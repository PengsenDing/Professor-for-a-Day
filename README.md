# Professor-for-a-Day

## Project status

The backend in `apps/api` is a Python scaffold: FastAPI for the HTTP boundary,
LangChain for the LLM layer, DeutschlandGPT as the current model provider, and
MongoDB for conversation persistence. The API key is read only from an
environment variable and is never sent to the browser.

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

Open `apps/api/.env` and replace `replace-with-your-api-key` with your real
DeutschlandGPT API key.

Start a local MongoDB (optional — see below):

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Then start the API:

```bash
uvicorn app.main:app --reload --port 8787
```

Interactive API docs are served at http://localhost:8787/docs.

Check the health endpoint:

```bash
curl http://localhost:8787/health
```

Send a chat request through the local backend:

```bash
curl http://localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"请用一句话介绍德国。"}]}'
```

The response is normalised to `{"reply": "...", "model": "..."}` instead of the
raw provider payload. Under the hood LangChain's `ChatOpenAI` talks to
DeutschlandGPT's OpenAI-compatible `/chat/completions` endpoint, so the provider
can be swapped without touching the routes. The model can be changed with
`DEUTSCHLANDGPT_MODEL` or per request with a `model` field.

## Conversation storage (MongoDB)

Conversations are stored in MongoDB through a repository layer, so no route or
service talks to the driver directly. Messages are embedded in the conversation
document, and `updated_at` is indexed for the "recent sessions" listing.

MongoDB is **optional for development**: the API still starts when it is
unreachable, `GET /health` then reports `"database": "down"`, and the
conversation routes answer `503` while `/api/chat` keeps working.

```bash
# Create a session, capture its id, add a turn, then read it back
ID=$(curl -s -X POST http://localhost:8787/api/conversations \
  -H 'Content-Type: application/json' -d '{"title":"Quantenmechanik"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')

curl -s -X POST http://localhost:8787/api/conversations/$ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Was ist Superposition?"}]}'

curl -s "http://localhost:8787/api/conversations?limit=20"
curl -s -X DELETE http://localhost:8787/api/conversations/$ID
```

Persisting `/api/chat` turns into a conversation is deliberately not wired up
yet — the chat endpoint stays stateless until the agent loop lands.

Run the tests and linter:

```bash
pytest && ruff check .
```

The repository tests need a running MongoDB and **skip automatically** when none
is reachable; they use a separate `professor_for_a_day_test` database and drop
their collection afterwards.

## Planned architecture

- `apps/web` — React + Tailwind frontend
- `apps/api` — Python (FastAPI + LangChain + MongoDB) backend/API boundary
- `packages/shared` — shared types and contracts between frontend and backend
- `packages/config` — shared, non-secret configuration and tooling settings
- `infrastructure` — local development and deployment-related assets
- `docs` — architecture decisions and implementation notes

See [`docs/architecture.md`](docs/architecture.md) for the initial boundaries.
