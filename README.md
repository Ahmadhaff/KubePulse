# KubePulse (KubeAgent)

A small, production-style AI agent: a **NestJS + TypeScript** backend that uses **LangChain** and **Claude (Anthropic)** to answer questions and call tools, a simple **Next.js** chat UI, and everything needed to run it in **Docker** and **Kubernetes** on a local machine.

The agent has one tool, `get_weather` (simulated demo data), and runs the tool-call loop automatically: the model decides when to call the tool, the backend runs it, and the result goes back to the model to write the final answer.

## Why this project

I built this to learn, end to end, how an AI agent goes from an idea to something deployable:

- **Agents and tool calling:** wiring Claude to a tool through LangChain and handling the model → tool → model loop myself, rather than hiding it behind a framework.
- **A real backend around the model:** input validation, error handling, health checks and conversation memory in NestJS.
- **Containers and orchestration:** packaging the service with a multi-stage Docker build and running replicas on Kubernetes with probes, resource limits and a Secret for the API key.
- **A usable front end:** a lightweight Next.js chat UI so the agent can be demoed without `curl`.

It is intentionally small so each piece (agent, API, container, cluster) is easy to read and extend, for example by swapping the dummy weather tool for a real API or adding more tools.

## Architecture

```
Browser (Next.js, :3001) --/api/chat--> NestJS API (:3000) --> LangChain --> Claude
                                            |
                                            +--> get_weather tool
```

## Project layout

| Path | What it is |
| --- | --- |
| `src/agent` | LangChain + Claude agent, tool definition and tool-call loop |
| `src/chat` | `POST /chat` controller and module |
| `web/` | Next.js chat UI |
| `Dockerfile` | Multi-stage build for the backend |
| `k8s-deployment.yaml` | Deployment (2 replicas) and NodePort Service |

## Security

API keys are read from environment variables only. `.env` is git-ignored; copy `.env.example` to `.env` and add your own key. On Kubernetes the key lives in a Secret, not in the manifest.

## Quick start

## 1. Run locally

```bash
npm install
cp .env.example .env        # then set ANTHROPIC_API_KEY
npm run start:dev
```

Test it:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather in Paris?"}'
# {"success":true,"reply":"..."}
```

Health check: `GET /health`.

`POST /chat` also accepts an optional `history` (up to 20 earlier turns, `[{ "role": "user" | "assistant", "content": "..." }]`) so the agent remembers the conversation. The response includes `toolsUsed`, e.g. `["get_weather"]`.

### Web UI (Next.js)

With the backend running:

```bash
cd web
npm install
npm run dev     # http://localhost:3001
```

The UI proxies `/api/chat` to the backend (`BACKEND_URL`, default `http://localhost:3000`).

## 2. Build the Docker image

```bash
docker build -t kubeagent:v1 .
docker run --rm -p 3000:3000 -e ANTHROPIC_API_KEY=your_key kubeagent:v1
```

## 3. Deploy to Kubernetes (Docker Desktop / minikube / kind)

`imagePullPolicy: Never` means the image must exist inside the cluster's node:

- Docker Desktop: nothing extra, the local image is used.
- minikube: `minikube image load kubeagent:v1`
- kind: `kind load docker-image kubeagent:v1`

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=ANTHROPIC_API_KEY=your_claude_api_key_here

kubectl apply -f k8s-deployment.yaml
kubectl get pods
```

Call the service via NodePort:

```bash
curl -X POST http://localhost:30080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather in Tokyo?"}'
```

On minikube, use `minikube service kubeagent-service --url` to get the address.

Clean up: `kubectl delete -f k8s-deployment.yaml && kubectl delete secret anthropic-api-key`

## Notes

- The default model is `claude-sonnet-4-6`. `claude-3-5-sonnet-20241022` has been retired by Anthropic and returns a 404. Override the model with the `ANTHROPIC_MODEL` env var (list the models your key can use with `GET https://api.anthropic.com/v1/models`).
