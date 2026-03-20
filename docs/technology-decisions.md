# Agentsy: Technology Decision Record

> Every open question from the research docs, forced to a decision. No more "options include X, Y, Z." We pick one and move.
>
> Format: Decision → What we picked → What we rejected → Why

---

## Table of Contents

1. [Runtime & Orchestration](#1-runtime--orchestration)
2. [Data Layer](#2-data-layer)
3. [Model Gateway](#3-model-gateway)
4. [Tool Infrastructure](#4-tool-infrastructure)
5. [Code Execution & Sandboxing](#5-code-execution--sandboxing)
6. [Memory System](#6-memory-system)
7. [Eval Engine](#7-eval-engine)
8. [Observability](#8-observability)
9. [Auth & Multi-Tenancy](#9-auth--multi-tenancy)
10. [SDK & Developer Experience](#10-sdk--developer-experience)
11. [Frontend & UI](#11-frontend--ui)
12. [Infrastructure & Deployment](#12-infrastructure--deployment)

---

## 1. Runtime & Orchestration

### D-1.1: Agent Orchestration Pattern

**Decision**: Model-driven loop with guardrailed execution — NOT a graph-based state machine.

**What we build**: A simple agentic loop (LLM call → tool execution → LLM call → ...) with configurable guardrails, max iterations, and interrupt points. The LLM decides the next action, not a developer-defined graph.

**Rejected**:
- ❌ **LangGraph-style state machines**: Too complex for users. Forces workflow thinking onto what should be a conversation. We'll add workflow primitives later (P2) for users who need them.
- ❌ **CrewAI-style role-based teams**: Too opaque. The "manager agent decides" pattern is unreliable and hard to debug.

**Why**: Claude SDK and OpenAI Agents SDK both proved that a simple loop + tools + guardrails covers 80% of use cases. Start simple, add complexity when users ask for it. The agentic loop is also the most debuggable pattern — every step is visible in the trace.

### D-1.2: Durable Execution

**Decision**: **Temporal** for durable execution of agent runs.

**Rejected**:
- ❌ **Inngest**: Simpler but less flexible. No child workflows, limited signal/query support. We'll outgrow it.
- ❌ **Restate**: Promising (virtual objects are elegant) but too early/small community. Risk of being abandoned.
- ❌ **Custom state machine on Postgres**: Tempting for simplicity but we'd rebuild Temporal poorly. Agent runs need pause/resume, timeouts, retries, heartbeats — Temporal has all of this.
- ❌ **No durable execution (just process state)**: Non-starter for production. Agent runs that crash mid-execution lose all accumulated work and token spend.

**Why**: Temporal is battle-tested (Uber, Netflix, Snap scale), has a strong TypeScript SDK, and its workflow-as-code model maps perfectly to agent runs. Each agent run = a Temporal workflow. Each tool call = an activity. Human-in-the-loop = a signal + wait. Checkpointing comes free.

**Temporal deployment**: Start with **Temporal Cloud** (managed). Self-host later if needed for data residency.

### D-1.3: Agent Definition Format

**Decision**: **TypeScript-first code definition** with YAML as a serialization format for the UI-built agents.

```typescript
// This is what developers write
export default agentsy.defineAgent({
  name: "support-agent",
  model: "claude-sonnet",
  systemPrompt: "You are a customer support agent...",
  tools: [getOrder, getRefundPolicy, sendReply],
  guardrails: {
    maxIterations: 10,
    maxTokens: 50_000,
    outputValidation: [noPII, onTopic],
  },
});
```

**Rejected**:
- ❌ **YAML-only**: Poor DX for developers. No type checking, no IDE support, no composability.
- ❌ **Python-only**: Our backend is TypeScript. Python SDK will exist but TypeScript is first-class.
- ❌ **JSON Schema DSL**: Too verbose, not readable.

**Why**: Code-first gives type safety, IDE autocomplete, and composability (agents can import shared tools, extend base configs). YAML is generated from code for the visual builder and API storage.

---

## 2. Data Layer

### D-2.1: Primary Database

**Decision**: **PostgreSQL 16** — Fly Managed Postgres (MPG).

Single database for: organizations, agents, runs, checkpoints, eval datasets, eval results, prompt versions, audit logs, usage tracking.

**Why Fly Managed Postgres**: Same Fly private network (sub-1ms latency), managed backups and replication, no volume management risk, pgvector supported as an extension. Keeps the entire stack on Fly while eliminating database ops burden. Fly's unmanaged Postgres on raw Machines + volumes is explicitly not recommended by Fly — volumes don't auto-replicate and require the application to handle HA.

**Rejected**:
- ❌ **Self-managed Postgres on Fly Machine + volume**: Fly docs recommend against this — volumes are pinned to a single host, no automatic replication, operator must handle backups/failover. Too risky for the primary data store.
- ❌ **Neon (managed serverless Postgres)**: Good product but adds cross-network latency, another vendor, and higher cost. Serverless autoscale is unnecessary for beta.
- ❌ **MySQL**: Less capable (no JSONB, weaker extension ecosystem, no RLS).
- ❌ **MongoDB**: Schema flexibility not worth the consistency trade-offs for a platform with strict multi-tenancy requirements.
- ❌ **CockroachDB/TiDB**: Over-engineered for early stage. Postgres scales to millions of agent runs before we need distributed SQL.

### D-2.2: Vector Store

**Decision**: **pgvector** (PostgreSQL extension) for P0. Evaluate dedicated vector DB at scale.

**Rejected for P0**:
- ❌ **Pinecone**: Adds a separate managed service, separate auth, separate billing. Unnecessary complexity for launch.
- ❌ **Qdrant**: Same — great product but another service to manage.
- ❌ **Weaviate**: Same.
- ❌ **ChromaDB**: Not production-ready for multi-tenant SaaS.

**Why**: pgvector keeps everything in one database. Simpler operations, simpler backup, simpler multi-tenancy (same RLS policies apply to vectors). Performance is sufficient up to ~5M vectors per tenant with HNSW indexes. When a tenant exceeds this, we evaluate migrating their vectors to a dedicated store.

**Indexing strategy**: HNSW with `lists = sqrt(row_count)` for IVFFlat as fallback. Cosine distance for semantic similarity.

### D-2.3: Cache & Hot State

**Decision**: **Redis 7** — self-managed on Fly.io (Fly Machine + persistent volume).

Used for: rate limiting counters, session state, real-time streaming coordination, prompt cache, tool result cache.

NOT used for: durable state (that's Postgres), message queuing (that's Temporal).

**Why self-managed on Fly**: Same-network access from API and worker Machines, simpler than adding Upstash as another vendor. Redis is trivial to operate for cache/rate-limit workloads. AOF persistence enabled but data loss is tolerable — all durable state lives in Postgres.

**Rejected**:
- ❌ **Upstash (serverless Redis)**: Pay-per-request model is elegant but adds a vendor and cross-network latency. Not worth it when Redis is easy to self-manage.
- ❌ **Upstash via Fly extension**: Still Upstash under the hood, same cross-network issue.

### D-2.4: Object Storage

**Decision**: **Tigris** (Fly.io-native S3-compatible object storage).

Used for: generated artifacts (files, images, reports), large tool outputs, eval dataset files, conversation exports, database backups (pg_dump + WAL archives).

**Why Tigris**: First-party Fly integration (`fly storage create`), S3-compatible API, globally caching (objects are cached at edge locations near your apps, not eagerly replicated to every region), integrated into Fly billing. Keeps the entire stack on one platform.

**Rejected**:
- ❌ **Cloudflare R2**: Good product but adds another vendor and account. Tigris provides the same S3-compatible API without leaving Fly.
- ❌ **AWS S3**: Vendor lock-in, egress fees.
- ❌ **MinIO (self-hosted)**: Operational overhead for object storage is not worth it when Tigris exists.

### D-2.5: Local Development Database

**Decision**: **SQLite** for local dev mode (via better-sqlite3 in Node.js).

`agentsy dev` uses SQLite for everything — conversations, vectors (via sqlite-vec), eval results, traces. Zero external dependencies. Same SDK interface, different storage backend.

---

## 3. Model Gateway

### D-3.1: LLM Provider Priority

**Decision**: Ship with these providers in this order:

| Priority | Provider | Why |
|----------|----------|-----|
| P0 | **Anthropic (Claude)** | Best instruction-following for agents, extended thinking, strong tool use |
| P0 | **OpenAI (GPT-4o, o-series)** | Largest market share, users expect it |
| P1 | **Google (Gemini)** | Long context, multimodal, enterprise demand |
| P2 | **Local models via Ollama** | Privacy, cost reduction, offline dev |
| P2 | **Groq / Together / Fireworks** | Open models at low latency/cost |

**Rejected for P0**:
- ❌ **Mistral, Cohere, AI21**: Too niche. Add when users request.
- ❌ **AWS Bedrock / Azure OpenAI**: Enterprise wrappers. Add for enterprise tier.

### D-3.2: Model Router Implementation

**Decision**: **Static routing by agent config** for P0. Add smart routing in P1.

P0: Each agent specifies its model in config. The gateway calls that model. Simple, predictable, debuggable.

P1: Add routing rules:
```yaml
model_policy:
  default: claude-sonnet
  fallback: gpt-4o
  routing:
    - condition: "estimated_complexity < 0.3"
      model: claude-haiku
    - condition: "task_type == 'code_generation'"
      model: claude-sonnet
```

**Rejected for P0**:
- ❌ **LLM-based complexity classifier**: Adds latency and cost to every request. Premature optimization.
- ❌ **Cascading (try cheap, escalate)**: Doubles latency for escalated requests. Bad UX.

### D-3.3: Provider SDK Abstraction

**Decision**: **Vercel AI SDK** (`ai` package) as the unified provider interface.

**Why**: Already model-agnostic (OpenAI, Anthropic, Google, Mistral, Ollama all supported), TypeScript-native, streaming-first, great tool-calling abstraction, active maintenance by Vercel.

**Rejected**:
- ❌ **LiteLLM**: Python-only. We're TypeScript-first.
- ❌ **Custom abstraction**: Waste of time when `ai` already handles provider differences.
- ❌ **Portkey/Helicone proxy**: Adds network hop. We'll build our own thin gateway for cost tracking and caching.

---

## 4. Tool Infrastructure

### D-4.1: Tool Protocol

**Decision**: **MCP (Model Context Protocol)** as the primary tool interface. Plus native function tools for simple cases.

**Two ways to add tools:**
1. **Native tools** (simple): TypeScript functions registered with the agent. For tools that are part of the agent's codebase.
2. **MCP servers** (standard): For external integrations, third-party tools, and the tool marketplace.

**Rejected**:
- ❌ **LangChain tools format**: Proprietary to LangChain ecosystem. Not interoperable.
- ❌ **OpenAPI/Swagger auto-import**: Too coarse-grained. An OpenAPI spec with 200 endpoints overwhelms the model. MCP servers expose curated tool sets.
- ❌ **Custom tool protocol**: NIH. MCP is winning. Use it.

### D-4.2: Tool Authentication

**Decision**: **Platform-managed OAuth proxy** for common integrations + **user-provided API keys** for custom tools.

For the top 20 integrations (Slack, GitHub, Google Workspace, Salesforce, Jira, etc.), Agentsy manages the OAuth flow — user authorizes once, we store refresh tokens in the secrets vault, and inject access tokens at tool-call time.

For custom tools, users provide API keys stored in the per-tenant secrets vault.

**Rejected**:
- ❌ **Composio / Nango (third-party OAuth proxy)**: Adds dependency and cost. Build the OAuth flows ourselves for the top integrations. Only consider Nango if we need 100+ integrations quickly.
- ❌ **User manages their own tokens**: Too much friction. Users don't want to paste tokens into a dashboard.

### D-4.3: Secrets Management

**Decision**: **Encrypted columns in PostgreSQL** (AES-256-GCM) with a master key stored as a Fly secret.

**What we build**: A `tenant_secrets` table storing tool credentials encrypted at the application layer. The master encryption key is injected via Fly's `fly secrets set` (environment variable). The API encrypts on write, the worker decrypts at tool-call time. Secrets are write-only through the API — they can be set and deleted but never read back in plaintext.

**Why**: Zero additional services. Uses our existing Postgres. Keeps the entire stack on Fly. For a private beta with <100 tenants, this is more than sufficient.

**Encryption scheme**:
- AES-256-GCM with per-secret random IV
- Master key: `SECRETS_MASTER_KEY` env var (set via `fly secrets set`)
- Key rotation: re-encrypt all secrets with new key, zero-downtime migration
- Audit: `tenant_secrets` table tracks created_at, updated_at, last_accessed_at

**Rejected**:
- ❌ **Infisical**: Good product but adds another vendor, another account, cross-network calls for every tool execution. Unnecessary for beta.
- ❌ **HashiCorp Vault**: Too complex to operate for a startup.
- ❌ **AWS Secrets Manager / GCP Secret Manager**: Cloud lock-in.
- ❌ **Doppler**: SaaS-only, can't self-host.

**Upgrade path**: Add HashiCorp Vault or AWS KMS when enterprise customers require HSM-backed key management or compliance certifications.

---

## 5. Code Execution & Sandboxing

### D-5.1: Code Execution Sandbox

**Decision**: **E2B** for P1 (managed service). Build on **Firecracker** for P2/self-hosted enterprise.

**Beta scope**: No arbitrary code execution in private beta. Beta agents use API tools, MCP tools, retrieval, and approval-gated actions, but do not run user-generated code.

**Why E2B first**: Strong isolation, fast startup, good SDK, and the same vendor can cover both code execution and desktop/browser automation. We don't need to operate sandbox infrastructure on day one.

**Why Firecracker later**: Some enterprise customers will require self-hosted sandboxes for data residency or stricter control. Firecracker gives us the same isolation model E2B uses, but on our own infra.

**Rejected**:
- ❌ **Modal**: Great for GPU workloads but overkill for code snippet execution. Higher latency.
- ❌ **Docker containers**: Insufficient isolation for multi-tenant code execution. Container escapes are a real risk.
- ❌ **gVisor**: Incomplete syscall coverage breaks too many programs. Better as a defense-in-depth layer, not primary sandbox.
- ❌ **WASM (Wasmtime/Pyodide)**: Good for simple functions but can't run arbitrary Python packages, shell commands, or system tools. Will use for lightweight eval scorers only.
- ❌ **Fly.io Machines**: No GPU, more infra to manage, no sandbox-specific abstractions.

### D-5.2: Browser Automation

**Decision**: **E2B Desktop sandboxes** for P1 browser automation. Playwright runs inside the sandbox.

**Why**: E2B already gives us isolated desktop/browser environments, so we can keep code execution and browser automation on one sandbox platform. This reduces vendor sprawl and keeps the execution model consistent.

**Rejected**:
- ❌ **Self-hosted Playwright pool**: Operational overhead. Browser instances are resource-heavy and need careful lifecycle management.
- ❌ **Browserbase as default**: Excellent for anti-detection and recording, but unnecessary as the default browser substrate for beta/P1.
- ❌ **Anthropic Computer Use directly**: Claude-specific. Our platform is model-agnostic.
- ❌ **Steel**: Newer, less proven.

**Fallback / upgrade path**: Add Browserbase later if we hit use cases that require stealth browsing, advanced session replay, or anti-bot evasion. That's a specialized browser ops layer, not the default sandbox.

---

## 6. Memory System

### D-6.1: Memory Architecture

**Decision**: **Three-tier memory**, NOT a custom MemGPT/Letta-style self-managing memory system.

| Tier | What | Storage | TTL |
|------|------|---------|-----|
| **Working memory** | Current conversation + scratchpad | In Temporal workflow state | Per-run |
| **Session memory** | Conversation history, user profile | PostgreSQL | 90 days default, configurable |
| **Knowledge memory** | RAG documents, learned facts | PostgreSQL + pgvector | Permanent until deleted |

**Rejected**:
- ❌ **MemGPT/Letta-style self-managing memory**: The agent decides what to remember/forget via tool calls. Elegant but adds complexity and LLM calls (cost). Too sophisticated for P0.
- ❌ **Knowledge graphs (Neo4j)**: Adds another database. pgvector handles our needs for P0. Add graph queries later if users demand relationship traversal.
- ❌ **Dedicated vector DB (Pinecone/Qdrant)**: Unnecessary when pgvector is in the stack.

### D-6.2: Embedding Model

**Decision**: **OpenAI `text-embedding-3-small`** for P0. Support user-configurable embedding models in P1.

**Why**: Best price/performance ratio, 1536 dimensions, strong multilingual support. Most users already have an OpenAI API key.

**P1**: Add Anthropic embeddings (when available), local embeddings via Ollama, and Cohere embed v3.

### D-6.3: Retrieval Strategy

**Decision**: **Hybrid search** (vector similarity + keyword/BM25) with reranking.

Implementation: pgvector for vector search + PostgreSQL `tsvector` for full-text search. Combine results with Reciprocal Rank Fusion (RRF). No external reranker for P0 — RRF is sufficient.

**P1**: Add cross-encoder reranking (Cohere Rerank or a local model) for improved precision.

---

## 7. Eval Engine

### D-7.1: Eval Framework Strategy

**Decision**: **Build our own eval engine** on top of the trace system. Do NOT wrap Braintrust, DeepEval, or RAGAS.

**Why**: Eval is our core differentiator. Wrapping someone else's framework means we inherit their limitations and can't innovate on trace-based evaluation. Our eval engine is built on our own traces — that's the architectural advantage.

**What we take from each**:
- From **Braintrust**: The `Score` object pattern (name, score 0-1, metadata). The experiment comparison UX.
- From **DeepEval**: pytest integration pattern. GEval's chain-of-thought scoring.
- From **RAGAS**: The faithfulness/relevancy metric decomposition into atomic claims.
- From **LangSmith**: The `Run` object pattern for trajectory evaluation.

**Rejected**:
- ❌ **Braintrust as eval backend**: Would create dependency on their platform. Our eval IS the platform.
- ❌ **DeepEval as library**: Opinionated in ways that conflict with our trace-native approach.
- ❌ **RAGAS as RAG eval**: We'll implement the metrics (faithfulness, context precision) ourselves. The math is documented.

### D-7.2: LLM-as-Judge Model

**Decision**: **Claude Sonnet** as the default judge model. Support user-configurable judge models.

**Why**: Strong instruction-following, less self-enhancement bias when judging outputs from other models, good at structured output.

**Rejected**:
- ❌ **GPT-4o as default judge**: Self-enhancement bias when judging GPT-4o agent outputs (many users will use GPT-4o).
- ❌ **Smaller/cheaper models as judge**: Too unreliable for quality scoring. Use cheap models only for binary classification (PII detection, toxicity).

### D-7.3: Grader Execution Environment

**Decision**: Deterministic graders run **in-process**. LLM judge graders run via the model gateway. Custom Python graders run in **E2B sandboxes**.

**Why**: Deterministic graders (regex, JSON schema, exact match) are fast and safe — no need for isolation. LLM judges use the same model gateway as agents. Custom Python graders are untrusted user code — sandbox them.

### D-7.4: Tool Side-Effects in Eval

**Decision**: **Mock tools by default** in eval runs. Support dry-run mode for tools that opt in.

```typescript
agentsy.eval({
  dataset: "golden-v3",
  agent: supportAgent,
  toolMode: "mock",  // default: tools return mocked responses from dataset
  // toolMode: "dry-run",  // tools execute but don't commit side effects
  // toolMode: "live",     // tools execute for real (use with caution)
});
```

**Why**: Eval runs should be safe, fast, and repeatable. Mocked tools give deterministic results. Live tool calls in eval are slow, expensive, and can have side effects (sending emails, creating tickets).

---

## 8. Observability

### D-8.1: Tracing Backend

**Decision**: **OpenTelemetry** for instrumentation. **Grafana Tempo** (self-hosted) or **Axiom** (managed) as the trace backend for P0.

**Rejected**:
- ❌ **LangSmith**: Would make us dependent on a competitor's observability. We ARE the observability layer.
- ❌ **Jaeger**: Mature but limited UI. Grafana Tempo integrates with Grafana dashboards.
- ❌ **Datadog/New Relic**: Expensive at scale. We'd pay more for observability than our users pay us.
- ❌ **Langfuse**: Good open-source option but we need deeper control over the trace format for our eval integration.

**Architecture**: OTel SDK in our runtime → OTel Collector → Tempo/Axiom for storage → Our custom trace viewer UI for display.

### D-8.2: Metrics & Dashboards

**Decision**: **Prometheus** + **Grafana** for internal platform metrics. Custom dashboard in the Agentsy UI for user-facing metrics.

Users see metrics in our dashboard (Statsig-inspired). We use Prometheus/Grafana for ops metrics (infra health, queue depths, error rates).

### D-8.3: Logging

**Decision**: **Structured JSON logs** to stdout → collected by Fly log shipping (or Fly's built-in `fly logs`) → stored in log backend.

Every log line includes: `timestamp`, `level`, `service`, `run_id`, `tenant_id`, `trace_id`. Sensitive data (prompts, tool outputs) redacted in production logs by default.

---

## 9. Auth & Multi-Tenancy

### D-9.1: Authentication

**Decision**: **Better Auth** (TypeScript auth library) embedded in agentsy-api. Uses our existing PostgreSQL for session/user/org storage.

**What we get**: Email/password, Google OAuth, GitHub OAuth, session management, organization management, API key management — all as a library inside the API process, backed by our Postgres.

**Why**: No additional service to deploy or manage. Runs inside agentsy-api. Uses our existing Postgres tables. TypeScript-native, works with Fastify. Keeps the entire auth stack on Fly with zero external dependencies.

**Rejected**:
- ❌ **Clerk (managed auth)**: Adds an external vendor, cross-network latency on every auth check, another billing account. Unnecessary when Better Auth covers the same features.
- ❌ **Auth0**: More expensive, more complex, external dependency.
- ❌ **Supabase Auth**: Ties us to Supabase ecosystem.
- ❌ **Logto (self-hosted)**: Good but adds another Fly Machine to manage. Library approach is simpler.
- ❌ **NextAuth/Auth.js**: Too basic — no organization management, no API key management.
- ❌ **Keycloak**: Java, heavy, overkill for a startup.

**Upgrade path**: Add SSO/SAML via Better Auth plugins (P2). If enterprise customers require a dedicated identity provider, evaluate self-hosted Logto or Keycloak at that point.

### D-9.2: Multi-Tenancy Isolation

**Decision**: **Row-Level Security in PostgreSQL** + per-tenant namespacing in vector store + per-run sandboxing for code execution.

Level 1 (data): RLS with `tenant_id` on every table.
Level 2 (compute): Sandboxed execution per run (E2B gives us this free).
Level 3 (enterprise): Dedicated compute workers per tenant (P2).

### D-9.3: API Key Management

**Decision**: API keys managed through **Better Auth** (organization-scoped) with our own key-to-tenant resolution layer.

Pattern: `sk-agentsy-{tenant_id_prefix}-{random}`. Hashed with SHA-256 before storage in Postgres. Never stored in plaintext. The full key is returned once on creation and never again.

### D-9.4: Rate Limiting

**Decision**: **Redis-based sliding window** rate limiting. Multi-dimensional: requests/min + tokens/day + concurrent runs.

Implementation: Redis Lua scripts for atomic increment-and-check. Middleware in the API gateway.

---

## 10. SDK & Developer Experience

### D-10.1: Primary SDK Language

**Decision**: **TypeScript SDK first**. Python SDK as a fast-follow (P1).

**Why**: Our backend is TypeScript. The SDK shares types with the server. TypeScript developers are our primary early adopters (Next.js, Vercel, serverless crowd).

**Python SDK timing**: P1, within 4-6 weeks of TypeScript SDK launch. Python is critical for the ML/AI community.

### D-10.2: CLI Tool

**Decision**: Build `agentsy` CLI in TypeScript (using `commander` or `citty`).

Commands:
```
agentsy init          # scaffold new agent project
agentsy dev           # local dev server (SQLite mode)
agentsy eval run      # run eval suite
agentsy eval compare  # compare results against baseline
agentsy deploy        # deploy to platform
agentsy logs          # query run logs
agentsy login         # authenticate
```

### D-10.3: Project Scaffolding

**Decision**: `agentsy init` with built-in templates (no Cookiecutter dependency).

Templates:
- `agentsy init --template basic` — single agent with tools
- `agentsy init --template eval` — agent + eval suite + golden dataset
- `agentsy init --template mcp-server` — custom MCP tool server

Uses `degit` or simple file copy from our template repo.

---

## 11. Frontend & UI

### D-11.1: Framework

**Decision**: **Next.js 15** (App Router) + **React 19** + **TypeScript**.

**Why**: Same language as backend (shared types). App Router gives us server components for data-heavy pages (agent list, run history). React 19 for streaming and concurrent features.

### D-11.2: Component Library

**Decision**: **shadcn/ui** as the component foundation. Customize with our design tokens.

**Why**: Not a dependency — it's copy-pasted components we own. Built on Radix primitives (accessible). Tailwind CSS for styling. We modify components to match our Statsig-inspired design system.

**Rejected**:
- ❌ **Chakra UI**: Too opinionated, harder to customize deeply.
- ❌ **MUI**: Too heavy, React-centric opinions conflict with Next.js patterns.
- ❌ **Ant Design**: Enterprise-looking but not the aesthetic we want.
- ❌ **Custom from scratch**: Waste of time. shadcn gives us accessible primitives to customize.

### D-11.3: Charts & Data Visualization

**Decision**: **Recharts** for standard charts (line, bar, area). Custom SVG for sparklines.

**Why**: Lightweight, React-native, sufficient for dashboard metrics. Sparklines are simple enough to render as inline SVG paths — no library needed.

**Rejected**:
- ❌ **D3.js**: Too low-level for our needs. Overkill for metric charts.
- ❌ **Nivo**: Heavy bundle size.
- ❌ **Tremor**: Good but too opinionated — we want Statsig-like control.

### D-11.4: State Management

**Decision**: **TanStack Query** (React Query) for server state. **Zustand** for client state (minimal).

**Why**: Most of our UI is server-state-driven (agent lists, run history, metrics). TanStack Query handles caching, revalidation, and optimistic updates. Zustand for the few pieces of client-only state (UI preferences, filter state).

### D-11.5: Real-time Updates

**Decision**: **Server-Sent Events (SSE)** for streaming agent responses. **WebSocket** for dashboard live updates (run status changes, metric updates).

SSE for agent runs: matches the LLM streaming pattern (unidirectional, auto-reconnect).
WebSocket for dashboard: bidirectional, lower overhead for frequent small updates.

---

## 12. Infrastructure & Deployment

### D-12.1: Deployment Platform

**Decision**: **Fly.io** (plain Fly Apps / Machines — NOT Fly Kubernetes).

Three Fly apps:
- `agentsy-web` — Next.js dashboard
- `agentsy-api` — Fastify API server + SSE streaming
- `agentsy-worker` — Temporal activity/workflow workers

**Why Fly**: Simple `fly deploy`, per-app scaling, process groups, multi-region when needed, no K8s operational overhead at this stage.

**Why NOT Kubernetes**: Fly Kubernetes is in closed beta, missing HPA, CronJobs, network policies, sidecars, and init containers. K8s adds operational complexity we don't need until we're past private beta. Revisit when Fly's scaling limits are hit or enterprise customers require dedicated compute.

**Rejected**:
- ❌ **Railway/Render**: Less control over machine placement, weaker scaling primitives
- ❌ **Fly Kubernetes (FKS)**: Not production-ready, missing critical features
- ❌ **Managed K8s (EKS/GKE)**: Overkill for private beta, high ops cost

**On Fly** (same private network):
- PostgreSQL 16 + pgvector (Fly Managed Postgres)
- Redis 7 (self-managed, Fly Machine + volume)
- Tigris (Fly-native S3-compatible object storage)
- Better Auth (library in agentsy-api, data in Postgres)
- Encrypted secrets (AES-256-GCM columns in Postgres)

**External services** (only one):
- Temporal Cloud (durable execution)

### D-12.2: CI/CD

**Decision**: **GitHub Actions** for CI/CD.

Pipeline:
1. Lint + type check on every PR
2. Unit tests on every PR
3. Eval suite (deterministic only) on every PR
4. Full eval suite on merge to main
5. Deploy to staging automatically on merge
6. Deploy to production on manual approval (or tag)

### D-12.3: Monorepo Structure

**Decision**: **Turborepo** monorepo with pnpm workspaces.

```
agentsy/
  apps/
    web/          # Next.js dashboard
    api/          # Fastify API server
    worker/       # Temporal worker
    cli/          # CLI tool
  packages/
    sdk/          # TypeScript SDK (published to npm)
    db/           # Drizzle schema + migrations
    ui/           # Shared React components
    eval/         # Eval engine (published to npm)
    shared/       # Shared types and utilities
```

**Why Turborepo**: Fast incremental builds, good caching, simpler than Nx, native pnpm workspace support.

### D-12.4: ORM / Database Client

**Decision**: **Drizzle ORM** for PostgreSQL access.

**Why**: Type-safe, SQL-like API (not an abstraction over SQL), excellent migration tooling, lightweight. Pairs well with our TypeScript-first approach.

**Rejected**:
- ❌ **Prisma**: Too many abstractions, generates a query engine binary, slower for complex queries.
- ❌ **Knex.js**: Query builder without type safety.
- ❌ **TypeORM**: Over-engineered, decorator-heavy, poor TypeScript inference.
- ❌ **Raw SQL**: No type safety, migration management becomes manual.

---

## Decision Summary Matrix

| Category | Decision | Confidence | Revisit When? |
|----------|----------|------------|---------------|
| Orchestration | Model-driven loop (not graph) | High | Add workflow primitives in P2, visual DAG in P3 |
| Durable execution | Temporal Cloud | High | If cost exceeds $X/mo or data residency |
| Database | PostgreSQL 16 (Fly Managed Postgres) | High | Never — Postgres is the foundation |
| Vector store | pgvector | Medium | If tenant exceeds 5M vectors |
| Cache | Redis 7 (self-managed on Fly) | High | Managed Redis if ops burden grows |
| Object storage | Tigris (Fly-native) | High | Stable |
| Local dev DB | SQLite + sqlite-vec | High | Stable |
| LLM providers | Anthropic + OpenAI P0, Google P1 | High | Add providers on demand |
| Model router | Static config P0, rules P1 | High | Add ML classifier at scale |
| Provider SDK | Vercel AI SDK | Medium | If it falls behind on features |
| Tool protocol | MCP + native functions | High | MCP is the standard |
| Tool auth | Platform OAuth proxy | Medium | Nango if we need 100+ integrations fast |
| Secrets | Encrypted Postgres columns (AES-256-GCM) | High | Vault/KMS for enterprise compliance |
| Code sandbox | E2B (managed, P1) | Medium | Firecracker self-hosted for enterprise |
| Browser automation | E2B Desktop + Playwright (P1) | Medium | Browserbase for stealth-heavy use cases |
| Memory | 3-tier (working/session/knowledge) for P0 | High | MemGPT-style as opt-in mode in P2 (not default) |
| Embeddings | text-embedding-3-small | Medium | Multi-model support in P1 |
| Retrieval | Hybrid (vector + BM25 + RRF) | High | Add reranker in P1 |
| Eval engine | Custom (built on our traces) | High | This IS the product |
| Judge model | Claude Sonnet default | Medium | Make configurable |
| Grader execution | In-process / E2B for custom | High | Stable |
| Tool mocking in eval | Mock by default | High | Stable |
| Tracing | OTel → Tempo/Axiom | Medium | Switch backends if needed |
| Metrics | Prometheus + Grafana (ops) | High | Stable |
| Auth | Better Auth (library in API) | High | Logto/Keycloak for enterprise SSO |
| Multi-tenancy | PostgreSQL RLS | High | Add compute isolation for enterprise |
| Rate limiting | Redis sliding window | High | Stable |
| SDK language | TypeScript first | High | Python fast-follow |
| CLI | TypeScript (commander/citty) | High | Stable |
| Frontend framework | Next.js 15 + React 19 | High | Stable for 2+ years |
| Components | shadcn/ui + Tailwind | High | Stable |
| Charts | Recharts + custom sparklines | Medium | Replace if needs grow |
| State management | TanStack Query + Zustand | High | Stable |
| Real-time | SSE (streaming) + WS (dashboard) | High | Stable |
| Deployment | Fly.io (all-in: apps + Postgres + Redis) → K8s at scale | Medium | K8s when we need horizontal scale |
| CI/CD | GitHub Actions | High | Stable |
| Monorepo | Turborepo + pnpm | High | Stable |
| ORM | Drizzle | High | Stable |

---

## Decisions Explicitly Deferred (with Timeline)

Aligned with PRD v1. "Demand" = >20% of active beta teams request, OR 3+ paying customers at GA.

| Topic | Phase | Trigger |
|-------|-------|---------|
| Form-based visual agent builder (config UI in dashboard) | **P1** (Milestone 5) | Ships after runtime + eval are solid. NOT a DAG builder — just a config form. |
| Billing integration (Stripe) | **P1** | Ships alongside visual builder. Credit-based pricing. |
| Python SDK | **P1** | 4-6 weeks after TypeScript SDK launch. |
| Built-in MCP server gallery (curated starter set) | **P1** | 10-15 popular servers with one-click connect. |
| Release gates (hard/soft/canary) | **P1** | Automated eval gates that block deploys. |
| Programmatic workflow primitives (branching, fan-out in SDK) | **P2** | When users need multi-step orchestration beyond simple loops. |
| Multi-agent orchestration (agent-to-agent routing) | **P2** | When >20% of teams request. Data model is multi-agent-aware from P0. |
| MemGPT-style self-managing memory (opt-in) | **P2** | When users need agents that manage their own memory lifecycle. |
| SSO/SAML (via Better Auth plugins or dedicated IdP) | **P2** | When 3+ enterprise prospects require it. |
| Data residency (EU, etc.) | **P2** | Enterprise feature. Requires multi-region infra. |
| Fine-tuning pipeline | **P2** | When >20% demand. |
| A2A protocol support | **P2** | When the standard stabilizes and cross-platform agent calls are common. |
| Visual DAG/workflow builder (node-and-wire) | **P3** | Builds on P2 workflow primitives. For non-technical workflow designers. |
| Agent marketplace / template gallery | **P3** | Needs critical mass of agents and community. |
| Voice / real-time agents | **P3** | Different runtime (WebRTC). Pull to P2 if >30% of beta users request. |
| No-code agent builder (non-technical users) | **P3** | Different market. Expand audience after PMF with developers. |
| Self-hosted / on-prem | **P3** | Enterprise compliance. Cloud-only until then. |
| Custom domain / white-label | **P3** | Enterprise vanity feature. |
