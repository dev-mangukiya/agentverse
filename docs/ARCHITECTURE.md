# AgentVerse backend architecture

This describes the implemented runtime after the October 2026 backend audit. The earlier LangGraph/checkpoint design was a proposal, not the running application.

## Request and ownership flow

The browser exchanges its legacy guest capability once for a signed, persisted guest session. Registered sessions use the same session table and can be revoked. Every conversation, feedback edit, custom agent, download, comparison, memory lookup, and dashboard query checks the owner. Guest migration clears `session_id` on account conversations and revokes the old guest credential. Existing account JWTs without a session ID require a fresh login.

WebSockets accept a transport connection, require an authentication frame within five seconds, and verify conversation ownership before accepting chat messages. Open connections recheck session/ownership on frames and at five-second idle intervals; revocation cancels active work. Tokens never enter socket URLs. `/ws/events` precedes the parameterized route. Dashboard broadcasts are owner scoped and bounded by send deadlines. Socket updates are local to the process; persisted history remains the source of truth after reconnect or across instances.

## Turn execution

`services/runs.py` creates a durable run, deduplicates client request IDs, and reserves a unique active conversation. The main API worker admits four foreground turns by default. Provider calls also share six model slots. Owner turn limits use Redis when available, with a bounded local fallback. Deploy one API worker per container; process-local semaphores are not a fleet-wide distributed scheduler.

A turn has a 180-second deadline, a 16-call model budget, bounded output tokens, and a validated plan with at most three unique specialists. Routing currently uses validated DELEGATE/PARALLEL directives, not provider-native structured output. The research→writer dependency is preserved. Final synthesis has no tools. Provider errors propagate as failures, and streamed partial output is preserved on Stop, errors, and timeouts. A disconnected socket cancels its active turn; reconnect loads saved history rather than resuming generation.

History keeps user/assistant roles distinct from system instructions, including specialist handoffs that append research. Recent saved images are restored only from unexpired artifacts in the same owned conversation; a shared three-image budget prioritizes current uploads. Missing images are explicitly unavailable to the model. Plain specialist evidence is passed as untrusted context. Tool results feed a bounded source ledger, with canonical URLs and page-versus-snippet provenance. Critic review runs after response persistence. It has explicit pending/completed/partial/failed states; truncated or unavailable visual evidence cannot receive a numeric score. “Improve answer” creates one new revision on request and preserves the original.

## Storage and background work

PostgreSQL is required in production. SQLite supports local development with foreign keys enabled. Ordered revisions in `database/migrations.py` are recorded in `schema_revisions`; failures abort startup. PostgreSQL uses a migration advisory lock. The migration adopts legacy tables and preserves legacy custom agents without assigning their private prompts to an arbitrary owner.

Runs store status, first-token and total durations, model-call counts, per-stage timings, and token usage when the provider reports it. Tool executions store name/status/duration. The older `TaskExecution` table is retained for compatibility; new execution records use `Run`.

Review and embedding jobs persist in SQL. Two workers claim jobs atomically, enforce a queue cap, recover expired leases, and retry bounded failures with delay. Stale foreground runs are marked interrupted after their maximum execution allowance; they are never automatically replayed. Jobs and startup tasks are cancelled on shutdown.

Generated files and validated uploaded bytes are stored as owned, expiring database artifacts. This trades database space for durability without requiring another storage account. Files are limited to 5 MB each and a 25 MB owner workspace. Downloads check owner and expiry; HTML downloads are forced attachments with a sandbox policy. An object-store adapter is a future scaling choice, not a prerequisite for this deployment.

Qdrant uses a new `agentverse_memory_v2` collection with 768-dimensional normalized embeddings. Six overlapping chunks per message bound indexing cost. Every query includes an owner filter and a current SQL conversation-membership filter, so deleted conversations cannot be retrieved from stale vectors. Reindex old authorized messages explicitly using the supplied script.

Chat/account deletion writes a `memory_deletions` outbox entry before deleting SQL content, in the same transaction. Revision `20261029_02` introduces this table without a conversation/account foreign key so cleanup survives deletion. A supervised worker waits 120 seconds for existing indexing jobs, claims a 60-second lease, and bounds each deletion attempt to 10 seconds. Failures retry indefinitely with backoff capped at one hour; a disabled Qdrant configuration retains pending entries. The worker removes an entry only after confirmed deletion (or a missing collection), with a lease-token check protecting newer requests. Indexing stops after loss of ownership and schedules another sweep if a write races deletion. SQL membership blocks retrieval immediately while physical cleanup is pending. This mechanism cannot recover deletion intents lost before it was deployed.

## Tool boundary

The calculator interprets a small bounded arithmetic AST. File tools operate on private database artifacts and never open API-host paths. Web fetching validates every redirect, resolves only public addresses, connects to those checked addresses, and caps time and downloaded bytes. Compressed responses are rejected to avoid decompression expansion.

Generated code has no API-host fallback. `tools/code_sandbox.py` talks to a separately configured execution service. The optional runner launches a fresh container with no network, no mounts/app secrets, a read-only root filesystem, an unprivileged user, and CPU/memory/process/output limits. The runner and its Docker daemon belong on a dedicated host. They must never be mounted into the main API service.

Slack/Linear credentials are restricted to `CONNECTOR_OWNER_ID`. Side-effect execution pauses for a persisted, expiring, exact-payload approval. Authenticated approval consumption is atomic and one-time, with a second exact-argument check inside connector tools. Plain “APPROVED” chat text grants no permission. Uncertain external results are not automatically retried. A successful action is saved into the conversation; the original pipeline is not silently replayed.

## Operational limits

Google keys in a deployment are conservatively treated as one project quota; rotation does not create more quota. Free-host cold starts remain a hosting property. Optional Redis and Qdrant failures degrade availability of their features without exposing credentials. `/health` returns 503 for a failed database; `llm: configured` is configuration status, not a successful model probe.

SMTP recovery, Google OAuth, connectors, isolated execution, backup restore, and production model quality require configured infrastructure and separate staging verification. CI covers offline regressions, dependency scanning, PostgreSQL migrations, frontend checks, and an API Docker build. No automatic quality-repair loop or blanket factual-correctness guarantee is claimed.
