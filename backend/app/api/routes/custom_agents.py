"""CRUD API for custom user-created agents."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database.session import async_session_factory
from app.database.models.models import CustomAgent
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])

# Available tools that can be assigned to custom agents
AVAILABLE_TOOLS = {
    "web_search": "Search the web for information",
    "run_code": "Execute Python, JavaScript, or Bash code",
    "calculate": "Evaluate math expressions",
    "read_file": "Read file contents",
    "write_file": "Write content to files",
    "get_current_time": "Get current date and time",
    "open_url": "Open/provide URLs",
    "request_user_approval": "Request user approval for sensitive actions",
    "search_github_repos": "Search public GitHub repositories",
    "create_linear_issue": "Create an issue in Linear",
    "send_slack_message": "Send a message to a Slack channel",
}

# Built-in agents (not editable)
BUILTIN_AGENTS = [
    {"id": "builtin_orchestrator", "name": "orchestrator", "emoji": "🧠", "description": "Routes requests to specialized agents", "is_builtin": True, "is_active": True},
    {"id": "builtin_research", "name": "research", "emoji": "🔬", "description": "Web search and information gathering", "is_builtin": True, "is_active": True},
    {"id": "builtin_coding", "name": "coding", "emoji": "💻", "description": "Code generation, execution, and debugging", "is_builtin": True, "is_active": True},
    {"id": "builtin_writer", "name": "writer", "emoji": "✍️", "description": "Content creation and editing", "is_builtin": True, "is_active": True},
    {"id": "builtin_critic", "name": "critic", "emoji": "🔍", "description": "Quality analysis and feedback", "is_builtin": True, "is_active": True},
    {"id": "builtin_data", "name": "data_analyst", "emoji": "📊", "description": "Data analysis and visualization", "is_builtin": True, "is_active": True},
]


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    emoji: str = Field(default="🤖", max_length=10)
    description: str | None = Field(default=None, max_length=200)
    system_prompt: str = Field(..., min_length=10, max_length=5000)
    tools: list[str] = Field(default_factory=list)
    model: str | None = None


class AgentUpdate(BaseModel):
    emoji: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    tools: list[str] | None = None
    model: str | None = None
    is_active: bool | None = None


@router.get("")
async def list_agents():
    """List all agents (built-in + custom)."""
    agents = list(BUILTIN_AGENTS)

    async with async_session_factory() as session:
        result = await session.execute(
            select(CustomAgent).order_by(CustomAgent.created_at)
        )
        custom = result.scalars().all()
        for agent in custom:
            d = agent.to_dict()
            d["is_builtin"] = False
            agents.append(d)

    return {"agents": agents, "available_tools": AVAILABLE_TOOLS}


@router.post("", status_code=201)
async def create_agent(data: AgentCreate):
    """Create a new custom agent."""
    # Check name doesn't conflict with built-in agents
    builtin_names = {a["name"] for a in BUILTIN_AGENTS}
    if data.name in builtin_names:
        raise HTTPException(400, f"Name '{data.name}' is reserved for a built-in agent.")

    # Validate tools
    invalid_tools = [t for t in data.tools if t not in AVAILABLE_TOOLS]
    if invalid_tools:
        raise HTTPException(400, f"Invalid tools: {', '.join(invalid_tools)}")

    async with async_session_factory() as session:
        # Check uniqueness
        existing = await session.execute(
            select(CustomAgent).where(CustomAgent.name == data.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, f"Agent '{data.name}' already exists.")

        agent = CustomAgent(
            name=data.name,
            emoji=data.emoji,
            description=data.description,
            system_prompt=data.system_prompt,
            tools_json=json.dumps(data.tools),
            model=data.model,
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)

        logger.info("custom_agent.created", name=data.name)
        result = agent.to_dict()
        result["is_builtin"] = False
        return result


@router.put("/{agent_id}")
async def update_agent(agent_id: str, data: AgentUpdate):
    """Update a custom agent."""
    if agent_id.startswith("builtin_"):
        raise HTTPException(400, "Cannot edit built-in agents.")

    async with async_session_factory() as session:
        result = await session.execute(
            select(CustomAgent).where(CustomAgent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(404, "Agent not found.")

        if data.emoji is not None:
            agent.emoji = data.emoji
        if data.description is not None:
            agent.description = data.description
        if data.system_prompt is not None:
            agent.system_prompt = data.system_prompt
        if data.tools is not None:
            invalid = [t for t in data.tools if t not in AVAILABLE_TOOLS]
            if invalid:
                raise HTTPException(400, f"Invalid tools: {', '.join(invalid)}")
            agent.tools_json = json.dumps(data.tools)
        if data.model is not None:
            agent.model = data.model
        if data.is_active is not None:
            agent.is_active = 1 if data.is_active else 0

        await session.commit()
        await session.refresh(agent)

        # Clear cached agent instance so it gets re-created
        from app.api.routes.chat import _clear_cached_agent
        _clear_cached_agent(agent.name)

        logger.info("custom_agent.updated", id=agent_id, name=agent.name)
        d = agent.to_dict()
        d["is_builtin"] = False
        return d


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete a custom agent."""
    if agent_id.startswith("builtin_"):
        raise HTTPException(400, "Cannot delete built-in agents.")

    async with async_session_factory() as session:
        result = await session.execute(
            select(CustomAgent).where(CustomAgent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(404, "Agent not found.")

        name = agent.name
        await session.delete(agent)
        await session.commit()

        # Clear from cache
        from app.api.routes.chat import _clear_cached_agent
        _clear_cached_agent(name)

        logger.info("custom_agent.deleted", id=agent_id, name=name)
        return {"status": "deleted", "name": name}
