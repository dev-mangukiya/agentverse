# AgentVerse — Autonomous Multi-Agent AI Workforce Platform

AgentVerse is a production-style multi-agent AI system where a **Chief Orchestrator**
plans and delegates work across specialized agents (Research, Data Analyst, Coding,
Writer, Critic, Memory), coordinated via a **LangGraph** state machine, exposed through
a **FastAPI** backend, and visualized in a real-time **Next.js** command-center dashboard.

This is not a chatbot wrapper. It is a planning → delegation → execution → evaluation →
retry pipeline with durable state, human-in-the-loop checkpoints, and observable agent
communication.

## Why this project exists

Most "AI agent" portfolio projects are a single LLM call with a couple of tools bolted
on. AgentVerse demonstrates the actual primitives that matter in production agentic
systems:

- **Explicit planning artifacts** (a Plan is a first-class object, not implicit in a prompt)
- **A real orchestration graph** with conditional routing, not nested if/else
- **Reflection & retry as graph nodes**, so agents can be sent back to redo work
- **Durable, inspectable state** (Postgres for history, Redis for hot state, a vector
  store for semantic memory)
- **Human-in-the-loop interrupts** for high-stakes actions
- **Observability**: every agent step, tool call, and token is traceable end-to-end

## Architecture

```
                       ┌─────────────────────────┐
                       │   Next.js Dashboard      │
                       │  (chat, agent network,   │
                       │   live execution, KPIs)  │
                       └────────────┬─────────────┘
                                    │ REST + WebSocket
                       ┌────────────▼─────────────┐
                       │      FastAPI Gateway      │
                       │  auth · routes · streaming│
                       └────────────┬─────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │   LangGraph Orchestrator  │
                       │  plan → route → evaluate  │
                       └───┬───┬───┬───┬───┬───────┘
                           │   │   │   │   │
                 ┌─────────┘   │   │   │   └─────────┐
                 ▼             ▼   ▼   ▼             ▼
            Research      Data    Coding   Writer   Critic
             Agent       Agent    Agent    Agent    Agent
                 │             │   │   │             │
                 └──────┬──────┴───┴───┴──────┬──────┘
                        ▼                      ▼
                  Memory Agent          Tool Execution Layer
                (Redis + Vector DB)      (search, sandbox, files)
                        │
                        ▼
                 PostgreSQL (users, tasks, executions, reports)
```

See `docs/ARCHITECTURE.md` for the full data-flow and state-machine diagram, and
`docs/PHASES.md` for the build roadmap.

## Repository structure

```
backend/
  agents/            # One module per agent (orchestrator, research, data, coding, writer, critic, memory)
  graphs/             # LangGraph StateGraph definitions + node/edge logic
  tools/              # Tool implementations (web search, code exec, file IO, vector retrieval)
  memory/             # Short-term (Redis) and long-term (vector store) memory managers
  api/                # FastAPI routers, websocket handlers, request/response schemas
  database/           # SQLAlchemy models, repositories, migrations
  core/               # Config, logging, security, dependency wiring
  tests/              # Unit + integration tests

frontend/
  app/                # Next.js app router pages
  components/agents/  # Agent network graph visualization
  components/dashboard/ # Analytics + KPI widgets
  components/chat/    # Streaming chat interface
  hooks/              # WebSocket + API hooks

docker/               # Dockerfiles + compose
docs/                 # Architecture docs, diagrams, phase plan
```

## Tech stack

| Layer | Choice |
|---|---|
| Orchestration | LangGraph + LangChain |
| LLM | Anthropic Claude (configurable, OpenAI-compatible fallback) |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Relational DB | PostgreSQL + SQLAlchemy (async) |
| Cache / hot state | Redis |
| Vector DB | Qdrant (swappable for pgvector/Chroma) |
| Frontend | Next.js 14 (App Router), React, Tailwind, Framer Motion |
| Realtime | WebSockets |
| Infra | Docker Compose |

## Getting started (Phase 1 scope)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then visit `http://localhost:8000/docs` for the live OpenAPI schema and
`http://localhost:8000/health` to confirm Postgres/Redis/Qdrant connectivity.

## Build roadmap

This repo is being built in 8 phases (see `docs/PHASES.md`):

1. **Project setup & architecture** ✅ (this phase)
2. Backend foundation (config, logging, DB models, health checks)
3. Agent system (base agent class + all 7 agents, tool interfaces)
4. LangGraph workflows (planning graph, routing, reflection/retry loop)
5. RAG + memory (vector ingestion, retrieval, short/long-term memory)
6. Frontend dashboard (chat, agent network viz, live execution feed)
7. Real-time visualization (WebSocket streaming of agent state)
8. Testing & deployment (integration tests, CI, Docker production build)

## Recent Updates

### LLM Orchestration & Fallback Fixes
- **Robust Key Rotation**: Implemented a per-request round-robin API key manager that distributes load across multiple Google Gemini API keys to avoid quota exhaustion on free tiers.
- **Automatic Fallback Pipeline**: If a key hits a `429 Too Many Requests` limit, the system gracefully traps the error, places the key in a 60-second cooldown, and immediately retries the prompt with the next available key. If all Google keys are exhausted, the system automatically falls back to a HuggingFace inference endpoint (`Qwen/Qwen2.5-Coder-32B-Instruct`).
- **LangChain SecretStr Bug Fix**: Fixed a critical crash where LangChain's Pydantic `SecretStr` object was breaking the cooldown dictionary lookup during rate limit handling, ensuring smooth error recovery.
- **Agent Caching Fix**: Modified the BaseAgent so it requests a fresh LLM instance on every `run()` call, ensuring that API key rotation properly propagates to long-lived agent instances.

## License

MIT — use freely for your own portfolio.
