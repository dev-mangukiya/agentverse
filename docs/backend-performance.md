# Backend response time and answer quality

This pass fixes verified code paths. It does not establish production latency or
higher model scores: no local AI provider key or production trace was available.

## Findings and changes

- Research previously required a date lookup, 2–3 searches, and 3–5 page fetches
  for every request. It now starts with the evidence the task needs and expands
  when necessary. The current UTC date is supplied in the system prompt.
- Independent searches/page reads run concurrently, up to four per tool batch.
  Tool results retain call order. Code, writes, approvals, and connector actions
  remain sequential, with barriers between independent read groups.
- Routing uses a concise prompt without tool schemas. Its deadline is 25 seconds.
  Gemini 2.5 Flash/Flash-Lite routing disables thinking; answer-generating models
  retain their reasoning settings. Other models are unchanged.
- Research→writer dependencies are respected even when the router labels them
  parallel. The writer consumes completed research and streams the final answer,
  avoiding a redundant synthesis call. Automatic critics run after the answer.
- Synthesis uses a separate final-answer prompt with the original request,
  conversation context, and source links. It cannot delegate again.
- The data agent no longer requests invented market statistics without data.
  It can retrieve evidence or explain what data is missing.
- Recent conversation messages are kept whole within a 15,000-character budget,
  rather than cutting every previous answer at 2,000 characters.
- Tool-budget exhaustion reserves a final model round to answer from evidence.
  Empty outputs and unavailable specialists produce errors instead of exposing
  internal directives or passing raw tool logs off as finished work.
- Provider fallback retains tool definitions using the destination adapter.
  A known failed stream is not repeated against the same provider. Fallback
  attempts share one 120-second deadline rather than resetting it per attempt.
- Page downloads allow up to 500 KB; 50 KB often captured only page headers.

## Critic integrity

Previously the critic saw only 1,000 characters of the request and 3,000 of the
answer, without prior conversation context or tool evidence. A missing score
could become 1/10. Those are review defects, not evidence of actual answer quality.

Chat and comparison now share input construction and strict score validation.
Normal answers are reviewed in full, including endings and citations. Context
limits are explicit (request 24k, answer 60k, history 16k, evidence 24k characters).
Oversized request/answer/history receives a partial review without a numeric
score. Evidence excerpts are labelled. Invalid scores are not saved.

The rubric assesses the requested scope and constraints. It neither demands
unrequested production features nor grants higher scores automatically. The
critic can compare retrieved evidence but cannot claim independent web checking
or code execution. Reviews remain advisory, not proof of factual correctness.

## Configuration and diagnosis

Defaults are documented in `.env.example`:

- `ROUTING_TIMEOUT_SECONDS=25`
- `TOOL_TIMEOUT_SECONDS=25` for independent reads; other tools receive at least
  60 seconds within their agent deadline.
- `MAX_PARALLEL_TOOLS=4` (1–8, per active tool batch)

Existing agent deadlines still bound whole turns. These settings do not remove
hosting cold starts, provider rate limits, or slow upstream model responses.

New log events:

- `chat.first_token`: time to first visible text.
- `tool.complete`: tool name and execution duration.
- `chat.answer_complete`: total answer time, first-token time, answer length,
  and contributing specialists.
- `critic.complete`: review duration, score, and whether context was partial.

To validate a deployment, repeat the same representative prompts (brief email,
sourced current-facts question, long code answer, data analysis, and follow-up)
using the same provider/model. Compare first-token and total times separately;
inspect critic comments against the full answer. Do not optimize only for scores.
Cold and warm requests should be measured separately.

## Local verification

Run from the repository root with the installed Python environment:

```sh
APP_DEBUG=false PYTHONPATH=backend python -m pytest backend/tests -q
npm test --prefix frontend
```

Regression coverage includes read concurrency/order, timeouts and cancellation,
fallback tool preservation, full review context, score validation, dependency
ordering, synthesis constraints, and completion after the tool budget.

The Gemini routing setting follows the official
[thinking documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking)
and the installed LangChain adapter's supported `thinking_budget` parameter.
