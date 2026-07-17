# Cortex AI

**Cortex AI** (formerly AgentVerse) is an autonomous multi-agent AI workforce platform. It allows users to manage a network of specialized AI agents that collaborate to solve complex tasks. 

## Features

*   **Autonomous Multi-Agent System**: Agents dynamically collaborate, delegating sub-tasks to specialists (e.g., Code, Research, Data Analyst).
*   **Secure Code Sandbox**: Executes Python, JavaScript, and Bash safely in isolated temporary directories.
*   **Custom Agent Builder**: Create your own agents with custom system prompts, tools, and LLMs directly from the UI.
*   **Human-in-the-Loop (HITL)**: Agents pause and request explicit user approval before performing irreversible or sensitive actions.
*   **Voice Mode**: Speak directly to your agent workforce using built-in web speech dictation.
*   **Third-Party Integrations**: Built-in support for GitHub, Linear, and Slack.

## Getting Started

### Backend (FastAPI + LangChain)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Frontend (Next.js + Tailwind)

```bash
cd frontend
npm install

# Start the development server
npm run dev
```

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Required
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key

# Integrations
GITHUB_TOKEN=your_github_token
LINEAR_API_KEY=your_linear_api_key
SLACK_BOT_TOKEN=your_slack_bot_token
```

## Keeping the Render backend warm

The production backend is deployed on Render's Free tier, which sleeps after
15 minutes without traffic. The included GitHub Actions workflow pings its
health endpoint every 10 minutes so users do not pay the cold-start delay.

If the backend URL changes, set the repository variable
`BACKEND_HEALTH_URL` to its full `/health` URL in GitHub. You can also run the
**Keep Render backend awake** workflow manually after a deploy to wake the
service immediately. Keeping a Free Render instance awake all month uses
almost all of its 750 included instance-hours; moving the backend to a paid
Render instance is the durable production option.

## Architecture

Cortex AI uses a hierarchical agent architecture. The **Orchestrator Agent** receives the initial user request, decomposes it, and delegates tasks to specialized agents (Research, Coding, Writer, Critic, Data Analyst, or Custom Agents). The platform supports parallel delegation and tool execution.

## License
MIT
