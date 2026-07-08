import asyncio
from app.agents.base import BaseAgent
from app.core.config import get_settings

async def main():
    settings = get_settings()
    print("Testing backend LLM initialization...")
    print(f"Provider: {settings.default_model_provider}")
    print(f"Model: {settings.default_model}")
    
    agent = BaseAgent()
    print(f"Agent instantiated.")
    print("Sending message...")
    
    try:
        response = await agent.run("Hello, who are you?")
        print(f"Response: {response}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
