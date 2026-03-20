# Agentsy v1 — Product Requirements Document

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**Target**: Private beta launch

---

## 1. Problem Statement

Building an AI agent is easy. Running it reliably in production is hard.

Teams today cobble together 5-8 tools to get an agent to production: a framework (LangGraph/CrewAI), an LLM provider, a vector store, an observability tool (LangSmith/Langfuse), an eval tool (Braintrust/DeepEval), a secrets manager, a hosting platform, and a sandboxing solution. Each tool has its own auth, its own billing, its own learning curve. The integration surface is enormous.

The result: most agents work in demos but fail in production. Teams spend more time on infrastructure than on the agent itself. There is no "Vercel for agents" — no platform that takes an agent from prototype to production with confidence.

**Agentsy solves this.** One platform. Define your agent, connect your tools, write your evals, deploy with confidence. We handle the runtime, the durability, the observability, the eval pipeline, and the cost tracking.

---

## 2. Vision

**Agentsy is the operating system for AI agents.**

Companies come to Agentsy to build, test, and run agents without worrying about infrastructure. We provide the building blocks every agent needs — compute, memory, tools, eval, and observability — as a single, integrated platform.

**Analogy**: Vercel made deploying web apps trivial. Agentsy makes deploying agents trivial.

**Core belief**: The winning agent platform won't be the one with the most features. It will be the one where agents are most **reliable**. Reliability comes from evaluation, observability, and safe deployment — not from fancier orchestration.

---

## 3. Target Users

### Primary: Engineering teams building AI-powered features (P0)

- **Who**: Software engineers at startups and mid-market companies (50-500 employees) building customer-facing or internal AI agents
- **Example**: A SaaS company building a customer support agent that can look up orders (read tool, auto-approved), process refunds (write tool, requires approval gate), and escalate to humans
- **Current tools**: LangChain/LangGraph + OpenAI API + Pinecone + LangSmith + custom deployment scripts
- **Pain**: Integration complexity, no eval pipeline, no safe deployment, no cost visibility
- **Budget**: $500-5,000/month for tooling (separate from LLM API costs)

### Secondary: AI/ML teams at larger companies (P1)

- **Who**: ML engineers and AI platform teams at companies with 500+ employees
- **Example**: A fintech company building multiple agents across support, compliance, and data analysis
- **Current tools**: Internal platforms built on LangGraph + Temporal + custom eval + Datadog
- **Pain**: Maintaining internal agent infrastructure is expensive and distracts from agent quality
- **Budget**: $5,000-50,000/month

### Not targeting (yet):

- ❌ Non-technical users who want to "build an agent with no code" — form-based builder is P1, full no-code is P3
- ❌ Researchers building novel agent architectures — we're for production, not research
- ❌ Individual developers/hobbyists — we're B2B, team-first

---

## 4. Success Metrics

### Private Beta (First 90 Days)

| Metric | Target | How We Measure |
|--------|--------|---------------|
| Teams onboarded | 20 | Sign-ups with at least 1 agent deployed |
| Agents in production | 50 | Agents receiving real traffic (not just dev/test) |
| Weekly active teams | 15 | Teams with at least 1 agent run per week |
| Eval adoption | 60% of teams | Teams with at least 1 eval dataset + 1 eval run |
| NPS | > 40 | Survey at 30 and 60 days |
| Time to first deploy | < 30 minutes | From sign-up to first agent running on platform |
| Uptime | 99.5% | Platform availability (not counting LLM provider outages) |

### Signals We're Watching (Leading Indicators)

