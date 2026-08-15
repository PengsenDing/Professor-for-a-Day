"""Knowledge-graph contract schemas: `GraphSummary`, `GraphList`, `GraphUpdate`."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from .curriculum import ConceptRef

GraphId = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"),
    Field(
        description=(
            "Stable graph identifier. `machine-learning` is the builtin graph; "
            "user graphs use server-generated ids."
        )
    ),
]


class GraphSource(StrEnum):
    builtin = "builtin"
    user = "user"


class GraphSummary(BaseModel):
    id: GraphId
    title: str
    source: GraphSource
    concept_count: Annotated[int, Field(ge=1)]
    created_at: datetime | None = Field(
        description="Null for the builtin graph, which predates the database."
    )


class GraphList(BaseModel):
    graphs: list[GraphSummary]


class GraphUpdate(BaseModel):
    """What a finished session did to a knowledge graph (ADR-0004)."""

    graph_id: GraphId
    graph_title: str
    created: bool = Field(
        description="True when this session created the graph; false when it grew one."
    )
    added_concepts: list[ConceptRef] = Field(
        description=(
            "All concepts of a newly created graph; only the appended ones for a "
            "grown graph. May be empty."
        )
    )
