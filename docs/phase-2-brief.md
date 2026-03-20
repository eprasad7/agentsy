# Phase 2: Agent Definition & Runtime — Implementation Brief

**Goal**: Developers can define agents in TypeScript, run them locally via `agentsy dev`, and execute them on the platform via `POST /v1/agents/:id/run` with full trace capture.
**Duration**: 5–7 days
**Dependencies**: Phase 1 complete (auth, RLS, API server, Temporal connection)
**Journeys**: J2 (Create & Define Agent), J3 (Local Dev & Testing), J14 (Fallback Model Config)

---

## What Gets Built

By the end of Phase 2, a developer can:
1. `agentsy init my-agent` → scaffold a project with agent config + example tool
2. Write `agentsy.defineAgent()` and `agentsy.defineTool()` in TypeScript with full type safety
3. `agentsy dev` → local server with terminal REPL + browser playground
4. Agent calls LLM, executes tools, respects guardrails (max iterations, cost, tokens, timeout)
5. `POST /v1/agents/:id/run` → Temporal workflow executes agentic loop, writes run_steps
6. Fallback model kicks in when primary provider fails
7. Tool risk levels trigger approval gates in production

---

## Architecture

```
                   Platform Mode                          Local Dev Mode
                   ============                           ==============

POST /v1/agents/:id/run                        agentsy dev
        │                                            │
        ▼                                            ▼
   Fastify API                                  Local Fastify (port 4321)
        │                                            │
        ▼                                            ▼
   Temporal Workflow                             In-Process Loop (Promise-based)
   (AgentRunWorkflow)                           (localRunner)
        │                                            │
        ├── LLMCall Activity                         ├── Direct LLM call
        │   (Vercel AI SDK)                          │   (Vercel AI SDK)
        │                                            │
        ├── ToolExecution Activity                   ├── Direct tool execution
        │   (validate → execute → cap 10KB)          │   (same logic)
        │                                            │
        ├── Guardrail Check                          ├── Guardrail Check
        │   (iterations, tokens, cost, timeout)      │   (same checks)
        │                                            │
        └── Write run_steps to Postgres              └── Write to SQLite
```

---

## Steps

### 2.1 — `@agentsy/sdk` Package

Implement the agent/tool definition API with Zod validation.

**Ref**: spec-sdk.md sections 6.1–6.10

```
packages/sdk/src/
  agentsy.ts          → defineAgent(), defineTool(), defineProject()
  types.ts            → AgentConfig, ToolDefinition, NativeToolDefinition, McpToolDefinition,
                         GuardrailsConfig, OutputValidation, MemoryConfig, ModelParams,
                         SystemPromptFn, ToolContext, RunInput, RunOutput
  validation.ts       → Zod schemas: agentConfigSchema, toolDefinitionSchema, guardrailsSchema
  serialization.ts    → serializeAgentConfig() — converts functions/Zod to JSON for API storage
                         zodToJsonSchema() — converts Zod schemas to JSON Schema for LLM tool defs
  index.ts            → Barrel export
```

**Key types** (from spec-sdk.md):

```typescript
interface AgentConfig {
  slug: string;                    // 3-63 chars, lowercase + hyphens
  name?: string;
  description?: string;
  model: string | { class: "reasoning" | "balanced" | "fast"; provider?: "anthropic" | "openai" };
  fallbackModel?: ModelIdentifier;
  systemPrompt: string | SystemPromptFn;
  tools?: ToolDefinition[];
  guardrails?: GuardrailsConfig;
  memory?: MemoryConfig;
  modelParams?: ModelParams;
}

interface NativeToolDefinition<TInput, TOutput> {
  type: "native";
  name: string;                    // snake_case
  description: string;
  input: z.ZodType<TInput>;       // Zod schema → JSON Schema for LLM
  output?: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;
  timeout?: number;                // Default: 30_000ms
  riskLevel?: "read" | "write" | "admin";  // Default: "read"
  approvalPolicy?: { autoApprove?: boolean; requireApproval?: boolean };
}

interface GuardrailsConfig {
  maxIterations?: number;          // Default: 10
  maxTokens?: number;              // Default: 50_000
  maxCostUsd?: number;             // Default: 1.00
  timeoutMs?: number;              // Default: 300_000 (5 min)
  outputValidation?: OutputValidation[];
}
```