- **Retention signal**: Do teams keep deploying new agent versions? (shows trust in the platform)
- **Eval signal**: Do teams grow their eval datasets over time? (shows they're using evals for real decisions)
- **Cost signal**: Do teams use cost breakdowns to optimize model routing? (shows platform value beyond hosting)
- **Expansion signal**: Do teams add more agents after the first one succeeds?

---

## 5. What We're Building

### Beta Core vs. Full P0

The requirements below are organized into **Beta Core** (the narrowest slice for private beta — weeks 1-12) and **P0 Remainder** (still P0, ships in weeks 13-16 before P1). The beta core is: runtime + tools + evals + basic observability. Memory, knowledge bases, secrets vault, MCP remote, deployment controls, and multi-tenancy hardening ship in the P0 remainder.

**Beta Core (Milestones 1-3)**: Runtime engine, native tools, eval engine, trace viewer, CLI, basic dashboard, API.
**P0 Remainder (Milestone 4)**: Memory/sessions, knowledge bases, secrets, MCP remote, versioning, environments, rate limiting, team management.

This separation means beta users can define agents, connect tools, run evals, and deploy — the full reliability loop — without waiting for every platform feature.

---

### 5.1 Core Runtime

**The Agent Runtime Engine** — the heart of the platform. Takes an agent definition (model + system prompt + tools + guardrails) and executes it reliably.

**User story**: *As a developer, I define my agent in code using the Agentsy SDK, deploy it to the platform, and it runs reliably with automatic retries, checkpointing, and cost tracking.*

**Requirements**:

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-1.1 | Agent definition via TypeScript SDK (model, prompt, tools, guardrails) | Beta Core | Code-first, type-safe |
| R-1.2 | Default execution model is a model-driven agentic loop (LLM call → tool execution → LLM call → ... → response) | Beta Core | Default, not the only option — room for programmatic workflow primitives in P2 |
| R-1.3 | Streaming responses via SSE | Beta Core | Token-level and step-level events |
| R-1.4 | Durable execution — agent runs survive process crashes | Beta Core | Via Temporal |
| R-1.5 | Checkpointing at every tool call boundary | Beta Core | Resume from last checkpoint on failure |
| R-1.6 | Configurable max iterations (default: 10) | Beta Core | Prevent infinite loops |
| R-1.7 | Configurable max tokens per run (default: 50K) | Beta Core | Cost circuit breaker |
| R-1.8 | Configurable timeout per run (default: 5 min) | Beta Core | Prevent runaway agents |
| R-1.9 | Support for Anthropic Claude models (reasoning + fast tiers) | Beta Core | Provider capability class, not model SKUs — see §5.10 |
| R-1.10 | Support for OpenAI models (reasoning + fast tiers) | Beta Core | Provider capability class, not model SKUs — see §5.10 |
| R-1.11 | Fallback model configuration | Beta Core | If primary provider is down, route to fallback |
| R-1.12 | Per-run cost tracking (input tokens, output tokens, model, cost USD) | Beta Core | Tracked and stored for every LLM call |

### 5.2 Tool System

**User story**: *As a developer, I connect my agent to external APIs and services using MCP servers or native tool functions, and the platform handles execution, auth, and error handling.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-2.1 | Native tool definitions (TypeScript functions with schema) | Beta Core | Simple functions registered in agent config |
| R-2.2 | MCP server connection (stdio transport for local dev) | Beta Core | Connect any MCP server |
| R-2.3 | MCP server connection (Streamable HTTP for remote) | P0 | Connect remote MCP servers with auth |
| R-2.4 | Tool execution with timeout (default: 30s per tool call) | Beta Core | Kill hung tools |
| R-2.5 | Tool execution retry on transient failure (1 retry) | Beta Core | Auto-retry 5xx errors |
| R-2.6 | Tool result size limit (default: 10KB, truncate with warning) | Beta Core | Prevent context window blowout |
| R-2.7 | Per-tenant secrets vault for tool credentials | P0 | Encrypted at rest, never in logs or LLM context |
| R-2.8 | Code execution sandbox via E2B | P1 | For agents that generate and run code |
| R-2.9 | Tool risk classification: `read` / `write` / `admin` | Beta Core | Declared in tool definition, enforced by runtime |
| R-2.10 | Write-tool approval gate: configurable human-in-the-loop for `write` and `admin` tools | Beta Core | Default: auto-approve reads, require approval for writes in production. Configurable per-tool and per-environment |
| R-2.11 | Tool execution policy: allow-list of permitted tools per environment | P0 | Agent in staging can call dev tools; production only calls approved tools |

### 5.3 Memory

**User story**: *As a developer, my agent remembers conversation history within a session and can retrieve relevant knowledge from uploaded documents.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-3.1 | Conversation history persistence (per-session) | P0 | Stored in Postgres, retrieved on continuation |
| R-3.2 | Configurable conversation history window (default: last 20 messages) | P0 | Older messages summarized or truncated |
| R-3.3 | Knowledge base upload (PDF, TXT, MD, CSV) | P0 | Chunked, embedded, stored in pgvector |
| R-3.4 | RAG retrieval as an automatic context injection | P0 | Top-K relevant chunks injected before LLM call |
| R-3.5 | Hybrid search (vector + keyword) for retrieval | P0 | pgvector + tsvector with RRF |
| R-3.6 | Per-agent knowledge base scoping | P0 | Agent A cannot access Agent B's documents |

> **Note**: All memory features ship in Milestone 4 (P0 Remainder), not Beta Core. Beta agents run without sessions or RAG — they work, but statelessly.

### 5.4 Eval Engine

**This is our differentiator.** The eval system is not bolted on — it's built on the same traces the runtime produces.

**User story**: *As a developer, I define test cases for my agent, run evals automatically on every prompt change, and see exactly which cases regressed before I deploy.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-4.1 | Dataset registry — create, version, and manage eval datasets | Beta Core | Datasets are immutable snapshots |
| R-4.2 | Agent-native dataset format (see §5.4.1 below) | Beta Core | Flexible — not all fields required per case |
| R-4.3 | Experiment runner — run agent against a dataset, collect outputs + traces | Beta Core | Parallelized, with progress tracking |
| R-4.4 | Deterministic graders: exact_match, json_schema, regex, numeric_threshold | Beta Core | Fast, cheap, high confidence |
| R-4.5 | Semantic graders: embedding similarity, tool name match, tool args match | Beta Core | For open-ended outputs |
| R-4.6 | LLM-as-judge graders: pointwise scoring with rubric | Beta Core | Configurable judge model — see §5.10 for model classes |
| R-4.7 | Trajectory graders: tool sequence match, unnecessary step detection | Beta Core | Evaluate the path, not just the output |
| R-4.8 | Experiment comparison — diff two experiments, show per-case score deltas | Beta Core | "Version A scored 0.92, Version B scored 0.87 on case X" |
| R-4.9 | Baseline tracking — every experiment compared against a stored baseline | Beta Core | Regression detection |
| R-4.10 | CLI integration: `agentsy eval run`, `agentsy eval compare` | Beta Core | Runs locally or against platform |
| R-4.11 | CI integration: exit code 1 if regression threshold breached | Beta Core | GitHub Actions compatible |
| R-4.12 | Custom graders: user-defined Python/TypeScript scoring functions | P1 | Sandboxed execution |
| R-4.15 | Tool mocking in eval: tools return mocked responses from dataset by default | Beta Core | Modes: mock (default), dry-run, live. Evals must be safe, fast, repeatable |
| R-4.13 | Human annotation queue: flag cases for human review, collect labels | P1 | Build golden datasets from production |
| R-4.14 | Production sampling: automatically score a % of live traffic | P1 | Continuous quality monitoring |

#### 5.4.1 Eval Dataset Case Schema

The dataset format must be **agent-native** — not just input/output pairs. Real agent evals need to validate trajectories, tool usage, approval behavior, citations, and memory interactions.

```typescript
interface EvalCase {
  // --- Input ---
  input: string;                          // The user message
  session_history?: Message[];            // Prior conversation context (for multi-turn eval)

  // --- Expected Outputs (all optional, use what you need) ---
  expected_output?: string;               // Expected final response (exact or semantic)
  expected_tool_calls?: ExpectedToolCall[]; // Expected tools in order
  expected_trajectory?: TrajectoryStep[]; // Full expected step sequence (tool calls + reasoning)
  expected_approval_behavior?: ApprovalExpectation; // Should the agent request human approval?
  expected_citations?: string[];          // Expected source references from knowledge base
  expected_memory_writes?: MemoryExpectation[]; // Expected session/knowledge writes

  // --- Tool Mocking ---
  tool_mocks?: Record<string, unknown>;   // Mock responses keyed by tool name

  // --- Metadata ---
  metadata?: Record<string, unknown>;     // Tags, categories, difficulty, etc.
  tags?: string[];                        // For filtering subsets (e.g., "refund", "escalation")
}

interface ExpectedToolCall {
  tool_name: string;
  args?: Record<string, unknown>;         // Expected arguments (partial match supported)
  result?: unknown;                       // Expected result (also used as mock)
}

interface TrajectoryStep {
  type: 'tool_call' | 'response' | 'approval_request';
  tool_name?: string;
  contains?: string;                      // Substring match on response text
}

interface ApprovalExpectation {
  should_request: boolean;                // Should agent pause for approval?
  tool_name?: string;                     // Which tool triggers approval?
  action?: 'approve' | 'deny';           // Mock the human decision in eval
}

interface MemoryExpectation {
  type: 'session_write' | 'knowledge_update';
  key?: string;
  value_contains?: string;
}
```

> **Philosophy**: Not every case needs every field. A simple output-accuracy eval uses just `input` + `expected_output`. A trajectory eval uses `expected_trajectory`. A safety eval uses `expected_approval_behavior`. The schema supports all of these without forcing complexity on simple cases.

### 5.5 Observability

**User story**: *As a developer, I can see exactly what my agent did — every LLM call, every tool call, every token spent — and drill into any run to debug failures.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-5.1 | Trace capture for every agent run (OTel-based) | Beta Core | Spans: LLM call, tool call, retrieval, response |
| R-5.2 | Trace viewer UI: timeline of steps with expandable details | Beta Core | Show messages, tool I/O, tokens, cost per step |
| R-5.3 | Run history table: list all runs with status, cost, duration, score | Beta Core | Filterable by agent, status, date range |
| R-5.4 | Per-run cost breakdown: model, tokens in/out, cost USD per step | Beta Core | The "receipt" for every run |
| R-5.5 | Agent dashboard: success rate, avg cost, avg latency, error rate (with sparklines) | Beta Core | Statsig-inspired metric cards |
| R-5.6 | Error drill-down: click a failed run → see exact failure point in trace | Beta Core | Where it broke and why |
| R-5.7 | Usage dashboard: total tokens, total cost, by model, by agent, by day | P0 | For cost management |
| R-5.8 | Real-time run status: SSE feed of active runs with live progress | P1 | "Agent is thinking... calling tool... responding..." |

### 5.6 Deployment & Versioning

**User story**: *As a developer, I deploy new agent versions with confidence — I can canary, monitor, and rollback if something goes wrong.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-6.1 | Agent versioning: every deploy creates an immutable version | P0 | Version = snapshot of prompt + tools + model + guardrails |
| R-6.2 | Environment support: development, staging, production | P0 | Separate configs per environment |
| R-6.3 | Deploy via CLI: `agentsy deploy --env production` | Beta Core | Simple push-to-deploy (single environment in beta) |
| R-6.4 | Instant rollback: revert to any previous version | P0 | One-click in UI or `agentsy rollback` |
| R-6.5 | Deploy history: see what changed between versions (prompt diff) | P0 | Git-style diff view |
| R-6.6 | Canary deployment: route X% of traffic to new version | P1 | With automatic rollback on score regression |

### 5.7 API & SDK

**User story**: *As a developer, I interact with my agents via a clean REST API that follows the OpenAI chat completions shape, so I can integrate with any frontend.*

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-7.1 | REST API: `POST /v1/agents/{id}/run` (sync, streaming via SSE) | Beta Core | Primary way to invoke agents |
| R-7.2 | REST API: `POST /v1/agents/{id}/run` with `async: true` (returns run ID) | Beta Core | For long-running agents |
| R-7.3 | REST API: `GET /v1/runs/{id}` (poll async run status/result) | Beta Core | Status + result when complete |
| R-7.4 | REST API: OpenAI-compatible shape option (`/v1/chat/completions`) | P0 | Drop-in replacement for OpenAI SDK |
| R-7.5 | TypeScript SDK: `agentsy.agents.run()`, `agentsy.agents.stream()` | Beta Core | Type-safe, streaming-first |
| R-7.6 | API key authentication (per-organization) | Beta Core | `Authorization: Bearer sk-agentsy-...` |
| R-7.7 | Session management: `session_id` parameter for multi-turn conversations | P0 | Resume conversations |
| R-7.8 | Python SDK | P1 | Same interface as TypeScript |

### 5.8 Platform & Multi-Tenancy

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-8.1 | Organization accounts (team-based, not individual) | Beta Core | Via Better Auth |
| R-8.2 | Organization members with roles (admin, member) | P0 | Admin can manage agents, keys, billing |
| R-8.3 | API key management (create, revoke, list) | Beta Core | Organization-scoped |
| R-8.4 | Per-org data isolation (PostgreSQL RLS) | Beta Core | Tenant A cannot see Tenant B's data |
| R-8.5 | Rate limiting: requests/min + tokens/day per org | P0 | Redis-based sliding window |
| R-8.6 | Usage tracking: tokens consumed, runs executed, cost accrued | Beta Core | Real-time counters, daily aggregation |
| R-8.7 | Usage dashboard in UI | P0 | See current usage vs. limits |

### 5.9 Developer Experience

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-9.1 | `agentsy init` — scaffold a new agent project | Beta Core | Templates: basic, with-eval |
| R-9.2 | `agentsy dev` — local dev server with SQLite backend | Beta Core | Zero external dependencies |
| R-9.3 | `agentsy dev` — built-in trace viewer (localhost web UI) | Beta Core | See traces locally |
| R-9.4 | `agentsy eval run` — run eval suite locally | Beta Core | Uses same engine as platform |
| R-9.5 | `agentsy deploy` — push to platform | Beta Core | Simple deploy flow |
| R-9.6 | `agentsy logs` — tail run logs | P0 | Filter by agent, status |
| R-9.7 | `agentsy login` — authenticate with platform | Beta Core | Opens browser for OAuth |
| R-9.8 | Hot reload in dev mode (prompt changes apply immediately) | P1 | No restart needed |

### 5.10 Model Capability Classes

Instead of hardcoding model SKUs (which change every few months), we define **provider capability classes**. The platform routes to the best available model in each class at runtime.

| Capability Class | Description | Use Case | Example Models (as of March 2026) |
|-----------------|-------------|----------|----------------------------------|
| `reasoning` | Strongest reasoning, extended thinking, highest accuracy | Complex agent tasks, multi-step planning | Claude Opus, GPT-5.4, o-series |
| `balanced` | Strong reasoning, good speed, cost-effective | Default agent execution, most production use | Claude Sonnet, GPT-4o |
| `fast` | Fastest response, lowest cost, good enough for simple tasks | Classification, routing, extraction | Claude Haiku, GPT-4o-mini |
| `embedding` | Text embedding for vector search | Knowledge base indexing, semantic similarity | text-embedding-3-large, voyage-3 |

**Rules**:
- Agent configs specify a capability class, not a model name: `model: { class: 'balanced', provider: 'anthropic' }`
- Optional override to pin a specific model: `model: { id: 'claude-sonnet-4-20250514' }` — but we warn this may break
- Eval judge defaults to `balanced` class; users can override
- Fallback routing uses the same class on a different provider
- Pricing tiers map to capability classes, not model names — so pricing stays stable across model releases

> **Why this matters**: Between Jan–Mar 2026 alone, both Anthropic and OpenAI shipped new model versions. Hardcoding SKUs in agent configs means every agent breaks on provider updates. Capability classes decouple agent intent from model identity.

---

## 6. What We're NOT Building (P0) — and When

### Visual Agent Builder → P1 (not P3)

Originally deferred to P3 as "code-first covers 80%." **Revised**: if Agentsy is an Agent OS, you shouldn't need TypeScript to use it. The visual builder should generate the same agent config that the SDK produces — not a separate system. Think Vercel: you can configure via `vercel.json` or the dashboard. Same engine, two interfaces.

**P1 scope**: A form-based agent builder in the dashboard (configure model, paste system prompt, select tools, set guardrails). NOT a node-and-wire DAG builder — just a clean config UI. The visual DAG/workflow builder is still P3.

**Why P1, not P0**: The runtime, eval, and observability must work first. The visual builder is a skin over the same primitives.

### Multi-Agent Orchestration → P2 (unchanged)

Multi-agent hype (CrewAI, AutoGen) hasn't translated to reliable production systems. Most real-world agents are single-agent with tools. Multi-agent adds massive debugging complexity (which agent failed? why did the router pick wrong?).

**However** — the data model MUST be multi-agent-aware from day one:
- `parent_run_id` on runs table (for sub-agent calls)
- Agent-to-agent invocation as a tool call pattern (agent A can call agent B as a tool)
- Trace viewer supports nested run visualization

This means when we build multi-agent in P2, it's additive — no schema rewrite.

### Voice / Real-Time Agents → P3 (unchanged, but monitored)

The architecture is genuinely different: WebRTC, voice activity detection, interruption handling, sub-200ms response latency. It's not "add voice to our API" — it's a separate runtime.

**However** — our eval and observability layers WILL work for voice once the runtime exists. A voice agent run produces the same trace (LLM calls, tool calls, tokens, cost). So the platform investment isn't wasted.

**Trigger to pull forward**: If >30% of beta users ask for voice, move to P2.

### Other Exclusions

| Feature | Why Not P0 | When |
|---------|-----------|------|
| No-code agent builder (non-technical users) | Our P0 users are developers. Expand audience after product-market fit. | P3 |
| Agent marketplace / templates | Need critical mass of agents before a marketplace adds value. | P3 |
| Fine-tuning pipeline | Most users don't fine-tune. Prompt engineering + eval is sufficient for P0. | P2 |
| A2A protocol support | Standard is still maturing. Design for it, don't build it yet. | P2 |
| SSO/SAML | Better Auth plugins or dedicated IdP for enterprise sales. | P2 |
| Data residency (EU hosting) | Requires multi-region infrastructure. Enterprise feature. | P2 |
| Billing integration (Stripe) | Track usage from day one. Actual billing is P1. Beta is free/invite-only. | P1 |
| Mobile SDK | Web and API first. Mobile SDKs when we see mobile use cases. | P2 |
| Self-hosted / on-prem | Cloud-only for beta. Self-hosted is an enterprise tier feature. | P3 |
| Prompt optimization (DSPy-style) | Interesting but not core. Users optimize manually first. | P2 |
| Built-in integrations (Slack, GitHub) | Users bring MCP servers. We curate a starter set in P1. | P1 |

---

## 7. User Flows

### Flow 1: First-Time Setup (< 30 minutes)

```
1. Developer signs up at agentsy.com (email + Google OAuth)
2. Creates organization ("Acme Corp")
3. Installs CLI: npm install -g @agentsy/cli
4. Authenticates: agentsy login
5. Scaffolds project: agentsy init --template basic
6. Opens project in VS Code
7. Sees generated files:
   agentsy.config.ts    — agent definition
   tools/               — tool functions
   evals/
     dataset.json       — starter eval dataset (5 example cases)
     graders.ts          — starter graders
   .env.example          — API key placeholders
8. Adds their Anthropic/OpenAI API key to .env
9. Runs locally: agentsy dev
10. Opens localhost:4321 — sees local dashboard with trace viewer
11. Chats with agent in the built-in playground
12. Sees traces appear in real-time
13. Runs evals: agentsy eval run
14. Sees results: 5/5 cases passed
15. Deploys: agentsy deploy
16. Gets API endpoint: https://api.agentsy.com/v1/agents/ag_xxx/run
17. Calls it from their app
```

### Flow 2: Improving an Agent with Evals

```
1. Agent is running in production, handling ~100 requests/day
2. Developer notices some bad responses in the run history
3. Clicks a bad run → sees the trace → identifies the issue (wrong tool selected)
4. Adds the failing case to their eval dataset (1 click: "Add to golden dataset")
5. Edits the system prompt to fix the issue
6. Runs eval: agentsy eval run
7. Sees: 4/6 cases pass, 2 regressions!
8. The prompt fix helped the new case but broke 2 old cases
9. Iterates on the prompt until all 6 cases pass
10. Deploys the new version
11. Checks the dashboard — success rate improving over next 24 hours
```

### Flow 3: Debugging a Failed Run

```
1. Developer gets an alert: error rate spiked to 8%
2. Opens Agentsy dashboard → sees the error rate chart
3. Filters runs by status: "failed" → sees cluster of failures in last 2 hours
4. Clicks a failed run → opens trace viewer
5. Timeline shows: LLM call → tool call (search_orders) → ERROR: timeout after 30s
6. Expands the tool call: sees the Salesforce API is returning 503
7. Diagnosis: Salesforce outage, not an agent bug
8. Checks: agent's fallback behavior → agent responded "I'm unable to look up your order right now. Let me connect you with a human agent."
9. Satisfied: the agent degraded gracefully. No prompt change needed.
```

### Flow 4: CI/CD Integration

```
1. Developer opens a PR that changes the agent's system prompt
2. GitHub Actions triggers: agentsy eval run --dataset golden-v3
3. Eval runs 50 test cases against the new prompt
4. Results posted as PR comment:
   "Eval results: 48/50 passed (96%)
    Baseline: 49/50 (98%)
    ⚠ 1 regression detected on case #23 (tool selection accuracy: 1.0 → 0.0)
    ✅ 1 new case passing (case #51, previously failing)"
5. Developer reviews the regression, fixes the prompt
6. Pushes again → eval passes: 50/50 (100%)
7. PR merged → auto-deploys to staging
8. Manual promotion to production after team review
```

---

## 8. Information Architecture

### Navigation (Left Sidebar)

```
[Agentsy Logo]

MAIN
  📊 Dashboard          — Core metrics, recent activity
  🤖 Agents             — List, create, configure agents
  📋 Runs               — All runs across agents, filterable
  🧪 Evals              — Datasets, experiments, graders

SETTINGS
  ⚙️ Settings           — Org settings, API keys, members
  💰 Usage              — Token usage, cost, rate limits
  📖 Docs               — Links to documentation
```

### Page Hierarchy

```
Dashboard (home)
├── Core metrics (sparkline cards)
├── Recent runs (live feed)
└── Deployment activity

Agents
├── Agent list (table with trends)
└── Agent detail
    ├── Overview (health, config summary)
    ├── Runs (filtered to this agent)
    ├── Eval History (experiments for this agent)
    ├── Config (prompt, model, tools, guardrails)
    ├── Traces (searchable trace list)
    ├── Knowledge Base (uploaded docs)
    └── Deployments (version history with diffs)

Runs
├── Run list (all agents, filterable)
└── Run detail (trace viewer)
    ├── Timeline (step-by-step visualization)
    ├── Messages (full conversation)
    ├── Cost breakdown (per-step)
    └── Eval scores (if scored)

Evals
├── Datasets (list, create, version)
│   └── Dataset detail (cases, stats)
├── Experiments (list, compare)
│   └── Experiment detail (results, per-case scores)
└── Graders (registry of available graders)

Settings
├── General (org name, billing email)
├── API Keys (create, revoke)
├── Members (invite, roles)
└── Billing (usage, plan, limits)
```

---

## 9. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| **Latency** | Time to first token (agent response) | < 2s (excluding LLM provider latency) |
| **Latency** | Dashboard page load | < 1s |
| **Latency** | Trace viewer load | < 2s for runs with up to 50 steps |
| **Availability** | Platform uptime | 99.5% (beta), 99.9% (GA) |
| **Scalability** | Concurrent agent runs per org | 10 (beta), 100 (GA) |
| **Scalability** | Runs per day per org | 10,000 (beta) |
| **Scalability** | Eval dataset size | Up to 10,000 cases |
| **Scalability** | Knowledge base per agent | Up to 100MB / 10,000 chunks |
| **Security** | Data isolation | Row-level security, zero cross-tenant leakage |
| **Security** | Secrets | Encrypted at rest and in transit, never in logs |
| **Security** | API authentication | SHA-256 hashed API keys, TLS everywhere |
| **Security** | Prompt/response data | Not used for model training, not shared across tenants |
| **Compliance** | SOC 2 Type II | Target within 12 months of GA |
| **Data retention** | Run traces | 90 days (configurable) |
| **Data retention** | Eval results | Permanent (until org deleted) |
| **Data retention** | Conversation history | 90 days (configurable) |

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| LLM provider outage causes platform to look broken | High | Medium | Fallback model config, clear error messaging ("Anthropic is experiencing issues"), status page |
| Eval engine is too slow for CI workflows | High | Medium | Parallelize eval runs, cache deterministic grader results, tier eval suites (fast/full) |
| Temporal adds operational complexity | Medium | Medium | Start with Temporal Cloud (managed). Only self-host if cost or data residency forces it |
| E2B sandbox cold starts hurt agent latency | Medium | Low | Pre-warm sandbox pools, only use for code execution tools (not all tools) |
| pgvector doesn't scale for large knowledge bases | Medium | Low | Monitor per-tenant vector count. Migrate to dedicated vector DB per tenant if > 5M vectors |
| MCP ecosystem is immature for some integrations | Medium | Medium | Ship native tool functions as escape hatch. Users can write plain TypeScript tools without MCP |
| Cost of LLM-as-judge eval scales with dataset size | Medium | High | Cheap model for binary checks, expensive model for quality scoring. Cache judge results. Show cost estimate before eval run |
| Users don't adopt eval (just want hosting) | High | Medium | Make eval the shortest path to "my agent is better." Default eval dataset in `agentsy init`. Prompt diff shows eval impact |
| Better Auth may lack advanced SSO features | Low | Medium | Better Auth covers 90% of needs. Add SSO/SAML via plugins or dedicated IdP for enterprise tier (P2) |

---

## 11. Decisions Made

All open questions from earlier drafts are now resolved. These are the final answers.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | LLM API key for local dev | **User provides their own key** | Simpler, no cost risk for us. We don't proxy LLM calls in dev mode — the SDK calls providers directly. |
| Q2 | API shape | **Our own shape + OpenAI-compatible endpoint** | Our shape is richer (includes trace IDs, cost, eval scores in responses). Offer `/v1/chat/completions` compat endpoint for drop-in migration. |
| Q3 | Beta access model | **Invite-only, 20 curated teams** | Tighter feedback loop. Hand-pick teams across different verticals (support, sales, code, data analysis) for signal diversity. |
| Q4 | Pricing model | **Credit-based with per-seat tiers** | Credits abstract away token economics. Each model/tool costs a defined number of credits. Tiers: Free (1K credits/mo), Pro ($49/seat/mo, 50K credits), Team ($99/seat/mo, 200K credits), Enterprise (custom). Decision informed by research doc competitive analysis — this is what Braintrust, Dust, and similar platforms converge on. Track raw usage (tokens, runs, cost) from day one so we can adjust credit ratios post-beta. |
| Q5 | Multi-turn support | **Multi-turn with session_id from day one** | Most real agents are conversational. Single-turn is a subset (just don't pass session_id). No reason to build single-turn first then retrofit sessions. |

### Additional Decisions (Closing Contradictions)

These resolve contradictions the audit found across our doc suite.

| # | Issue | Resolution |
|---|-------|------------|
| Q6 | **Visual builder timing** — blueprint says "don't build early," tech-decisions says P3, PRD says P1 | **PRD wins. Form-based config UI is P1 (Milestone 5, weeks 17-20).** The blueprint's advice was "don't build before the run engine and policies are solid" — by week 17, both are solid. The distinction: P1 is a form-based config UI (model picker, prompt editor, tool selector). P3 is a node-and-wire DAG/workflow builder. These are different products. Update tech-decisions accordingly. |
| Q7 | **MemGPT-style memory** — tech-decisions says "NOT MemGPT" then says "add in P2 if demand" | **Resolution: P0 is 3-tier (working/session/knowledge). MemGPT-style self-managing memory is a P2 opt-in feature, not the default.** No contradiction — we don't build it now, but we don't rule it out. The "NOT" applies to P0 architecture decisions. P2 adds it as an optional memory mode agents can enable. |
| Q8 | **Workflow primitives vs. DAG builder** — tech-decisions says "add workflow primitives in P2," PRD says "no DAG builder" | **Resolution: P2 adds programmatic workflow primitives in the SDK** (sequential steps, branching, parallel fan-out — code-defined, not visual). **P3 adds a visual DAG builder** that generates workflow config. These are separate features on a clear timeline. |
| Q9 | **Policy/guardrails service** — mentioned as core service in blueprint but never specified | **Resolution: P0 guardrails are simple, declarative, inline in agent config.** Max iterations, max tokens, timeout, output validators (PII detection, content policy). No separate "policy service" in P0. Policy service is P2 when we need cross-agent policies, compliance rules, and enterprise governance. |
| Q10 | **Tool mocking in eval** — decided in tech-decisions but missing from PRD requirements | **Resolution: Added to PRD.** See R-4.15 below. |
| Q11 | **"Enterprise tier" definition** — referenced in 5+ places but never defined | **Resolution: Enterprise tier = annual contract, >$50K ACV, with requirements that include SSO/SAML, audit log export, data residency, dedicated compute, SLA guarantee, and custom integrations.** We don't build enterprise features until we have 3+ enterprise prospects in pipeline. |
| Q12 | **Demand thresholds for deferred features** — "add if demand" with no threshold | **Resolution: "Demand" means >20% of active beta teams request the feature in feedback, OR 3+ paying customers at GA ask for it as a blocker to expansion.** Track feature requests in a structured log from day one. |
| Q13 | **Release gates in P0** — eval engine spec assumes gates, PRD doesn't include them | **Resolution: Release gates are P1, not P0.** P0 has eval experiments and regression detection. P1 adds automated gates (hard/soft/canary) that block deploys based on eval scores. Eval without enforcement is still valuable — teams see regressions even without gates. |

---

## 12. Milestones & Timeline

### Milestone 1: "Hello Agent" (Weeks 1-4)

**Goal**: A developer can define an agent in TypeScript, run it locally, and deploy it to the platform.

**Deliverables**:
- [ ] TypeScript SDK: `defineAgent()`, `defineTool()`, agent config schema
- [ ] Agent runtime engine: agentic loop with tool execution
- [ ] Vercel AI SDK integration: Anthropic + OpenAI providers
- [ ] Temporal workflow: durable agent run with checkpointing
- [ ] PostgreSQL schema: orgs, agents, versions, runs, messages
- [ ] REST API: create agent, run agent (sync + stream), get run
- [ ] CLI: `agentsy init`, `agentsy dev`, `agentsy deploy`, `agentsy login`
- [ ] Local dev mode with SQLite backend
- [ ] API key auth (Better Auth)
- [ ] Basic web dashboard: agent list, run list

**Demo**: Live demo of defining an agent, testing locally, deploying, and calling via API.

### Milestone 2: "I Can See Everything" (Weeks 5-8)

**Goal**: Full observability — every run has a detailed trace, and the dashboard shows health metrics.

**Deliverables**:
- [ ] OTel instrumentation on every LLM call and tool call
- [ ] Trace viewer UI: timeline, message content, cost breakdown
- [ ] Run history with filtering (by agent, status, date, cost)
- [ ] Dashboard: core metrics with sparklines (success rate, cost, latency, error rate)
- [ ] Per-run cost breakdown (tokens, model, USD per step)
- [ ] Usage dashboard (total tokens, cost, by agent, by day)
- [ ] Error drill-down (click failed run → see failure point)

**Demo**: Walk through a trace of a complex agent run, showing exactly where it spent tokens and time.

### Milestone 3: "Ship With Confidence" (Weeks 9-12)

**Goal**: Eval engine is live — developers can test their agents before deploying and catch regressions in CI.

**Deliverables**:
- [ ] Dataset registry (create, version, upload)
- [ ] Experiment runner (parallel execution, progress tracking)
- [ ] Deterministic graders (exact_match, json_schema, regex, numeric)
- [ ] Semantic graders (embedding similarity, tool name match)
- [ ] LLM-as-judge graders (pointwise with rubric)
- [ ] Trajectory graders (tool sequence, unnecessary steps)
- [ ] Experiment comparison UI (side-by-side, per-case diffs)
- [ ] Baseline tracking and regression detection
- [ ] CLI: `agentsy eval run`, `agentsy eval compare`
- [ ] CI integration: exit code on regression, markdown report
- [ ] "Add to eval dataset" button on run detail page

**Demo**: Change a prompt → run eval → see regression → fix → deploy with confidence.

### Milestone 4: "Production Ready" (Weeks 13-16)

**Goal**: Memory, knowledge bases, secrets management, and deployment controls.

**Deliverables**:
- [ ] Conversation persistence (multi-turn sessions)
- [ ] Knowledge base upload + RAG retrieval
- [ ] Hybrid search (vector + keyword)
- [ ] Per-tenant secrets vault (encrypted Postgres columns)
- [ ] MCP remote server connections (with auth)
- [ ] Agent versioning with prompt diff viewer
- [ ] Environment management (dev/staging/prod)
- [ ] Instant rollback to previous version
- [ ] Rate limiting (requests/min + tokens/day)
- [ ] Invite team members, role-based access

**Demo**: Full production workflow — agent with knowledge base, connected tools, eval suite, deployed with versioning and rollback.

### Milestone 5: "Open the Door" (Weeks 17-20) — P1

**Goal**: Visual agent builder in dashboard + billing + starter integrations. Opens Agentsy beyond code-only users.

**Deliverables**:
- [ ] Visual agent builder: form-based config UI (model selector, prompt editor, tool picker, guardrail settings)
- [ ] Visual builder generates same agent config that SDK produces (one engine, two interfaces)
- [ ] Agent playground in dashboard: chat with your agent, see traces live
- [ ] Billing integration (Stripe): usage-based with credit tiers
- [ ] Starter MCP server gallery (curated list of 10-15 popular MCP servers with one-click connect)
- [ ] Production sampling: auto-score X% of live traffic with LLM-as-judge
- [ ] Human annotation queue: flag runs for review, collect labels, grow golden datasets
- [ ] Hot reload in `agentsy dev` (prompt changes apply without restart)
- [ ] Python SDK

**Demo**: Product manager builds an agent entirely in the dashboard UI, tests it in the playground, deploys it — no code written. Developer on the same team iterates on the same agent via TypeScript SDK + eval suite.

---

## 13. Dependencies

| Dependency | What We Need | Risk Level | Fallback |
|------------|-------------|------------|----------|
| **Anthropic API** | Claude models for agent execution + eval judging | Low | OpenAI as fallback provider |
| **OpenAI API** | GPT models as second provider + embeddings | Low | Anthropic as fallback, local embeddings |
| **Temporal Cloud** | Managed durable execution | Low | Self-hosted Temporal |
| **Better Auth** | Auth library in agentsy-api (email, OAuth, orgs, sessions) | None | Logto/Keycloak for enterprise SSO |
| **E2B** | Code execution + browser sandbox (P1) | Medium | Self-hosted Firecracker |
| **PostgreSQL 16** | Self-managed on Fly.io (Machine + volume) | Low | Managed Postgres (Neon, Supabase) |
| **Redis 7** | Self-managed on Fly.io (Machine + volume) | Low | Managed Redis (Upstash) |
| **Tigris** | Fly-native S3-compatible object storage | None | Any S3-compatible store |
| **Vercel AI SDK** | Provider abstraction | Medium | Custom provider adapters |

---

## 14. Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Agent** | A configured AI system with a model, system prompt, tools, and guardrails |
| **Run** | A single execution of an agent (from user input to final response) |
| **Trace** | The complete record of a run: every LLM call, tool call, and decision |
| **Step** | One unit within a trace (an LLM call or a tool call) |
| **Session** | A multi-turn conversation (multiple runs sharing context) |
| **Dataset** | A versioned collection of eval test cases |
| **Experiment** | A single eval run: agent + dataset + graders → scores |
| **Grader** | A function that scores an agent's output (deterministic, semantic, or LLM-judged) |
| **Baseline** | The stored scores from a reference experiment, used for regression detection |
| **Version** | An immutable snapshot of an agent's configuration (prompt + model + tools + guardrails) |
| **Checkpoint** | A saved state of an in-progress run, used for crash recovery |
| **Knowledge Base** | A collection of documents uploaded for RAG retrieval |
| **MCP Server** | A tool server implementing the Model Context Protocol |
| **Guardrail** | A constraint on agent behavior (max iterations, output validation, PII detection) |
