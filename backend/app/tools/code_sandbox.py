"""Secure code execution sandbox.

Provides isolated code execution with:
- Temporary directory per execution (filesystem isolation)
- Resource limits (timeout, output size)
- Multi-language support (Python, JavaScript, Bash)
- Security restrictions (blocked dangerous imports/commands)
"""

import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)

# Maximum output size in characters
MAX_OUTPUT_SIZE = 10_000
DEFAULT_TIMEOUT = 30


@dataclass
class ExecutionResult:
    """Result of a code execution."""
    language: str
    code: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    timed_out: bool = False
    error: str | None = None
    files_created: list[str] = field(default_factory=list)
    execution_time_ms: int = 0

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out and not self.error

    def to_display(self) -> str:
        """Format result for chat display."""
        parts: list[str] = []

        if self.stdout.strip():
            stdout = self.stdout.strip()
            if len(stdout) > MAX_OUTPUT_SIZE:
                stdout = stdout[:MAX_OUTPUT_SIZE] + f"\n... (output truncated, {len(self.stdout)} total chars)"
            parts.append(f"**Output:**\n```\n{stdout}\n```")

        if self.stderr.strip():
            stderr = self.stderr.strip()
            if len(stderr) > MAX_OUTPUT_SIZE:
                stderr = stderr[:MAX_OUTPUT_SIZE] + "\n... (truncated)"
            parts.append(f"**Errors:**\n```\n{stderr}\n```")

        if self.timed_out:
            parts.append(f"⏱️ **Timed out** after {DEFAULT_TIMEOUT}s")

        if self.error:
            parts.append(f"❌ **Error:** {self.error}")

        if self.files_created:
            parts.append(f"📁 **Files created:** {', '.join(self.files_created)}")

        if not parts:
            parts.append("✅ Code executed successfully (no output)")

        status = "✅" if self.success else "❌"
        header = f"{status} **{self.language.title()}** — {self.execution_time_ms}ms"
        if self.exit_code != 0 and not self.timed_out:
            header += f" (exit code {self.exit_code})"

        return f"{header}\n\n" + "\n\n".join(parts)


# Security: patterns that are blocked in code
BLOCKED_PYTHON_PATTERNS = [
    "os.system(",
    "subprocess.",
    "__import__('os')",
    '__import__("os")',
    "shutil.rmtree",
    "os.remove(",
    "os.rmdir(",
    "os.unlink(",
    # Block network access
    "urllib",
    "requests.get",
    "requests.post",
    "httpx.",
    "socket.",
]

BLOCKED_BASH_PATTERNS = [
    "rm -rf /",
    "rm -rf ~",
    "mkfs.",
    "dd if=",
    ":(){",  # fork bomb
    "wget ",
    "curl ",
    "nc ",  # netcat
]


def _check_security(code: str, language: str) -> str | None:
    """Check code for dangerous patterns. Returns error message or None."""
    if language == "python":
        for pattern in BLOCKED_PYTHON_PATTERNS:
            if pattern in code:
                return f"Blocked: code contains restricted pattern '{pattern}'"
    elif language == "bash":
        for pattern in BLOCKED_BASH_PATTERNS:
            if pattern in code:
                return f"Blocked: code contains restricted pattern '{pattern}'"
    return None


class CodeSandbox:
    """Manages isolated code execution environments."""

    @staticmethod
    async def execute(
        code: str,
        language: str = "python",
        timeout: int = DEFAULT_TIMEOUT,
    ) -> ExecutionResult:
        """Execute code in an isolated temporary directory.

        Args:
            code: The source code to execute.
            language: One of 'python', 'javascript', 'bash'.
            timeout: Max execution time in seconds.

        Returns:
            ExecutionResult with stdout, stderr, exit code, etc.
        """
        import time

        language = language.lower().strip()
        if language in ("js", "node"):
            language = "javascript"
        if language in ("sh", "shell"):
            language = "bash"
        if language in ("py",):
            language = "python"

        # Security check
        security_error = _check_security(code, language)
        if security_error:
            return ExecutionResult(
                language=language,
                code=code,
                error=security_error,
                exit_code=1,
            )

        # Create isolated temp directory
        sandbox_dir = tempfile.mkdtemp(prefix="cortex_sandbox_")
        logger.info("sandbox.created", dir=sandbox_dir, language=language)

        try:
            start = time.time()

            if language == "python":
                result = await _run_python(code, sandbox_dir, timeout)
            elif language == "javascript":
                result = await _run_javascript(code, sandbox_dir, timeout)
            elif language == "bash":
                result = await _run_bash(code, sandbox_dir, timeout)
            else:
                return ExecutionResult(
                    language=language,
                    code=code,
                    error=f"Unsupported language: {language}. Use python, javascript, or bash.",
                    exit_code=1,
                )

            elapsed_ms = int((time.time() - start) * 1000)
            result.execution_time_ms = elapsed_ms

            # Check for files created in sandbox
            try:
                created = [
                    f.name for f in Path(sandbox_dir).iterdir()
                    if f.is_file() and f.name not in ("_script.py", "_script.js", "_script.sh")
                ]
                result.files_created = created[:20]  # cap at 20
            except Exception:
                pass

            return result

        finally:
            # Cleanup sandbox
            try:
                shutil.rmtree(sandbox_dir, ignore_errors=True)
                logger.info("sandbox.cleaned", dir=sandbox_dir)
            except Exception:
                pass


async def _run_python(code: str, cwd: str, timeout: int) -> ExecutionResult:
    """Run Python code in subprocess."""
    script_path = os.path.join(cwd, "_script.py")
    with open(script_path, "w") as f:
        f.write(code)

    def _exec():
        return subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    try:
        proc = await asyncio.to_thread(_exec)
        return ExecutionResult(
            language="python",
            code=code,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            exit_code=proc.returncode,
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            language="python",
            code=code,
            timed_out=True,
            exit_code=124,
        )
    except Exception as exc:
        return ExecutionResult(
            language="python",
            code=code,
            error=str(exc),
            exit_code=1,
        )


async def _run_javascript(code: str, cwd: str, timeout: int) -> ExecutionResult:
    """Run JavaScript code with Node.js."""
    # Check if Node.js is available
    node_cmd = shutil.which("node")
    if not node_cmd:
        return ExecutionResult(
            language="javascript",
            code=code,
            error="Node.js is not installed on this server. Use Python instead.",
            exit_code=1,
        )

    script_path = os.path.join(cwd, "_script.js")
    with open(script_path, "w") as f:
        f.write(code)

    def _exec():
        return subprocess.run(
            [node_cmd, script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
        )

    try:
        proc = await asyncio.to_thread(_exec)
        return ExecutionResult(
            language="javascript",
            code=code,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            exit_code=proc.returncode,
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            language="javascript",
            code=code,
            timed_out=True,
            exit_code=124,
        )
    except Exception as exc:
        return ExecutionResult(
            language="javascript",
            code=code,
            error=str(exc),
            exit_code=1,
        )


async def _run_bash(code: str, cwd: str, timeout: int) -> ExecutionResult:
    """Run Bash script."""
    script_path = os.path.join(cwd, "_script.sh")
    with open(script_path, "w") as f:
        f.write(code)

    def _exec():
        return subprocess.run(
            ["bash", script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
        )

    try:
        proc = await asyncio.to_thread(_exec)
        return ExecutionResult(
            language="bash",
            code=code,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            exit_code=proc.returncode,
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            language="bash",
            code=code,
            timed_out=True,
            exit_code=124,
        )
    except Exception as exc:
        return ExecutionResult(
            language="bash",
            code=code,
            error=str(exc),
            exit_code=1,
        )