**Tests**: `packages/sdk/src/__tests__/define-agent.test.ts`, `define-tool.test.ts`

**Done when**: `agentsy.defineAgent({...})` validates config, `agentsy.defineTool({...})` validates tool with Zod schema, both return frozen objects.

---

### 2.2 — Agent CRUD API Endpoints

**Ref**: spec-api.md section 2

```
apps/api/src/routes/
  agents.ts             → POST /v1/agents (create agent + first version)
                           GET /v1/agents (list, paginated)
                           GET /v1/agents/:agent_id
                           PATCH /v1/agents/:agent_id
                           DELETE /v1/agents/:agent_id (soft delete)
  agent-versions.ts     → GET /v1/agents/:agent_id/versions (list versions)
                           POST /v1/agents/:agent_id/versions (create new version)
                           GET /v1/agents/:agent_id/versions/:version_id
```

**Create agent flow**:
1. Validate input with Zod (`{ slug, name?, description? }`)
2. Create `agents` row with `newId("ag")`
3. Create initial `agent_versions` row with `newId("ver")`, version=1
4. Return agent with version info

**Version creation** (from SDK config):
1. Receive serialized agent config (system prompt, model, tools, guardrails, params)
2. Store as new `agent_versions` row with incremented version number
3. System prompt: if dynamic function, evaluate at deploy time and store rendered string

**Done when**: Create agent → list shows it → get returns full config → update name → delete soft-deletes → versions list shows history.

---

### 2.3 — Run API Endpoints

**Ref**: spec-api.md section 3

```
apps/api/src/routes/
  runs.ts               → POST /v1/agents/:agent_id/run (start run)
                           GET /v1/runs/:run_id (get run status/result)
                           GET /v1/runs (list runs, filtered/paginated)
                           GET /v1/runs/:run_id/steps (get trace)
                           POST /v1/runs/:run_id/cancel
```

**POST /v1/agents/:agent_id/run** flow:
1. Validate input: `{ input: string | RunInput, session_id?, stream?, async?, metadata? }`
2. Resolve version (latest active deployment, or specified `version_id`)
3. Create `runs` row with status `queued`
4. Start Temporal workflow `AgentRunWorkflow`
5. If `async: true` → return 202 with run_id + poll_url
6. If `stream: false` → wait for workflow completion, return result
7. If `stream: true` → SSE (Phase 3, stub for now returning sync result)

**GET /v1/runs/:run_id** response:
```typescript
{
  id: string;            // run_...
  agent_id: string;
  version_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  input: RunInput;
  output?: RunOutput;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms?: number;
  error?: string;
  created_at: string;
  completed_at?: string;
}
```

**Done when**: Start run → poll status → get completed result with output. List runs with filters works.

---

### 2.4 — Vercel AI SDK Integration & Model Resolution

**Ref**: technology-decisions.md D-3.1–D-3.3, spec-sdk.md capability classes

```
apps/worker/src/providers/
  model-registry.ts     → Capability class → concrete model mapping
  provider-factory.ts   → Create Vercel AI SDK provider instances (Anthropic, OpenAI)
  fallback-handler.ts   → Retry with exponential backoff → fallback provider
```

**Model registry**:
```typescript
const REGISTRY = {
  anthropic: { reasoning: "claude-opus-4", balanced: "claude-sonnet-4", fast: "claude-haiku-4" },
  openai:    { reasoning: "o3", balanced: "gpt-4o", fast: "gpt-4o-mini" },
};
```

