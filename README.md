# AgentVerse — Autonomous Multi-Agent AI Workforce Platform

AgentVerse is a production-grade multi-agent AI system where a **Chief Orchestrator** plans and delegates work across specialized agents (Research, Data Analyst, Coding, Writer, Critic). It is coordinated via a **LangGraph** state machine, exposed through a **FastAPI** backend, and visualized in a stunning real-time **Next.js** command-center dashboard.

This is not a simple chatbot wrapper. It is a full **planning → delegation → execution → evaluation → retry** pipeline with durable state, human-in-the-loop capabilities, and highly observable agent communications.

---

## 🚀 Live Demo & Deployment

- **Frontend**: Deployed on Vercel
- **Backend API**: Deployed on Render
- **Databases**: PostgreSQL (Render), Redis (Upstash)

---

## ✨ Core Features

- **Multi-Agent Orchestration**: A `Chief Orchestrator` intelligently breaks down user goals into parallel sub-tasks and delegates them to specialized agents (e.g., sending coding tasks to the Coding Agent, research to the Research Agent).
- **LangGraph State Machine**: Control flow, routing, reflection, and retry loops are strictly enforced by a Directed Acyclic Graph (DAG) state machine rather than nested if/else statements.
- **Robust LLM Fallback Pipeline**: 
  - Implements a thread-safe, per-request **round-robin API key manager** across multiple Google Gemini API keys to avoid free-tier quota exhaustion.
  - Automatically traps `429 Too Many Requests` limits, puts exhausted keys in a cooldown, and immediately retries the next available key.
  - Falls back to a **HuggingFace** Serverless Inference Endpoint (`Qwen/Qwen2.5-Coder-32B-Instruct`) if all primary Google keys are exhausted.
- **Real-time Observability**: WebSockets stream live status updates, tool executions, and LLM reasoning directly to the Next.js frontend, visualized via a dynamic force-directed agent network graph.
- **Durable Three-Tier Memory**:
  - **PostgreSQL**: Source of truth for users, tasks, and execution history.
  - **Redis**: Sub-millisecond hot state (scratch memory, rate limiting, pub/sub for WebSocket fan-out).
  - **Vector DB (Qdrant)**: Long-term semantic recall for conversational history and RAG (Retrieval-Augmented Generation).

---

## 🏗️ Architecture

```text
                       ┌─────────────────────────┐
                       │   Next.js Dashboard      │
                       │  (chat, agent network,   │
                       │   live execution, KPIs)  │
                       └────────────┬─────────────┘
                                    │ REST + WebSocket
                       ┌────────────▼─────────────┐
                       │      FastAPI Gateway     │
                       │  auth · routes · web-sock│
                       └────────────┬─────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │  LangGraph Orchestrator  │
                       │ plan → route → evaluate  │
                       └───┬───┬───┬───┬───┬──────┘
                           │   │   │   │   │
                 ┌─────────┘   │   │   │   └─────────┐
                 ▼             ▼   ▼   ▼             ▼
            Research      Data    Coding   Writer   Critic
             Agent       Agent    Agent    Agent    Agent
                 │             │   │   │             │
                 └──────┬──────┴───┴───┴──────┬──────┘
                        ▼                     ▼
                  Memory Agent          Tool Execution
                (Redis + Vector)        (search, code, files)
                        │
                        ▼
                 PostgreSQL (state checkpoints, analytics)
```

See `docs/ARCHITECTURE.md` for a deep dive into the state machine design.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| **Orchestration** | LangGraph + LangChain |
| **LLMs** | Google Gemini (Primary), HuggingFace / Qwen (Fallback), Anthropic/OpenAI (Supported) |
| **Backend API** | Python 3.11, FastAPI, Uvicorn, WebSockets |
| **Databases** | PostgreSQL (asyncpg), SQLAlchemy |
| **Cache / State** | Redis |
| **Vector DB** | Qdrant (swappable for pgvector/Chroma) |
| **Frontend** | Next.js 14 (App Router), React, TailwindCSS, Framer Motion |
| **Infrastructure** | Docker Compose, Render, Vercel |

---

## 📂 Repository Structure

```text
backend/
  ├── agents/            # Orchestrator, Research, Data, Coding, Writer, Critic, Memory
  ├── graphs/            # LangGraph StateGraph definitions + node/edge logic
  ├── tools/             # Tool implementations (web search, code exec, file IO, vector retrieval)
  ├── memory/            # Short-term (Redis) and long-term (vector store) memory managers
  ├── api/               # FastAPI routers, websocket handlers, request/response schemas
  ├── database/          # SQLAlchemy models, repositories, migrations
  ├── core/              # Config, logging, security, dependency wiring, LLM key rotation
  └── tests/             # Unit + integration tests

frontend/
  ├── app/               # Next.js app router pages
  ├── components/agents/ # Agent network graph visualization (Force-directed graph)
  ├── components/dashboard/ # Analytics + KPI widgets
  ├── components/chat/   # Streaming chat interface with markdown & tool call rendering
  └── hooks/             # WebSocket + API hooks

docker/                  # Dockerfiles + compose configs
docs/                    # Architecture docs, diagrams, phase plan
```

---

## 🚀 Getting Started (Local Development)

### 1. Environment Setup

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```
Ensure you provide at least one `GOOGLE_API_KEY`. You can supply multiple keys in `GOOGLE_API_KEYS` (comma-separated) to enable the automatic round-robin fallback system.

### 2. Start Supporting Services

Spin up Postgres, Redis, and Qdrant using Docker Compose:

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant
```

### 3. Start the Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload --port 8000
```
The API will be available at `http://localhost:8000`. You can test connectivity at `http://localhost:8000/health`.

### 4. Start the Frontend (Next.js)

In a new terminal window:

```bash
cd frontend
npm install
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

---

## 📈 Roadmap & Development Phases

We build in phases to ensure no phase depends on stubbed-out code from a later phase (see `docs/PHASES.md`):

1. **Phase 1**: Project setup & architecture ✅
2. **Phase 2**: Backend foundation (config, logging, DB models, health checks) ✅
3. **Phase 3**: Agent system (base agent class + all 7 agents, tool interfaces) ✅
4. **Phase 4**: LangGraph workflows (planning graph, routing, reflection/retry loop) ✅
5. **Phase 5**: RAG + memory (vector ingestion, retrieval, short/long-term memory) ✅
6. **Phase 6**: Frontend dashboard (chat, agent network viz, live execution feed) ✅
7. **Phase 7**: Real-time visualization (WebSocket streaming of agent state) ✅
8. **Phase 8**: Testing & deployment (Integration tests, Docker production builds, Render/Vercel deploy) ✅

---

## 📜 License & Contact

MIT — Use freely for your own portfolio.

**Author**: Dev Mangukiya  
**LinkedIn**: [linkedin.com/in/devmangukiya](https://www.linkedin.com/in/devmangukiya/)
