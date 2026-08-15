"""Graph service: one façade over the builtin catalog and user graphs (ADR-0004).

Callers (routes, orchestrator) never care where a graph lives. The builtin
Machine Learning graph is version-controlled files and never touches MongoDB —
it stays usable when the database is down and is never written (ADR-0002). User
graphs live in the `knowledge_graphs` collection, get their rubrics generated
on demand, and grow append-only at session end.

Graph-persistence failures degrade, never break: `create_from_session` falls
back to a single-concept graph when extraction fails, and both it and `grow`
return None when MongoDB rejects the write — the caller's report is already
built and is returned regardless.
"""

import logging
from typing import Any

from pymongo.errors import PyMongoError

from ..curriculum.rubrics import Rubric
from ..repositories.graphs import GraphRepository
from ..schemas import Concept, ConceptRef, Curriculum, GraphList, GraphSummary, GraphUpdate
from .exceptions import GenerationError
from .graph_summarizer import GraphExtraction, GraphSummarizerAdapter, merge_extraction
from .rubric_generator import RubricGeneratorAdapter

logger = logging.getLogger(__name__)

BUILTIN_GRAPH_ID = "machine-learning"
BUILTIN_GRAPH_TITLE = "Machine Learning"

# Re-reads + re-merges when a concurrent session grew the graph first.
_APPEND_ATTEMPTS = 3


