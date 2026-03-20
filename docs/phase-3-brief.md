# Phase 3: Streaming & API — Implementation Brief

**Goal**: Real-time SSE streaming, multi-turn sessions, `@agentsy/client` SDK, and OpenAI-compatible endpoint.
**Duration**: 3–4 days
**Dependencies**: Phase 2 complete (agent runtime, runs, tools, Temporal workflow)
**Journeys**: J3 (Local Dev — streaming), J7 (Integrate via API & SDK)

---

## What Gets Built

By the end of Phase 3, a developer can:
1. Stream agent responses token-by-token via SSE
2. Have multi-turn conversations with persistent session memory
3. Call agents via `@agentsy/client` SDK (sync, streaming, async modes)
4. Use the OpenAI SDK as a drop-in client (`baseURL` swap)
5. See approval-requested events in the stream for write tools

---

## Architecture

```
Platform Streaming Pipeline
==========================

Worker (Temporal Activity)
  │ publishEvent(runId, "step.text_delta", { delta: "Hello" })
  ▼
Redis Pub/Sub (channel: run:{run_id}:events)
  │
  ▼
API (subscriber)
  │ formatSSE(event) → "event: step.text_delta\ndata: {...}\n\n"
  ▼
Client (SSE connection via EventSource or fetch)
  │
  ▼
@agentsy/client (async iterable) or OpenAI SDK (stream chunks)
```

---

## Steps

### 3.1 — SSE Event Types & Worker Event Emitter

Define all SSE event types and publish them from the worker during execution.

**Ref**: spec-api.md section 15 (SSE Streaming Format)

```
packages/shared/src/
  events.ts             → TypeScript types for all 13 SSE event types

apps/worker/src/
  streaming/
    event-emitter.ts    → publishRunEvent(runId, event) → Redis PUBLISH
```

**Event types**:

| Event | When | Key Fields |
|-------|------|------------|
| `run.started` | Run begins | run_id, agent_id, version_id, model |
| `step.thinking` | LLM processing starts | step_id, step_order, model |
| `step.text_delta` | Each LLM output token | step_id, delta (text chunk) |
| `step.tool_call` | LLM requests a tool | step_id, tool_name, tool_call_id, arguments |
| `step.tool_result` | Tool execution done | step_id, tool_name, result, duration_ms |
| `step.approval_requested` | Write/admin tool needs human | step_id, tool_name, risk_level |
| `step.approval_resolved` | Human approved/denied | step_id, approved, resolved_by |
| `step.completed` | Step finishes | step_id, type, tokens_in, tokens_out, cost_usd |
| `step.guardrail` | Output validation result | step_id, guardrail_type, passed |
| `step.retrieval` | RAG retrieval done | step_id, kb_id, results_count |
| `run.completed` | Run succeeds | output, total_tokens, total_cost_usd, duration_ms |
| `run.failed` | Run errors | error, error_type, failed_step_id |
| `run.cancelled` | Run cancelled | total_tokens, total_cost_usd |

**Redis channel**: `run:{run_id}:events`
**Message format**: JSON with `{ type, data, id }` (id = incrementing event sequence for Last-Event-ID replay)

**Worker integration** — modify `apps/worker/src/workflows/agent-run.ts`:
- Emit `run.started` at workflow start
- Emit `step.thinking` before each LLM call
- Emit `step.text_delta` for each token (via Vercel AI SDK streaming)
- Emit `step.tool_call` and `step.tool_result` around tool execution
- Emit `step.approval_requested` / `step.approval_resolved` during approval gates
- Emit `run.completed` / `run.failed` at workflow end

**LLM streaming**: Switch from `generateText()` to `streamText()` in the LLM call activity. Stream tokens via Redis, accumulate full response for storage.

**Done when**: Worker publishes all event types to Redis during a run. Events arrive in correct order with monotonic IDs.

---

### 3.2 — API SSE Handler

Subscribe to Redis events and forward them as SSE to the client.

**Ref**: spec-api.md section 3.1 (streaming), section 15 (SSE format)

```
apps/api/src/
  streaming/
    sse-handler.ts      → handleSSEConnection(runId, reply):
                           1. Set headers: Content-Type: text/event-stream, Cache-Control: no-cache
                           2. Subscribe to Redis channel run:{runId}:events
                           3. On message: format as SSE → write to response
                           4. On run.completed/failed/cancelled: close connection
                           5. On client disconnect: unsubscribe from Redis
  routes/
    runs-stream.ts      → Update POST /v1/agents/:id/run to handle stream: true
```