**resolveModel(spec)**: If string → return as-is. If `{ class, provider }` → look up in registry.

**Fallback flow**:
1. Try primary model (up to 2 retries with 1s, 4s backoff)
2. If all retries fail AND `fallbackModel` is set → try fallback
3. If fallback fails → fail the run with provider error

**Done when**: `{ class: "balanced" }` resolves to `claude-sonnet-4`. Primary fails → fallback used. Both fail → run fails with clear error.

---

### 2.5 — Temporal AgentRunWorkflow

The core agentic loop as a Temporal workflow.

**Ref**: architecture-v1.md agent run flow, spec-data-model.md runs/run_steps

```
apps/worker/src/
  workflows/
    agent-run.ts        → AgentRunWorkflow: the main agentic loop
  activities/
    load-agent-config.ts → Load agent_version config from DB
    llm-call.ts         → Call LLM via Vercel AI SDK, return response + tool calls
    tool-execution.ts   → Execute native tool with timeout, cap result at 10KB
    persist-run-step.ts → Write run_step row to Postgres
    persist-run.ts      → Update runs row with final status/output/cost
```

**AgentRunWorkflow pseudocode**:
```
input: { runId, agentId, versionId, orgId, input, sessionId?, environment }

1. loadAgentConfig(versionId) → config
2. resolveModel(config.model) → modelId
3. state = { iteration: 0, totalTokens: 0, totalCost: 0, messages: [] }

4. LOOP:
     // Guardrail check
     if state.iteration >= config.guardrails.maxIterations → break "max_iterations"
     if state.totalTokens >= config.guardrails.maxTokens → break "max_tokens"
     if state.totalCost >= config.guardrails.maxCostUsd → break "max_cost_usd"

     state.iteration++

     // LLM call (activity)
     response = llmCall({ model: modelId, systemPrompt, messages: state.messages, tools })
     persistRunStep({ type: "llm_call", model, tokensIn, tokensOut, costUsd })
     state.totalTokens += response.tokensIn + response.tokensOut
     state.totalCost += response.costUsd

     // No tool calls → final response
     if response.toolCalls.length === 0:
       persistRun({ status: "completed", output: response.text, ... })
       return { output: response.text, status: "completed", ... }

     // Execute each tool call
     for toolCall in response.toolCalls:
       toolDef = findTool(config.tools, toolCall.name)

       // Approval gate (if required)
       if requiresApproval(toolDef, environment):
         persistRunStep({ type: "approval_request", approvalStatus: "pending" })
         decision = waitForSignal("approval")  // Temporal signal
         if decision === "denied": skip tool, add denial to messages

       // Execute tool (activity)
       result = toolExecution({ toolDef, args: toolCall.args, orgId })
       persistRunStep({ type: "tool_call", toolName, input, output: result })

       // Cap result at 10KB
       if sizeof(result) > 10240: truncate + add warning

     // Add tool results to messages, continue loop

5. persistRun({ status: "timeout", reason })
```

**Done when**: Agent run loops correctly — calls LLM, executes tools, respects all guardrails, writes every step to run_steps.

---

### 2.6 — Tool Execution & Risk Levels

**Ref**: spec-sdk.md tool definitions, architecture-v1.md approval gates

```
apps/worker/src/
  tools/
    risk-policy.ts      → evaluateApprovalPolicy(toolDef, environment) → { requiresApproval }
```

**Risk level defaults**:
| Risk Level | Development | Staging | Production |
|-----------|-------------|---------|------------|
| `read` | auto-approve | auto-approve | auto-approve |
| `write` | auto-approve | auto-approve | **requires approval** |
| `admin` | **requires approval** | **requires approval** | **requires approval** |

**Approval gate** (Temporal signal):
1. Workflow pauses at `workflow.condition()`
2. Run status set to `awaiting_approval`
3. API receives `POST /v1/runs/:run_id/approve` or `/deny`
4. Sends Temporal signal `approval` with decision
5. Workflow resumes

