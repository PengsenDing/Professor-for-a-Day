# Professor-for-a-Day — Architecture

## Goal

Clear project boundaries in service of a learn-by-teaching product: the learner
plays teacher and explains a machine-learning concept to an AI Student; a Judge
evaluates every explanation and drives progress, and each session ends with a
Teacher Report. The backend is Python: FastAPI owns the HTTP boundary, LangChain
owns LLM access (DeutschlandGPT), ElevenLabs provides speech (STT/TTS), and
MongoDB provides persistence.

**Contract-first**: `packages/shared/openapi.yaml` is the single authoritative
contract for the product API (ADR-0001). The code is implemented against the
contract and verified by `tests/test_contract.py`; `/openapi.json` is generated
by FastAPI and pruned to match the contract. Maintaining a second hand-edited
contract is forbidden.

## Directory layout

```text
Professor-for-a-Day/
├── apps/
│   ├── web/                 # React + Tailwind frontend (not initialized yet)
│   └── api/                 # Python backend/API (FastAPI + LangChain)
├── packages/
│   ├── shared/              # openapi.yaml: the API contract shared by front and back end
│   └── config/              # shared engineering configuration
├── infrastructure/
│   ├── docker-compose.yml   # MongoDB for local development
│   └── scripts/             # local dev, check, and deployment helper scripts
├── docs/                    # architecture, decisions (ADRs), and acceptance criteria
├── .env.example             # environment variable names only, never real secrets
├── README.md
└── LICENSE
```

## Layer responsibilities

### `apps/web`

Browser-side rendering and interaction. It talks to the backend only through
the product API; it never touches MongoDB and never sees an API key. Mastery
(retained progress across sessions) lives in the browser; the backend neither
stores nor returns it (AC-CAT-8).

### `apps/api`

HTTP API, request validation, session orchestration, and the domain services.
Current layout:

```text
apps/api/
├── pyproject.toml           # dependencies and tooling (FastAPI, LangChain, elevenlabs, pytest, ruff)
├── .env.example             # backend env var checklist; copy to .env and fill in real keys
├── app/
│   ├── main.py              # FastAPI entrypoint, CORS, lifespan (Mongo), contract-shaped /openapi.json
│   ├── config.py            # environment-backed settings (DeutschlandGPT, ElevenLabs, turn budget)
│   ├── db.py                # MongoDB client lifecycle
│   ├── dependencies.py      # FastAPI dependency injection (repository, Judge, AI Student, orchestrator)
│   ├── errors.py            # ApiError and the {"error": {code, message}} envelope handlers
│   ├── schemas/             # contract models, split by domain (curriculum/sessions/speech/errors/health)
│   ├── curriculum/          # version-controlled catalog and rubrics (data files, AC-CAT-7)
│   │   ├── catalog.json     # 15 concepts + 14 prerequisite edges (acyclicity-checked)
│   │   ├── rubrics/         # one rubric per concept (points, misconceptions, per-mode probes)
│   │   └── rubrics.py       # rubric models and load-time validation
│   ├── routes/              # client-facing API routes (thin; logic lives in the orchestrator)
│   │   ├── health.py        # GET /health (includes database status)
│   │   ├── curriculum.py    # GET /api/curriculum
│   │   ├── sessions.py      # POST /api/sessions, /turns, /finish; GET /{id} (snapshot), GET .../speech
│   │   └── speech.py        # POST /api/speech/transcriptions
│   ├── services/
│   │   ├── llm.py           # LangChain provider (DeutschlandGPT; the only module that knows the vendor)
│   │   ├── judge.py         # Judge adapter: structured evaluation + one bounded repair retry
│   │   ├── student.py       # AI Student adapter: mode-conditioned opening question and replies
│   │   ├── evaluation.py    # the Judge's structured output contract (AC-JDG-1)
│   │   ├── scoring.py       # pure scoring engine: sticky confirmations, monotonic progress, misconception gate
│   │   ├── report.py        # Teacher Report builder (deterministic, grounded in Judge evidence)
│   │   ├── orchestrator.py  # session orchestration: Judge → scoring → AI Student → one atomic write
│   │   ├── speech.py        # ElevenLabs adapter (STT/TTS; audio never cached or persisted)
│   │   └── exceptions.py    # provider-neutral service exceptions
│   ├── repositories/
│   │   └── sessions.py      # teaching_sessions collection; embedded turns, single atomic update
│   ├── agent/               # agent orchestration and run loop (placeholder)
│   └── tools/               # controlled tools callable by agents (placeholder)
└── tests/                   # pytest: contract drift test, fake-adapter acceptance suite, real-Mongo integration
```

### Orchestration of a Teaching Turn

