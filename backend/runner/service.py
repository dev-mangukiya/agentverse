"""Deploy on a dedicated execution host. The API container must not mount Docker."""

import asyncio
import hmac
import os
import uuid
from contextlib import suppress
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
slots = asyncio.Semaphore(2)
IMAGE = os.environ.get("RUNNER_IMAGE", "agentverse-execution:local")
TOKEN = os.environ.get("RUNNER_TOKEN", "")


class Execution(BaseModel):
    code: str = Field(max_length=50000)
    language: str = Field(pattern=r"^(python|javascript|bash)$")
    timeout: int = Field(default=30, ge=1, le=30)


async def collect(stream):
    data = bytearray()
    while True:
        chunk = await stream.read(4096)
        if not chunk:
            return data.decode(errors="replace")
        data.extend(chunk)
        if len(data) > 12000:
            raise ValueError("Execution output exceeded 12 KB")


async def destroy(name):
    process = await asyncio.create_subprocess_exec(
        "docker",
        "rm",
        "-f",
        name,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await asyncio.wait_for(process.wait(), 5)


@app.post("/execute")
async def execute(
    body: Execution, request: Request, authorization: str | None = Header(None)
):
    if len(TOKEN) < 32 or not hmac.compare_digest(
        (authorization or "").encode(), ("Bearer " + TOKEN).encode()
    ):
        raise HTTPException(401, "Unauthorized")
    try:
        await asyncio.wait_for(slots.acquire(), 1)
    except TimeoutError:
        raise HTTPException(429, "Execution slots busy")
    name = "agentverse-run-" + uuid.uuid4().hex
    process = None

    async def disconnected():
        while True:
            if await request.is_disconnected():
                raise RuntimeError("Client disconnected")
            await asyncio.sleep(0.2)

    tasks = []
    try:
        executable = {
            "python": ["python", "-I", "-c", body.code],
            "javascript": ["node", "--eval", body.code],
            "bash": ["bash", "--noprofile", "--norc", "-c", body.code],
        }[body.language]
        # No volumes, app environment, credentials, or network reach the container.
        process = await asyncio.create_subprocess_exec(
            "docker",
            "run",
            "--rm",
            "--pull=never",
            "--name",
            name,
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--user=65534:65534",
            "--memory=256m",
            "--memory-swap=256m",
            "--cpus=0.5",
            "--pids-limit=64",
            "--ulimit=cpu=30:30",
            "--ulimit=fsize=10485760:10485760",
            "--tmpfs=/tmp:rw,noexec,nosuid,size=32m",
            "--workdir=/tmp",
            IMAGE,
            *executable,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async def result():
            stdout, stderr = await asyncio.gather(
                collect(process.stdout), collect(process.stderr)
            )
            return {
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": await process.wait(),
            }

        tasks = [asyncio.create_task(result()), asyncio.create_task(disconnected())]
        done, _ = await asyncio.wait(
            tasks, timeout=body.timeout, return_when=asyncio.FIRST_COMPLETED
        )
        if not done:
            raise TimeoutError()
        return await next(iter(done))
    except (TimeoutError, ValueError, RuntimeError) as exc:
        return {
            "stdout": "",
            "stderr": str(exc) or "Execution timed out",
            "exit_code": 1,
        }
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        with suppress(Exception):
            await asyncio.shield(destroy(name))
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        slots.release()
