# Backend hardening — implementation and rollout status

Updated 29 October 2026. This implements the core security, correctness, persistence, and execution-control work from the backend audit against `9b88c416`. Validation below was performed locally before publishing these changes. No production migration or deployment has been verified.

## Implemented

| Area | What changed |
| --- | --- |
| Ownership | Shared checks for conversations, sockets, feedback, stats, custom agents, comparisons, files, and memory. Signed credentials refer to revocable database sessions. Guest-to-account migration clears the old capability and preserves conflicting custom-agent names. |
| WebSockets | Authentication before chat work, explicit origins, correct static event route, bounded payloads, session/ownership rechecks on open connections, and owner-scoped review broadcasts. Frontend reconnects after identity changes and stops retrying rejected credentials. |
| Authentication | Email/password validation, bcrypt byte limits and hashing off the event loop, strict Google audience/subject verification, deliberate linking, password change/reset, one-use recovery tokens, logout revocation, and account deletion. Recovery page and SMTP integration included. |
| Tool boundaries | No execution on the API host. Code tools require the separate restricted runner. File tools use owned database artifacts. Calculator interprets bounded arithmetic. URL fetching checks public DNS/address/redirect destinations and byte/time limits. |
| Approvals | Persisted exact-action approvals, connector owner permissions, atomic one-time consumption, expiry, and uncertain-result handling. Plain chat text grants no approval. Status survives reload; completed actions cannot replay. |
| Storage | Durable run/tool/artifact/approval/session/recovery/job records. Ordered schema revisions fail visibly; PostgreSQL migrations use an advisory lock. SQLite foreign keys are enabled. Files persist with expiry and quotas. |
| Recovery | Job leases, bounded delayed retries, terminal failure states, failed-review status, and supervised workers. Shutdown cancels tasks and closes clients/SQL. Deleted conversations cascade to SQL child records. |
| Limits | One active run per conversation, request deduplication, total deadlines, shared foreground/model/tool concurrency, owner limits, output/model-call caps, cancellation, and comparison budgets. CORS preflight is exempt; rejected messages do not grow rate-limit memory. |
| Performance | Blocking password/PDF/document work is offloaded. Chat lists avoid loading bodies; history is paginated and exports include all messages. Runs store first-token/total/stage timings and reported token usage. Dashboard metrics use run/tool records. |
| Routing/providers | Selected provider honored, mismatched model families rejected, caches bounded, global credential mutation removed, tool bindings retained on fallback, and typed provider statuses used. Plans bound specialist count and forbid self-delegation. Router sees the owner's active custom specialists. |
| Quality | Role-preserving history, shorter prompts, source/evidence ledger, chunked scoped memory, background advisory reviews, partial/unavailable scoring, and explicit bounded “Improve answer” preserving the original. |
| Concrete defects | Custom model factory, event-route shadowing, CORS ordering, failures treated as successful answers, comparison error exposure, PDF Unicode/fonts, spreadsheet titles/formulas, HTML escaping, and SQLite timestamp comparisons. |
| Delivery | Locked Python dependencies, obsolete/vulnerable dependencies removed, Python 3.12 non-root container, production origins/storage validation, health/liveness separation, CI with PostgreSQL/container checks, and opt-in benchmark/smoke tools. Scheduled keep-alive traffic removed. |

Responsibilities are extracted into security/services and routing/context/source/telemetry helpers. The chat route module remains large; its full transport/service decomposition is unfinished.

## Local verification

| Check | Result |
| --- | --- |
| Backend tests | **87 passed, 1 skipped**; PostgreSQL test skipped locally. |
| Real-process lifecycle | Startup, private session/chat creation, clean shutdown, restart, persisted access, and unauthorized denial verified against isolated SQLite. |
| Frontend tests | **29 passed**. |
| TypeScript / Next.js production build | Passed. |
| Ruff | Passed for application, runner, scripts, and tests. |
| Python dependency consistency | No broken requirements. |
| Locked backend dependency audit | No known vulnerabilities reported by the local pip-audit run; a point-in-time package scan. |
| Diff whitespace | git diff --check passed. |

Tests use isolated fixtures and do not send production chat or connector writes. They cover cross-owner access, revoked/forged sessions, open-socket revocation, approvals/recovery, custom-agent migration collisions, documents, private files, URL/calculator restrictions, streaming/Stop, roles, jobs, pagination/export, legacy SQLite migration, and restart.

No live model benchmark, production database operation, visual browser check, Docker build, or execution-host isolation test was performed locally. Offline tests do not establish faster live responses or higher factual quality.

## Deployment acceptance still required

1. Back up PostgreSQL and rehearse migration plus restore on an isolated copy. Confirm the PostgreSQL migration and container checks pass in CI before accepting rollout. Legacy unowned custom agents require explicit assignment to a verified owner; migration does not guess.
2. Configure PostgreSQL, random signing secret, production mode, debug off, chosen provider/model/key, explicit frontend origins, and trusted proxy addresses. Verify /live and /health through the real proxy.
3. Deploy frontend/backend together because authentication changed. Existing account users must sign in again. Verify guest migration, logout, ownership, pagination/export, and downloads.
4. Rehearse Redis/Qdrant outage recovery. Use the new memory collection and explicitly reindex authorized history with backend/scripts/reindex_memory.py. Legacy vectors are not reassigned automatically. Verify physical cleanup after a vector outage.
5. Before enabling execution, verify the dedicated runner blocks network, API secrets, application paths, excessive resources/output, and work surviving timeout/disconnect. There is no API-host execution fallback.
6. Verify configured OAuth/SMTP end to end. Test approved connector actions against a deliberate test destination using CONNECTOR_OWNER_ID.
7. Run backend/test_ws.py against an explicit staging URL and backend/scripts/benchmark.py with --live --max-calls 12. The benchmark measures individual specialists with a shared call cap. Use run telemetry for whole-chat warm/cold latency and human-check answers/citations before claiming improvement.

This environment lacks live provider credentials, a PostgreSQL server, Docker daemon, configured SMTP/OAuth test accounts, and an authorized production deployment connection. These checks remain open.

## Audit proposals not implemented here

| Enhancement | Current boundary |
| --- | --- |
| Provider-native routing schema / complete chat-module split | Bounded directives validated; separation partial. |
| Resumable generation / cross-instance event replay | Disconnect cancels; saved history reloads. Live delivery remains process-local. |
| Fleet-wide concurrency / daily token or monetary quotas | Redis owner admission and per-process concurrency; usage recorded, no billing/daily-budget system. |
| Per-user memory preferences, retention UI, durable vector-deletion retries | SQL membership blocks stale/foreign retrieval; physical Qdrant deletion is best effort during outages. |
| Object-store adapter / richer dataset-image follow-up | Bounded SQL artifacts persist originals; image bytes are not automatically re-injected into later turns. |
| Per-user connector OAuth / full account-settings UI | Restricted shared credentials and account lifecycle APIs; recovery has a page, other account actions do not have dedicated settings screens. |
| Local-account verification emails | Google verified claims enforced; password-created email verification remains separate. |
| Runner plot/file export / richer report layouts | Runner files temporary; document tools create durable downloads. Full font/language/layout coverage is not claimed. |
| Larger calibrated quality/evidence evaluation | Small fixture suite and source ledger; human citation checks, broader evaluations, secondary search fallback, and confidence calibration remain work. |

The application uses its own ordered migration mechanism rather than Alembic. The old unused task table is retained for compatibility. No destructive legacy-table cleanup, object-store migration, distributed framework rewrite, or extra specialists are included.
