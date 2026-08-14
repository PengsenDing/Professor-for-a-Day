# Professor-for-a-Day

Learn by teaching: the learner plays teacher and explains a machine-learning
concept to an AI student. A Judge evaluates every explanation against a hidden
rubric, progress rises with demonstrated understanding, and each session ends
with a Teacher Report.

## Project status

The backend in `apps/api` implements the full product API contract frozen in
[`packages/shared/openapi.yaml`](packages/shared/openapi.yaml): FastAPI for the
HTTP boundary, LangChain for the LLM layer (DeutschlandGPT), ElevenLabs for
speech-to-text and text-to-speech, and MongoDB for Teaching Session persistence.
API keys are read only from environment variables and are never sent to the
browser. The frontend in `apps/web` is not initialized yet.

## Run the API locally

Requirements: Python 3.11 or newer (verified on 3.14; the system `python3` on
macOS is 3.9 and will not work).

```bash
cd apps/api
python3.14 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
```

Open `apps/api/.env` and fill in your real DeutschlandGPT and ElevenLabs API
keys. The server refuses to start while either key is missing.

Start a local MongoDB (optional — see below):

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Then start the API:

```bash
uvicorn app.main:app --reload --port 8787
```

Interactive API docs are served at http://localhost:8787/docs, and the schema at
`/openapi.json` matches the checked-in contract (enforced by
`tests/test_contract.py`).

## The product API

All routes are defined in `packages/shared/openapi.yaml` — the authoritative
contract per [ADR-0001](docs/adr/0001-openapi-is-the-product-api-contract.md).

```bash
# Health and curriculum
curl http://localhost:8787/health
curl http://localhost:8787/api/curriculum

# Start a Teaching Session (the AI student opens with a question)
curl -s http://localhost:8787/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"concept_id":"gradient-descent","mode":"confident"}'

# Submit a Teaching Turn (idempotent via client_turn_id)
curl -s http://localhost:8787/api/sessions/$SESSION_ID/turns \
  -H 'Content-Type: application/json' \
  -d '{"learner_text":"Gradient descent steps opposite the gradient...","input_mode":"text","client_turn_id":"'$(uuidgen)'"}'

# Fetch the spoken version of a reply (turn 0 = the opening question)
curl -s http://localhost:8787/api/sessions/$SESSION_ID/turns/0/speech -o reply.mp3

# Finish early and get the Teacher Report
curl -s -X POST http://localhost:8787/api/sessions/$SESSION_ID/finish

# Transcribe recorded audio (the transcript is then submitted as a normal turn)
curl -s http://localhost:8787/api/speech/transcriptions -F 'audio=@take.webm'
```

Errors use one provider-neutral envelope:
`{"error": {"code": "<ENUM>", "message": "<text>"}}`.

## Persistence (MongoDB)

Teaching Sessions live in the `teaching_sessions` collection behind a repository
layer; no route or service talks to the driver directly. Turns are embedded in
the session document and written together with the updated progress in a single
update, so a reader never observes a turn without its progress. Sessions are
anonymous and never contain audio or credentials.

MongoDB is **optional for development**: the API still starts when it is
unreachable, `GET /health` then reports `"database": "down"`, `/api/curriculum`
keeps answering `200`, and the session routes answer `503`.

## Tests

```bash
pytest && ruff check .
```

The suite runs without live providers: the Judge, AI Student, and speech
adapters are replaced with fakes through FastAPI dependency overrides. The
repository integration tests need a running MongoDB and **skip automatically**
when none is reachable; they use a separate `professor_for_a_day_test` database
and drop their collection afterwards.

Two live smoke tests (real DeutschlandGPT and ElevenLabs credentials) are
opt-in and never run by default:

```bash
RUN_LIVE_SMOKE=1 pytest tests/test_smoke_live.py -v
```

## Architecture

- `apps/web` — React + Tailwind frontend (not initialized)
- `apps/api` — Python (FastAPI + LangChain + ElevenLabs + MongoDB) backend
- `packages/shared` — `openapi.yaml`, the product API contract
- `packages/config` — shared, non-secret configuration and tooling settings
- `infrastructure` — local development and deployment-related assets
- `docs` — architecture, ADRs, spec, and acceptance criteria

See [`docs/architecture.md`](docs/architecture.md) for the layering and
[`docs/backend-acceptance-criteria.md`](docs/backend-acceptance-criteria.md)
for what "done" means for the backend.