**SSE format**:
```
id: 1
event: step.text_delta
data: {"step_id":"stp_abc","delta":"Hello"}

id: 2
event: step.text_delta
data: {"step_id":"stp_abc","delta":" world"}

id: 3
event: run.completed
data: {"run_id":"run_xyz","output":{"type":"text","text":"Hello world"},"total_cost_usd":0.012}
```

**Reconnection**: If client sends `Last-Event-ID` header:
1. Fetch events from Redis list `run:{runId}:event_log` (persisted alongside pub/sub)
2. Replay all events with id > Last-Event-ID
3. Then subscribe to live channel

**Modify existing `POST /v1/agents/:id/run`** in `apps/api/src/routes/runs.ts`:
- When `stream: true` (default): start Temporal workflow, then pipe SSE
- When `stream: false`: start workflow, poll for completion, return JSON
- When `async: true`: start workflow, return 202 immediately

**Done when**: `curl -N -H "Accept: text/event-stream" POST /v1/agents/:id/run` shows events streaming in real-time.

---

### 3.3 — `@agentsy/client` SDK

TypeScript client library for calling deployed agents.

**Ref**: spec-sdk.md section 7 (Client SDK)

```
packages/client/src/
  client.ts             → AgentsyClient class
  resources/
    agents.ts           → run(), stream(), runAsync()
    runs.ts             → get(), poll(), cancel(), steps()
    sessions.ts         → create(), list(), messages(), delete()
  streaming.ts          → SSE parser (line-by-line, yields typed events)
  types.ts              → AgentsyClientConfig, RunRequest, RunResponse, RunStreamEvent
  errors.ts             → AgentsyError, AuthenticationError, RateLimitError, etc.
  index.ts              → Barrel export
```

**AgentsyClient**:
```typescript
const client = new AgentsyClient({ apiKey: "sk-agentsy-..." });

// Sync
const result = await client.agents.run("support-agent", "Where is my order?");

// Streaming
for await (const event of client.agents.stream("support-agent", "Refund ORD-123")) {
  if (event.type === "step.text_delta") process.stdout.write(event.delta);
}

// Async
const { id } = await client.agents.runAsync("research-agent", "Analyze competitors");
const result = await client.runs.poll(id, { timeoutMs: 300_000 });

// Multi-turn
const session = await client.sessions.create("support-agent");
await client.agents.run("support-agent", "Order status?", { sessionId: session.id });
await client.agents.run("support-agent", "Refund that", { sessionId: session.id });
```

**HTTP client**: Use native `fetch` with:
- Exponential backoff retry (3 retries, 1s/2s/4s)
- Configurable timeout (default 30s sync, no timeout for streaming)
- `Authorization: Bearer {apiKey}` header
- Custom headers via `defaultHeaders` config

**SSE parser** (`streaming.ts`):
- Parse `event:` and `data:` lines from stream
- Yield typed `RunStreamEvent` objects
- Handle reconnection with `Last-Event-ID`
- Handle `[DONE]` sentinel for OpenAI compat mode

**Error classes**:
```typescript
AgentsyError              → Base class (status, code, message, details)
AuthenticationError       → 401
ForbiddenError            → 403
NotFoundError             → 404
RateLimitError            → 429 (includes retryAfter)
ValidationError           → 422 (includes field errors)
ServerError               → 500+
```

**Tests**: `packages/client/src/__tests__/client.test.ts`, `streaming.test.ts`

**Done when**: All three modes (sync, stream, async) work against live API. Error types are correct.

---

### 3.4 — Session Management (Multi-Turn)

Enable persistent multi-turn conversations.

**Ref**: spec-api.md section 4, spec-data-model.md tables 3.8 (sessions), 3.11 (messages)

```
apps/api/src/routes/
  sessions.ts           → POST /v1/agents/:agent_id/sessions (create)
                           GET /v1/agents/:agent_id/sessions (list, paginated)
                           GET /v1/sessions/:session_id/messages (list messages)
                           DELETE /v1/sessions/:session_id (soft delete)

apps/worker/src/activities/
  session-history.ts    → loadSessionHistory(sessionId, maxMessages) → Message[]
  persist-messages.ts   → persistMessages(sessionId, runId, userInput, agentOutput)
```

**Session flow**:
1. Client creates session: `POST /v1/agents/:agent_id/sessions`
2. Client runs with session: `POST /v1/agents/:id/run { session_id: "ses_..." }`
3. Worker loads last N messages from session (default 20, configurable via `memory.sessionHistory.maxMessages`)
4. Messages prepended to LLM context (system + history + current input)
5. After run: user message + agent response persisted to `messages` table
6. Next run with same session_id: previous messages loaded automatically

