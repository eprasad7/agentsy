# Agentsy v1 -- System Architecture

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**References**: PRD v1, Technology Decisions, Data Model Spec, API Spec, SDK Spec

---

## 1. System Overview

Agentsy is a platform for building, testing, and running AI agents in production. It takes an agent definition (model, system prompt, tools, guardrails) and provides durable execution, streaming responses, cost tracking, trace-based observability, and an integrated eval engine -- so teams can deploy agents with confidence and iterate using data, not guesswork. The platform is multi-tenant, TypeScript-first, and designed so that the same agent config runs identically in local development (`agentsy dev` with SQLite) and in production (Temporal + PostgreSQL + Redis).

### Architecture Diagram

```
                                   +------------------+
                                   |   agentsy-web    |
                                   |   (Next.js 15)   |
                                   |   Dashboard UI   |
                                   +--------+---------+
                                            |
                                     REST / SSE
                                            |
  +----------+        +-----------+---------+----------+-----------+
  |  Client  | -----> |                                            |
  |  App /   | REST   |             agentsy-api                    |
  |  SDK     | + SSE  |             (Fastify)                      |
  +----------+        |                                            |
                      | Better Auth | tenant RLS | rate limit      |
                      +-----+------+------+------+------+----------+
                            |             |             |
              +-------------+      +------+------+     +----------+
              |                    |             |                 |
     +--------v--------+   +------v------+  +---v-----------+    |
     | Temporal Cloud   |   | PostgreSQL  |  | Redis         |    |
     | (durable exec)   |   | (on Fly)    |  | (on Fly)      |    |
     +--------+---------+   |  + pgvector |  | rate limits   |    |
              |             |  + RLS      |  | pub/sub       |    |
     +--------v--------+   +------+------+  | cache         |    |
     | agentsy-worker   |          |         +---------------+    |
     | (Temporal worker) |         |                              |
     |                   +---------+                              |
     | LLM calls         Reads/writes                             |
     | Tool execution     run_steps,                              |
     | Eval runs          runs, etc.                              |
     +---+------+--------+                                       |
         |      |                                                 |
    +----v-+ +--v-----------+                        +-----------v---+
    | LLM  | | Tool         |                        | Tigris        |
    |Provid.| | Targets      |                        | (objects)     |
    | Anthr.| | (MCP / HTTP) |                        +---------------+
    | OpenAI| +--------------+
    +-------+
```

### Service Inventory

| Service | Technology | Role | Runs On |
|---------|-----------|------|---------|
| agentsy-api | Fastify (Node.js) | REST API, SSE streaming, auth, tenant context, rate limiting | Fly.io |
| agentsy-web | Next.js 15, React 19 | Dashboard UI, agent builder (P1), playground | Fly.io |
| agentsy-worker | Temporal TypeScript SDK | Agent execution, tool calling, LLM calls, eval runs | Fly.io |
| PostgreSQL 16 | Fly Managed Postgres + pgvector | Primary data store, vector search, RLS tenant isolation | Fly.io (MPG) |
| Redis 7 | Self-managed | Rate limits, streaming pub/sub, caching | Fly.io (Machine + volume) |
| Temporal | Temporal Cloud (managed) | Durable workflow orchestration, checkpointing, signals | Temporal Cloud |
| Tigris | Fly-native S3-compatible | Artifacts, large tool outputs, knowledge base files, DB backups | Fly.io |

---

## 2. Service Architecture

### 2.1 agentsy-api (Fastify)

**Responsibilities**: REST API for all platform operations, SSE streaming of agent run events, authentication, tenant context enforcement, rate limiting, webhook dispatch.

**Middleware stack** (executed in order on every request):

1. **Better Auth** -- Validates session token (dashboard) or API key (`sk-agentsy-...` via SHA-256 hash lookup). Extracts `org_id`.
2. **Tenant RLS** -- Opens a Postgres transaction, calls `SET LOCAL app.org_id = '<org_id>'`. All subsequent queries are scoped by RLS policies.
3. **Rate limiter** -- Redis sliding window check: requests/min, tokens/day, concurrent runs. Returns `429` if exceeded.
4. **Request handler** -- Route-specific logic.

