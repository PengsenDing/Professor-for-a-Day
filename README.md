# Professor-for-a-Day

## Project status

The first server-side DeutschlandGPT integration is now available in `apps/api`.
The API key is read only from an environment variable and is never sent to the
browser.

## Run the DeutschlandGPT API locally

Requirements: Node.js 20.6 or newer.

```bash
cd apps/api
npm install
cp ../../.env.example .env
```

Open `apps/api/.env` and replace `replace-with-your-api-key` with your real
DeutschlandGPT API key. Then start the API:

```bash
npm run dev
```

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

The backend forwards the request to DeutschlandGPT's OpenAI-compatible
`/chat/completions` endpoint. The model can be changed with `DEUTSCHLANDGPT_MODEL`
or per request with a `model` field.

## Planned architecture

- `apps/web` — React + Tailwind frontend
- `apps/api` — TypeScript backend/API boundary
- `packages/shared` — shared types and contracts between frontend and backend
- `packages/config` — shared, non-secret configuration and tooling settings
- `infrastructure` — local development and deployment-related assets
- `docs` — architecture decisions and implementation notes

See [`docs/architecture.md`](docs/architecture.md) for the initial boundaries.
