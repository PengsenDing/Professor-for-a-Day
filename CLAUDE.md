# Professor for a Day — Project Instructions

## 1. Product overview

Professor for a Day is a reverse-learning web application. The learner teaches one of
15 curated machine-learning Concepts to an intentionally imperfect **AI Student** instead
of asking an AI tutor for explanations. The AI Student asks questions, forms plausible
level-appropriate misunderstandings, and requires the learner to repair them. A hidden
**Judge** evaluates every explanation against a stable, pre-authored **Concept Rubric**,
so progress is evidence-based rather than an arbitrary conversational score.

Core loop:

```text
AI Student asks -> learner explains -> Judge evaluates against the rubric
  -> AI Student misunderstands or probes -> learner repairs -> Judge confirms
```

Key product facts:

- English-only, single anonymous learner, no accounts (see Out of Scope).
- The Home screen shows a fixed **Knowledge Graph** of the 15 Concepts with directed
  prerequisite edges. Edges recommend an order but never lock a node.
- A **Teaching Session** covers one Concept and one AI Student mode. It ends at 100%
  progress (`mastery`), when the learner finishes early (`learner_finished`), or after
  the eighth learner turn (`turn_limit`). Every exit path produces a **Teacher Report**.
- **Session Progress** is derived from confirmed rubric coverage, is monotonic within a
  session, and is capped at 99 until the misconception challenge posed during the
  session has been resolved (the "misconception gate").
- **Mastery** (best score per Concept) is browser-local only. It appears nowhere in the
  API and is never stored server-side.
- Voice is a first-class feature: ElevenLabs transcribes push-to-talk input, and every
  AI Student reply can be spoken via ElevenLabs with one fixed default voice. Text is
  always the fallback; voice failures never break the text flow or the session.

The product must not feel like a chatbot with a reversed layout. The plausible
misunderstanding, and the learner repairing it, is the core demonstration.

## 2. Authoritative sources

This file is an orientation summary. When it disagrees with the documents below, they win:

1. **`packages/shared/openapi.yaml`** — the product API contract. Per
   `docs/adr/0001-openapi-is-the-product-api-contract.md`, this checked-in document is
   the authoritative agreement between frontend and backend. FastAPI is verified against
   it; generated output never redefines it. Do not hand-maintain a second contract.
2. **`docs/mvp-spec.md`** — the agreed product scope, vocabulary, user stories, and
   testing decisions.
3. **`docs/backend-acceptance-criteria.md`** — what "done" means for `apps/api`.
4. **`docs/adr/`** — decision records:
   - 0001: OpenAPI is the product API contract.
   - 0002: the backend owns the Concept Catalog (concepts + prerequisite edges are
     version-controlled backend data; the LLM never adds, deletes, or rewires nodes).
   - 0003: speech is synthesized on fetch (no audio in JSON envelopes; clients fetch
     `audio/mpeg` per turn and cache the blob for replay).
   - 0004: sessions are resumable via `GET /api/sessions/{session_id}` (a learner-safe
     `SessionSnapshot`; the web app stays localStorage-first and uses it as fallback).

## 3. Repository layout and technology

```text
Professor-for-a-Day/
├── apps/
│   ├── web/            # Next.js + React + TypeScript + Tailwind frontend (has its own CLAUDE.md)
│   └── api/            # Python FastAPI + LangChain backend
├── packages/
│   ├── shared/         # openapi.yaml — the API contract
│   └── config/         # shared engineering configuration
├── infrastructure/     # docker-compose (local MongoDB), scripts
└── docs/               # spec, acceptance criteria, ADRs, architecture
```

Backend (`apps/api`):

- Python 3.12+, FastAPI, Pydantic, pytest, uv (`pyproject.toml`).
- LangChain for LLM access. **DeutschlandGPT** is the LLM provider for both AI roles
  (Judge and AI Student) through separate calls — it exposes an OpenAI-compatible
  endpoint, reached via `ChatOpenAI` with an overridden `base_url`
  (`app/services/llm.py`). Code above that module depends on LangChain runnables, not
  the vendor. Do not use the Anthropic API.
- **ElevenLabs** for speech-to-text and text-to-speech, behind one provider-neutral
  adapter.
- MongoDB via Motor, accessed only through the repository layer
  (`app/repositories/`), never directly from routes or agents.
- Layers: routes → services/orchestration → repositories → MongoDB; LLM and speech
  providers behind dedicated adapter modules.

Frontend (`apps/web`): Next.js, React, TypeScript, Tailwind. It talks only to the
product API defined in `openapi.yaml`, never to MongoDB or providers, and never sees a
credential. See `apps/web/CLAUDE.md` / `AGENTS.md` for frontend-specific rules.

Do not replace DeutschlandGPT, ElevenLabs, MongoDB, FastAPI, or LangChain during the
MVP. Do not introduce Kubernetes, Kafka, Redis, microservices, vector databases, or
autonomous multi-agent frameworks. Orchestration order is controlled explicitly in
Python: deterministic, testable, easy to debug.

