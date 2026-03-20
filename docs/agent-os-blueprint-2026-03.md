# Agentsy Agent OS Blueprint

Date: March 19, 2026

## 1. What Agentsy should be

Agentsy should be the control plane and runtime fabric for enterprise agents.

Users and companies should be able to:

- define an agent once
- connect tools and knowledge sources
- run it in chat, background, scheduled, webhook, and API modes
- give it durable memory, governed access, and safe execution
- observe every run, replay failures, evaluate quality, and control spend

The key product idea is:

> Companies should build agents, not agent infrastructure.

This repo is currently empty, so the right first move is to define the platform shape before writing code.

## 2. What changed by March 2026

As of March 19, 2026, the agent stack is much clearer than it was a year ago.

- OpenAI now exposes a fairly complete agent surface in its docs: Agents SDK, built-in tools, conversation state, background mode, compaction, prompt caching, evals, trace grading, and GPT-5.4 model guidance.
- MCP has become the default tool interoperability layer for agent-to-tool communication.
- Google launched A2A in April 2025, contributed it to the Linux Foundation in June 2025, and by July 31, 2025 was positioning it as the interoperability layer for agent-to-agent ecosystems.
- Anthropic has doubled down on tool use, computer use, prompt caching, and the Claude Code SDK.
- Durable execution is no longer optional. If agents can do multi-step work, they need resumability, retries, and human pauses.

Inference from the sources: the winning product in 2026 is not "one more agent framework." It is a reliable platform that combines these primitives into a managed operating environment.

## 3. Product thesis

Agentsy should sit above model vendors and below end-user workflows.

That means:

- do not build your own foundation models
- do not force customers into one model provider
- do not invent a proprietary tool protocol if MCP already solves the integration shape
- do build the missing enterprise layer: tenancy, execution, memory, governance, observability, approvals, and deployment

The platform should feel like:

- Stripe for agent execution and billing
- Vercel for agent deployment and developer experience
- Temporal for durable runs
- Auth0 for identity and policy
- Datadog plus Langfuse for traces and evals

## 4. The layers that actually matter

### 4.1 Control plane

This is the heart of Agentsy. It owns the declarative truth of the platform.

Build:

- organizations, projects, workspaces, environments
- agent registry and versioning
- deployment configs
- secrets and connector credentials
- policies and approvals
- quotas, budgets, and billing metadata
- audit logs

Do not delegate this to the model layer. This is your product.

### 4.2 Inference and model gateway

Agents need a single runtime contract even if they use multiple providers.

Build:

- provider abstraction for OpenAI, Anthropic, Google, and open model backends
- model policy per agent
- routing rules for latency, cost, and safety
- retry and fallback behavior
- token accounting and cached-token accounting

Use vendor-native capabilities where they are strong:

- OpenAI for built-in tools, background runs, conversation state, prompt caching, and traceable agent workflows
- Anthropic where tool use or code-oriented flows fit better
- Google where A2A or ADK ecosystem compatibility matters

Important design rule:

- your internal API should expose a stable `run_step()` contract
- provider-specific features should plug in behind adapters

### 4.3 Workflow and durable execution

An agent run is not just one model call. It is a workflow.

Build:

- a durable run engine
- resumable steps
- retries with backoff
- timeouts
- pause and resume for human approvals
- idempotent tool execution
- state checkpoints
- schedules and triggers

Recommendation:

- use Temporal as the durable execution layer
- model each agent run as a workflow
- model tool calls, approvals, and sub-agent handoffs as activities or child workflows

Why this matters:

- long-running research, ops, finance, support, and coding agents fail constantly in the real world
- without durable orchestration, the platform becomes a chatbot wrapper

### 4.4 Compute plane

Not every step needs the same execution environment.

You need at least four classes of compute:

1. Stateless inference workers
2. Background workflow workers
3. Isolated tool sandboxes
4. Browser or computer-use sandboxes

Build:

- runtime worker pool
- sandbox allocator
- execution leases
- CPU, memory, wall-clock, and network budgets
- artifact mounting and upload/download
- environment templates

Recommendation:

- start with Kubernetes for worker orchestration
- use managed isolated sandboxes first for code/browser execution if speed matters
- keep a strict abstraction boundary so you can later move high-volume workloads to your own Firecracker or container-based fleet

Do not build custom infra for sandboxing on day one unless isolation is your core moat.

### 4.5 Memory plane

