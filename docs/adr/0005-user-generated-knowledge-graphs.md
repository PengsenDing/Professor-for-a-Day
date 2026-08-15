# User knowledge graphs are LLM-drafted, application-validated, and append-only

Beyond the builtin Machine Learning graph, learners create knowledge graphs by teaching:
a freeform session generates a rubric for the topic at session start, runs the ordinary
Judge/Student loop, and at session end the LLM summarizes the conversation into a new
graph stored in MongoDB (`knowledge_graphs`). Later sessions on a user graph may append
concepts and edges the conversation surfaced. User-graph concepts get their rubric
generated on demand at session start and cached in the graph document.

The LLM only ever proposes. Deterministic application code validates every proposal
(Pydantic), slugifies and dedupes ids and titles, caps additions per session, rejects
any edge that would introduce a cycle, and never modifies or removes existing nodes,
edges, summaries, or cached rubrics. Graph persistence failures degrade — a freeform
session falls back to a single-concept graph, growth falls back to no change — and the
Teacher Report is never blocked by summarization.

This narrows ADR-0002 rather than reversing it: the builtin catalog remains
version-controlled backend data that no LLM call can touch. User graphs are anonymous
and global (no accounts), and generated rubric content stays server-side exactly like
hand-authored rubric content.

User graphs can be deleted from the picker (`DELETE /api/graphs/{graph_id}`); the
builtin graph never can (409 `GRAPH_NOT_DELETABLE`). Deleting a graph removes its
concepts, edges, and cached generated rubrics, but past Teaching Sessions and their
reports are the learning record and stay untouched — a still-active session on a
deleted graph fails cleanly with 404 `GRAPH_NOT_FOUND`.