## 4. Product API

Defined in `packages/shared/openapi.yaml` — read it before touching any route. Summary:

```text
GET  /health                                                # process + DB health, no LLM call
GET  /api/curriculum                                        # 15 Concepts + prerequisite edges, no LLM call
POST /api/sessions                                          # start a session -> opening question (turn 0)
GET  /api/sessions/{session_id}                             # learner-safe session snapshot (resume), no LLM call
POST /api/sessions/{session_id}/turns                       # submit one learner explanation
POST /api/sessions/{session_id}/finish                      # finish early -> Teacher Report (idempotent)
GET  /api/sessions/{session_id}/turns/{turn_number}/speech  # synthesize one AI Student reply (audio/mpeg)
POST /api/speech/transcriptions                             # pure speech-to-text (multipart audio upload)
```

The legacy `/api/chat` and `/api/conversations` routes are intentionally outside this
contract; the stateless chat behavior is not the Teaching Session contract.

Contract behaviors to preserve:

- **The session snapshot is a learner-safe projection** (ADR-0004). `GET
  /api/sessions/{session_id}` never invokes a provider, never mutates the session, and
  never exposes the persisted Judge evaluation, probe recommendations, or rubric
  internals. The web app is localStorage-first and fetches the snapshot only when no
  local copy exists.
- **Turns are text-only JSON.** A voice turn is transcribed first via
  `POST /api/speech/transcriptions`, then submitted through the ordinary turn contract
  with `input_mode: "voice"`. Transcription touches nothing else — no turn, no session
  mutation — and failed transcription never harms a session. Uploaded audio is
  discarded after transcription.
- **Turns are atomic and Judge-then-Student.** Either the full turn envelope is
  returned and the turn is persisted with its evaluation, or an error is returned and
  the session is left in its pre-turn state.
- **Turns are idempotent** via a client-generated `client_turn_id` (UUID). Retries with
  the same id return the original envelope without re-running the Judge, the AI
  Student, or the counters.
- **Sessions end inside the turn envelope.** A turn that reaches 100%, or the eighth
  accepted turn, returns `status: "ended"` with a populated `report` in the same
  response — no extra request.
- **Speech is synthesized on fetch** (ADR-0003). JSON responses carry no audio. Turn 0
  is the opening question. Nothing is cached or persisted server-side; a muted client
  simply never calls the endpoint; synthesis failures affect only that endpoint.
- **Errors use a minimal envelope** `{"error": {"code", "message"}}` with an enumerated,
  provider-neutral `code` (`INVALID_CONCEPT`, `SESSION_ENDED`, `GENERATION_FAILED`,
  `TRANSCRIPTION_FAILED`, `SPEECH_FAILED`, `DB_UNAVAILABLE`, …). Vendors, models,
  upstream statuses, and upstream error text never appear in any response.

Response shapes (`TurnEnvelope`, `SessionCreated`, `SessionFinished`, `TeacherReport`,
`Progress`, `ActiveMisconception`, `RubricPointRef`, …) are owned by the OpenAPI
document. Notable fields: the envelope carries `progress.percent`, per-turn
`newly_covered_points`, the learner-safe `active_misconception`, `learner_turn_count` /
`turns_remaining`, `status`, `end_reason`, and the `report`. The `TeacherReport`
contains `final_percent` (equal to the session's final computed progress, never
recomputed), `explained_well`, `misconceptions_corrected`,
`gaps_and_accidental_implications`, exactly one `improvement_suggestion`,
`recommended_next_concept`, and `mastery_achieved` (true iff `final_percent` is 100).

## 5. AI Student modes

Three modes, selected at session start (`Mode` enum: `beginner`, `confident`, `skeptic`):

- **Beginner** — asks foundational clarification questions, surfaces simple mistakes.
- **Confident** — partial understanding; asserts plausible but incorrect conclusions.
  This is the primary demo mode.
- **Skeptic** — challenges causal claims, assumptions, transfer, counterexamples, and
  edge cases.

Mode changes question style and depth only. It never changes the rubric or the scoring
standard, so scores stay comparable across modes.

## 6. Rubrics, scoring, and orchestration

- Every Concept has a hidden, pre-authored **Concept Rubric**: 3–5 required learning
  points, common misconceptions, and mode-appropriate probe suggestions. Rubric content
  never reaches the browser — only learner-safe labels and misconception summaries do.
- The **Judge** runs after every learner submission, evaluating the cumulative
  conversation and rubric state, and returns structured evaluation data: newly
  demonstrated points with evidence, corrected misconceptions, unresolved or newly
  introduced misconceptions, and a recommended next probe. The Judge never talks to the
  learner and never writes to the database.
- The **application** (deterministic Python, not the LLM) derives progress from
  confirmed rubric coverage. Confirmed points stay confirmed for the rest of the
  session; progress is monotonic. The Judge does not invent a percentage.
