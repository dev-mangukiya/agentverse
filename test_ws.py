import asyncio
import websockets
import json
import uuid

async def test():
    uri = "wss://agentverse-140e.onrender.com/api/v1/chat/ws/" + uuid.uuid4().hex[:12]
    print(f"Connecting to {uri}")
    try:
        async with websockets.connect(uri) as ws:
            print("Connected!")
            msg = {"type": "message", "content": "Hello Render"}
            await ws.send(json.dumps(msg))
            print("Sent message")
            
            while True:
                response = await asyncio.wait_for(ws.recv(), timeout=10.0)
                print("Received:", response)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