Most teams under-spec memory. Agents need multiple memory types, not one vector store.

Build four memory classes:

- Working memory: current run state, step outputs, scratchpad summaries, tool results
- Episodic memory: summaries of prior runs, decisions taken, outcomes, failure patterns
- Semantic memory: facts, documents, chunks, embeddings, retrieval indexes
- Procedural memory: prompts, policies, playbooks, tool usage patterns, reusable skills

Also build:

- artifact storage for files, screenshots, datasets, code diffs, reports
- memory scopes: user, team, org, agent, run
- TTL and retention rules
- memory compaction and summarization jobs
- source attribution and provenance on recalled items

Recommendation:

- use Postgres as the system of record
- use `pgvector` for first-party semantic memory
- use object storage for artifacts
- keep memory write paths explicit and policy-driven

Important product decision:

- memory writes should not be implicit by default in enterprise settings
- customers need controls over what gets remembered, where, and for how long

### 4.6 Tool plane

This is where Agentsy becomes useful.

Build:

- MCP gateway for remote and local tool servers
- connector framework for SaaS APIs, databases, internal HTTP services, queues, and files
- tool registry with schemas, auth requirements, scopes, and risk ratings
- execution policy layer for rate limits, dry-runs, approvals, and allowed arguments

Supported tool classes should include:

- read APIs
- write APIs
- SQL
- web search
- retrieval
- shell/code execution
- browser/computer use
- messaging and workflow actions
- human approval requests
- other agents

Key standards:

- MCP for agent-to-tool integration
- A2A for agent-to-agent interoperability when that ecosystem matters

Inference from the sources: Agentsy should be protocol-native. If you make every tool integration custom, the product will not scale.

### 4.7 Security and governance layer

This is mandatory for B2B.

Build:

- RBAC and ideally ABAC
- per-tool scopes and allowlists
- secrets isolation by org and environment
- approval gates based on risk
- content and policy guardrails
- network egress controls for sandboxes
- audit trails for every tool call and memory write
- redaction and PII handling
- tenant isolation guarantees

Every tool should have a risk class:

- low: read-only and reversible
- medium: write but reversible or narrow scope
- high: money movement, destructive changes, user-facing actions, external publishing

High-risk actions should support:

- pre-execution policy checks
- human approval
- dual-control for the most sensitive workflows

### 4.8 Observability and eval layer

If you cannot inspect an agent run, you cannot operate it.

Build:

- trace of every run, step, tool call, and model call
- prompt and output version association
- cost, latency, and token metrics
- failure reason taxonomy
- replay support
- eval datasets and dataset versioning
- grader registry
- experiment runner
- trajectory grading and tool-call grading
- annotation queues for human calibration
- online quality monitoring
- regression testing before agent version rollout
- release gates for deployment promotion

Recommendation:

- instrument everything with OpenTelemetry from day one
- keep a first-party run ledger in your app database
- store high-cardinality traces in an observability backend
- score both final outcomes and trajectories, not just answers

Evals should exist at three levels:

- unit evals for prompts, tool schemas, and extraction formats
- workflow evals for end-to-end task success
- production evals for drift, cost spikes, and safety incidents

See the dedicated eval design here:

- [Eval Engine Blueprint](/Users/ishprasad/code/agentsy/docs/agent-evals-engine-2026-03.md)

### 4.9 Human-in-the-loop layer

Enterprise agents should not jump directly from "can reason" to "can act without review."

Build:

- inbox for approvals and escalations
- diff view for pending actions
- approve, reject, edit, and rerun controls
- SLA handling
- fallback when humans do not respond

This is not a nice-to-have. It is how you unlock higher-risk workflows safely.

### 4.10 Developer platform and UX layer

This is what customers actually experience.

Build:

- agent builder
- deployment environments
- test console
- prompt and tool editor
- trace viewer
- eval runner
- dataset manager
- experiment comparison view
- annotation queue
- connector installer
- usage dashboard
- logs and failure replay

Eventually add:

- templates
- team-shared skills and playbooks
- deployment promotion flows
- marketplace

## 5. What needs to be built first

If you try to build the entire surface at once, you will stall. The correct move is to build an opinionated thin vertical slice.

### Phase 1: Managed single-agent runtime

Build first:

- org/project/environment model
- agent spec and versioning
- one model provider deeply integrated
- one durable workflow engine
- one semantic memory backend
- one artifact store
- one connector protocol
- trace viewer
- eval dataset registry
- experiment runner
- deterministic graders
- approval inbox
- budgets and quotas