- 100% requires all required learning points **and** resolution of the misconception
  challenge posed during the session. An unresolved misconception gates completion even
  if every point has been mentioned.
- The **AI Student** call runs after the Judge, receives the Judge's recommended target
  and the current unresolved misconception, and produces one concise, in-character
  follow-up question or plausible misunderstanding. It never reveals the rubric, Judge
  reasoning, or the correct answer, and its misconception originates from tracked
  state, not random role-play.

## 7. Engineering principles

- Inspect the existing repository before changing anything; reuse existing code.
- Do not delete or rewrite unrelated user code.
- Keep API routes, business logic, database access, and LLM/speech calls separate.
- Keep the backend in Python with FastAPI. Do not move backend logic to Node.js.
- Never expose an API key or any provider detail to the frontend.
- Never trust raw LLM output as application state. Validate every LLM response with
  Pydantic; handle parse failures with bounded repair/retry.
- The Python application owns session state and scoring; the LLM may only propose
  changes through a validated, structured result.
- Prefer simple, explicit workflows over generic agent frameworks. Agents never call
  each other autonomously or touch the database directly.
- Add tests for important behavior before adding unnecessary abstractions.
- Use descriptive names and type annotations; avoid `Any` without a documented reason.
- Handle loading, timeouts, invalid input, missing sessions, provider failures, and
  malformed LLM output. Never log secrets.

## 8. Persistence

- MongoDB stores anonymous Teaching Sessions and their ordered turns: session id,
  Concept, mode, lifecycle status, turn count, final score when present, timestamps,
  and the Teacher Report when present; each turn stores the learner transcript, input
  mode, AI Student text, the Judge's structured evaluation, resulting progress, and a
  timestamp — so score changes can be traced to evidence.
- MongoDB never stores raw or generated audio, browser-local Mastery, credentials, or
  hidden provider payloads unnecessary for the learning record.
- All database access goes through the repository boundary (`app/repositories/`).

## 9. Configuration

Settings load from the environment via `apps/api/app/config.py`
(pydantic-settings, `apps/api/.env` supported). Current variables:

```env
DEUTSCHLANDGPT_API_KEY=      # required; startup fails without it
DEUTSCHLANDGPT_MODEL=        # default: gemini-2.5-pro
DEUTSCHLANDGPT_BASE_URL=
PORT=                        # default: 8787
WEB_ORIGIN=
MONGODB_URI=
MONGODB_DATABASE=
MONGODB_TIMEOUT_MS=
LLM_TEMPERATURE=
LLM_TIMEOUT_SECONDS=
LOG_LEVEL=
JUDGE_TEMPERATURE=
STUDENT_TEMPERATURE=
JUDGE_REASONING_EFFORT=
STUDENT_REASONING_EFFORT=
```

ElevenLabs credentials likewise live server-side in environment configuration. Secrets
never appear in code, logs, or any API response.

## 10. Testing

Follow `docs/mvp-spec.md` §Testing Decisions and `docs/backend-acceptance-criteria.md`:

- Assert externally observable behavior and stable contracts — never exact prompts,
  private helper calls, or verbatim model wording.
- The primary automated seam is the session API boundary: start a session, submit
  learner transcripts, finish, and read back the stored result using fake
  DeutschlandGPT and ElevenLabs adapters plus a test repository.
- Session API tests must cover: the opening question, the ordered Judge-before-Student
  loop, structured progress, monotonic coverage, the misconception completion gate, the
  eight-turn limit, manual finish, report production on every exit path, safe
  provider-neutral failures, idempotent turn retries, and persisted turn evidence.
- Existing FastAPI route tests with dependency overrides (`apps/api/tests/`) are the
  prior art for exercising HTTP behavior without live infrastructure; the conversation
  repository tests are the prior art for validating persistence against a real test
  MongoDB when one is available.
- Contract tests verify the backend against `packages/shared/openapi.yaml`, that raw
  audio is never present in persisted sessions, and that provider keys never appear in
  responses.
- One browser-level golden-path test covers graph selection, the opening question, a
  typed teaching loop, 100% completion, animation state, the Teacher Report, and
  updated local Mastery. Browser tests mock microphone and audio playback.
- Live-provider checks (DeutschlandGPT parseability, ElevenLabs STT/TTS) are small,
  opt-in smoke tests only. CI and normal local runs never depend on live providers or
  a real API key.
- Do not silently skip failing tests. Run relevant tests, linting, and type checks
  before declaring work done.

## 11. Out of scope for the MVP

Accounts and authentication; multiple users or cross-device sync; topics beyond the 15
curated ML Concepts; LLM-generated graph nodes or edges; a graph database or
server-side Mastery storage; hard prerequisite locks; languages other than English;
voice selection or cloning; real-time full-duplex speech; persisting raw or generated
audio; AI Student personalities beyond the three modes; mode-dependent scoring
standards; sessions longer than eight learner turns; analytics, dashboards, social
features, leaderboards; automated rubric authoring. Do not implement any of these
unless explicitly requested.
