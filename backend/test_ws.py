"""Authenticated smoke test for an explicitly supplied staging URL."""

import argparse
import asyncio
import json
from uuid import uuid4
import httpx
import websockets


async def main(base):
    base = base.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(base + "/api/v1/auth/guest", json={})
        response.raise_for_status()
        token = response.json()["token"]
        headers = {"X-Session-ID": token}
        response = await client.post(
            base + "/api/v1/chat/conversations",
            headers=headers,
            json={"title": "Smoke test"},
        )
        response.raise_for_status()
        conversation = response.json()["id"]
        try:
            async with websockets.connect(
                base.replace("http", "ws", 1) + "/api/v1/chat/ws/" + conversation
            ) as ws:
                await ws.send(json.dumps({"type": "auth", "session_token": token}))
                assert (
                    json.loads(await asyncio.wait_for(ws.recv(), 10))["type"]
                    == "authenticated"
                )
                await ws.send(
                    json.dumps(
                        {"type": "message", "content": "hi", "request_id": uuid4().hex}
                    )
                )
                async with asyncio.timeout(90):
                    async for raw in ws:
                        event = json.loads(raw)
                        if event["type"] == "error":
                            raise RuntimeError(event.get("content", "Chat failed"))
                        if event["type"] == "response":
                            assert event.get("message", {}).get("id") and event.get(
                                "content"
                            )
                            print(
                                "Authenticated socket delivered a persisted response."
                            )
                            break
        finally:
            await client.delete(
                base + "/api/v1/chat/conversations/" + conversation, headers=headers
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url", required=True, help="Explicit staging API URL; this sends one greeting"
    )
    asyncio.run(main(parser.parse_args().url))
