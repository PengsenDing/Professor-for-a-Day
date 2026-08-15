# Sessions are resumable via GET

`GET /api/sessions/{session_id}` returns a learner-safe snapshot of any stored
session — active or ended — rebuilt from the session document: concept, mode, the
opening question, every learner/AI Student exchange in order, progress, the active
misconception, turn counters, and the Teacher Report once ended. The endpoint is
read-only: no LLM or speech call, no mutation, and an unknown or malformed id is a
plain `404 SESSION_NOT_FOUND`.

This reverses the MVP decision that a mid-session browser refresh loses the session
by design, and reinstates the original AC-SES-7 / AC-SES-10. The web app remains
localStorage-first — the running conversation still lives in the browser and this
endpoint is only the fallback when no local copy exists (cleared storage, or a
session URL opened on another device). Chosen over server-first reads (adds latency
and a reconciliation policy nobody needs) and over a Home-screen resume prompt
(separable UI; the deep link silently working is the feature).

Consequences: the response is a projection, never a document dump — the persisted
Judge evaluation, probe recommendations, and rubric internals must never appear in
the `SessionSnapshot`; Mastery stays browser-local and still appears nowhere in the
contract; the client is expected to persist a fetched snapshot locally and then
proceed exactly as after a refresh (no animation, no autoplay). Starting a new
session best-effort finishes any still-active local session via the idempotent
finish endpoint, so abandoned sessions reach a terminal state with a report.