**Message ordering**: `message_order` column (integer, auto-incremented per session). Query with `ORDER BY message_order ASC, LIMIT maxMessages` from the end.

**Overflow strategy**: `"truncate"` (default) — drop oldest messages beyond limit. `"summarize"` — deferred to Phase 5.

**Workflow integration** — modify `apps/worker/src/workflows/agent-run.ts`:
- Before first LLM call: if `sessionId` provided, call `loadSessionHistory` activity
- Convert loaded messages to LLM message format (user/assistant roles)
- After run completes: call `persistMessages` activity

**Done when**: Create session → run with session_id → agent sees history → run again → agent remembers previous exchange.

---

### 3.5 — OpenAI-Compatible Endpoint

Drop-in replacement for OpenAI API so users can swap `baseURL` without code changes.

**Ref**: spec-api.md section 14

```
apps/api/src/routes/
  openai-compat.ts      → POST /v1/chat/completions
```

**Request mapping**:
- `model` → agent slug or agent ID (resolve via DB lookup)
- `messages` → last user message becomes `input`, prior messages become context
- `stream` → pass through
- `temperature`, `max_tokens` → override agent's model params for this run
- `tools` → **reject with 422** (`tools_override_not_supported`)
- `agentsy.session_id` → pass as session_id
- `agentsy.version_id` → pass as version_id

**Response mapping**:
```typescript
{
  id: run_id,
  object: "chat.completion",
  created: unix_timestamp,
  model: actual_model_used,
  choices: [{ index: 0, message: { role: "assistant", content: output_text }, finish_reason: "stop" }],
  usage: { prompt_tokens, completion_tokens, total_tokens },
  agentsy: { run_id, trace_id, session_id, cost_usd, duration_ms }
}
```

**Streaming response** (OpenAI format):
```
data: {"id":"run_...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"run_...","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

Map internal SSE events (`step.text_delta`) to OpenAI chunk format.

**Done when**: `new OpenAI({ apiKey: "sk-agentsy-...", baseURL: "https://api.agentsy.com/v1" })` works for both sync and streaming calls.

---

## Tests

| Type | File | What |
|------|------|------|
| Unit | `packages/client/src/__tests__/client.test.ts` | Client config, request formatting, response parsing, error handling |
| Unit | `packages/client/src/__tests__/streaming.test.ts` | SSE parser, all event types, reconnection, malformed input |
| Unit | `packages/shared/src/__tests__/events.test.ts` | Event type serialization/deserialization |
| Integration | `apps/api/src/__tests__/sse-streaming.test.ts` | Redis → SSE pipeline, event ordering, Last-Event-ID replay |
| Integration | `apps/api/src/__tests__/sessions.test.ts` | Session CRUD, message persistence, message ordering |
| Integration | `apps/api/src/__tests__/openai-compat.test.ts` | Request/response mapping, streaming, tools rejection |
| E2E | Client SDK → stream a run → verify all events received in order |
| E2E | OpenAI SDK → call agent → verify response format |
| E2E | Multi-turn: create session → run twice → agent remembers context |

---

## Acceptance Criteria

| Check | Evidence |
|-------|----------|
| SSE streams | `curl -N POST /v1/agents/:id/run` shows events token-by-token |
| All event types | 13 event types emit with correct payloads |
| Last-Event-ID | Reconnection replays missed events |
| Client sync | `client.agents.run()` returns RunResponse with output |
| Client stream | `client.agents.stream()` yields typed events |
| Client async | `client.agents.runAsync()` → `client.runs.poll()` works |
| Sessions | Create session → run with session_id → agent sees history |
| Message persistence | Messages stored in DB after run, retrievable via API |
| OpenAI compat | OpenAI SDK works with `baseURL` swap (sync + streaming) |
| Tools rejection | `tools` in OpenAI request → 422 with clear error |
| Error types | Client SDK throws typed errors (AuthenticationError, etc.) |
| CI passes | `turbo build && turbo lint && turbo typecheck && turbo test` |

---

## What NOT To Do in Phase 3

- Do not implement WebSocket for dashboard live updates (Phase 8)
- Do not implement knowledge base retrieval / RAG (Phase 5)
- Do not implement conversation summarization for overflow (Phase 5)
- Do not implement eval engine (Phase 4)
- Do not implement MCP streamable-http transport (Phase 6)
- Do not implement webhook event delivery (Phase 10)