**Approval endpoints** (add to runs.ts):
```
POST /v1/runs/:run_id/approve   → Send approval signal
POST /v1/runs/:run_id/deny      → Send denial signal
```

**Done when**: `write` tool in production → run pauses → approve via API → tool executes → run completes.

---

### 2.7 — Guardrails & Output Validators

**Ref**: implementation-plan.md Amendments A2 (cost breaker), A3 (output validators)

```
apps/worker/src/
  guardrails/
    guardrail-checker.ts    → checkGuardrails(state, config) → { violated, reason }
    output-validators.ts    → runOutputValidation(output, validators) → { passed, violations }
    pii-patterns.ts         → Regex patterns: SSN, credit card, email, phone
```

**Guardrail checks** (before each iteration):
- `maxIterations` — iteration count
- `maxTokens` — cumulative tokens (input + output)
- `maxCostUsd` — cumulative cost (from pricing.ts)
- `timeoutMs` — wall clock since run start

**Cost tracking** (per LLM call):
```typescript
import { MODEL_PRICING } from "@agentsy/shared/pricing";
const cost = (tokensIn * MODEL_PRICING[model].inputPer1M / 1_000_000)
           + (tokensOut * MODEL_PRICING[model].outputPer1M / 1_000_000);
```

**Output validators** (after final LLM response):
- `no_pii` — regex scan for SSN, credit card, email, phone patterns
- `on_topic` — keyword match against configured topic list
- `content_policy` — blocked phrase list
- `json_schema` — validate output against JSON Schema (if output is JSON)

When violated: run completes with `guardrail_triggered` metadata, not a failure.

**Done when**: Run hitting maxIterations stops cleanly. Cost over $1 stops. PII in output flagged.

---

### 2.8 — `agentsy init` CLI Command

**Ref**: spec-sdk.md section 9, user-journeys.md J2

```
packages/cli/src/
  commands/
    init.ts             → agentsy init <name> [--template basic|with-eval|with-knowledge]
  templates/
    basic/
      agentsy.config.ts → Scaffold with defineAgent + defineTool example
      tools/
        index.ts        → Barrel export
        get-order.ts    → Example tool with Zod input schema
      .env.example      → ANTHROPIC_API_KEY=, OPENAI_API_KEY=
      .gitignore
      package.json      → depends on @agentsy/sdk
      tsconfig.json
```

**Done when**: `agentsy init my-agent && cd my-agent && pnpm install && pnpm tsc --noEmit` succeeds.

---

### 2.9 — `agentsy dev` Local Development Server

**Ref**: architecture-v1.md section 9, user-journeys.md J3

```
packages/cli/src/
  commands/
    dev.ts              → agentsy dev [--port 4321] [--no-browser]
  dev/
    local-runner.ts     → In-process agentic loop (Promise-based, same logic as Temporal workflow)
    local-server.ts     → Fastify server: POST /run, GET /runs/:id, GET /health, GET /playground
    playground.ts       → Serve minimal HTML+JS chat UI with trace viewer
    terminal-repl.ts    → readline-based interactive chat
```

**`agentsy dev` startup**:
1. Load `agentsy.config.ts` from cwd (using `tsx` or `jiti` for TypeScript)
2. Validate config with Zod
3. Create/open SQLite database
4. Start Fastify server on port 4321
5. Start terminal REPL
6. Open browser to `http://localhost:4321/playground` (unless `--no-browser`)
7. Watch `agentsy.config.ts` for changes, hot-reload on save

