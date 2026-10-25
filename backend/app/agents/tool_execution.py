"""Run independent read-only calls concurrently; preserve order for other tools."""
import asyncio
import time

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
# Only these calls can safely overlap. Code, writes, approvals, and connector
# actions remain ordered, including barriers between groups of read-only calls.
PARALLEL_READ_TOOLS = frozenset({'web_search', 'fetch_url', 'get_current_time', 'calculate'})


async def execute_tool_calls(tool_calls, tools, on_start=None, on_result=None):
    settings = get_settings()
    tool_map = {tool.name: tool for tool in tools}
    semaphore = asyncio.Semaphore(settings.max_parallel_tools)

    async def execute(call):
        async with semaphore:
            started = time.monotonic()
            if on_start:
                await on_start(call)
            try:
                tool = tool_map.get(call['name'])
                if tool is None:
                    result = f"Unknown tool: {call['name']}"
                else:
                    timeout = settings.tool_timeout_seconds if call['name'] in PARALLEL_READ_TOOLS else max(60, settings.tool_timeout_seconds)
                    result = await asyncio.wait_for(tool.ainvoke(call['args']), timeout)
            except asyncio.TimeoutError:
                result = f"Tool {call['name']} timed out. Its result is unavailable; do not invent it."
            except Exception as exc:
                result = f'Tool error: {exc}'
            duration = int((time.monotonic() - started) * 1000)
            logger.info('tool.complete', tool=call['name'], duration_ms=duration)
            if on_result:
                await on_result(call, str(result), duration)
            return str(result)

    results = []
    pending = []
    async def flush():
        if pending:
            tasks = [asyncio.create_task(execute(call)) for call in pending]
            try:
                results.extend(await asyncio.gather(*tasks))
            finally:
                for task in tasks:
                    if not task.done(): task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            pending.clear()

    for call in tool_calls:
        if call['name'] in PARALLEL_READ_TOOLS:
            pending.append(call)
        else:
            await flush()
            results.append(await execute(call))
    await flush()
    return results