**Key connections**:

| Dependency | Protocol | Purpose |
|-----------|----------|---------|
| Temporal Cloud | gRPC | Start workflows (agent runs, eval experiments), send signals (approval) |
| PostgreSQL (Fly MPG) | TCP (Drizzle ORM) | Read/write all platform data within RLS transaction |
| Redis (on Fly) | TCP | Rate limit counters, subscribe to run event pub/sub, cache. **Non-critical**: all features degrade gracefully if Redis is unavailable (fallback to in-memory rate limits, no SSE replay, no cache). |
| PostgreSQL (secrets) | TCP | Fetch + decrypt tenant secrets at tool-call time (AES-256-GCM) |

**Scaling**: Stateless. Horizontally scalable by adding Fly.io instances behind a load balancer. No local state -- all state lives in Postgres, Redis, or Temporal.

### 2.2 agentsy-web (Next.js)

**Responsibilities**: Dashboard UI, agent list/detail, run history, trace viewer, eval experiment viewer, usage dashboard, settings/API key management. Agent builder (form-based config UI) ships in P1.

**Architecture**:

- **Server Components** for data-heavy pages: agent list, run history, dashboard metrics. Data fetched from agentsy-api via internal network (not the public API).
- **Client Components** for interactive views: trace timeline, SSE streaming display, eval comparison, chart interactions.
- **shadcn/ui** component library (Radix primitives + Tailwind CSS).
- **TanStack Query** for server state caching and revalidation; **Zustand** for minimal client state.
- **Recharts** for dashboard charts; custom SVG for sparklines.

**Key rule**: agentsy-web never connects directly to PostgreSQL. All data access goes through agentsy-api.

### 2.3 agentsy-worker (Temporal)

**Responsibilities**: Durable execution of agent runs and eval experiments. Performs all LLM calls, tool executions, retrieval queries, guardrail checks, and approval gates.

**Workflow types**:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `AgentRunWorkflow` | `POST /v1/agents/:id/run` | Execute a single agent run (agentic loop) |
| `EvalExperimentWorkflow` | `POST /v1/eval/experiments` | Run an eval experiment across a dataset |

**Activity types** (individual units of work within a workflow):

| Activity | Description | Timeout |
|----------|-------------|---------|
| `LLMCall` | Call an LLM provider (Anthropic/OpenAI) via Vercel AI SDK | Configurable, default 60s |
| `ToolExecution` | Execute a tool (native function or MCP server call) | Default 30s per tool |
| `RetrievalQuery` | Hybrid search (pgvector + tsvector with RRF) against knowledge base | 10s |
| `GuardrailCheck` | Run output validators (PII detection, content policy, JSON schema) | 5s |
| `ApprovalGate` | Pause workflow, wait for human signal to approve/deny a tool call | No timeout (waits indefinitely) |

**Checkpointing**: Temporal automatically checkpoints workflow state at every activity boundary. If a worker crashes mid-run, Temporal replays the workflow from the last completed activity. This means every tool call boundary is a checkpoint -- the agent never loses accumulated work.

**Approval gates**: When a tool with `riskLevel: "write"` or `"admin"` requires approval, the workflow calls a Temporal signal wait. The workflow pauses (durably, survives restarts) until the API sends a signal via `POST /v1/runs/:run_id/approve` or `/deny`. On resume, the tool either executes or is skipped, and the agentic loop continues.

**Worker scaling**: Each worker process runs a configurable number of concurrent workflow and activity slots. Scale by adding worker instances on Fly.io. Temporal handles work distribution across workers automatically.

---

## 3. Runtime Behavior

### 3.1 Agent Run Lifecycle

A complete agent run proceeds through these stages:

