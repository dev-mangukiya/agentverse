"""Exercise real startup, migrations, shutdown and restart with no live providers."""

import os
import secrets
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx


def test_startup_and_restart_preserve_private_session(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment.update(
        {
            "APP_ENV": "development",
            "APP_DEBUG": "false",
            "SECRET_KEY": secrets.token_hex(32),
            "DATABASE_URL": "sqlite+aiosqlite:///" + str(tmp_path / "smoke.db"),
            "PYTHONPATH": str(backend),
            "REDIS_URL": "",
            "QDRANT_URL": "",
            "GOOGLE_API_KEY": "",
            "GOOGLE_API_KEYS": "",
            "OPENAI_API_KEY": "",
            "ANTHROPIC_API_KEY": "",
            "HUGGINGFACE_API_KEY": "",
            "EXECUTION_URL": "",
            "SMTP_HOST": "",
        }
    )
    with socket.socket() as allocated:
        allocated.bind(("127.0.0.1", 0))
        port = allocated.getsockname()[1]
    environment["PORT"] = str(port)
    headers = None
    conversation = None
    for iteration in range(2):
        log_path = tmp_path / f"server-{iteration}.log"
        with log_path.open("w") as log:
            process = subprocess.Popen(
                [sys.executable, "start.py"],
                cwd=backend,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                with httpx.Client(
                    base_url=f"http://127.0.0.1:{port}", timeout=2
                ) as client:
                    deadline = time.monotonic() + 20
                    while True:
                        assert process.poll() is None, log_path.read_text()
                        try:
                            response = client.get("/health")
                            if response.status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        assert time.monotonic() < deadline, log_path.read_text()
                        time.sleep(0.1)
                    assert response.json()["services"]["llm"] == "no_api_key"
                    if iteration == 0:
                        response = client.post("/api/v1/auth/guest", json={})
                        assert response.status_code == 200
                        headers = {"X-Session-ID": response.json()["token"]}
                        response = client.post(
                            "/api/v1/chat/conversations", headers=headers, json={}
                        )
                        assert response.status_code == 200, response.text
                        conversation = response.json()["id"]
                    response = client.get(
                        f"/api/v1/chat/conversations/{conversation}", headers=headers
                    )
                    assert response.status_code == 200
                    assert (
                        client.get(
                            f"/api/v1/chat/conversations/{conversation}"
                        ).status_code
                        == 401
                    )
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
                    raise AssertionError("Server failed to shut down cleanly")
        # Uvicorn re-raises the received signal after completing lifespan cleanup.
        assert process.returncode in (0, -signal.SIGTERM), log_path.read_text()
        assert "agentverse.shutdown" in log_path.read_text()
        assert "Application shutdown complete" in log_path.read_text()