1. **Judge first** (AC-TRN-2): receives the cumulative conversation and the
   current rubric state, returns a structured evaluation.
2. **Scoring engine** (`scoring.py`, a pure function): folds the evaluation in,
   discards hallucinated ids with a warning log; progress is
   `round(confirmed / required * 100)`, capped at 99 while the misconception
   gate is unsatisfied.
3. **AI Student reply**: receives the Judge's recommended probe; if no
   misconception challenge has been posed yet, the orchestrator assigns one
   rubric misconception for the student to voice.
4. **One atomic write**: the turn, its evaluation, the progress, and the
   counters land in a single `update_one` (AC-TRN-9 / AC-PER-10). Retries with
   the same `client_turn_id` replay the stored envelope without any provider
   call (AC-IDM).

### Session resume

Sessions are resumable (ADR-0004): `GET /api/sessions/{session_id}` rebuilds a
learner-safe `SessionSnapshot` from the stored document — the full conversation,
progress, and report once ended — with no provider call and no mutation. The
persisted Judge evaluation never appears in it. The web app stays
localStorage-first and uses the snapshot only when it has no local copy.

### Speech

Synthesize-on-fetch (ADR-0003): JSON responses carry no audio. Only when the
client calls `GET /api/sessions/{id}/turns/{n}/speech` is the stored reply
synthesized with the single server-configured voice; audio is never cached,
never written to disk, never persisted. Voice input is two-step:
`POST /api/speech/transcriptions` only transcribes, and the transcript is then
submitted through the ordinary `/turns` contract (`input_mode: "voice"`).

### MongoDB data layer

`db.py` creates the one `AsyncMongoClient` (pymongo's native async driver)
inside the application lifespan and hangs it on `app.state`. Routes and the
orchestrator reach data only through `repositories/sessions.py` (AC-PER-7).
The URI may contain credentials, so logs only ever show the database name.

`repositories/sessions.py` is the only module that knows the document
structure: turns are embedded in the session document, and one update writes
the turn, the progress, and the counters together — a reader can never observe
a turn without its progress. Sessions are anonymous: no owner, no IP, and no
audio of any kind is stored (AC-PER-5/6).

**Mongo is optional during development**: the app starts even when it is
unreachable — `/health` reports `"database": "down"`, `/api/curriculum` still
answers `200`, and the `/api/sessions*` routes answer `503` with the
`DB_UNAVAILABLE` error envelope. Start a local instance with:
`docker compose -f infrastructure/docker-compose.yml up -d`.

### `packages/shared`

Holds `openapi.yaml` — the product contract shared by frontend and backend.
No database connections, secrets, or browser-specific code belong here.

### `packages/config`

Central home for shared frontend TypeScript, lint, formatting, and test
configuration. Backend dependencies and tooling live in
`apps/api/pyproject.toml`.

### `infrastructure`

MongoDB for local development plus containerization, deployment, and
operations assets, kept separate from application code.

## Dependency direction

```text
web ────────► shared (openapi.yaml)
  │
  └─────────► api ───────► shared (contract verification)
                         ├► orchestrator ─► judge / student / scoring / report
                         ├► repositories ───► MongoDB
                         ├► LLM provider (DeutschlandGPT)
                         └► speech provider (ElevenLabs)
```

Ground rules:

1. The frontend interacts with the backend only through the API.
2. API keys (DeutschlandGPT, ElevenLabs) exist only in the server environment.
3. Routes and the orchestrator never touch the database connection directly;
   all data access goes through the repository.
4. Rubric internals (evidence criteria, corrections, probe text) never appear
   in a client response.
5. Every error crosses the boundary as the `{"error": {code, message}}`
   envelope — provider-neutral, never naming a vendor, model, or upstream
   detail.

## Test strategy

- `tests/test_contract.py`: the contract drift test — compares the runtime
  `/openapi.json` against `packages/shared/openapi.yaml` item by item (paths,
  methods, status codes, content types, component fields, enums).
- Acceptance suite (fake adapters + fake repository injected via
  `dependency_overrides`): session lifecycle, Judge-before-Student ordering,
  idempotent retries, prompt-injection resistance, provider-failure
  degradation, and the speech boundaries (413/415/502).
- `tests/test_sessions_repository.py`: integration against a real MongoDB,
  skipped automatically when none is reachable.
- `tests/test_smoke_live.py`: T21/T22 smoke tests with real credentials —
  manual opt-in via `RUN_LIVE_SMOKE=1`, never run in CI.

## Explicitly not implemented

- User accounts and cross-device sync (sessions are anonymous)
- Server-side audio caching or persistence (ADR-0003)
- Production Mongo auth, replica sets, and migration strategy
- CI/CD, containers, and production deployment configuration
