"""Cap JSON request bytes before parsing. Binary uploads use the bounded socket."""

import asyncio
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app, limit=262144):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        data = bytearray()
        try:
            while True:
                message = await asyncio.wait_for(receive(), 10)
                if message["type"] == "http.disconnect":
                    return
                data.extend(message.get("body", b""))
                if len(data) > self.limit:
                    return await JSONResponse(
                        {"detail": "Request exceeds the 256 KB limit"}, 413
                    )(scope, receive, send)
                if not message.get("more_body"):
                    break
        except TimeoutError:
            return await JSONResponse({"detail": "Request body timed out"}, 408)(
                scope, receive, send
            )
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