User promise for Phase 1:

- "Define an agent, connect tools and knowledge, run it safely, and see everything it did."

This alone is already a meaningful product.

### Phase 2: Multi-agent and background work

Build next:

- sub-agent orchestration
- scheduled runs
- background jobs
- browser and computer-use workers
- richer policy engine
- eval dashboards
- connector marketplace
- tenant-level memory controls

### Phase 3: Enterprise platform

Then build:

- A2A interoperability
- deployment promotion and staging environments
- SSO and SCIM
- private networking and on-prem connectors
- data residency controls
- self-hosted or dedicated deployment options
- advanced billing

## 6. Opinionated stack recommendation for Agentsy

This is the stack I would choose for a greenfield build today.

### Application stack

- TypeScript across control plane and product UI
- Next.js for app surface
- a backend service layer using Fastify or NestJS

Reason:

- fast iteration
- shared types across UI and backend
- strong ecosystem for auth, admin UX, and API tooling

### Durable execution

- Temporal

Reason:

- pause/resume semantics
- durable retries
- schedules
- child workflows
- strong fit for long-running agent runs

### Data layer

- Postgres for core metadata and run ledger
- `pgvector` for semantic memory
- object storage for artifacts
- Redis for hot state, caching, and coordination if needed

Start simple:

- do not add Kafka on day one unless you already know you need it
- Temporal plus Postgres plus Redis is enough for the first serious version

### Compute

- Kubernetes for workers
- managed sandbox provider initially for browser/code isolation
- move to self-managed isolation later only if economics or compliance force it

### Observability

- OpenTelemetry instrumentation everywhere
- OTel Collector as the ingestion control point
- vendor backend or self-hosted observability stack behind that abstraction

### Model layer

- start with OpenAI as the deepest native integration because the March 2026 platform surface is broad
- add Anthropic and Google through the same gateway contract

### Protocols

- MCP for tools
- A2A for cross-agent interoperability
- webhooks for external triggers

## 7. Suggested internal architecture

### Core services

1. `api-gateway`
   Exposes public API, auth, streaming, webhooks, and SDK surface.

2. `control-plane`
   Owns orgs, projects, agents, versions, deployments, policies, secrets metadata, and billing metadata.

3. `run-orchestrator`
   Starts and manages Temporal workflows for every run.

4. `model-gateway`
   Normalizes provider APIs and captures usage, retries, and fallbacks.

5. `tool-gateway`
   Handles MCP servers, native connectors, tool auth, and execution policy.

6. `memory-service`
   Handles storage, retrieval, summarization, compaction, and scope-aware recall.

7. `artifact-service`
   Handles files, screenshots, reports, code bundles, and signed URLs.

8. `policy-service`
   Evaluates guardrails, risk, approvals, compliance rules, and memory write policy.

9. `trace-eval-service`
   Stores traces, powers replay, manages datasets and graders, runs offline and online evals, and enforces release gates.

10. `sandbox-manager`
    Allocates isolated environments for code, browser, and computer-use tasks.

### Data model primitives

At minimum, define these entities early:

- `organization`
- `project`
- `environment`
- `user`
- `agent`
- `agent_version`
- `deployment`
- `run`
- `run_step`
- `session`
- `tool`
- `tool_installation`
- `approval_request`
- `memory_item`
- `artifact`
- `trace_span`
- `budget_policy`
- `audit_event`

## 8. Agent definition contract

Every agent should be declarative.

Suggested shape:

```yaml
name: support-ops
description: Triage and resolve customer support operations issues
model_policy:
  primary: openai:gpt-5.4
  fallback:
    - anthropic:claude-sonnet-4.5
run_policy:
  max_steps: 40
  timeout_seconds: 1800
  background_allowed: true
tools:
  - mcp:slack
  - mcp:postgres
  - native:web_search
  - native:file_search
memory:
  read_scopes:
    - org_knowledge
    - user_history
  write_scopes:
    - episodic
    - artifacts
approvals:
  - when: risk >= high
    action: require_human
guardrails:
  - moderation
  - pii_redaction
  - tool_argument_validation
deployments:
  - environment: prod
    channel: api
```

Why this matters:

- the agent definition becomes your platform contract
- everything else, including UI, SDKs, and deployments, can sit on top of it

## 9. How agent runs should work

Recommended run lifecycle:

