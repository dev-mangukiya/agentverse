# Backend performance and quality verification

The API now has a total turn deadline (180 seconds), provider concurrency slots, owner turn limits, a 16-call model budget, output-token caps, and bounded independent tool batches. Specialist and comparison execution share one tool loop. Cancellation preserves delivered text; no fallback repeats a partially delivered answer.

Routing is tool-free and concise. A validated plan has at most three distinct specialists. Research precedes downstream writing, and synthesis is omitted when the writer already has the final answer. Document readers analyze supplied text directly; they no longer call tools that merely echo it. Document generators return a short download response instead of repeating the full report.

Runs persist first-token and total latency, stage durations/statuses, model-call counts, and provider-reported token usage. Tool execution records support actual tool counts. Dashboard timing samples use completed runs, and percentiles require 20 samples. Older answers do not get invented timings.

Quality inputs retain roles and original constraints. Retrieved URLs are deduplicated in a source ledger. Reviews include answer, request, context, and evidence; truncation produces a partial review without a numeric score. Invalid/unavailable scores remain unavailable. Reviews are advisory. “Improve answer” requests one new bounded revision and preserves previous text.

Use `backend/scripts/benchmark.py --live --max-calls 12` with configured credentials to produce latency/answer evidence from the fixtures in `backend/evals/cases.json`. This measures individual specialists with a shared call budget, not the entire chat-routing path or hosting cold starts. Review correctness, source support, requested length/language, and task completion manually alongside the automatic checks. Use run telemetry for complete-turn cold and warm hosting samples. Compare p50/p95 only with enough samples, and record model/configuration alongside results.

Local offline tests verify ordering, isolation, cancellation, validation, and persistence. They cannot measure live model quality, hosting cold starts, external tool latency, or quota availability. No measured speedup or score increase is claimed before a staging benchmark.
