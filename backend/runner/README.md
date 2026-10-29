# Optional isolated code execution

Deploy this service on a dedicated execution host with Docker installed. Do not deploy it inside the API container, share application volumes, or give it application credentials. Render's ordinary web service does not provide a Docker daemon for nested execution.

1. Build the restricted execution image on that host: `docker build -f Dockerfile.execution -t agentverse-execution:local .`.
2. Install the service's FastAPI/Uvicorn dependencies using the main locked Python requirements, or a separately audited minimal environment.
3. Generate a random `RUNNER_TOKEN` of at least 32 characters and set `RUNNER_IMAGE=agentverse-execution:local`.
4. Serve `service:app` with Uvicorn behind an authenticated HTTPS/private-network endpoint. Restrict ingress to the API service. Set `EXECUTION_URL` and `EXECUTION_TOKEN` on the API.
5. Verify output limits, deadline termination, disconnect termination, child-process termination, network denial, memory exhaustion, and absence of API secrets in staging before enabling public use.

Each call uses a fresh unprivileged container, no volumes, no network, a read-only root, a 32 MB temporary filesystem, 256 MB RAM, 0.5 CPU, 64 processes, a 30-second deadline, and bounded output. Python, Node.js, and Bash are installed in the execution image. Source code is passed as an argument, never interpolated into a host shell.

Generated runner files are currently temporary and are removed with the container. Downloadable reports should use the document-generation tools; arbitrary runner-created plot export is not implemented. The Docker image and runtime isolation need verification on the actual execution host; this development machine has no Docker daemon.
