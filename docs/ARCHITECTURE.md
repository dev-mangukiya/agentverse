# AgentVerse — Architecture Deep Dive

## 1. Design principles

1. **Plans are objects, not vibes.** The Orchestrator produces a structured `Plan`
   (list of `Task` objects with `agent`, `goal`, `dependencies`, `status`) that is
   persisted to Postgres before any agent executes. This is what makes the system
   inspectable and demoable — you can show a recruiter the actual plan JSON.
2. **The graph is the source of truth for control flow.** Routing between agents is
   a LangGraph conditional edge function reading `state["next_agent"]`, not a chain
   of `if` statements in application code.
3. **Reflection and retry are nodes, not exceptions.** The Critic agent's output
   updates `state["evaluation"]`; a conditional edge sends the task back to the
   originating agent (up to `max_retries`) or forward to the Writer for final
   synthesis.
4. **Memory is layered.** Redis holds hot, ephemeral state (current run's scratch
   memory, in-flight task state) with TTLs. The vector DB holds durable semantic
   memory (past conversations, ingested documents) keyed by user.
5. **Everything emits events.** Every node transition publishes a WebSocket event
   `{agent, status, message, timestamp}` so the frontend's live execution feed and
   agent network graph are driven by real state, not simulated.

## 2. LangGraph state machine

```
                         ┌─────────────┐
                         │   START     │
                         └──────┬──────┘
                                ▼
                       ┌─────────────────┐
                       │  Orchestrator   │  ← builds/updates Plan
                       │   (planner)     │
                       └────────┬────────┘
                                ▼
                     ┌─────────────────────┐
                     │   route_next_task    │  (conditional edge)
                     └──┬───┬───┬───┬───┬───┘
             ┌──────────┘   │   │   │   └───────────┐
             ▼               ▼   ▼   ▼               ▼
        ┌─────────┐   ┌─────────┐ ┌───────┐   ┌───────────┐
        │Research │   │  Data   │ │Coding │   │  Writer   │
        │ Agent   │   │ Agent   │ │Agent  │   │  Agent    │
        └────┬────┘   └────┬────┘ └───┬───┘   └─────┬─────┘
             └────────────┬─┴──────────┴──────────────┘
                          ▼
                    ┌───────────┐
                    │  Critic   │  ← reflection / scoring
                    └─────┬─────┘
                          ▼
                 ┌──────────────────┐
                 │ evaluation_gate   │ (conditional edge)
                 └──┬─────────────┬─┘
           needs_retry           passed / max_retries_hit
                 │                     │
                 ▼                     ▼
          (back to originating   ┌───────────┐
           agent node)           │    END     │
                                 └───────────┘
```

Every node reads/writes a single shared `AgentState` (TypedDict) that flows through
the graph — this is the core LangGraph pattern and the thing to be able to whiteboard
in an interview.

## 3. Core state schema (conceptual)

```python
class AgentState(TypedDict):
    user_id: str
    session_id: str
    goal: str
    plan: list[Task]
    current_task_index: int
    agent_outputs: dict[str, Any]
    evaluation: dict | None
    retry_count: dict[str, int]
    next_agent: str | None
    requires_human_approval: bool
    final_output: str | None
```

## 4. Human-in-the-loop

LangGraph's `interrupt` mechanism pauses graph execution before any node flagged as
sensitive (e.g., "send email", "execute shell command", "commit code"). The FastAPI
layer surfaces this as a `pending_approval` task in Postgres; the frontend renders an
approve/reject modal; approval resumes the graph from its checkpoint via LangGraph's
checkpointer (Postgres-backed `PostgresSaver`).

## 5. Data flow for a single request

1. User submits a goal via chat → FastAPI `/api/chat` → creates `Task` row, publishes
   to the graph with a fresh `thread_id`.
2. Orchestrator node calls the LLM with function-calling to produce a `Plan`.
3. Each task is routed to its agent node; agent emits progress events over WebSocket
   as it works (tool calls, intermediate reasoning).
4. Critic scores the output (0–1) against the task's stated goal; below threshold →
   retry (up to `MAX_RETRIES`, default 2); at/above → proceed.
5. Writer synthesizes all agent outputs into the final deliverable.
6. Memory Agent writes a summary embedding to the vector DB and updates Redis
   short-term state for the session.
7. Final output + full execution trace persisted to Postgres for the analytics
   dashboard.

## 6. Why Postgres *and* Redis *and* a vector DB

This three-tier storage story is worth stating explicitly to a reviewer:

- **Postgres**: source of truth, relational integrity, audit trail (users, tasks,
  executions, reports) — anything you need to query/join/report on.
- **Redis**: sub-millisecond hot state — current graph checkpoint cache, rate
  limiting, pub/sub for WebSocket fan-out across multiple backend replicas.
- **Vector DB (Qdrant)**: semantic recall — "what did we discuss about X last week,"
  RAG over ingested documents. Wrong tool for transactional data, right tool for
  similarity search.