**Local runner** — same agentic loop as Temporal workflow but using async/await:
- Direct LLM calls (user's .env API keys)
- Direct tool execution (in-process)
- SQLite for run/step storage
- No RLS, no Redis, no Temporal

**Terminal REPL output**:
```
You: What's the status of order ORD-12345?
  [tool] get_order({ orderId: "ORD-12345" })
  → { status: "shipped", total: 89.99 }

Agent: Your order ORD-12345 has been shipped. Total was $89.99.

Cost: $0.012 | Tokens: 1200 in / 340 out | 2.3s
```

**Done when**: `agentsy dev` loads config, chat works in terminal, tools execute, playground shows trace.

---

### 2.10 — MCP Stdio Client (Local Dev Only)

**Ref**: spec-sdk.md MCP tool definitions, technology-decisions.md D-4.1

```
packages/cli/src/
  dev/
    mcp-stdio-client.ts → Spawn MCP server process, communicate via stdio JSON-RPC
```

For local dev, MCP servers configured with `transport: "stdio"` are spawned as child processes. The client:
1. Spawns the MCP server binary/script
2. Sends `initialize` → receives capabilities
3. Sends `tools/list` → discovers available tools
4. On tool call: sends `tools/call` with arguments → receives result

**Done when**: Agent config with `{ type: "mcp", serverUrl: "./my-mcp-server.js", transport: "stdio" }` works in `agentsy dev`.

---

## Tests

| Type | File | What |
|------|------|------|
| Unit | `packages/sdk/src/__tests__/define-agent.test.ts` | Config validation, defaults, Zod errors, slug validation |
| Unit | `packages/sdk/src/__tests__/define-tool.test.ts` | Tool definition, risk levels, Zod input schema |
| Unit | `apps/worker/src/__tests__/model-resolver.test.ts` | Capability class resolution, unknown model error |
| Unit | `apps/worker/src/__tests__/guardrail-checker.test.ts` | All 4 guardrail conditions trigger correctly |
| Unit | `apps/worker/src/__tests__/risk-policy.test.ts` | Risk level × environment → approval matrix |
| Unit | `apps/worker/src/__tests__/output-validators.test.ts` | PII detection, blocked phrases, JSON schema |
| Integration | `apps/api/src/__tests__/agents.test.ts` | Agent CRUD + version creation |
| Integration | `apps/api/src/__tests__/runs.test.ts` | Run creation, polling, step retrieval |
| Integration | `apps/worker/src/__tests__/agent-run-workflow.test.ts` | Full loop with mocked LLM (Temporal test framework) |

---

## Acceptance Criteria

| Check | Evidence |
|-------|----------|
| SDK compiles | `defineAgent()` and `defineTool()` return frozen, validated objects |
| Agent CRUD | Create → list → get → update → soft-delete lifecycle works |
| Version history | Create agent → create version → list shows both |
| Run sync | `POST /v1/agents/:id/run { stream: false }` → completed result with output |
| Run async | `POST { async: true }` → 202 → poll → completed |
| Run trace | `GET /v1/runs/:id/steps` returns ordered step list |
| LLM calls work | Anthropic + OpenAI providers both resolve and return |
| Fallback model | Primary fails → fallback used → run succeeds |
| Tool execution | Agent calls tool → tool executes → result fed back to LLM |
| Approval gate | Write tool in prod → run pauses → approve API → resumes |
| Max iterations | Guardrail triggers, run stops with `guardrail_triggered` |
| Max cost | Cost exceeds limit → run stops |
| Output validation | PII in output → flagged in metadata |
| `agentsy init` | Creates valid project that compiles |
| `agentsy dev` | Local server starts, REPL chat works, tools execute |
| Hot reload | Edit config → save → agent reloads without restart |
| CI passes | `turbo build && turbo lint && turbo typecheck && turbo test` |

---

## What NOT To Do in Phase 2

- Do not implement SSE streaming (Phase 3 — stub sync response for now)
- Do not implement sessions/multi-turn (Phase 3)
- Do not implement eval engine (Phase 4)
- Do not implement knowledge base/RAG (Phase 5)
- Do not implement MCP streamable-http transport (Phase 6 — only stdio for local dev)
- Do not implement deploy command (Phase 7)
- Do not polish dashboard UI (Phase 8)
- Do not implement webhook delivery on run events (Phase 10)