1. Accept trigger
2. Resolve agent version and environment
3. Load policies, tools, memory scopes, and model policy
4. Start durable workflow
5. Gather working context
6. Execute model step
7. If tool call is requested, validate policy and run tool
8. Persist outputs, artifacts, and memory writes
9. If approval is required, pause and enqueue human task
10. Resume until exit condition is met
11. Persist final output, trace, metrics, and evaluation signals

Exit conditions should include:

- final answer emitted
- structured output complete
- max steps reached
- tool failure policy reached
- approval rejected
- timeout exceeded

## 10. What not to build yet

These are common traps.

- Do not build a custom vector database.
- Do not build a custom workflow engine before proving Temporal is insufficient.
- Do not build a no-code visual builder before the run engine and policies are solid.
- Do not build a fully autonomous multi-agent system first.
- Do not build your own browser automation substrate first if a managed sandbox gets you to product faster.
- Do not treat "chat with documents" as the product. It is only one tool shape inside the platform.

## 11. Real moat for Agentsy

The moat is not "we call models."

The moat is:

- reliable enterprise execution
- policy-aware memory
- safe tool orchestration
- observability and replay
- good developer ergonomics
- multi-tenant governance
- deployment confidence

In other words, your moat is operating agents well, not just creating them.

## 12. Build order I would use

### Milestone A: Foundation

- Postgres schema
- auth and tenancy
- declarative agent spec
- OpenAI-backed model gateway
- Temporal workflow for a run
- artifact store
- trace capture
- basic approvals

### Milestone B: Useful product

- MCP tool gateway
- semantic memory with `pgvector`
- file and retrieval flows
- scheduled and background runs
- trajectory graders and LLM-judge graders
- basic dashboard for runs, cost, failures, and eval regressions
- Slack and webhook triggers

### Milestone C: Serious enterprise readiness

- Anthropic and Google adapters
- sandbox manager
- policy engine with risk classes
- eval suites and regression gates
- SSO and audit export
- memory controls per tenant

### Milestone D: Platform expansion

- A2A interoperability
- marketplace and templates
- private networking
- dedicated deployments
- advanced governance and billing

## 13. Immediate next implementation move

Because the repo is blank, I would start with this exact slice:

1. Control plane API with org, project, agent, and deployment models
2. Temporal-based run execution for one agent type
3. OpenAI model gateway with trace capture
4. Postgres plus `pgvector` memory service
5. S3-compatible artifact storage
6. One MCP connector path
7. Eval dataset registry and experiment runner
8. Approval inbox and run replay UI

That gives you a real Agent OS foundation instead of a demo.

## 14. Source notes

Primary sources used:

- OpenAI Agents SDK docs: [developers.openai.com/api/docs/guides/agents-sdk](https://developers.openai.com/api/docs/guides/agents-sdk)
- OpenAI Prompt Caching guide: [developers.openai.com/api/docs/guides/prompt-caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- OpenAI practical guide PDF: [cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- OpenAI model docs, including GPT-5.4 listing: [developers.openai.com/api/docs/models](https://developers.openai.com/api/docs/models)
- Anthropic docs overview for Claude Code SDK: [docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview)
- Anthropic docs on tool use and computer use: [docs.anthropic.com/en/docs/build-with-claude/tool-use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) and [docs.anthropic.com/en/docs/build-with-claude/computer-use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)
- Model Context Protocol docs: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- MCP authorization specification dated June 18, 2025: [modelcontextprotocol.io/specification/2025-06-18/basic/authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- Google Cloud A2A update dated July 31, 2025: [cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- A2A specification site: [google-a2a.github.io/A2A/latest](https://google-a2a.github.io/A2A/latest)
- Google ADK docs for sessions and artifacts: [google.github.io/adk-docs/sessions](https://google.github.io/adk-docs/sessions) and [google.github.io/adk-docs/artifacts](https://google.github.io/adk-docs/artifacts)
- Temporal docs: [docs.temporal.io](https://docs.temporal.io)
- OpenTelemetry Collector docs: [opentelemetry.io/docs/collector](https://opentelemetry.io/docs/collector)
- pgvector docs: [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)

Key conclusions inferred from the sources:

- standards and vendor primitives are mature enough that Agentsy should focus on the control plane, execution, governance, and memory model
- protocol support and durable execution should be first-order design decisions, not later add-ons
- enterprise trust comes from replayability, policy, and approvals more than from raw model quality alone
