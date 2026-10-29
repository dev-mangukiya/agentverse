"""Client for a separately deployed isolated execution service. No host fallback."""

from dataclasses import dataclass
import httpx
from app.core.config import get_settings
from app.security.identity import require_context


@dataclass
class ExecutionResult:
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    language: str = "python"

    def to_display(self):
        return f"Exit code: {self.exit_code}\n{self.stdout}\n{self.stderr}".strip()


class CodeSandbox:
    @staticmethod
    async def execute(code, language="python", timeout=30):
        require_context()
        settings = get_settings()
        if not settings.execution_url or not settings.execution_token:
            return ExecutionResult(
                stderr="Code execution is unavailable: an isolated runner must be configured. Do not claim this code was tested.",
                exit_code=1,
                language=language,
            )
        if language not in ("python", "javascript", "bash") or len(code) > 50000:
            raise ValueError("Unsupported language or code exceeds 50 KB")
        async with httpx.AsyncClient(
            timeout=min(timeout, 30) + 5, trust_env=False
        ) as client:
            async with client.stream(
                "POST",
                settings.execution_url.rstrip("/") + "/execute",
                json={"code": code, "language": language, "timeout": min(timeout, 30)},
                headers={"Authorization": f"Bearer {settings.execution_token}"},
            ) as response:
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 40000:
                        raise ValueError("Runner output exceeds limit")
        import json

        result = json.loads(data)
        return ExecutionResult(
            stdout=str(result.get("stdout", ""))[:12000],
            stderr=str(result.get("stderr", ""))[:12000],
            exit_code=int(result.get("exit_code", 1)),
            language=language,
        )
