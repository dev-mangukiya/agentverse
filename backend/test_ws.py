import asyncio
import websockets
import json

async def test_ws():
    uri = "wss://agentverse-140e.onrender.com/api/v1/chat/ws/test12345678"
    print(f"Connecting to {uri}")
    try:
        async with websockets.connect(uri) as ws:
            print("Connected! Sending message...")
            await ws.send(json.dumps({"type": "message", "content": "hi"}))
            
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=20)
                    print("Received:", response)
                    data = json.loads(response)
                    if data.get("type") == "pipeline_complete":
                        break
                    elif data.get("type") == "error":
                        break
                    elif data.get("type") == "response":
                        break
                except asyncio.TimeoutError:
                    print("Timed out waiting for response.")
                    break
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