```
Client                API                Temporal             Worker
  |                    |                    |                    |
  |-- POST /run ------>|                    |                    |
  |                    |-- validate auth -->|                    |
  |                    |-- check rate limit |                    |
  |                    |-- start workflow ->|                    |
  |<-- SSE stream -----|                    |-- dispatch ------->|
  |                    |                    |                    |
  |                    |          +-------- AGENTIC LOOP -------+
  |                    |          |                              |
  |                    |          |  1. Load agent config        |
  |                    |          |  2. Resolve model            |
  |                    |          |  3. Build system prompt      |
  |                    |          |  4. LLM call (activity)      |
  |                    |          |  5. Check for tool calls     |
  |                    |          |     - If tool call:          |
  |                    |          |       a. Check risk/approval |
  |                    |          |       b. Execute tool        |
  |                    |          |       c. Go to step 4        |
  |                    |          |     - If no tool call:       |
  |                    |          |       Return response        |
  |                    |          |  6. Check max iterations     |
  |                    |          |  7. Check max tokens         |
  |                    |          |                              |
  |                    |          +------------------------------+
  |                    |                    |                    |
  |<-- run.completed --|<-- pub/sub --------|<-- emit events ----|
  |                    |                    |                    |
```

**Detailed steps**:

1. **API receives request**: Validates Better Auth session token or API key, resolves `org_id`, sets tenant RLS context, checks rate limits (requests/min, concurrent runs, tokens/day).

2. **Start Temporal workflow**: API calls `client.workflow.start(AgentRunWorkflow, { ... })` with the agent ID, input message, session ID (if any), and resolved config. Returns the `run_id` immediately. If `stream: true`, opens an SSE connection.

3. **Load and resolve config**: Worker loads the agent version config. Resolves model specification -- if a capability class is specified (e.g., `{ class: "balanced", provider: "anthropic" }`), the provider registry maps it to a concrete model (e.g., `claude-sonnet-4`).

4. **Build system prompt**: Evaluates template variables in the system prompt. If a session exists, loads conversation history (last N messages). If a knowledge base is attached, performs retrieval and injects relevant chunks.

5. **Agentic loop**: The core execution cycle:
   - **LLM call** (activity): Send messages to the resolved model via Vercel AI SDK. Create a `run_step` row (type: `llm_call`). Record tokens in/out, cost, duration.
   - **Tool call check**: If the LLM response includes tool calls, process each one. If not, the response is final.
   - **Tool execution** (activity): For each tool call, check risk level and approval policy. Execute the tool with timeout. Create a `run_step` row (type: `tool_call`). Cap result size at 10KB.
   - **Iteration check**: If iterations exceed `maxIterations` (default: 10) or tokens exceed `maxTokens` (default: 50K), terminate with a timeout/limit status.

6. **Event emission**: At each step, the worker publishes an event to Redis pub/sub. The API subscribes and forwards events as SSE to the client. Events include: `run.started`, `step.thinking`, `step.text_delta`, `step.tool_call`, `step.tool_result`, `step.approval_requested`, `step.approval_resolved`, `step.completed`, `run.completed`, `run.failed`.

7. **Completion**: Update the `runs` row with final status (`completed` or `failed`), total tokens, total cost, duration. Emit `run.completed` SSE event. Fire webhook if the organization has one registered.

8. **Failure handling**: On unrecoverable failure, Temporal checkpoints the state. The `runs` row is updated with status `failed` and `error` details. The `run.failed` SSE event is emitted.

### 3.2 Approval Gate Flow

When a tool with `riskLevel: "write"` or `"admin"` is invoked:

1. **Policy check**: The runtime evaluates the approval policy for this tool in this environment. Policies are configurable per-tool and per-environment (e.g., auto-approve writes in development, require approval in production).

2. **If approval required**:
   - Pause the Temporal workflow using `workflow.condition()` (signal wait).
   - Create a `run_step` row with `type: "approval_request"` and `approval_status: "pending"`.
   - Emit `step.approval_requested` SSE event with the tool name, arguments, and risk level.

3. **Human action**: A user calls `POST /v1/runs/:run_id/approve` or `POST /v1/runs/:run_id/deny` via the API or dashboard.

4. **Resume**: The API sends a Temporal signal to the paused workflow. The workflow resumes:
   - If approved: the tool executes normally. Emit `step.approval_resolved` with `action: "approved"`.
   - If denied: the tool is skipped. The LLM receives a message indicating the tool call was denied. Emit `step.approval_resolved` with `action: "denied"`.

5. **Agentic loop continues**: The LLM processes the result (or denial) and decides the next action.

