# AgentVerse

AgentVerse is a chat application that routes useful work to research, coding, writing, data, and document specialists. Answers stream into chat; optional quality reviews arrive afterward. The user can request one improved revision without losing the original answer.

## Run locally

Use Python 3.12 and Node.js 22.

```bash
cp .env.example .env
python3.12 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements-dev.txt
# Set a real model credential in .env, then:
cd backend
python start.py
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. SQLite is the local default; Redis and Qdrant are optional. Configure the same Google OAuth client ID in the backend and frontend if using Google sign-in. A model key is required for agent answers. Do not commit `.env`.

For the complete local service stack, use `docker compose -f docker/docker-compose.yml up --build`. The API uses service DNS names inside Docker. Infrastructure ports are bound to loopback. The Docker Compose defaults are development credentials.

## Deploy

`render.yaml` describes the backend and `backend/Dockerfile` is the canonical Python 3.12 image. The API runs as an unprivileged user. Configure a durable PostgreSQL `DATABASE_URL`, a random `SECRET_KEY` of at least 32 characters, `APP_ENV=production`, `APP_DEBUG=false`, the real model key, and an explicit `ALLOWED_ORIGINS` list. Startup rejects missing durable storage or unsafe production signing configuration.

Set the frontend's `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` to the deployed backend origin and rebuild it. Deploy both sides together: sockets now require an authentication frame, and protected downloads use authorization headers. Existing registered users must sign in again after the session upgrade. Guest history migrates once from the existing browser capability.

Before rollout, follow [the deployment checklist](docs/backend-hardening-progress.md). Back up the database and validate the migration on a restore first. Free hosting can sleep or exhaust its monthly budget; continuous keep-alive schedules have been removed. A manually invoked health check remains available.

## Tools and optional services

- Public search and bounded page retrieval support research. Memory is owner scoped and optional.
- File tools read/write owned database artifacts. Generated PDF, DOCX, XLSX, HTML, Markdown, and text files have authenticated downloads and expiry.
- Code execution requires `EXECUTION_URL` and `EXECUTION_TOKEN` for a separate isolated runner. See [runner setup](backend/runner/README.md). It is unavailable until configured; code never runs on the API host.
- Shared Slack and Linear connections are restricted to `CONNECTOR_OWNER_ID` and require explicit approval for the exact action. Linear requires an explicit team ID.
- Password recovery requires SMTP with STARTTLS and `PUBLIC_FRONTEND_URL`. Google identities are verified against the configured audience and linked deliberately. Session revocation, password change, account deletion, and Google linking have API routes.

## Tests and benchmarks

```bash
PYTHONPATH=backend APP_DEBUG=false REDIS_URL='' QDRANT_URL='' python -m pytest backend/tests -q
pip check
pip-audit -r backend/requirements.txt --no-deps
cd frontend
npm test
npx tsc --noEmit
npm run build
```

PostgreSQL migration tests run when `TEST_POSTGRES_URL` is set; CI provides an isolated test database. Offline tests never contact production or spend model credits. Live checks require explicit commands:

```bash
PYTHONPATH=backend python backend/test_ws.py --url https://YOUR-STAGING-BACKEND
PYTHONPATH=backend python backend/scripts/benchmark.py --live --output benchmark-results.json
```

The benchmark records latency, answers, automatic constraints, and a human review checklist. It does not prove factual quality from critic scores alone. Regenerate the dependency lock with `pip-compile --strip-extras --output-file=backend/requirements.txt backend/requirements.in` under Python 3.12.

See [architecture](docs/ARCHITECTURE.md), [performance measurement](docs/backend-performance.md), and [implementation status](docs/backend-hardening-progress.md). LangGraph, response caching, and automatic critic retry loops are not used by this runtime.
