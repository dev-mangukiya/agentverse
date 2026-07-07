# Build Roadmap

- [x] **Phase 1 — Project setup & architecture**: repo structure, docs, docker-compose,
      env config, dependency manifests.
- [ ] **Phase 2 — Backend foundation**: FastAPI app factory, settings (pydantic-settings),
      structured logging, SQLAlchemy async engine + base models, health-check endpoint
      that pings Postgres/Redis/Qdrant.
- [ ] **Phase 3 — Agent system**: `BaseAgent` abstract class, concrete Orchestrator /
      Research / Data / Coding / Writer / Critic / Memory agents, tool interfaces
      (web search, code sandbox, file parsing, vector retrieval).
- [ ] **Phase 4 — LangGraph workflows**: `AgentState` schema, graph builder, conditional
      routing edges, retry/reflection loop, Postgres checkpointer.
- [ ] **Phase 5 — RAG + memory**: document ingestion pipeline, chunking/embeddings,
      Qdrant collections, short-term Redis memory manager, long-term memory retrieval
      tool for agents.
- [ ] **Phase 6 — Frontend dashboard**: Next.js app shell, chat interface with streaming,
      file upload, Tailwind design system.
- [ ] **Phase 7 — Real-time visualization**: WebSocket hook, agent network graph
      (force-directed), live execution feed, Framer Motion transitions.
- [ ] **Phase 8 — Testing & deployment**: pytest suite for agents/graph, integration
      tests against test containers, GitHub Actions CI, production Dockerfiles.

Each phase will land as working, runnable code with its own test instructions —
no phase depends on stubbed-out code from a later phase.
