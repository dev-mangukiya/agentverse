from contextvars import ContextVar

stages: ContextVar[list | None] = ContextVar("stages", default=None)


def record_stage(agent, kind, status, duration_ms):
    records = stages.get()
    if records is not None:
        records.append(
            {"agent": agent, "kind": kind, "status": status, "duration_ms": duration_ms}
        )


usage = ContextVar("usage", default=None)


def record_usage(response):
    data = getattr(response, "usage_metadata", None) or {}
    counters = usage.get()
    if counters is not None:
        for key in ("input_tokens", "output_tokens", "total_tokens"):
            value = data.get(key)
            if isinstance(value, int):
                counters[key] = counters.get(key, 0) + value