class GraphService:
    def __init__(
        self,
        *,
        catalog: Curriculum,
        rubrics: dict[str, Rubric],
        repository: GraphRepository,
        rubric_generator: RubricGeneratorAdapter,
        summarizer: GraphSummarizerAdapter,
        max_new_concepts_per_session: int,
    ) -> None:
        self._catalog = catalog
        self._rubrics = rubrics
        self._repository = repository
        self._rubric_generator = rubric_generator
        self._summarizer = summarizer
        self._max_new_concepts = max_new_concepts_per_session

    # -- reads ---------------------------------------------------------------

    async def list_graphs(self) -> GraphList:
        builtin = GraphSummary(
            id=BUILTIN_GRAPH_ID,
            title=BUILTIN_GRAPH_TITLE,
            source="builtin",
            concept_count=len(self._catalog.concepts),
            created_at=None,
        )
        summaries = [
            GraphSummary(
                id=str(document["_id"]),
                title=document["title"],
                source="user",
                concept_count=len(document["concepts"]),
                created_at=document["created_at"],
            )
            for document in await self._repository.list_summaries()
            if document["concepts"]
        ]
        return GraphList(graphs=[builtin, *summaries])

    async def get_curriculum(self, graph_id: str) -> Curriculum | None:
        if graph_id == BUILTIN_GRAPH_ID:
            return self._catalog
        document = await self._repository.get(graph_id)
        if document is None:
            return None
        return _curriculum_from_document(document)

    # -- deletion --------------------------------------------------------------

    def is_deletable(self, graph_id: str) -> bool:
        """Only user graphs may be deleted; the builtin graph never (ADR-0002)."""
        return graph_id != BUILTIN_GRAPH_ID

    async def delete_graph(self, graph_id: str) -> bool:
        """Delete a user graph; False when it does not exist.

        Callers must check `is_deletable` first — this method refuses the
        builtin graph as a hard safety net rather than as the primary guard.
        """
        if not self.is_deletable(graph_id):
            raise ValueError("The builtin graph cannot be deleted")
        return await self._repository.delete(graph_id)

    # -- rubrics ---------------------------------------------------------------

    async def generate_topic_rubric(self, *, topic_title: str, concept_id: str) -> Rubric:
        """A rubric for a freeform topic that has no graph yet.

        Raises `GenerationError` on failure; the caller creates no session in
        that case (AC-SES-8 extends to rubric generation).
        """
        return await self._rubric_generator.generate(
            topic_title=topic_title, concept_id=concept_id
        )

    async def get_rubric(self, graph_id: str, concept_id: str) -> Rubric:
        """The concept's rubric, generating and caching it on first use.

        Raises `GenerationError` when generation fails and `LookupError` when
        the (graph, concept) pair does not exist — callers validate the pair
        first, so the latter signals a programming error, not user input.
        """
        if graph_id == BUILTIN_GRAPH_ID:
            return self._rubrics[concept_id]

        document = await self._repository.get(graph_id)
        entry = _concept_entry(document, concept_id)
        if entry is None:
            raise LookupError(f"No concept {concept_id!r} in graph {graph_id!r}")
        if entry.get("rubric"):
            return Rubric.model_validate(entry["rubric"])

        rubric = await self._rubric_generator.generate(
            topic_title=entry["title"], concept_id=concept_id
        )
        stored = await self._repository.set_concept_rubric(
            graph_id, concept_id, rubric.model_dump()
        )
        if not stored:
            # Lost the race against a concurrent generation: use the winner's.
            document = await self._repository.get(graph_id)
            entry = _concept_entry(document, concept_id)
            if entry is not None and entry.get("rubric"):
                return Rubric.model_validate(entry["rubric"])
        return rubric

    # -- session-end writes ----------------------------------------------------

    async def create_from_session(
        self,
        *,
        taught_concept: Concept,
        rubric: Rubric,
        transcript: list[tuple[str, str]],
    ) -> GraphUpdate | None:
        """Create a graph from a freeform session (`created: true`).

        Extraction failure degrades to a single-concept graph — the freeform
        promise ("you end up with a graph") survives any LLM failure. Only a
        database failure yields None.
        """
        try:
            extraction = await self._summarizer.extract(
                transcript=transcript,
                taught_concept=ConceptRef(id=taught_concept.id, title=taught_concept.title),
                existing=None,
            )
        except GenerationError:
            logger.warning("graph extraction failed; creating a single-concept graph")
            extraction = GraphExtraction()

        merged = merge_extraction(
            existing_concepts=[taught_concept],
            existing_edges=[],
            extraction=extraction,
            max_new_concepts=self._max_new_concepts,
        )
        title = extraction.graph_title.strip() or taught_concept.title
        concepts = [
            {
                "id": taught_concept.id,
                "title": taught_concept.title,
                "summary": taught_concept.summary,
                "rubric": rubric.model_dump(),
            },
            *(_concept_document(concept) for concept in merged.added_concepts),
        ]
        edges = [edge.model_dump(by_alias=True) for edge in merged.added_edges]

        try:
            document = await self._repository.insert(
                title=title, concepts=concepts, edges=edges
            )
        except PyMongoError:
            logger.exception("failed to persist the new knowledge graph")
            return None
        return GraphUpdate(
            graph_id=str(document["_id"]),
            graph_title=title,
            created=True,
            added_concepts=[
                ConceptRef(id=entry["id"], title=entry["title"]) for entry in concepts
            ],
        )

    async def grow(
        self,
        *,
        graph_id: str,
        taught_concept: ConceptRef,
        transcript: list[tuple[str, str]],
    ) -> GraphUpdate | None:
        """Grow a user graph after a session on it (`created: false`).

        None means the graph is unchanged (extraction failed, the graph
        vanished, or the write kept losing the optimistic-version race). An
        empty `added_concepts` is a successful no-op: the session was reviewed
        and nothing new came up. The builtin graph never reaches this method.
        """
        for _ in range(_APPEND_ATTEMPTS):
            try:
                document = await self._repository.get(graph_id)
            except PyMongoError:
                logger.exception("failed to load graph %s for growth", graph_id)
                return None
            if document is None:
                return None

            existing = _curriculum_from_document(document)
            try:
                extraction = await self._summarizer.extract(
                    transcript=transcript,
                    taught_concept=taught_concept,
                    existing=existing,
                )
            except GenerationError:
                logger.warning("graph growth extraction failed; graph unchanged")
                return None

            merged = merge_extraction(
                existing_concepts=existing.concepts,
                existing_edges=existing.edges,
                extraction=extraction,
                max_new_concepts=self._max_new_concepts,
            )
            update = GraphUpdate(
                graph_id=graph_id,
                graph_title=document["title"],
                created=False,
                added_concepts=[
                    ConceptRef(id=concept.id, title=concept.title)
                    for concept in merged.added_concepts
                ],
            )
            if not merged.added_concepts and not merged.added_edges:
                return update

            try:
                appended = await self._repository.append(
                    graph_id,
                    expected_version=document["version"],
                    new_concepts=[
                        _concept_document(concept) for concept in merged.added_concepts
                    ],
                    new_edges=[edge.model_dump(by_alias=True) for edge in merged.added_edges],
                )
            except PyMongoError:
                logger.exception("failed to persist growth for graph %s", graph_id)
                return None
            if appended:
                return update
            # Version conflict: another session grew the graph first. Re-read
            # and re-merge against the fresh state.

        logger.warning("gave up growing graph %s after version conflicts", graph_id)
        return None


def _curriculum_from_document(document: dict[str, Any]) -> Curriculum:
    """Project a graph document to the learner-safe curriculum shape.

    Rubric internals never leave this projection (AC-RUB-6).
    """
    return Curriculum(
        concepts=[
            Concept(id=entry["id"], title=entry["title"], summary=entry["summary"])
            for entry in document["concepts"]
        ],
        edges=[
            {"from": edge["from"], "to": edge["to"]} for edge in document["edges"]
        ],
    )


def _concept_entry(document: dict[str, Any] | None, concept_id: str) -> dict[str, Any] | None:
    if document is None:
        return None
    for entry in document["concepts"]:
        if entry["id"] == concept_id:
            return entry
    return None


def _concept_document(concept: Concept) -> dict[str, Any]:
    return {
        "id": concept.id,
        "title": concept.title,
        "summary": concept.summary,
        "rubric": None,
    }
