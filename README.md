# Professor-for-a-Day

## Project status

The backend in `apps/api` is a Python scaffold: FastAPI for the HTTP boundary,
LangChain for the LLM layer, DeutschlandGPT as the current model provider. The
API key is read only from an environment variable and is never sent to the
browser.

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
DeutschlandGPT API key. Then start the API:

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

Run the tests and linter:

```bash
pytest && ruff check .
```

## Planned architecture

- `apps/web` — React + Tailwind frontend
- `apps/api` — Python (FastAPI + LangChain) backend/API boundary
- `packages/shared` — shared types and contracts between frontend and backend
- `packages/config` — shared, non-secret configuration and tooling settings
- `infrastructure` — local development and deployment-related assets
- `docs` — architecture decisions and implementation notes

See [`docs/architecture.md`](docs/architecture.md) for the initial boundaries.