### 3.3 Streaming Architecture

Streaming connects the worker (where execution happens) to the client (where results are displayed) through two intermediaries:

```
Worker --> Redis Pub/Sub --> API --> SSE --> Client
```

1. **Worker publishes**: As each step completes (or tokens stream), the worker publishes events to a Redis pub/sub channel keyed by `run_id`.

2. **API subscribes**: When a client opens an SSE connection for a run, the API subscribes to that run's Redis channel.

3. **API forwards**: Each Redis message is formatted as an SSE event and written to the HTTP response stream.

4. **Client receives**: The client (SDK, browser, or dashboard) receives typed SSE events and updates the UI or collects the response.

**SSE event types**:

| Event | When | Key Data |
|-------|------|----------|
| `run.started` | Run begins | run_id, agent_id, model |
| `step.thinking` | LLM begins processing | step_id, step_order |
| `step.text_delta` | Each streamed token | step_id, delta text |
| `step.tool_call` | LLM requests tool | tool_name, arguments |
| `step.tool_result` | Tool execution completes | result, duration_ms, error |
| `step.retrieval` | RAG search completes | query, results_count |
| `step.approval_requested` | Write/admin tool needs approval | tool_name, risk_level |
| `step.approval_resolved` | Approval granted or denied | action (approved/denied) |
| `step.completed` | A step finishes | tokens_in, tokens_out, cost |
| `run.completed` | Run finishes successfully | total_tokens, total_cost, duration |
| `run.failed` | Run fails | error type, error message |

**Reconnection**: If the SSE connection drops, the client can reconnect using `Last-Event-ID`. The API replays missed events from Redis (events are retained with a short TTL for replay).

### 3.4 Model Resolution

Agent configs specify models using either a direct model ID or a capability class. The runtime resolves capability classes to concrete models at run time.

**Resolution flow**:

```
Agent Config                  Provider Registry              Concrete Model
+---------------------+      +------------------------+     +-----------------+
| model:              |      | balanced + anthropic   | --> | claude-sonnet-4 |
|   class: "balanced" | ---> | balanced + openai      | --> | gpt-4o          |
|   provider: "anthr" |      | reasoning + anthropic  | --> | claude-opus-4   |
+---------------------+      | fast + anthropic       | --> | claude-haiku    |
                              +------------------------+     +-----------------+
```

**Provider registry**: A config-driven mapping from `{ class, provider }` to a concrete model ID. Updated when providers ship new models -- no code change needed, just a config update.

**Capability classes**:

| Class | Use Case | Example Models (March 2026) |
|-------|----------|-----------------------------|
| `reasoning` | Complex planning, multi-step reasoning | Claude Opus, GPT-5.4, o-series |
| `balanced` | Default agent execution, production use | Claude Sonnet, GPT-4o |
| `fast` | Classification, routing, extraction | Claude Haiku, GPT-4o-mini |
| `embedding` | Vector search, semantic similarity | text-embedding-3-large, voyage-3 |

**Fallback**: If the primary provider returns 5xx or times out after retries, the runtime attempts the same capability class on a different provider. For example, if `balanced + anthropic` fails, try `balanced + openai`. Fallback is transparent to the agent -- same capability class, different provider.

**Direct model override**: Agents can pin a specific model with `model: { id: "claude-sonnet-4-20250514" }`. This bypasses capability class resolution. A warning is emitted because pinned models may break on provider updates.

### 3.5 Eval Execution

Eval experiments validate agent behavior against test datasets before deployment.

**Execution model**:

```
EvalExperimentWorkflow (parent)
  |
  +-- AgentRunWorkflow (case 1)  -- tools mocked
  +-- AgentRunWorkflow (case 2)  -- tools mocked
  +-- AgentRunWorkflow (case 3)  -- tools mocked
  +-- ...                        -- up to N concurrent
  |
  +-- GraderActivity (case 1 scores)
  +-- GraderActivity (case 2 scores)
  +-- ...
  |
  +-- AggregateResults
  +-- CompareToBaseline
```

1. **Experiment creation**: API creates an `eval_experiments` row and starts an `EvalExperimentWorkflow` on Temporal.

