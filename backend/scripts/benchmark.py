"""Opt-in model benchmark. Writes evidence; never presents critic scores as truth."""

import argparse
import asyncio
import json
import time
from pathlib import Path
from app.api.routes.chat import _get_cached_agent
from app.core.config import get_settings
from app.security.identity import Owner, current_owner
from app.services.runs import model_calls
from app.agents.telemetry import usage


async def main(args):
    if not args.live:
        raise SystemExit(
            "Add --live to explicitly allow provider calls and their cost."
        )
    if not get_settings().llm_configured:
        raise SystemExit("No model credentials configured.")
    cases = json.loads(
        (Path(__file__).resolve().parents[1] / "evals/cases.json").read_text()
    )
    results = []
    settings = get_settings()
    original_budget = settings.max_model_calls_per_turn
    settings.max_model_calls_per_turn = args.max_calls
    budget_token = model_calls.set([0])
    usage_token = usage.set({})
    token = current_owner.set(Owner(session_id="benchmark-" + str(time.time_ns())))
    try:
        for case in cases:
            start = time.monotonic()
            try:
                agent = await _get_cached_agent(case["agent"])
                answer = await asyncio.wait_for(agent.run(case["prompt"]), 180)
                checks = {"word_limit": len(answer.split()) <= case["max_words"]}
                if case.get("contains"):
                    checks["contains_required"] = (
                        case["contains"].lower() in answer.lower()
                    )
                results.append(
                    {
                        "id": case["id"],
                        "latency_ms": round((time.monotonic() - start) * 1000),
                        "answer": answer,
                        "automatic_checks": checks,
                        "human_review_checklist": case["checks"],
                    }
                )
            except Exception as exc:
                results.append({"id": case["id"], "error_type": type(exc).__name__})
    finally:
        current_owner.reset(token)
        calls = model_calls.get()[0]
        tokens = dict(usage.get())
        model_calls.reset(budget_token)
        usage.reset(usage_token)
        settings.max_model_calls_per_turn = original_budget
    Path(args.output).write_text(
        json.dumps(
            {
                "scope": "individual specialists; does not measure complete chat routing or cold starts",
                "model_calls": min(calls, args.max_calls),
                "call_budget": args.max_calls,
                "reported_token_usage": tokens,
                "results": results,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    print(
        f"Wrote {len(results)} results to {args.output}. Human correctness review is still required."
    )
    if any(
        "error_type" in item or not all(item["automatic_checks"].values())
        for item in results
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--max-calls", type=int, default=12, choices=range(1, 41), metavar="1-40"
    )
    parser.add_argument("--output", default="benchmark-results.json")
    asyncio.run(main(parser.parse_args()))