2. **Case execution**: Each test case runs as a child workflow, reusing `AgentRunWorkflow`. Tools return mocked responses from the dataset by default (`toolMode: "mock"`). Cases run in parallel with configurable concurrency (default: 5 concurrent cases).

3. **Grading**: After each case completes, grader activities score the output. Grader types:
   - **Deterministic**: exact_match, json_schema, regex, numeric_threshold (fast, in-process)
   - **Semantic**: embedding similarity, tool name match, tool args match
   - **LLM-as-judge**: Pointwise scoring with rubric (uses `balanced` class by default, configurable)
   - **Trajectory**: Tool sequence match, unnecessary step detection

4. **Aggregation**: Results are aggregated across all cases. Per-grader scores are computed (mean, min, max, distribution).

5. **Baseline comparison**: If a baseline exists for this agent+dataset pair, the experiment scores are compared per-case. Regressions are flagged (score decreased beyond a configurable threshold).

6. **Storage**: Results stored in `eval_experiment_results`. Each result row captures the case, the agent output, all grader scores, and the trace (full run_steps).

7. **CI integration**: The CLI command `agentsy eval run` returns exit code 1 if any regression exceeds the threshold. It outputs a markdown report suitable for GitHub PR comments.

---

## 4. Data Flow

### Request Path

```
Client Request
  --> agentsy-api (auth, RLS, rate limit)
    --> Temporal Cloud (workflow dispatch)
      --> agentsy-worker (execution)
        --> LLM Provider (model inference)
        --> Tool Target (MCP server / HTTP API)
        --> PostgreSQL (read knowledge base, write run_steps)
      <-- results back to worker
    <-- workflow completion
  <-- response to client
```

### Streaming Path

```
agentsy-worker
  --> Redis Pub/Sub (per-run channel)
    --> agentsy-api (subscriber)
      --> SSE stream
        --> Client
```

### Trace Storage

The worker writes `run_steps` rows to PostgreSQL as each step completes. Each step records: type, input, output, tokens, cost, duration, and error (if any). OTel spans are emitted in parallel to the configured trace backend (Tempo or Axiom).

### Caching

Redis serves multiple caching roles:

| Use Case | Key Pattern | TTL |
|----------|-------------|-----|
| Rate limit counters | `rl:{org_id}:{window}` | Sliding window (1 min / 1 day) |
| Run event stream | `run:{run_id}:events` | 5 min (for SSE reconnect replay) |
| Session cache | `ses:{session_id}:messages` | 30 min |
| Model response cache (optional) | `cache:{hash(prompt+model)}` | Configurable |

---

## 5. Security Architecture

### 5.1 Tenant Isolation

Every row of tenant data in PostgreSQL is protected by Row-Level Security.

**Mechanism**: The API opens an explicit transaction and calls `SET LOCAL app.org_id = '<org_id>'` before executing any queries. RLS policies on every table enforce `org_id = current_setting('app.org_id')`. The `SET LOCAL` is transaction-scoped -- it is automatically cleared on `COMMIT` or `ROLLBACK`, making it safe under connection poolers in transaction mode.

**Soft-deleted rows**: Tables with soft delete include `deleted_at IS NULL` in their RLS `USING` clause, ensuring deleted data is invisible even within the correct tenant.

**Service role bypass**: Internal operations (migrations, aggregation jobs, retention cleanup) use a dedicated `agentsy_service` PostgreSQL role that bypasses RLS.

**API keys**: Organization-scoped. The key resolves to an `org_id` which sets the RLS context. One organization cannot access another's data regardless of API or SQL path.

### 5.2 Tool Safety

Tools are classified by risk level, and the runtime enforces safety policies at execution time.

| Risk Level | Description | Default Policy |
|-----------|-------------|----------------|
| `read` | Read-only operations (lookups, searches) | Auto-approve in all environments |
| `write` | State-changing operations (create, update, delete) | Auto-approve in dev/staging, require approval in production |
| `admin` | Destructive or high-privilege operations | Require approval in all environments |

**Enforcement**:
- Risk level is declared in the tool definition and cannot be overridden at call time.
- Approval policies are configurable per-tool and per-environment.
- Tool execution runs in Temporal activities with strict timeouts (default: 30s).
- Tool result size is capped at 10KB (truncated with a warning if exceeded).
- Per-environment tool allow-lists restrict which tools an agent can call in production.

### 5.3 Auth Flow

```
Browser User:
  Browser --> agentsy-api (Better Auth: email/password or Google/GitHub OAuth)
  Better Auth creates session --> session token (HTTP-only cookie)
  Browser --> agentsy-web --> agentsy-api (session token validation) --> org_id

API Consumer:
  Client --> agentsy-api (Authorization: Bearer sk-agentsy-...)
  API looks up SHA-256(key) --> resolves org_id --> sets RLS context
```

**Better Auth** runs as a library inside agentsy-api. User/session/organization data lives in Postgres tables managed by Better Auth. No external auth service.

**API key format**: Prefix `sk-agentsy-`, followed by a random string. The full key is shown once on creation and never stored. Only the SHA-256 hash and a visible prefix are persisted.

**Key lifecycle**: Keys can be created, revoked, and listed. Revoked keys return `403`. Optional expiration date.

### 5.4 Secrets Management

Tool credentials (API keys, OAuth tokens, database passwords) are stored encrypted in the `tenant_secrets` Postgres table, namespaced by `org_id`.

| Property | Implementation |
|----------|---------------|
| Storage | `tenant_secrets` table in PostgreSQL, encrypted at application layer |
| Encryption | AES-256-GCM with per-secret random IV. Master key via `SECRETS_MASTER_KEY` env var |
| Injection | Worker decrypts secrets into `ToolContext` at execution time |
| Logging | Never logged, never included in LLM context or traces |
| Rotation | Rotatable via dashboard or API without redeploying the agent. Master key rotation re-encrypts all secrets |
| Access | Write-only through API — secrets can be set and deleted but never read back in plaintext |

---

## 6. Observability

### Distributed Tracing

Every agent run produces an OTel trace. The trace ID is generated by the API when the run starts and propagated through Temporal to the worker and all activities.

**Span hierarchy**:

```
AgentRun (root span)
  +-- LLMCall (model, tokens_in, tokens_out, cost, duration)
  +-- ToolExecution (tool_name, args, result_size, duration)
  +-- LLMCall
  +-- RetrievalQuery (knowledge_base_id, query, results_count)
  +-- GuardrailCheck (guardrail_name, passed/failed)
  +-- LLMCall
  ...
```

**Export**: Spans are exported via OTel Collector to Grafana Tempo or Axiom (configurable backend).

### Metrics

**Ops metrics** (Prometheus + Grafana, internal):

| Metric | Type | Description |
|--------|------|-------------|
| `agentsy_api_request_total` | Counter | Total API requests by endpoint and status |
| `agentsy_api_request_duration_seconds` | Histogram | Request latency (p50, p95, p99) |
| `agentsy_worker_active_workflows` | Gauge | Currently executing workflows |
| `agentsy_llm_call_duration_seconds` | Histogram | LLM call latency by provider and model |
| `agentsy_llm_call_errors_total` | Counter | LLM call failures by provider and error type |
| `agentsy_tool_execution_duration_seconds` | Histogram | Tool execution latency by tool name |

**Application metrics** (PostgreSQL, user-facing dashboards):

Per-run: cost (USD), tokens in/out, duration, model, status. Aggregated per-agent and per-org in `usage_daily` table for dashboard charts (success rate, avg cost, avg latency, error rate with sparklines).

### Structured Logging

All services emit structured JSON logs to stdout. Every log line includes: `timestamp`, `level`, `service`, `run_id` (if applicable), `org_id`, `trace_id`. Sensitive data (prompts, tool outputs) is redacted in production logs by default. Logs are collected by infrastructure (FluentBit or equivalent) and shipped to the log backend.

---

## 7. Error Handling and Resilience

### LLM Provider Failure

| Attempt | Action |
|---------|--------|
| 1st failure | Retry immediately |
| 2nd failure | Retry after 1s |
| 3rd failure | Retry after 2s |
| 4th failure | Retry after 4s |
| All retries exhausted | Switch to fallback model (same capability class, different provider) |
| Fallback fails | Fail the run with `error.provider_unavailable` |

### Tool Failure

| Scenario | Action |
|----------|--------|
| Transient error (5xx, network) | 1 automatic retry |
| Retry fails | Return error to the LLM as a tool result (let it reason about the failure) |
| Timeout (exceeds 30s default) | Kill execution, return timeout error to LLM |
| Result too large (> 10KB) | Truncate with warning, return truncated result |

### Infrastructure Failure

| Component | Failure Mode | Recovery |
|-----------|-------------|----------|
| API server crash | Stateless -- no impact on in-flight runs | New instance picks up. Temporal workflows continue independently. Client reconnects SSE. |
| Worker crash | Temporal detects heartbeat failure | Temporal replays workflow from last checkpoint on a different worker. No data loss. |
| Temporal Cloud outage | New workflows cannot start | API returns `503`. Existing paused workflows resume when Temporal recovers. |
| PostgreSQL connection failure | Queries fail | Circuit breaker opens. Health check endpoint reports unhealthy. Retries on recovery. |
| Redis failure | Rate limits and streaming degrade | Rate limiting falls back to permissive mode. SSE streaming degrades (polling fallback). |

---

## 8. Performance Targets

From the PRD non-functional requirements:

| Metric | Target | Notes |
|--------|--------|-------|
| Time to first token (TTFT) | < 2s | Excludes LLM provider latency. Measures API + Temporal dispatch + worker startup. |
| Dashboard page load | < 1s | Server-rendered with cached data |
| Trace viewer load | < 2s | For runs with up to 50 steps |
| Concurrent runs per org | 10 (beta) | Enforced by rate limiter |
| Runs per day per org | 10,000 (beta) | Tracked in `usage_daily` |
| Platform uptime | 99.5% (beta) | Excluding LLM provider outages |
| Eval dataset size | Up to 10,000 cases | Parallel execution, default concurrency of 5 |

---

## 9. Local Development Architecture

The `agentsy dev` command runs a self-contained local environment that mirrors production behavior with simpler infrastructure.

| Concern | Production | Local Dev |
|---------|-----------|-----------|
| Database | PostgreSQL 16 (Fly MPG) + Drizzle | SQLite (better-sqlite3) + Drizzle SQLite driver |
| Durable execution | Temporal Cloud | In-process Promise-based loop (no Temporal) |
| Tenant isolation | PostgreSQL RLS | Single-tenant (no RLS) |
| Vector search | pgvector HNSW index | In-memory brute-force cosine similarity |
| Secrets | Encrypted Postgres columns | `.env` file |
| Streaming | Redis pub/sub → API → SSE | Direct in-process events → SSE |
| Trace viewer | agentsy-web dashboard | Built-in web UI served from same process on `localhost:4321` |
| LLM calls | Platform-proxied (production keys) | Direct to provider (user's own API key in `.env`) |

**What stays the same**: Agent config format, tool definitions, eval engine, grader logic, CLI commands. The same `agentsy.config.ts` runs identically in both environments.

**What is simplified**: No Temporal, no RLS, no Redis, no separate API/worker processes. Everything runs in a single Node.js process. This eliminates all external dependencies for local development -- a developer needs only Node.js and an LLM API key.

---

## Appendix: Monorepo Structure

```
agentsy/
  apps/
    web/              # Next.js 15 dashboard (agentsy-web)
    api/              # Fastify API server (agentsy-api)
    worker/           # Temporal worker (agentsy-worker)
  packages/
    sdk/              # @agentsy/sdk -- agent definition (published)
    client/           # @agentsy/client -- API client (published)
    eval/             # @agentsy/eval -- eval engine (published)
    cli/              # @agentsy/cli -- CLI tool (published)
    db/               # @agentsy/db -- Drizzle schema + migrations (internal)
    ui/               # @agentsy/ui -- shared React components (internal)
    shared/           # @agentsy/shared -- shared types + utilities (internal)
```

Build tooling: Turborepo + pnpm workspaces. All packages target ES2022 with CJS/ESM dual output via tsup. Minimum Node.js 20.x.
