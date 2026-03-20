# Agentsy API Specification

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**Implements**: PRD v1, Technology Decisions, Data Model Spec
**Stack**: Fastify (Node.js) + PostgreSQL + Drizzle ORM + SSE Streaming

---

## Table of Contents

1. [API Conventions](#1-api-conventions)
2. [Agent Management](#2-agent-management)
3. [Agent Runs](#3-agent-runs)
4. [Sessions](#4-sessions)
5. [Tool Management](#5-tool-management)
6. [Memory / Knowledge Bases](#6-memory--knowledge-bases)
7. [Eval Engine](#7-eval-engine)
8. [Deployments](#8-deployments)
9. [Environments](#9-environments)
10. [Secrets](#10-secrets)
11. [API Keys](#11-api-keys)
12. [Organization & Members](#12-organization--members)
13. [Usage & Billing](#13-usage--billing)
14. [OpenAI-Compatible Endpoint](#14-openai-compatible-endpoint)
15. [SSE Streaming Format](#15-sse-streaming-format)
16. [Webhook Events](#16-webhook-events)
17. [Connector Catalog](#17-connector-catalog)

---

## 1. API Conventions

### Base URL

```
https://api.agentsy.com/v1
```

All endpoints are prefixed with `/v1`. Future breaking changes will increment the version prefix (`/v2`, etc.). Non-breaking additions (new fields, new endpoints) ship within the current version.

### Authentication

Every request must include an API key in the `Authorization` header:

```
Authorization: Bearer sk-agentsy-...
```

API keys are organization-scoped. The server resolves the key to an organization via SHA-256 hash lookup. Requests without a valid key receive a `401` response. Revoked or expired keys receive a `403` response.

Dashboard endpoints (used by the web UI) authenticate via Better Auth session tokens (HTTP-only cookies) instead of API keys. This spec covers the programmatic API only.

### Content Type

All request and response bodies use `application/json` unless otherwise noted. File uploads use `multipart/form-data`. SSE streams use `text/event-stream`.

### ID Format

All resource IDs are prefixed nanoid strings. The prefix identifies the resource type:

| Resource | Prefix | Example |
|----------|--------|---------|
| Organization | `org_` | `org_V1StGXR8_Z5jdHi6B` |
| Agent | `ag_` | `ag_kP9xW2nM5vBz` |
| Agent Version | `ver_` | `ver_qJ3tY8cF6hNm` |
| Environment | `env_` | `env_rL7wK4xP2dGs` |
| Deployment | `dep_` | `dep_mN5vB9kP3wQx` |
| Run | `run_` | `run_hT2cF8nM6jLz` |
| Run Step | `stp_` | `stp_xW4bN7kP9vRm` |
| Session | `ses_` | `ses_qJ6tY3cF8hNz` |
| Message | `msg_` | `msg_rL9wK2xP5dGm` |
| Eval Dataset | `eds_` | `eds_mN7vB4kP1wQz` |
| Eval Dataset Case | `edc_` | `edc_hT5cF9nM3jLx` |
| Eval Experiment | `exp_` | `exp_xW8bN2kP6vRz` |
| Eval Experiment Result | `exr_` | `exr_qJ4tY7cF1hNm` |
| Eval Baseline | `ebl_` | `ebl_rL3wK8xP4dGz` |
| Knowledge Base | `kb_` | `kb_mN9vB5kP2wQx` |
| Knowledge Chunk | `kc_` | `kc_hT7cF3nM8jLz` |
| Secret | `sec_` | `sec_xW6bN4kP7vRm` |
| API Key | `key_` | `key_Tz4Rv8bNq1Lm` |
| Member | `mem_` | `mem_a3k9Xp2mQ7wR` |
| Usage Daily | `usg_` | `usg_qJ8tY5cF2hNx` |

### Error Format (RFC 7807)

All errors return a JSON body conforming to RFC 7807 Problem Details:

```typescript
interface ApiError {
  type: string;         // URI reference identifying the error type
  title: string;        // Short human-readable summary
  status: number;       // HTTP status code
  detail: string;       // Human-readable explanation specific to this occurrence
  instance?: string;    // URI reference identifying the specific occurrence
  errors?: Array<{      // Field-level validation errors (for 422 responses)
    field: string;
    message: string;
    code: string;
  }>;
}
```

**Standard error types:**

| Status | Type | Title |
|--------|------|-------|
| 400 | `https://api.agentsy.com/errors/bad-request` | Bad Request |
| 401 | `https://api.agentsy.com/errors/unauthorized` | Unauthorized |
| 403 | `https://api.agentsy.com/errors/forbidden` | Forbidden |
| 404 | `https://api.agentsy.com/errors/not-found` | Not Found |
| 409 | `https://api.agentsy.com/errors/conflict` | Conflict |
| 422 | `https://api.agentsy.com/errors/validation-error` | Validation Error |
| 429 | `https://api.agentsy.com/errors/rate-limit-exceeded` | Rate Limit Exceeded |
| 500 | `https://api.agentsy.com/errors/internal-error` | Internal Server Error |
| 503 | `https://api.agentsy.com/errors/service-unavailable` | Service Unavailable |

**Example error response:**

```json
{
  "type": "https://api.agentsy.com/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request body failed validation",
  "errors": [
    {
      "field": "model",
      "message": "Model 'gpt-5-turbo' is not supported",
      "code": "invalid_enum_value"
    }
  ]
}
```

### Pagination (Cursor-Based)

All list endpoints use cursor-based pagination. Responses include a `has_more` boolean and an optional `next_cursor` string.

**Request query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Number of items to return (1-100) |
| `cursor` | string | — | Opaque cursor from a previous response |
| `order` | string | `desc` | Sort order: `asc` or `desc` |

**Response envelope:**

```typescript
interface PaginatedResponse<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```
GET /v1/agents?limit=10&cursor=eyJpZCI6ImFnX2tQOXhXMm5NNXZCB...
```

```json
{
  "data": [ ... ],
  "has_more": true,
  "next_cursor": "eyJpZCI6ImFnX3hZN3ZXOW5GMmJReiJ9"
}
```

Cursors are opaque base64-encoded JSON objects. Clients must not construct or parse them. Cursors expire after 24 hours.

### Rate Limiting

Rate limits are per-organization, enforced via Redis sliding window counters. Three dimensions are tracked:

| Dimension | Default Limit (Beta) | Header |
|-----------|---------------------|--------|
| Requests per minute | 60 | `X-RateLimit-Limit-Requests` |
| Tokens per day | 1,000,000 | `X-RateLimit-Limit-Tokens` |
| Concurrent runs | 10 | `X-RateLimit-Limit-Concurrent` |

**Rate limit response headers (included on every response):**

```
X-RateLimit-Limit-Requests: 60
X-RateLimit-Remaining-Requests: 42
X-RateLimit-Reset-Requests: 2026-03-19T12:01:00Z
X-RateLimit-Limit-Tokens: 1000000
X-RateLimit-Remaining-Tokens: 843210
X-RateLimit-Reset-Tokens: 2026-03-20T00:00:00Z
```

When a rate limit is exceeded, the server responds with `429`:

```json
{
  "type": "https://api.agentsy.com/errors/rate-limit-exceeded",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "Request rate limit of 60 requests per minute exceeded. Retry after 12 seconds.",
  "retry_after": 12
}
```

The response also includes a `Retry-After` header (in seconds).

### Idempotency

Mutating requests (POST, PUT, PATCH, DELETE) support an optional `Idempotency-Key` header. The server stores the response for 24 hours and returns it for duplicate requests with the same key.

```
Idempotency-Key: unique-request-id-12345
```

### Common Query Filters

Many list endpoints support these common filter parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `created_after` | ISO 8601 datetime | Filter items created after this timestamp |
| `created_before` | ISO 8601 datetime | Filter items created before this timestamp |

### Timestamp Format

All timestamps in request and response bodies are ISO 8601 strings in UTC:

```
2026-03-19T14:30:00.000Z
```

### Common Types

The following JSONB envelope types are used throughout the API for run inputs and outputs:

```typescript
type RunInput =
  | { type: "text"; text: string }
  | { type: "messages"; messages: Array<{ role: string; content: string }> }
  | { type: "structured"; data: Record<string, unknown> };

type RunOutput =
  | { type: "text"; text: string }
  | { type: "messages"; messages: Array<{ role: string; content: string }> }
  | { type: "structured"; data: Record<string, unknown> };
```

When a plain `string` is accepted for input, the server auto-wraps it as `{ type: "text", text: "..." }` before storing.

---

## 2. Agent Management

### 2.1 Create Agent

Creates a new agent within the organization.

```
POST /v1/agents
```

**Request body:**

```typescript
interface CreateAgentRequest {
  name: string;                // Required. Human-readable name (max 255 chars)
  slug: string;                // Required. URL-safe identifier (max 63 chars, unique per org)
  description?: string;        // Optional description
}
```

**Response: `201 Created`**

```typescript
interface Agent {
  id: string;                  // ag_...
  org_id: string;              // org_...
  name: string;
  slug: string;
  description: string | null;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent",
    "slug": "support-agent",
    "description": "Handles customer support inquiries"
  }'
```

```json
{
  "id": "ag_kP9xW2nM5vBz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "name": "Support Agent",
  "slug": "support-agent",
  "description": "Handles customer support inquiries",
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 2.2 List Agents

Returns a paginated list of agents in the organization.

```
GET /v1/agents
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `order` | string | `asc` or `desc` (default `desc`) |

**Response: `200 OK`**

```typescript
interface ListAgentsResponse {
  data: Agent[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/agents?limit=10 \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "ag_kP9xW2nM5vBz",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "name": "Support Agent",
      "slug": "support-agent",
      "description": "Handles customer support inquiries",
      "created_at": "2026-03-19T14:30:00.000Z",
      "updated_at": "2026-03-19T14:30:00.000Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 2.3 Get Agent

Retrieves a single agent by ID.

```
GET /v1/agents/:agent_id
```

**Response: `200 OK`**

Returns an `Agent` object.

**Example:**

```bash
curl https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz \
  -H "Authorization: Bearer sk-agentsy-..."
```

### 2.4 Update Agent

Updates an agent's mutable fields (name, description). Slug is immutable after creation.

```
PATCH /v1/agents/:agent_id
```

**Request body:**

```typescript
interface UpdateAgentRequest {
  name?: string;
  description?: string;
}
```

**Response: `200 OK`**

Returns the updated `Agent` object.

**Example:**

```bash
curl -X PATCH https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent",
    "description": "Updated description"
  }'
```

### 2.5 Delete Agent

Soft-deletes an agent. The agent and its associated data (versions, runs, sessions) are no longer returned by list/get endpoints. Data is retained for 30 days before permanent deletion.

```
DELETE /v1/agents/:agent_id
```

**Response: `204 No Content`**

### 2.6 List Agent Versions

Returns all versions of an agent, ordered by version number.

```
GET /v1/agents/:agent_id/versions
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `order` | string | `asc` or `desc` (default `desc`) |

**Response: `200 OK`**

```typescript
interface AgentVersion {
  id: string;                  // ver_...
  agent_id: string;            // ag_...
  org_id: string;              // org_...
  version: number;             // Monotonically increasing integer
  system_prompt: string;
  model: string;               // Resolved model name, e.g. "claude-sonnet-4"
  model_spec: string | { class: "reasoning" | "balanced" | "fast"; provider?: "anthropic" | "openai" }; // Original model specification as configured
  fallback_model: string | null;
  tools_config: ToolConfig[];
  guardrails_config: GuardrailsConfig;
  model_params: ModelParams;
  description: string | null;  // Changelog / commit message
  created_by: string | null;   // user ID
  created_at: string;          // ISO 8601
}

interface ToolConfig {
  name: string;
  type: "native" | "mcp";
  description?: string;
  input_schema?: Record<string, unknown>;
  mcp_server_url?: string;
  mcp_transport?: "stdio" | "streamable-http";
  timeout?: number;
  risk_level?: "read" | "write" | "admin";  // Default: "read". Controls approval gate behavior.
  approval_policy?: {
    auto_approve?: boolean;             // If true, skip approval even for write/admin tools
    require_approval?: boolean;         // If true, always require approval regardless of risk_level
    require_approval_in?: Array<"development" | "staging" | "production">; // Require approval only in these environments
  };
}

interface GuardrailsConfig {
  max_iterations?: number;     // Default: 10
  max_tokens?: number;         // Default: 50000
  timeout_ms?: number;         // Default: 300000 (5 min)
  max_cost_usd?: number;       // Default: 1.00. Cost circuit breaker — kills run if estimated LLM spend exceeds threshold.
  max_tool_result_size?: number; // Default: 10240 (10KB)
  output_validation?: Array<{
    type: "no_pii" | "on_topic" | "content_policy" | "custom";
    config?: Record<string, unknown>;
  }>;
}

interface ModelParams {
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  stop_sequences?: string[];
}
```

```typescript
interface ListAgentVersionsResponse {
  data: AgentVersion[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/versions?limit=5 \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "ver_qJ3tY8cF6hNm",
      "agent_id": "ag_kP9xW2nM5vBz",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "version": 3,
      "system_prompt": "You are a customer support agent for Acme Corp...",
      "model": "claude-sonnet-4",
      "fallback_model": "gpt-4o",
      "tools_config": [
        {
          "name": "get_order",
          "type": "native",
          "description": "Look up an order by ID",
          "input_schema": {
            "type": "object",
            "properties": {
              "order_id": { "type": "string" }
            },
            "required": ["order_id"]
          }
        }
      ],
      "guardrails_config": {
        "max_iterations": 10,
        "max_tokens": 50000,
        "timeout_ms": 300000,
        "output_validation": [
          { "type": "no_pii" }
        ]
      },
      "model_params": {
        "temperature": 0.7,
        "max_output_tokens": 4096
      },
      "description": "Added PII guardrail",
      "created_by": "user_2abc123",
      "created_at": "2026-03-19T14:30:00.000Z"
    }
  ],
  "has_more": true,
  "next_cursor": "eyJ2ZXJzaW9uIjoyfQ=="
}
```

### 2.7 Create Agent Version

Creates a new immutable version of an agent's configuration. This is typically called by `agentsy deploy`.

```
POST /v1/agents/:agent_id/versions
```

**Request body:**

```typescript
interface CreateAgentVersionRequest {
  system_prompt: string;       // Required
  model: string | {            // Required. Direct model string (e.g. "claude-sonnet-4") or capability class.
    class: "reasoning" | "balanced" | "fast";
    provider?: "anthropic" | "openai";  // Optional provider preference
  };
  fallback_model?: string;
  tools_config?: ToolConfig[];
  guardrails_config?: GuardrailsConfig;
  model_params?: ModelParams;
  description?: string;        // Changelog for this version
}
```

> **Model resolution:** When a capability class is used (e.g. `{ "class": "balanced" }`), the platform resolves to the best available model at runtime. The resolved model name is stored in `model` on the version response, and the original specification is preserved in `model_spec`.

**Response: `201 Created`**

Returns the created `AgentVersion` object. The `version` number is auto-incremented.

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/versions \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "You are a customer support agent...",
    "model": "claude-sonnet-4",
    "fallback_model": "gpt-4o",
    "tools_config": [
      {
        "name": "get_order",
        "type": "native",
        "description": "Look up an order by ID",
        "input_schema": {
          "type": "object",
          "properties": {
            "order_id": { "type": "string" }
          },
          "required": ["order_id"]
        }
      }
    ],
    "guardrails_config": {
      "max_iterations": 10,
      "max_tokens": 50000
    },
    "model_params": {
      "temperature": 0.7
    },
    "description": "Initial version"
  }'
```

### 2.8 Get Agent Version

Retrieves a specific version by ID.

```
GET /v1/agents/:agent_id/versions/:version_id
```

**Response: `200 OK`**

Returns an `AgentVersion` object.

---

## 3. Agent Runs

### 3.1 Run Agent (Sync + Streaming)

Executes an agent and returns the result. By default, the response streams via SSE. Set `stream: false` for a synchronous JSON response.

```
POST /v1/agents/:agent_id/run
```

**Request body:**

```typescript
interface RunAgentRequest {
  input: string | RunInput;    // Required. Plain string (auto-wrapped as { type: "text" }) or structured RunInput envelope
  session_id?: string;         // Optional. ses_... ID for multi-turn conversation
  version_id?: string;         // Optional. ver_... to pin a specific version (default: active deployment)
  environment?: string;        // Optional. "development" | "staging" | "production" (default: "production")
  stream?: boolean;            // Optional. Default: true. If false, returns synchronous JSON
  async?: boolean;             // Optional. Default: false. If true, returns 202 Accepted immediately (see section 3.2). Mutually exclusive with stream.
  metadata?: Record<string, unknown>; // Optional. Custom metadata attached to the run
}
// Note: `stream` and `async` are mutually exclusive.
// - stream: true (default) → SSE stream of events, connection held open until run completes
// - stream: false → synchronous JSON response, connection held open until run completes
// - async: true → 202 Accepted with run_id, poll via GET /v1/runs/:id or use webhook_url
```

**Response (synchronous, `stream: false`): `200 OK`**

```typescript
interface RunResult {
  id: string;                  // run_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  session_id: string | null;   // ses_...
  status: "completed" | "failed" | "timeout" | "cancelled";
  input: RunInput;
  output: RunOutput | null;    // Final agent response
  error: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  model: string;
  trace_id: string;            // OTel trace ID
  tool_mode?: "mock" | "dry-run" | "live"; // Present on eval runs to indicate tool execution mode
  metadata: Record<string, unknown>;
  started_at: string;          // ISO 8601
  completed_at: string;        // ISO 8601
  created_at: string;          // ISO 8601
}
```

**Response (streaming, `stream: true`): `200 OK` with `Content-Type: text/event-stream`**

Returns an SSE stream. See [Section 15: SSE Streaming Format](#15-sse-streaming-format) for event types and payloads.

**Example (synchronous, string shorthand):**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the status of order #12345?",
    "session_id": "ses_qJ6tY3cF8hNz",
    "stream": false
  }'
```

**Example (synchronous, structured envelope):**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "messages",
      "messages": [
        {"role": "user", "content": "What is the status of order #12345?"}
      ]
    },
    "session_id": "ses_qJ6tY3cF8hNz",
    "stream": false
  }'
```

```json
{
  "id": "run_hT2cF8nM6jLz",
  "agent_id": "ag_kP9xW2nM5vBz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "session_id": "ses_qJ6tY3cF8hNz",
  "status": "completed",
  "input": { "type": "text", "text": "What is the status of order #12345?" },
  "output": { "type": "text", "text": "Order #12345 is currently in transit and expected to arrive by March 21st." },
  "error": null,
  "total_tokens_in": 1250,
  "total_tokens_out": 340,
  "total_cost_usd": 0.0089,
  "duration_ms": 3420,
  "model": "claude-sonnet-4",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "metadata": {},
  "started_at": "2026-03-19T14:30:00.000Z",
  "completed_at": "2026-03-19T14:30:03.420Z",
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

**Example (streaming):**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the status of order #12345?",
    "stream": true
  }'
```

Structured input also works with streaming:

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "structured",
      "data": {"order_id": "12345", "action": "check_status"}
    },
    "stream": true
  }'
```

```
event: run.started
data: {"run_id":"run_hT2cF8nM6jLz","agent_id":"ag_kP9xW2nM5vBz","version_id":"ver_qJ3tY8cF6hNm"}

event: step.thinking
data: {"step_id":"stp_xW4bN7kP9vRm","model":"claude-sonnet-4"}

event: step.text_delta
data: {"step_id":"stp_xW4bN7kP9vRm","delta":"I'll look up"}

event: step.tool_call
data: {"step_id":"stp_a3k9Xp2mQ7wR","tool_name":"get_order","arguments":{"order_id":"12345"}}

event: step.tool_result
data: {"step_id":"stp_a3k9Xp2mQ7wR","tool_name":"get_order","result":{"status":"in_transit","eta":"2026-03-21"}}

event: step.text_delta
data: {"step_id":"stp_mN5vB9kP3wQx","delta":"Order #12345 is currently "}

event: step.text_delta
data: {"step_id":"stp_mN5vB9kP3wQx","delta":"in transit and expected to arrive "}

event: step.text_delta
data: {"step_id":"stp_mN5vB9kP3wQx","delta":"by March 21st."}

event: run.completed
data: {"run_id":"run_hT2cF8nM6jLz","output":"Order #12345 is currently in transit and expected to arrive by March 21st.","total_tokens_in":1250,"total_tokens_out":340,"total_cost_usd":0.0089,"duration_ms":3420}
```

### 3.2 Run Agent Async

Starts an agent run asynchronously and returns immediately with a run ID. Use [Get Run](#33-get-run) to poll for the result, or register a [webhook](#16-webhook-events) for completion notification.

```
POST /v1/agents/:agent_id/run
```

**Request body:**

```typescript
interface RunAgentAsyncRequest {
  input: string | RunInput;    // Required. Plain string (auto-wrapped as { type: "text" }) or structured RunInput envelope
  session_id?: string;
  version_id?: string;
  environment?: string;
  async: true;                 // Required. Must be true for async mode
  webhook_url?: string;        // Optional. URL to POST result to on completion
  metadata?: Record<string, unknown>;
}
```

**Response: `202 Accepted`**

```typescript
interface RunAccepted {
  id: string;                  // run_...
  agent_id: string;            // ag_...
  status: "queued";
  poll_url: string;            // Full URL to GET the run status
  created_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Generate a comprehensive report on Q1 sales data",
    "async": true,
    "webhook_url": "https://myapp.com/webhooks/agentsy"
  }'
```

```json
{
  "id": "run_hT2cF8nM6jLz",
  "agent_id": "ag_kP9xW2nM5vBz",
  "status": "queued",
  "poll_url": "https://api.agentsy.com/v1/runs/run_hT2cF8nM6jLz",
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

### 3.3 Get Run

Retrieves the status and result of a run.

```
GET /v1/runs/:run_id
```

**Response: `200 OK`**

Returns a `RunResult` object.

**Example:**

```bash
curl https://api.agentsy.com/v1/runs/run_hT2cF8nM6jLz \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "id": "run_hT2cF8nM6jLz",
  "agent_id": "ag_kP9xW2nM5vBz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "session_id": null,
  "status": "running",
  "input": "Generate a comprehensive report on Q1 sales data",
  "output": null,
  "error": null,
  "total_tokens_in": 800,
  "total_tokens_out": 120,
  "total_cost_usd": 0.0041,
  "duration_ms": null,
  "model": "claude-sonnet-4",
  "trace_id": "8a2e0b5c4f1d3e6a7b9c0d2e4f6a8b0c",
  "metadata": {},
  "started_at": "2026-03-19T14:30:00.500Z",
  "completed_at": null,
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

### 3.4 List Runs

Returns a paginated, filterable list of runs across all agents in the organization.

```
GET /v1/runs
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `order` | string | `asc` or `desc` (default `desc`) |
| `agent_id` | string | Filter by agent ID |
| `session_id` | string | Filter by session ID |
| `status` | string | Filter by status: `queued`, `running`, `completed`, `failed`, `cancelled`, `timeout` |
| `environment` | string | Filter by environment: `development`, `staging`, `production` |
| `created_after` | string | ISO 8601 timestamp |
| `created_before` | string | ISO 8601 timestamp |
| `version_id` | string | Filter by agent version ID |
| `model` | string | Filter by model used (e.g., `claude-sonnet-4`) |
| `min_cost_usd` | number | Filter runs costing at least this amount |
| `max_cost_usd` | number | Filter runs costing at most this amount |
| `sort_by` | string | Sort field: `created_at` (default), `duration_ms`, `total_cost_usd` |

**Response: `200 OK`**

```typescript
interface ListRunsResponse {
  data: RunResult[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl "https://api.agentsy.com/v1/runs?agent_id=ag_kP9xW2nM5vBz&status=failed&limit=5" \
  -H "Authorization: Bearer sk-agentsy-..."
```

### 3.5 Get Run Trace (Steps)

Returns the ordered list of steps (LLM calls, tool calls, retrievals, guardrail checks) for a run. This is the detailed execution trace.

```
GET /v1/runs/:run_id/steps
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 50) |
| `cursor` | string | Pagination cursor |

**Response: `200 OK`**

```typescript
interface RunStep {
  id: string;                  // stp_...
  run_id: string;              // run_...
  step_order: number;          // 0-indexed position in the run
  type: "llm_call" | "tool_call" | "retrieval" | "guardrail";
  model: string | null;        // For llm_call steps
  tool_name: string | null;    // For tool_call steps
  input: string | null;        // Prompt or tool arguments (serialized JSON for tool calls)
  output: string | null;       // LLM response or tool result (serialized JSON for tool calls)
  output_truncated: boolean;   // True when tool result exceeded max_tool_result_size and was truncated
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number | null;
  error: string | null;
  approval_status?: "pending" | "approved" | "denied"; // For tool_call steps with write/admin risk_level. Null for non-approval steps.
  approved_by?: string | null; // user ID of approver (null if auto-approved or not applicable)
  approval_wait_ms?: number | null; // Milliseconds the run was paused waiting for approval
  metadata: StepMetadata;
  started_at: string | null;   // ISO 8601
  completed_at: string | null; // ISO 8601
  created_at: string;          // ISO 8601
}

interface StepMetadata {
  span_id?: string;            // OTel span ID
  cache_hit?: boolean;
  retry_count?: number;
  tool_call_id?: string;       // LLM-provided tool_call_id
  [key: string]: unknown;
}

interface ListRunStepsResponse {
  data: RunStep[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/runs/run_hT2cF8nM6jLz/steps \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "stp_xW4bN7kP9vRm",
      "run_id": "run_hT2cF8nM6jLz",
      "step_order": 0,
      "type": "llm_call",
      "model": "claude-sonnet-4",
      "tool_name": null,
      "input": "[{\"role\":\"system\",\"content\":\"You are a support agent...\"},{\"role\":\"user\",\"content\":\"What is the status of order #12345?\"}]",
      "output": "{\"tool_calls\":[{\"name\":\"get_order\",\"arguments\":{\"order_id\":\"12345\"}}]}",
      "tokens_in": 450,
      "tokens_out": 28,
      "cost_usd": 0.0024,
      "duration_ms": 1200,
      "error": null,
      "metadata": {
        "span_id": "a1b2c3d4e5f6a7b8"
      },
      "started_at": "2026-03-19T14:30:00.500Z",
      "completed_at": "2026-03-19T14:30:01.700Z",
      "created_at": "2026-03-19T14:30:00.500Z"
    },
    {
      "id": "stp_a3k9Xp2mQ7wR",
      "run_id": "run_hT2cF8nM6jLz",
      "step_order": 1,
      "type": "tool_call",
      "model": null,
      "tool_name": "get_order",
      "input": "{\"order_id\":\"12345\"}",
      "output": "{\"status\":\"in_transit\",\"eta\":\"2026-03-21\"}",
      "tokens_in": 0,
      "tokens_out": 0,
      "cost_usd": 0,
      "duration_ms": 320,
      "error": null,
      "metadata": {
        "tool_call_id": "call_abc123"
      },
      "started_at": "2026-03-19T14:30:01.700Z",
      "completed_at": "2026-03-19T14:30:02.020Z",
      "created_at": "2026-03-19T14:30:01.700Z"
    },
    {
      "id": "stp_mN5vB9kP3wQx",
      "run_id": "run_hT2cF8nM6jLz",
      "step_order": 2,
      "type": "llm_call",
      "model": "claude-sonnet-4",
      "tool_name": null,
      "input": "[...conversation with tool result...]",
      "output": "Order #12345 is currently in transit and expected to arrive by March 21st.",
      "tokens_in": 800,
      "tokens_out": 312,
      "cost_usd": 0.0065,
      "duration_ms": 1400,
      "error": null,
      "metadata": {
        "span_id": "c3d4e5f6a7b8c9d0"
      },
      "started_at": "2026-03-19T14:30:02.020Z",
      "completed_at": "2026-03-19T14:30:03.420Z",
      "created_at": "2026-03-19T14:30:02.020Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 3.6 Cancel Run

Cancels a running or queued run. The Temporal workflow is terminated and the run status is set to `cancelled`.

```
POST /v1/runs/:run_id/cancel
```

**Response: `200 OK`**

```typescript
interface CancelRunResponse {
  id: string;                  // run_...
  status: "cancelled";
  cancelled_at: string;       // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/runs/run_hT2cF8nM6jLz/cancel \
  -H "Authorization: Bearer sk-agentsy-..."
```

### 3.6 Approve Pending Tool Call

Approves a tool call that is awaiting human-in-the-loop approval. Sends a Temporal signal to resume the workflow.

```
POST /v1/runs/:run_id/approve
```

**Request Body:**

```typescript
interface ApproveRequest {
  step_id: string;             // The run_step awaiting approval
}
```

**Response: `200 OK`**

```typescript
interface ApproveResponse {
  id: string;                  // run_...
  step_id: string;             // step_...
  status: "approved";
}
```

**Error Responses:**
- `409 Conflict` — Run is not in `awaiting_approval` status, or the specified step is not pending approval.
- `403 Forbidden` — User lacks permission to approve tool calls for this agent/environment.
- `404 Not Found` — Run or step does not exist.

### 3.7 Deny Pending Tool Call

Denies a tool call that is awaiting approval. The agent continues without executing the tool.

```
POST /v1/runs/:run_id/deny
```

**Request Body:**

```typescript
interface DenyRequest {
  step_id: string;             // The run_step awaiting approval
  reason?: string;             // Optional reason for denial
}
```

**Response: `200 OK`**

```typescript
interface DenyResponse {
  id: string;                  // run_...
  step_id: string;             // step_...
  status: "denied";
  reason?: string;
}
```

**Error Responses:**
- `409 Conflict` — Run is not in `awaiting_approval` status, or the specified step is not pending approval.
- `403 Forbidden` — User lacks permission to deny tool calls for this agent/environment.
- `404 Not Found` — Run or step does not exist.

---

## 4. Sessions

Sessions represent multi-turn conversations. A session groups multiple runs with shared conversation history.

### 4.1 Create Session

Creates a new conversation session for an agent.

```
POST /v1/agents/:agent_id/sessions
```

**Request body:**

```typescript
interface CreateSessionRequest {
  metadata?: SessionMetadata;
}

interface SessionMetadata {
  user_id?: string;            // End-user identifier (your customer)
  channel?: string;            // "web", "api", "slack", etc.
  [key: string]: unknown;
}
```

**Response: `201 Created`**

```typescript
interface Session {
  id: string;                  // ses_...
  org_id: string;              // org_...
  agent_id: string;            // ag_...
  metadata: SessionMetadata;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/sessions \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "user_id": "cust_abc123",
      "channel": "web"
    }
  }'
```

```json
{
  "id": "ses_qJ6tY3cF8hNz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "agent_id": "ag_kP9xW2nM5vBz",
  "metadata": {
    "user_id": "cust_abc123",
    "channel": "web"
  },
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 4.2 List Sessions

Returns sessions for an agent, ordered by most recently updated.

```
GET /v1/agents/:agent_id/sessions
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `order` | string | `asc` or `desc` (default `desc`) |
| `created_after` | string | ISO 8601 timestamp |
| `created_before` | string | ISO 8601 timestamp |

**Response: `200 OK`**

```typescript
interface ListSessionsResponse {
  data: Session[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 4.3 Get Session Messages

Returns the conversation messages within a session, ordered by position.

```
GET /v1/sessions/:session_id/messages
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 50) |
| `cursor` | string | Pagination cursor |
| `order` | string | `asc` or `desc` (default `asc`) |

**Response: `200 OK`**

```typescript
interface Message {
  id: string;                  // msg_...
  session_id: string;          // ses_...
  run_id: string | null;       // run_... (which run produced this message)
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id: string | null; // For tool role messages
  tool_name: string | null;    // For tool role messages
  message_order: number;       // Position in session
  metadata: MessageMetadata;
  created_at: string;          // ISO 8601
}

interface MessageMetadata {
  token_count?: number;
  truncated?: boolean;
  [key: string]: unknown;
}

interface ListMessagesResponse {
  data: Message[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/sessions/ses_qJ6tY3cF8hNz/messages?limit=20 \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "msg_rL9wK2xP5dGm",
      "session_id": "ses_qJ6tY3cF8hNz",
      "run_id": "run_hT2cF8nM6jLz",
      "role": "user",
      "content": "What is the status of order #12345?",
      "tool_call_id": null,
      "tool_name": null,
      "message_order": 0,
      "metadata": {},
      "created_at": "2026-03-19T14:30:00.000Z"
    },
    {
      "id": "msg_xW4bN7kP9vRm",
      "session_id": "ses_qJ6tY3cF8hNz",
      "run_id": "run_hT2cF8nM6jLz",
      "role": "assistant",
      "content": "Order #12345 is currently in transit and expected to arrive by March 21st.",
      "tool_call_id": null,
      "tool_name": null,
      "message_order": 1,
      "metadata": {
        "token_count": 340
      },
      "created_at": "2026-03-19T14:30:03.420Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 4.4 Delete Session

Soft-deletes a session and all its messages.

```
DELETE /v1/sessions/:session_id
```

**Response: `204 No Content`**

---

## 5. Tool Management

Manage MCP server connections and view available tools for an agent.

### 5.1 List MCP Servers

Returns MCP server connections configured for an agent (from the active version's tools_config).

```
GET /v1/agents/:agent_id/tools
```

**Response: `200 OK`**

```typescript
interface ListToolsResponse {
  data: AgentTool[];
}

interface AgentTool {
  name: string;
  type: "native" | "mcp";
  description: string | null;
  input_schema: Record<string, unknown> | null;
  mcp_server_url: string | null;  // Only for MCP tools
  mcp_transport: "stdio" | "streamable-http" | null;
  timeout: number | null;         // Timeout in ms
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/tools \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "name": "get_order",
      "type": "native",
      "description": "Look up an order by ID",
      "input_schema": {
        "type": "object",
        "properties": {
          "order_id": { "type": "string" }
        },
        "required": ["order_id"]
      },
      "mcp_server_url": null,
      "mcp_transport": null,
      "timeout": 30000
    },
    {
      "name": "salesforce",
      "type": "mcp",
      "description": "Salesforce CRM operations",
      "input_schema": null,
      "mcp_server_url": "https://mcp.salesforce.com/v1",
      "mcp_transport": "streamable-http",
      "timeout": 30000
    }
  ]
}
```

### 5.2 Add MCP Server Connection

Adds an MCP server to an agent's tool configuration. This creates a new agent version with the updated tools_config.

```
POST /v1/agents/:agent_id/tools/mcp
```

**Request body:**

```typescript
interface AddMcpServerRequest {
  name: string;                // Required. Unique name for this tool connection
  description?: string;
  mcp_server_url: string;     // Required. MCP server endpoint URL
  mcp_transport: "stdio" | "streamable-http"; // Required
  timeout?: number;            // Timeout in ms (default: 30000)
  auth?: {
    type: "api_key" | "oauth2";
    secret_id?: string;        // sec_... reference to a stored secret
  };
}
```

**Response: `201 Created`**

Returns the newly created `AgentVersion` with the updated tools_config.

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/tools/mcp \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github",
    "description": "GitHub repository operations",
    "mcp_server_url": "https://mcp.github.com/v1",
    "mcp_transport": "streamable-http",
    "timeout": 30000,
    "auth": {
      "type": "api_key",
      "secret_id": "sec_xW6bN4kP7vRm"
    }
  }'
```

### 5.3 Remove MCP Server Connection

Removes an MCP server from an agent's tool configuration. Creates a new agent version without the specified tool.

```
DELETE /v1/agents/:agent_id/tools/mcp/:tool_name
```

**Response: `200 OK`**

Returns the newly created `AgentVersion` with the tool removed.

### 5.4 List Available MCP Tools

For an MCP server connection, lists the tools it exposes. This queries the MCP server's tool discovery endpoint.

```
GET /v1/agents/:agent_id/tools/mcp/:tool_name/discover
```

**Response: `200 OK`**

```typescript
interface DiscoverToolsResponse {
  server_name: string;
  tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}
```

---

## 6. Memory / Knowledge Bases

### 6.1 Create Knowledge Base

Creates a new knowledge base for an agent.

```
POST /v1/agents/:agent_id/knowledge-bases
```

**Request body:**

```typescript
interface CreateKnowledgeBaseRequest {
  name: string;                // Required (max 255 chars)
  description?: string;
  embedding_model?: string;    // Default: "text-embedding-3-small"
  chunk_size?: number;         // Default: 512 (tokens)
  chunk_overlap?: number;      // Default: 64 (tokens)
}
```

**Response: `201 Created`**

```typescript
interface KnowledgeBase {
  id: string;                  // kb_...
  org_id: string;              // org_...
  agent_id: string;            // ag_...
  name: string;
  description: string | null;
  embedding_model: string;
  embedding_dimensions: number;
  chunk_size: number;
  chunk_overlap: number;
  total_chunks: number;
  total_documents: number;
  total_size_bytes: number;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/knowledge-bases \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Documentation",
    "description": "All product docs and FAQs",
    "chunk_size": 512,
    "chunk_overlap": 64
  }'
```

```json
{
  "id": "kb_mN9vB5kP2wQx",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "agent_id": "ag_kP9xW2nM5vBz",
  "name": "Product Documentation",
  "description": "All product docs and FAQs",
  "embedding_model": "text-embedding-3-small",
  "embedding_dimensions": 1536,
  "chunk_size": 512,
  "chunk_overlap": 64,
  "total_chunks": 0,
  "total_documents": 0,
  "total_size_bytes": 0,
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 6.2 List Knowledge Bases

```
GET /v1/agents/:agent_id/knowledge-bases
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |

**Response: `200 OK`**

```typescript
interface ListKnowledgeBasesResponse {
  data: KnowledgeBase[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 6.3 Get Knowledge Base

```
GET /v1/knowledge-bases/:kb_id
```

**Response: `200 OK`**

Returns a `KnowledgeBase` object.

### 6.4 Update Knowledge Base

```
PATCH /v1/knowledge-bases/:kb_id
```

**Request body:**

```typescript
interface UpdateKnowledgeBaseRequest {
  name?: string;
  description?: string;
}
```

**Response: `200 OK`**

Returns the updated `KnowledgeBase` object.

### 6.5 Delete Knowledge Base

Soft-deletes a knowledge base and all its chunks.

```
DELETE /v1/knowledge-bases/:kb_id
```

**Response: `204 No Content`**

### 6.6 Upload Document

Uploads a document to a knowledge base. The document is chunked, embedded, and indexed for retrieval. Processing is asynchronous; the response includes a status URL.

```
POST /v1/knowledge-bases/:kb_id/documents
```

**Content-Type: `multipart/form-data`**

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | Required. The document to upload. |
| `metadata` | string (JSON) | Optional. Custom metadata for all chunks from this document |

**Supported file types:**

| MIME Type | Extension | Max Size |
|-----------|-----------|----------|
| `application/pdf` | .pdf | 50 MB |
| `text/plain` | .txt | 10 MB |
| `text/markdown` | .md | 10 MB |
| `text/csv` | .csv | 50 MB |

Unsupported file types return `415 Unsupported Media Type`. Files exceeding the size limit return `413 Payload Too Large`.

**Response: `202 Accepted`**

```typescript
interface DocumentUploadResponse {
  document_name: string;
  document_hash: string;       // SHA-256 of the file
  status: "processing";
  estimated_chunks: number;
  poll_url: string;            // URL to check processing status
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/knowledge-bases/kb_mN9vB5kP2wQx/documents \
  -H "Authorization: Bearer sk-agentsy-..." \
  -F "file=@product-guide.pdf" \
  -F 'metadata={"source": "confluence", "version": "2.1"}'
```

```json
{
  "document_name": "product-guide.pdf",
  "document_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "status": "processing",
  "estimated_chunks": 45,
  "poll_url": "https://api.agentsy.com/v1/knowledge-bases/kb_mN9vB5kP2wQx/documents/a1b2c3d4.../status"
}
```

### 6.7 Get Document Processing Status

```
GET /v1/knowledge-bases/:kb_id/documents/:document_hash/status
```

**Response: `200 OK`**

```typescript
interface DocumentStatus {
  document_name: string;
  document_hash: string;
  status: "processing" | "completed" | "failed";
  chunks_created: number;
  error: string | null;
  completed_at: string | null; // ISO 8601
}
```

### 6.8 Delete Document

Removes all chunks associated with a document from the knowledge base.

```
DELETE /v1/knowledge-bases/:kb_id/documents/:document_hash
```

**Response: `204 No Content`**

### 6.9 Search Knowledge Base

Performs hybrid search (vector + keyword) over a knowledge base. Used for testing retrieval quality outside of agent runs.

```
POST /v1/knowledge-bases/:kb_id/search
```

**Request body:**

```typescript
interface SearchKnowledgeBaseRequest {
  query: string;               // Required. The search query
  top_k?: number;              // Number of results (default: 10, max: 50)
  min_score?: number;          // Minimum relevance score threshold (0-1)
  filter?: {
    document_name?: string;    // Filter to specific document
    metadata?: Record<string, unknown>; // Filter by chunk metadata
  };
}
```

**Response: `200 OK`**

```typescript
interface SearchResult {
  chunk_id: string;            // kc_...
  content: string;
  score: number;               // Combined RRF score (0-1)
  document_name: string;
  chunk_index: number;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  source_type?: "pdf" | "txt" | "md" | "csv";
  page_number?: number;
  section?: string;
  headings?: string[];
  [key: string]: unknown;
}

interface SearchKnowledgeBaseResponse {
  data: SearchResult[];
  query: string;
  total_results: number;
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/knowledge-bases/kb_mN9vB5kP2wQx/search \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I process a refund?",
    "top_k": 5
  }'
```

```json
{
  "data": [
    {
      "chunk_id": "kc_hT7cF3nM8jLz",
      "content": "To process a refund, navigate to Orders > select the order > click 'Issue Refund'. Refunds are processed within 5-7 business days...",
      "score": 0.92,
      "document_name": "product-guide.pdf",
      "chunk_index": 12,
      "metadata": {
        "source_type": "pdf",
        "page_number": 15,
        "section": "Refunds & Returns"
      }
    }
  ],
  "query": "How do I process a refund?",
  "total_results": 1
}
```

---

## 7. Eval Engine

### 7.1 Create Dataset

Creates a new eval dataset.

```
POST /v1/eval/datasets
```

**Request body:**

```typescript
interface CreateDatasetRequest {
  name: string;                // Required (max 255 chars)
  description?: string;
}
```

**Response: `201 Created`**

```typescript
interface EvalDataset {
  id: string;                  // eds_...
  org_id: string;              // org_...
  name: string;
  description: string | null;
  version: number;             // Starts at 1
  case_count: number;
  created_by: string | null;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/eval/datasets \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "golden-v1",
    "description": "Golden test cases for the support agent"
  }'
```

```json
{
  "id": "eds_mN7vB4kP1wQz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "name": "golden-v1",
  "description": "Golden test cases for the support agent",
  "version": 1,
  "case_count": 0,
  "created_by": "user_2abc123",
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 7.2 List Datasets

```
GET /v1/eval/datasets
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `name` | string | Filter by exact dataset name |

**Response: `200 OK`**

```typescript
interface ListDatasetsResponse {
  data: EvalDataset[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 7.3 Get Dataset

```
GET /v1/eval/datasets/:dataset_id
```

**Response: `200 OK`**

Returns an `EvalDataset` object.

### 7.4 Delete Dataset

Soft-deletes a dataset and all its cases.

```
DELETE /v1/eval/datasets/:dataset_id
```

**Response: `204 No Content`**

### 7.5 Create Dataset Case

Adds a test case to a dataset.

```
POST /v1/eval/datasets/:dataset_id/cases
```

**Request body:**

```typescript
interface CreateDatasetCaseRequest {
  input: string | RunInput;    // Required. Plain string (auto-wrapped as { type: "text" }) or structured RunInput envelope
  session_history?: Array<{ role: string; content: string }>;  // Prior conversation context for multi-turn eval
  expected_output?: string | RunOutput; // Optional expected response (plain string auto-wrapped as { type: "text" })
  expected_tool_calls?: ExpectedToolCall[];
  expected_trajectory?: TrajectoryStep[];  // Full expected step sequence
  expected_approval_behavior?: ApprovalExpectation;  // Should the agent request approval?
  expected_citations?: string[];  // Expected knowledge base source references
  expected_memory_writes?: MemoryExpectation[];  // Expected session/knowledge writes
  mocked_tool_results?: MockedToolResult[];
  metadata?: Record<string, unknown>;
  tags?: string[];              // For filtering dataset subsets
}

interface ExpectedToolCall {
  name: string;                // Tool name
  arguments?: Record<string, unknown>; // Expected arguments
  order?: number;              // Expected position in tool call sequence
}

interface MockedToolResult {
  tool_name: string;           // Which tool to mock
  arguments_match?: Record<string, unknown>; // Match criteria for tool arguments
  result: unknown;             // Mocked return value
}

interface TrajectoryStep {
  type: "tool_call" | "llm_call" | "retrieval" | "guardrail";
  tool_name?: string;          // Required for tool_call steps
  arguments?: Record<string, unknown>; // Expected tool arguments (partial match)
  order: number;               // Expected position in step sequence
}

interface ApprovalExpectation {
  should_request: boolean;     // Whether the agent should trigger an approval gate
  tool_name?: string;          // Which tool should require approval
  risk_level?: "write" | "admin"; // Expected risk level of the approval
}

interface MemoryExpectation {
  type: "session" | "knowledge_base";
  key?: string;                // Expected memory key or topic
  value_contains?: string;     // Substring expected in the written value
}
```

**Response: `201 Created`**

```typescript
interface EvalDatasetCase {
  id: string;                  // edc_...
  dataset_id: string;          // eds_...
  org_id: string;              // org_...
  input: RunInput;
  session_history: Array<{ role: string; content: string }> | null;
  expected_output: RunOutput | null;
  expected_tool_calls: ExpectedToolCall[];
  expected_trajectory: TrajectoryStep[] | null;
  expected_approval_behavior: ApprovalExpectation | null;
  expected_citations: string[] | null;
  expected_memory_writes: MemoryExpectation[] | null;
  mocked_tool_results: MockedToolResult[];
  metadata: Record<string, unknown>;
  tags: string[];
  case_order: number;
  created_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/eval/datasets/eds_mN7vB4kP1wQz/cases \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the status of order #12345?",
    "expected_output": "Order #12345 is in transit",
    "expected_tool_calls": [
      {
        "name": "get_order",
        "arguments": { "order_id": "12345" },
        "order": 0
      }
    ],
    "mocked_tool_results": [
      {
        "tool_name": "get_order",
        "arguments_match": { "order_id": "12345" },
        "result": { "status": "in_transit", "eta": "2026-03-21" }
      }
    ],
    "metadata": {
      "category": "order_lookup",
      "difficulty": "easy"
    }
  }'
```

```json
{
  "id": "edc_hT5cF9nM3jLx",
  "dataset_id": "eds_mN7vB4kP1wQz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "input": "What is the status of order #12345?",
  "expected_output": "Order #12345 is in transit",
  "expected_tool_calls": [
    {
      "name": "get_order",
      "arguments": { "order_id": "12345" },
      "order": 0
    }
  ],
  "mocked_tool_results": [
    {
      "tool_name": "get_order",
      "arguments_match": { "order_id": "12345" },
      "result": { "status": "in_transit", "eta": "2026-03-21" }
    }
  ],
  "metadata": {
    "category": "order_lookup",
    "difficulty": "easy"
  },
  "case_order": 0,
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

### 7.6 List Dataset Cases

```
GET /v1/eval/datasets/:dataset_id/cases
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 50) |
| `cursor` | string | Pagination cursor |

**Response: `200 OK`**

```typescript
interface ListDatasetCasesResponse {
  data: EvalDatasetCase[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 7.7 Get Dataset Case

```
GET /v1/eval/datasets/:dataset_id/cases/:case_id
```

**Response: `200 OK`**

Returns an `EvalDatasetCase` object.

### 7.8 Update Dataset Case

```
PATCH /v1/eval/datasets/:dataset_id/cases/:case_id
```

**Request body:**

```typescript
interface UpdateDatasetCaseRequest {
  input?: string;
  expected_output?: string | null;
  expected_tool_calls?: ExpectedToolCall[];
  mocked_tool_results?: MockedToolResult[];
  metadata?: Record<string, unknown>;
}
```

**Response: `200 OK`**

Returns the updated `EvalDatasetCase` object.

### 7.9 Delete Dataset Case

```
DELETE /v1/eval/datasets/:dataset_id/cases/:case_id
```

**Response: `204 No Content`**

### 7.10 Run Experiment

Starts an eval experiment: runs an agent against a dataset and scores the outputs.

```
POST /v1/eval/experiments
```

**Request body:**

```typescript
interface RunExperimentRequest {
  name?: string;               // Optional experiment name
  agent_id: string;            // Required. ag_...
  version_id: string;          // Required. ver_... (which version to test)
  dataset_id: string;          // Required. eds_...
  graders: GraderConfig[];     // Required. At least one grader
  tool_mode?: "mock" | "dry-run" | "live"; // Default: "mock"
  parallelism?: number;        // Default: 5 (max concurrent cases)
  judge_model?: string;        // Model for LLM judge graders (default: "claude-sonnet-4")
}

interface GraderConfig {
  name: string;                // Grader display name
  type: "exact_match" | "json_schema" | "regex" | "numeric_threshold"
    | "embedding_similarity" | "tool_name_match" | "tool_args_match"
    | "llm_judge" | "tool_sequence" | "unnecessary_steps" | "custom";
  config?: Record<string, unknown>; // Grader-specific configuration
}
```

**Grader config details:**

| Grader Type | Config Fields |
|-------------|---------------|
| `exact_match` | `{ case_sensitive?: boolean }` |
| `json_schema` | `{ schema: object }` |
| `regex` | `{ pattern: string, flags?: string }` |
| `numeric_threshold` | `{ min?: number, max?: number, extract_pattern?: string }` |
| `embedding_similarity` | `{ threshold?: number }` (default 0.85) |
| `tool_name_match` | `{}` (compares against expected_tool_calls) |
| `tool_args_match` | `{ strict?: boolean }` |
| `llm_judge` | `{ rubric: string, score_range?: [number, number] }` |
| `tool_sequence` | `{ strict_order?: boolean }` |
| `unnecessary_steps` | `{ max_allowed_extra_steps?: number }` |
| `custom` | `{ function_id: string }` |

**Response: `202 Accepted`**

```typescript
interface EvalExperiment {
  id: string;                  // exp_...
  org_id: string;              // org_...
  dataset_id: string;          // eds_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  name: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  summary_scores: Record<string, number>; // grader_name -> avg score
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  total_cost_usd: number;
  total_duration_ms: number | null;
  config: ExperimentConfig;
  error: string | null;
  started_at: string | null;   // ISO 8601
  completed_at: string | null; // ISO 8601
  created_by: string | null;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}

interface ExperimentConfig {
  tool_mode?: "mock" | "dry-run" | "live";
  graders?: GraderConfig[];
  parallelism?: number;
  judge_model?: string;
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/eval/experiments \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "v3-prompt-update",
    "agent_id": "ag_kP9xW2nM5vBz",
    "version_id": "ver_qJ3tY8cF6hNm",
    "dataset_id": "eds_mN7vB4kP1wQz",
    "graders": [
      {
        "name": "tool_accuracy",
        "type": "tool_name_match"
      },
      {
        "name": "response_quality",
        "type": "llm_judge",
        "config": {
          "rubric": "Score the response on helpfulness (0-1). The response should directly answer the user question using the tool results. Deduct points for hallucination or unnecessary verbosity."
        }
      },
      {
        "name": "output_similarity",
        "type": "embedding_similarity",
        "config": {
          "threshold": 0.8
        }
      }
    ],
    "tool_mode": "mock",
    "parallelism": 10
  }'
```

```json
{
  "id": "exp_xW8bN2kP6vRz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "dataset_id": "eds_mN7vB4kP1wQz",
  "agent_id": "ag_kP9xW2nM5vBz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "name": "v3-prompt-update",
  "status": "queued",
  "summary_scores": {},
  "total_cases": 25,
  "passed_cases": 0,
  "failed_cases": 0,
  "total_cost_usd": 0,
  "total_duration_ms": null,
  "config": {
    "tool_mode": "mock",
    "graders": [
      { "name": "tool_accuracy", "type": "tool_name_match" },
      { "name": "response_quality", "type": "llm_judge", "config": { "rubric": "..." } },
      { "name": "output_similarity", "type": "embedding_similarity", "config": { "threshold": 0.8 } }
    ],
    "parallelism": 10,
    "judge_model": "claude-sonnet-4"
  },
  "error": null,
  "started_at": null,
  "completed_at": null,
  "created_by": "user_2abc123",
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 7.11 Get Experiment

```
GET /v1/eval/experiments/:experiment_id
```

**Response: `200 OK`**

Returns an `EvalExperiment` object. When status is `completed`, `summary_scores` contains the average score per grader.

**Example (completed experiment):**

```json
{
  "id": "exp_xW8bN2kP6vRz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "dataset_id": "eds_mN7vB4kP1wQz",
  "agent_id": "ag_kP9xW2nM5vBz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "name": "v3-prompt-update",
  "status": "completed",
  "summary_scores": {
    "tool_accuracy": 0.96,
    "response_quality": 0.88,
    "output_similarity": 0.91
  },
  "total_cases": 25,
  "passed_cases": 23,
  "failed_cases": 2,
  "total_cost_usd": 0.42,
  "total_duration_ms": 45200,
  "config": { "..." : "..." },
  "error": null,
  "started_at": "2026-03-19T14:30:01.000Z",
  "completed_at": "2026-03-19T14:30:46.200Z",
  "created_by": "user_2abc123",
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:46.200Z"
}
```

### 7.12 List Experiments

```
GET /v1/eval/experiments
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `agent_id` | string | Filter by agent ID |
| `dataset_id` | string | Filter by dataset ID |
| `status` | string | Filter by status |
| `version_id` | string | Filter by agent version ID |
| `created_after` | string | ISO 8601 timestamp |
| `created_before` | string | ISO 8601 timestamp |
| `sort_by` | string | Sort field: `created_at` (default), `total_cost_usd` |

**Response: `200 OK`**

```typescript
interface ListExperimentsResponse {
  data: EvalExperiment[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 7.13 Get Experiment Results

Returns per-case results for an experiment.

```
GET /v1/eval/experiments/:experiment_id/results
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 50) |
| `cursor` | string | Pagination cursor |
| `passed` | boolean | Filter by pass/fail status |

**Response: `200 OK`**

```typescript
interface EvalExperimentResult {
  id: string;                  // exr_...
  experiment_id: string;       // exp_...
  case_id: string;             // edc_...
  run_id: string | null;       // run_... (the run created for this case)
  input: RunInput;             // The test case input (denormalized for convenience)
  expected_output: RunOutput | null;
  output: RunOutput | null;    // Actual agent output
  scores: Record<string, ScoreResult>;
  passed: boolean | null;
  duration_ms: number | null;
  cost_usd: number;
  error: string | null;
  created_at: string;          // ISO 8601
}

interface ScoreResult {
  score: number;               // 0.0 - 1.0
  name: string;                // Grader name
  grader_type: string;         // Grader type
  reasoning?: string;          // LLM judge explanation
  metadata?: Record<string, unknown>;
}

interface ListExperimentResultsResponse {
  data: EvalExperimentResult[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/eval/experiments/exp_xW8bN2kP6vRz/results?limit=5 \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "exr_qJ4tY7cF1hNm",
      "experiment_id": "exp_xW8bN2kP6vRz",
      "case_id": "edc_hT5cF9nM3jLx",
      "run_id": "run_a1b2c3d4e5f6",
      "input": "What is the status of order #12345?",
      "expected_output": "Order #12345 is in transit",
      "output": "Order #12345 is currently in transit and expected to arrive by March 21st.",
      "scores": {
        "tool_accuracy": {
          "score": 1.0,
          "name": "tool_accuracy",
          "grader_type": "tool_name_match"
        },
        "response_quality": {
          "score": 0.95,
          "name": "response_quality",
          "grader_type": "llm_judge",
          "reasoning": "The response accurately conveys the order status and adds helpful ETA information."
        },
        "output_similarity": {
          "score": 0.88,
          "name": "output_similarity",
          "grader_type": "embedding_similarity"
        }
      },
      "passed": true,
      "duration_ms": 2100,
      "cost_usd": 0.012,
      "error": null,
      "created_at": "2026-03-19T14:30:05.000Z"
    }
  ],
  "has_more": true,
  "next_cursor": "eyJpZCI6ImV4cl9hYmMxMjMifQ=="
}
```

### 7.14 Compare Experiments

Compares two experiments side-by-side, showing per-case score deltas and overall score changes.

```
GET /v1/eval/experiments/compare
```

**Query parameters (required):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `experiment_a` | string | exp_... ID of the baseline experiment |
| `experiment_b` | string | exp_... ID of the comparison experiment |

**Response: `200 OK`**

```typescript
interface ExperimentComparison {
  experiment_a: ExperimentSummary;
  experiment_b: ExperimentSummary;
  score_deltas: Record<string, number>;  // grader_name -> (b_score - a_score)
  regressions: CaseComparison[];         // Cases where B scored lower than A
  improvements: CaseComparison[];        // Cases where B scored higher than A
  unchanged: number;                     // Cases with same scores
}

interface ExperimentSummary {
  id: string;
  name: string | null;
  version_id: string;
  summary_scores: Record<string, number>;
  total_cases: number;
  passed_cases: number;
}

interface CaseComparison {
  case_id: string;             // edc_...
  input: RunInput;
  scores_a: Record<string, number>;  // grader_name -> score in experiment A
  scores_b: Record<string, number>;  // grader_name -> score in experiment B
  delta: number;               // Average score delta across all graders
}
```

**Example:**

```bash
curl "https://api.agentsy.com/v1/eval/experiments/compare?experiment_a=exp_aaa&experiment_b=exp_bbb" \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "experiment_a": {
    "id": "exp_aaa",
    "name": "v2-baseline",
    "version_id": "ver_oldversion",
    "summary_scores": {
      "tool_accuracy": 0.92,
      "response_quality": 0.85
    },
    "total_cases": 25,
    "passed_cases": 22
  },
  "experiment_b": {
    "id": "exp_bbb",
    "name": "v3-prompt-update",
    "version_id": "ver_newversion",
    "summary_scores": {
      "tool_accuracy": 0.96,
      "response_quality": 0.88
    },
    "total_cases": 25,
    "passed_cases": 23
  },
  "score_deltas": {
    "tool_accuracy": 0.04,
    "response_quality": 0.03
  },
  "regressions": [
    {
      "case_id": "edc_case23",
      "input": "Can you cancel my subscription?",
      "scores_a": { "tool_accuracy": 1.0, "response_quality": 0.9 },
      "scores_b": { "tool_accuracy": 0.0, "response_quality": 0.4 },
      "delta": -0.75
    }
  ],
  "improvements": [
    {
      "case_id": "edc_case05",
      "input": "How do I process a refund?",
      "scores_a": { "tool_accuracy": 0.0, "response_quality": 0.5 },
      "scores_b": { "tool_accuracy": 1.0, "response_quality": 0.95 },
      "delta": 0.725
    }
  ],
  "unchanged": 23
}
```

### 7.15 Set Baseline

Promotes an experiment's scores as the active baseline for an agent + dataset pair. Future experiments are compared against this baseline for regression detection.

```
POST /v1/eval/baselines
```

**Request body:**

```typescript
interface SetBaselineRequest {
  experiment_id: string;       // Required. exp_... to promote as baseline
}
```

**Response: `201 Created`**

```typescript
interface EvalBaseline {
  id: string;                  // ebl_...
  org_id: string;              // org_...
  agent_id: string;            // ag_...
  dataset_id: string;          // eds_...
  experiment_id: string;       // exp_...
  version_id: string;          // ver_...
  summary_scores: Record<string, number>;
  per_case_scores: Record<string, Record<string, number>>; // case_id -> grader -> score
  is_active: boolean;
  set_by: string | null;
  created_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/eval/baselines \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "experiment_id": "exp_xW8bN2kP6vRz"
  }'
```

```json
{
  "id": "ebl_rL3wK8xP4dGz",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "agent_id": "ag_kP9xW2nM5vBz",
  "dataset_id": "eds_mN7vB4kP1wQz",
  "experiment_id": "exp_xW8bN2kP6vRz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "summary_scores": {
    "tool_accuracy": 0.96,
    "response_quality": 0.88,
    "output_similarity": 0.91
  },
  "per_case_scores": {
    "edc_hT5cF9nM3jLx": {
      "tool_accuracy": 1.0,
      "response_quality": 0.95,
      "output_similarity": 0.88
    }
  },
  "is_active": true,
  "set_by": "user_2abc123",
  "created_at": "2026-03-19T14:35:00.000Z"
}
```

### 7.16 Get Active Baseline

```
GET /v1/eval/baselines/active
```

**Query parameters (required):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | ag_... |
| `dataset_id` | string | eds_... |

**Response: `200 OK`**

Returns an `EvalBaseline` object, or `404` if no baseline is set.

### 7.17 Create Eval Case from Run

Creates a new eval case in a dataset by extracting input, output, tool calls, and tool results from an existing run trace. Used by the "Add to Eval Dataset" button in the dashboard.

```
POST /v1/eval/datasets/:dataset_id/cases/from-run
```

**Request body:**

```typescript
interface CreateCaseFromRunRequest {
  run_id: string;              // Required. The run to extract data from.
  expected_output?: RunOutput; // Optional override. If omitted, uses the run's actual output.
  expected_tool_calls?: string[]; // Optional override. If omitted, extracts from run trace.
  graders?: string[];          // Optional. Grader names to apply to this case.
}
```

**Response: `201 Created`**

Returns the created eval case. The system auto-populates:
- `input` from `runs.input`
- `expected_output` from `runs.output` (unless overridden)
- `expected_tool_calls` from the run's `tool_call` steps (unless overridden)
- `mocked_tool_results` from the actual tool results in the run trace
- `metadata.source_run_id` set to the originating run ID

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/eval/datasets/eds_mN7vB4kP1wQz/cases/from-run \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "run_hT2cF8nM6jLz",
    "expected_output": { "type": "text", "text": "Cannot process automatically, escalating to human agent." }
  }'
```

---

## 8. Deployments

### 8.1 Deploy Agent Version

Deploys an agent version to a specific environment. The previously active deployment for the same agent + environment is superseded.

```
POST /v1/deployments
```

**Request body:**

```typescript
interface CreateDeploymentRequest {
  agent_id: string;            // Required. ag_...
  version_id: string;          // Required. ver_...
  environment_id: string;      // Required. env_...
}
```

**Response: `201 Created`**

```typescript
interface Deployment {
  id: string;                  // dep_...
  org_id: string;              // org_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  environment_id: string;      // env_...
  status: "active" | "superseded" | "rolled_back";
  deployed_by: string | null;  // user ID
  deployed_at: string;         // ISO 8601
  superseded_at: string | null;
  created_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/deployments \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "ag_kP9xW2nM5vBz",
    "version_id": "ver_qJ3tY8cF6hNm",
    "environment_id": "env_rL7wK4xP2dGs"
  }'
```

```json
{
  "id": "dep_mN5vB9kP3wQx",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "agent_id": "ag_kP9xW2nM5vBz",
  "version_id": "ver_qJ3tY8cF6hNm",
  "environment_id": "env_rL7wK4xP2dGs",
  "status": "active",
  "deployed_by": "user_2abc123",
  "deployed_at": "2026-03-19T14:30:00.000Z",
  "superseded_at": null,
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

### 8.2 List Deployments

```
GET /v1/deployments
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `agent_id` | string | Filter by agent ID |
| `environment_id` | string | Filter by environment ID |
| `status` | string | Filter by status: `active`, `superseded`, `rolled_back` |

**Response: `200 OK`**

```typescript
interface ListDeploymentsResponse {
  data: Deployment[];
  has_more: boolean;
  next_cursor: string | null;
}
```

### 8.3 Get Deployment

```
GET /v1/deployments/:deployment_id
```

**Response: `200 OK`**

Returns a `Deployment` object.

### 8.4 Rollback Deployment

Rolls back an agent to a previous version in a specific environment. This creates a new deployment pointing to the specified version and supersedes the current active deployment.

```
POST /v1/deployments/rollback
```

**Request body:**

```typescript
interface RollbackDeploymentRequest {
  agent_id: string;            // Required. ag_...
  environment_id: string;      // Required. env_...
  target_version_id: string;   // Required. ver_... to roll back to
}
```

**Response: `201 Created`**

Returns the newly created `Deployment` object (with `status: "active"`). The previous deployment is set to `status: "rolled_back"`.

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/deployments/rollback \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "ag_kP9xW2nM5vBz",
    "environment_id": "env_rL7wK4xP2dGs",
    "target_version_id": "ver_oldVersion123"
  }'
```

---

## 9. Environments

Environments are pre-seeded (`development`, `staging`, `production`) on organization creation. Additional custom environments can be created.

### 9.1 List Environments

```
GET /v1/environments
```

**Response: `200 OK`**

```typescript
interface Environment {
  id: string;                  // env_...
  org_id: string;              // org_...
  name: "development" | "staging" | "production";
  tool_allow_list: string[] | null;   // If set, only these tool names can execute. Null = all allowed.
  tool_deny_list: string[] | null;    // If set, these tools are blocked (takes precedence over allow list).
  require_approval_for_write_tools: boolean; // If true, all write/admin tools require human approval.
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}

interface ListEnvironmentsResponse {
  data: Environment[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/environments \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "env_rL7wK4xP2dGs",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "name": "production",
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-01T00:00:00.000Z"
    },
    {
      "id": "env_aB3cD4eF5gHi",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "name": "staging",
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-01T00:00:00.000Z"
    },
    {
      "id": "env_jK6lM7nO8pQr",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "name": "development",
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-01T00:00:00.000Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 9.2 Get Environment

```
GET /v1/environments/:environment_id
```

**Response: `200 OK`**

Returns an `Environment` object.

### 9.3 Create Environment

Creates a custom environment. The standard three (`development`, `staging`, `production`) are created automatically.

```
POST /v1/environments
```

**Request body:**

```typescript
interface CreateEnvironmentRequest {
  name: string;                // Required. Must be unique per org
  tool_allow_list?: string[];  // Optional. Restrict to these tool names only.
  tool_deny_list?: string[];   // Optional. Block these tools (takes precedence).
  require_approval_for_write_tools?: boolean; // Optional. Default false.
}
```

**Response: `201 Created`**

Returns the created `Environment` object.

### 9.4 Update Environment

Updates an environment's tool policy. The `name` of standard environments cannot be changed.

```
PATCH /v1/environments/:environment_id
```

**Request body:**

```typescript
interface UpdateEnvironmentRequest {
  tool_allow_list?: string[] | null;  // Set to null to allow all tools.
  tool_deny_list?: string[] | null;   // Set to null to remove deny list.
  require_approval_for_write_tools?: boolean;
}
```

**Response: `200 OK`**

Returns the updated `Environment` object.

**Example: Lock down production to read-only tools + require approval for writes:**

```bash
curl -X PATCH https://api.agentsy.com/v1/environments/env_rL7wK4xP2dGs \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "tool_deny_list": ["delete_customer", "drop_table"],
    "require_approval_for_write_tools": true
  }'
```

### 9.5 Delete Environment

Deletes a custom environment. The three standard environments cannot be deleted.

```
DELETE /v1/environments/:environment_id
```

**Response: `204 No Content`**

Returns `400` if attempting to delete a standard environment.

---

## 10. Secrets

Secrets store credentials for tool authentication. Values are encrypted at the application layer (AES-256-GCM) and stored in PostgreSQL. They are write-only through the API; they can be set and deleted but never read back.

### 10.1 Create Secret

```
POST /v1/secrets
```

**Request body:**

```typescript
interface CreateSecretRequest {
  name: string;                // Required. Human-readable name (max 255 chars)
  key: string;                 // Required. Secret key identifier (max 255 chars)
  value: string;               // Required. The secret value (write-only, never returned)
  environment: "development" | "staging" | "production"; // Required
  description?: string;
}
```

**Response: `201 Created`**

```typescript
interface Secret {
  id: string;                  // sec_...
  org_id: string;              // org_...
  name: string;
  key: string;
  environment: "development" | "staging" | "production";
  description: string | null;
  last_rotated_at: string | null;
  created_by: string | null;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

Note: The `value` field is never returned in any response.

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/secrets \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Salesforce API Key",
    "key": "SALESFORCE_API_KEY",
    "value": "sf_live_abc123...",
    "environment": "production",
    "description": "Production Salesforce API credentials"
  }'
```

```json
{
  "id": "sec_xW6bN4kP7vRm",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "name": "Salesforce API Key",
  "key": "SALESFORCE_API_KEY",
  "environment": "production",
  "description": "Production Salesforce API credentials",
  "last_rotated_at": null,
  "created_by": "user_2abc123",
  "created_at": "2026-03-19T14:30:00.000Z",
  "updated_at": "2026-03-19T14:30:00.000Z"
}
```

### 10.2 List Secrets

```
GET /v1/secrets
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |
| `environment` | string | Filter by environment |

**Response: `200 OK`**

```typescript
interface ListSecretsResponse {
  data: Secret[];              // Note: value is never included
  has_more: boolean;
  next_cursor: string | null;
}
```

### 10.3 Update Secret Value

Rotates a secret's value. The old value is immediately invalidated.

```
PUT /v1/secrets/:secret_id
```

**Request body:**

```typescript
interface UpdateSecretRequest {
  value: string;               // Required. New secret value
  name?: string;               // Optional. Update display name
  description?: string;        // Optional. Update description
}
```

**Response: `200 OK`**

Returns the updated `Secret` object (without value). `last_rotated_at` is set to current time.

### 10.4 Delete Secret

Permanently deletes a secret from the database.

```
DELETE /v1/secrets/:secret_id
```

**Response: `204 No Content`**

---

## 11. API Keys

### 11.1 Create API Key

Creates a new API key for the organization. The full key is returned only in the creation response and cannot be retrieved again.

```
POST /v1/api-keys
```

**Request body:**

```typescript
interface CreateApiKeyRequest {
  name: string;                // Required. Human-readable name (max 255 chars)
  expires_at?: string;         // Optional. ISO 8601 expiration timestamp
}
```

**Response: `201 Created`**

```typescript
interface CreateApiKeyResponse {
  id: string;                  // key_...
  org_id: string;              // org_...
  name: string;
  key: string;                 // FULL KEY - only returned on creation. e.g. "sk-agentsy-V1StGXR8..."
  prefix: string;              // First 8 chars for display. e.g. "sk-agent"
  expires_at: string | null;   // ISO 8601
  created_by: string | null;
  created_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/api-keys \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "expires_at": "2027-03-19T00:00:00.000Z"
  }'
```

```json
{
  "id": "key_Tz4Rv8bNq1Lm",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "name": "Production API Key",
  "key": "sk-agentsy-V1StGXR8_Z5jdHi6BmN5vB9kP3wQx",
  "prefix": "sk-agent",
  "expires_at": "2027-03-19T00:00:00.000Z",
  "created_by": "user_2abc123",
  "created_at": "2026-03-19T14:30:00.000Z"
}
```

### 11.2 List API Keys

```
GET /v1/api-keys
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |

**Response: `200 OK`**

```typescript
interface ApiKey {
  id: string;                  // key_...
  org_id: string;              // org_...
  name: string;
  prefix: string;              // First 8 chars for display
  last_used_at: string | null; // ISO 8601
  expires_at: string | null;   // ISO 8601
  revoked_at: string | null;   // ISO 8601
  created_by: string | null;
  created_at: string;          // ISO 8601
}

interface ListApiKeysResponse {
  data: ApiKey[];              // Note: full key is never returned
  has_more: boolean;
  next_cursor: string | null;
}
```

### 11.3 Get API Key

```
GET /v1/api-keys/:key_id
```

**Response: `200 OK`**

Returns an `ApiKey` object (without the full key value).

### 11.4 Revoke API Key

Revokes an API key. Revoked keys immediately stop authenticating requests.

```
POST /v1/api-keys/:key_id/revoke
```

**Response: `200 OK`**

```typescript
interface RevokeApiKeyResponse {
  id: string;
  revoked_at: string;          // ISO 8601
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/api-keys/key_Tz4Rv8bNq1Lm/revoke \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "id": "key_Tz4Rv8bNq1Lm",
  "revoked_at": "2026-03-19T15:00:00.000Z"
}
```

---

## 12. Organization & Members

### 12.1 Get Organization

Returns the current organization (resolved from the API key).

```
GET /v1/organization
```

**Response: `200 OK`**

```typescript
interface Organization {
  id: string;                  // org_...
  name: string;
  slug: string;
  plan: "free" | "pro" | "team" | "enterprise";
  billing_email: string | null;
  metadata: OrgMetadata;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}

interface OrgMetadata {
  max_agents?: number;
  max_runs_per_day?: number;
  max_tokens_per_day?: number;
  max_concurrent_runs?: number;
  features?: string[];
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/organization \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "id": "org_V1StGXR8_Z5jdHi6B",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "pro",
  "billing_email": "billing@acme.com",
  "metadata": {
    "max_agents": 50,
    "max_runs_per_day": 10000,
    "max_tokens_per_day": 1000000,
    "max_concurrent_runs": 10
  },
  "created_at": "2026-03-01T00:00:00.000Z",
  "updated_at": "2026-03-15T10:00:00.000Z"
}
```

### 12.2 List Members

```
GET /v1/organization/members
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Items per page (1-100, default 20) |
| `cursor` | string | Pagination cursor |

**Response: `200 OK`**

```typescript
interface OrganizationMember {
  id: string;                  // mem_...
  org_id: string;              // org_...
  user_id: string;
  role: "admin" | "member";
  email: string;
  name: string | null;
  created_at: string;          // ISO 8601
}

interface ListMembersResponse {
  data: OrganizationMember[];
  has_more: boolean;
  next_cursor: string | null;
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/organization/members \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "id": "mem_a3k9Xp2mQ7wR",
      "org_id": "org_V1StGXR8_Z5jdHi6B",
      "user_id": "user_2abc123",
      "role": "admin",
      "email": "alice@acme.com",
      "name": "Alice Johnson",
      "created_at": "2026-03-01T00:00:00.000Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 12.3 Invite Member

Sends an invitation email to join the organization. Requires `admin` role.

```
POST /v1/organization/members/invite
```

**Request body:**

```typescript
interface InviteMemberRequest {
  email: string;               // Required. Email address to invite
  role: "admin" | "member";    // Required
}
```

**Response: `201 Created`**

```typescript
interface InviteMemberResponse {
  email: string;
  role: "admin" | "member";
  invited_at: string;          // ISO 8601
  status: "pending";
}
```

**Example:**

```bash
curl -X POST https://api.agentsy.com/v1/organization/members/invite \
  -H "Authorization: Bearer sk-agentsy-..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@acme.com",
    "role": "member"
  }'
```

```json
{
  "email": "bob@acme.com",
  "role": "member",
  "invited_at": "2026-03-19T14:30:00.000Z",
  "status": "pending"
}
```

### 12.4 Remove Member

Removes a member from the organization. Cannot remove the last admin.

```
DELETE /v1/organization/members/:member_id
```

**Response: `204 No Content`**

### 12.5 Update Member Role

```
PATCH /v1/organization/members/:member_id
```

**Request body:**

```typescript
interface UpdateMemberRequest {
  role: "admin" | "member";
}
```

**Response: `200 OK`**

Returns the updated `OrganizationMember` object.

---

## 13. Usage & Billing

### 13.1 Get Usage Summary

Returns aggregated usage metrics for the current billing period.

```
GET /v1/usage/summary
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | `current` (default), `previous`, or ISO 8601 date range `2026-03-01/2026-03-31` |

**Response: `200 OK`**

```typescript
interface UsageSummary {
  org_id: string;              // org_...
  period_start: string;        // ISO 8601
  period_end: string;          // ISO 8601
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_duration_ms: number;
  runs_by_model: Record<string, number>;
  cost_by_model: Record<string, number>;
  runs_by_agent: Record<string, number>;
  cost_by_agent: Record<string, number>;
  limits: {
    max_runs_per_day: number;
    max_tokens_per_day: number;
    max_concurrent_runs: number;
  };
}
```

**Example:**

```bash
curl https://api.agentsy.com/v1/usage/summary \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "period_start": "2026-03-01T00:00:00.000Z",
  "period_end": "2026-03-31T23:59:59.999Z",
  "total_runs": 4230,
  "completed_runs": 4102,
  "failed_runs": 128,
  "total_tokens_in": 12500000,
  "total_tokens_out": 3800000,
  "total_cost_usd": 186.42,
  "total_duration_ms": 8640000,
  "runs_by_model": {
    "claude-sonnet-4": 3200,
    "claude-haiku-4": 800,
    "gpt-4o": 230
  },
  "cost_by_model": {
    "claude-sonnet-4": 142.50,
    "claude-haiku-4": 12.80,
    "gpt-4o": 31.12
  },
  "runs_by_agent": {
    "ag_kP9xW2nM5vBz": 3500,
    "ag_otherAgent1": 730
  },
  "cost_by_agent": {
    "ag_kP9xW2nM5vBz": 152.20,
    "ag_otherAgent1": 34.22
  },
  "limits": {
    "max_runs_per_day": 10000,
    "max_tokens_per_day": 1000000,
    "max_concurrent_runs": 10
  }
}
```

### 13.2 Get Daily Usage Breakdown

Returns per-day usage metrics.

```
GET /v1/usage/daily
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Required. ISO 8601 date (e.g. `2026-03-01`) |
| `end_date` | string | Required. ISO 8601 date (e.g. `2026-03-19`) |
| `agent_id` | string | Optional. Filter by agent ID |

**Response: `200 OK`**

```typescript
interface DailyUsage {
  date: string;                // ISO 8601 date
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_duration_ms: number;
  runs_by_model: Record<string, number>;
  cost_by_model: Record<string, number>;
  runs_by_agent: Record<string, number>;
  cost_by_agent: Record<string, number>;
}

interface DailyUsageResponse {
  data: DailyUsage[];
  org_id: string;
}
```

**Example:**

```bash
curl "https://api.agentsy.com/v1/usage/daily?start_date=2026-03-15&end_date=2026-03-19" \
  -H "Authorization: Bearer sk-agentsy-..."
```

```json
{
  "data": [
    {
      "date": "2026-03-15",
      "total_runs": 312,
      "completed_runs": 298,
      "failed_runs": 14,
      "total_tokens_in": 920000,
      "total_tokens_out": 280000,
      "total_cost_usd": 13.42,
      "total_duration_ms": 620000,
      "runs_by_model": { "claude-sonnet-4": 280, "gpt-4o": 32 },
      "cost_by_model": { "claude-sonnet-4": 11.20, "gpt-4o": 2.22 },
      "runs_by_agent": { "ag_kP9xW2nM5vBz": 312 },
      "cost_by_agent": { "ag_kP9xW2nM5vBz": 13.42 }
    },
    {
      "date": "2026-03-16",
      "total_runs": 287,
      "completed_runs": 280,
      "failed_runs": 7,
      "total_tokens_in": 850000,
      "total_tokens_out": 260000,
      "total_cost_usd": 12.10,
      "total_duration_ms": 580000,
      "runs_by_model": { "claude-sonnet-4": 260, "gpt-4o": 27 },
      "cost_by_model": { "claude-sonnet-4": 10.40, "gpt-4o": 1.70 },
      "runs_by_agent": { "ag_kP9xW2nM5vBz": 287 },
      "cost_by_agent": { "ag_kP9xW2nM5vBz": 12.10 }
    }
  ],
  "org_id": "org_V1StGXR8_Z5jdHi6B"
}
```

---

## 14. OpenAI-Compatible Endpoint

Provides a drop-in replacement for the OpenAI Chat Completions API. This allows existing applications using the OpenAI SDK to switch to Agentsy agents with minimal code changes.

```
POST /v1/chat/completions
```

**Request body (OpenAI-compatible):**

```typescript
interface ChatCompletionRequest {
  model: string;               // Required. Use agent slug: "support-agent" or agent ID: "ag_..."
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    name?: string;
  }>;
  stream?: boolean;            // Default: false
  temperature?: number;        // Overrides agent config
  max_tokens?: number;         // Overrides agent config
  tools?: Array<{              // See tool override policy below
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  // Agentsy extensions (optional)
  agentsy?: {
    session_id?: string;       // ses_... for multi-turn
    environment?: string;      // "development" | "staging" | "production"
    version_id?: string;       // ver_... to pin version
    metadata?: Record<string, unknown>;
  };
}
```

**Mapping behavior:**

- `model` field maps to an agent. Pass the agent slug (`"support-agent"`) or agent ID (`"ag_..."`).
- `messages` are flattened. The last `user` message is extracted as the run `input`. Prior messages are used as session context.
- **`tools` override policy**: If the request includes a `tools` array, the server returns **`422 Unprocessable Entity`** with error code `tools_override_not_supported` and a message explaining that tool configuration is managed on the agent, not per-request. This prevents silent divergence where callers believe they are controlling tools but the platform ignores them. A future version may support a merge/restrict policy via `agentsy.tools_mode`.
- If `agentsy.session_id` is provided, conversation history is loaded from that session.
- If no `session_id` is provided, the full `messages` array provides conversation context for this single invocation.

**Response (non-streaming): `200 OK`**

```typescript
interface ChatCompletionResponse {
  id: string;                  // run_...
  object: "chat.completion";
  created: number;             // Unix timestamp
  model: string;               // Actual model used (e.g. "claude-sonnet-4")
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // Agentsy extensions
  agentsy: {
    run_id: string;            // run_...
    trace_id: string;          // OTel trace ID
    session_id: string | null;
    cost_usd: number;
    duration_ms: number;
  };
}
```

**Response (streaming): `200 OK` with `Content-Type: text/event-stream`**

Follows the OpenAI streaming format with `data: [DONE]` terminator:

```
data: {"id":"run_hT2cF8nM6jLz","object":"chat.completion.chunk","created":1710856200,"model":"claude-sonnet-4","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"run_hT2cF8nM6jLz","object":"chat.completion.chunk","created":1710856200,"model":"claude-sonnet-4","choices":[{"index":0,"delta":{"content":"Order"},"finish_reason":null}]}

data: {"id":"run_hT2cF8nM6jLz","object":"chat.completion.chunk","created":1710856200,"model":"claude-sonnet-4","choices":[{"index":0,"delta":{"content":" #12345"},"finish_reason":null}]}

data: {"id":"run_hT2cF8nM6jLz","object":"chat.completion.chunk","created":1710856200,"model":"claude-sonnet-4","choices":[{"index":0,"delta":{"content":" is currently in transit."},"finish_reason":"stop"}]}

data: [DONE]
```

**Example (using OpenAI SDK):**

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-agentsy-...",
  baseURL: "https://api.agentsy.com/v1",
});

const response = await client.chat.completions.create({
  model: "support-agent",  // Agent slug
  messages: [
    { role: "user", content: "What is the status of order #12345?" }
  ],
});

console.log(response.choices[0].message.content);
// "Order #12345 is currently in transit and expected to arrive by March 21st."

// Agentsy-specific metadata:
console.log(response.agentsy.run_id);     // "run_hT2cF8nM6jLz"
console.log(response.agentsy.cost_usd);   // 0.0089
```

---

## 15. SSE Streaming Format

When `stream: true` is set on the run endpoint, the response uses Server-Sent Events (SSE). Each event has a `event` type and a JSON `data` payload.

### Connection Format

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Event Types

#### `run.started`

Emitted when the agent run begins execution.

```typescript
interface RunStartedEvent {
  run_id: string;              // run_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  session_id: string | null;   // ses_...
  model: string;
}
```

```
event: run.started
data: {"run_id":"run_hT2cF8nM6jLz","agent_id":"ag_kP9xW2nM5vBz","version_id":"ver_qJ3tY8cF6hNm","session_id":null,"model":"claude-sonnet-4"}
```

#### `step.thinking`

Emitted when the LLM begins processing (before tokens start streaming). Useful for showing a "thinking" indicator.

```typescript
interface StepThinkingEvent {
  step_id: string;             // stp_...
  step_order: number;
  model: string;
}
```

```
event: step.thinking
data: {"step_id":"stp_xW4bN7kP9vRm","step_order":0,"model":"claude-sonnet-4"}
```

#### `step.text_delta`

Emitted for each text token from the LLM. This is the most frequent event during streaming.

```typescript
interface StepTextDeltaEvent {
  step_id: string;             // stp_...
  delta: string;               // The text chunk
}
```

```
event: step.text_delta
data: {"step_id":"stp_mN5vB9kP3wQx","delta":"Order #12345 is "}
```

#### `step.tool_call`

Emitted when the LLM decides to call a tool.

```typescript
interface StepToolCallEvent {
  step_id: string;             // stp_...
  step_order: number;
  tool_name: string;
  tool_call_id: string;        // LLM-provided tool call ID
  arguments: Record<string, unknown>;
}
```

```
event: step.tool_call
data: {"step_id":"stp_a3k9Xp2mQ7wR","step_order":1,"tool_name":"get_order","tool_call_id":"call_abc123","arguments":{"order_id":"12345"}}
```

#### `step.tool_result`

Emitted when a tool execution completes.

```typescript
interface StepToolResultEvent {
  step_id: string;             // stp_...
  tool_name: string;
  tool_call_id: string;
  result: unknown;             // Tool return value
  duration_ms: number;
  error: string | null;        // Non-null if tool execution failed
}
```

```
event: step.tool_result
data: {"step_id":"stp_a3k9Xp2mQ7wR","tool_name":"get_order","tool_call_id":"call_abc123","result":{"status":"in_transit","eta":"2026-03-21"},"duration_ms":320,"error":null}
```

#### `step.retrieval`

Emitted when RAG retrieval is performed (knowledge base search).

```typescript
interface StepRetrievalEvent {
  step_id: string;             // stp_...
  step_order: number;
  knowledge_base_id: string;   // kb_...
  query: string;
  results_count: number;
  duration_ms: number;
}
```

```
event: step.retrieval
data: {"step_id":"stp_r1e2t3r4i5e6","step_order":0,"knowledge_base_id":"kb_mN9vB5kP2wQx","query":"refund policy","results_count":3,"duration_ms":45}
```

#### `step.guardrail`

Emitted when an output guardrail check runs.

```typescript
interface StepGuardrailEvent {
  step_id: string;             // stp_...
  step_order: number;
  guardrail_type: string;      // "no_pii" | "on_topic" | "content_policy" | "custom"
  passed: boolean;
  message: string | null;      // Explanation if failed
}
```

```
event: step.guardrail
data: {"step_id":"stp_g1u2a3r4d5","step_order":4,"guardrail_type":"no_pii","passed":true,"message":null}
```

#### `step.approval_requested`

Emitted when the agent pauses execution waiting for human approval on a tool call with `write` or `admin` risk level.

```typescript
interface StepApprovalRequestedEvent {
  step_id: string;             // stp_...
  step_order: number;
  tool_name: string;
  tool_call_id: string;
  arguments: Record<string, unknown>;
  risk_level: "write" | "admin";
}
```

```
event: step.approval_requested
data: {"step_id":"stp_a3k9Xp2mQ7wR","step_order":1,"tool_name":"update_order","tool_call_id":"call_abc456","arguments":{"order_id":"12345","status":"cancelled"},"risk_level":"write"}
```

#### `step.approval_resolved`

Emitted when a pending approval is granted or denied, either by a human or by policy.

```typescript
interface StepApprovalResolvedEvent {
  step_id: string;             // stp_...
  tool_name: string;
  tool_call_id: string;
  approved: boolean;
  resolved_by: string | null;  // user ID, or null for policy-based resolution
  reason?: string;             // Optional denial reason
}
```

```
event: step.approval_resolved
data: {"step_id":"stp_a3k9Xp2mQ7wR","tool_name":"update_order","tool_call_id":"call_abc456","approved":true,"resolved_by":"user_abc123","reason":null}
```

#### `step.completed`

Emitted when a step finishes. Contains cost/token metrics for the step.

```typescript
interface StepCompletedEvent {
  step_id: string;             // stp_...
  step_order: number;
  type: "llm_call" | "tool_call" | "retrieval" | "guardrail";
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number;
}
```

```
event: step.completed
data: {"step_id":"stp_xW4bN7kP9vRm","step_order":0,"type":"llm_call","tokens_in":450,"tokens_out":28,"cost_usd":0.0024,"duration_ms":1200}
```

#### `run.completed`

Emitted when the entire run finishes successfully. This is the final event for successful runs.

```typescript
interface RunCompletedEvent {
  run_id: string;              // run_...
  output: RunOutput;           // Final agent response
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  trace_id: string;            // OTel trace ID
}
```

```
event: run.completed
data: {"run_id":"run_hT2cF8nM6jLz","output":{"type":"text","text":"Order #12345 is currently in transit and expected to arrive by March 21st."},"total_tokens_in":1250,"total_tokens_out":340,"total_cost_usd":0.0089,"duration_ms":3420,"trace_id":"4bf92f3577b34da6a3ce929d0e0e4736"}
```

#### `run.failed`

Emitted when the run fails. This is the final event for failed runs.

```typescript
interface RunFailedEvent {
  run_id: string;              // run_...
  error: string;               // Error message
  error_type: string;          // "timeout" | "max_iterations" | "max_tokens" | "max_cost" | "guardrail_triggered" | "tool_error" | "provider_error" | "internal_error"
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;      // Cost accrued before failure
  duration_ms: number;
  failed_step_id: string | null; // stp_... where the failure occurred
}
```

```
event: run.failed
data: {"run_id":"run_hT2cF8nM6jLz","error":"Tool execution timed out: get_order exceeded 30000ms","error_type":"tool_error","total_tokens_in":450,"total_tokens_out":28,"total_cost_usd":0.0024,"duration_ms":31200,"failed_step_id":"stp_a3k9Xp2mQ7wR"}
```

#### `run.cancelled`

Emitted when a run is cancelled via the cancel endpoint.

```typescript
interface RunCancelledEvent {
  run_id: string;              // run_...
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
}
```

```
event: run.cancelled
data: {"run_id":"run_hT2cF8nM6jLz","total_tokens_in":450,"total_tokens_out":28,"total_cost_usd":0.0024,"duration_ms":5200}
```

### SSE Stream Lifecycle

A typical successful stream follows this event sequence:

```
run.started
  step.thinking           (LLM starts processing)
  step.text_delta*        (zero or more text tokens, OR tool_call)
  step.tool_call          (if LLM calls a tool)
  step.completed          (first LLM call done)
  step.approval_requested (if tool has write/admin risk_level and approval required)
  step.approval_resolved  (approval granted or denied)
  step.tool_result        (tool execution result)
  step.completed          (tool call done)
  step.thinking           (LLM processes tool result)
  step.text_delta*        (final response tokens)
  step.completed          (second LLM call done)
run.completed
```

### Reconnection

Clients should implement automatic reconnection with exponential backoff. The server includes a `Last-Event-ID` header support. On reconnect, send the `Last-Event-ID` header to resume from where the stream dropped.

---

## 16. Webhooks

Agentsy can send HTTP POST requests to a registered URL when certain events occur. Webhooks are configured per-organization.

### 16.1 Register Webhook

```
POST /v1/webhooks
```

**Request body:**

```typescript
interface CreateWebhookRequest {
  url: string;                 // Required. HTTPS URL to receive webhook events.
  events: string[];            // Required. Event types to subscribe to: "run.completed", "run.failed", "eval.completed", "approval.requested"
  description?: string;        // Optional. Human-readable description.
}
```

**Response: `201 Created`**

```typescript
interface Webhook {
  id: string;                  // whk_...
  org_id: string;              // org_...
  url: string;
  events: string[];
  secret: string;              // HMAC signing secret. Shown ONCE on creation. Use to verify X-Agentsy-Signature.
  description: string | null;
  active: boolean;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}
```

The `secret` field is only returned on creation. Store it securely — it cannot be retrieved again.

### 16.2 List Webhooks

```
GET /v1/webhooks
```

**Response: `200 OK`**

Returns a list of `Webhook` objects (without `secret` field).

### 16.3 Update Webhook

```
PATCH /v1/webhooks/:webhook_id
```

**Request body:**

```typescript
interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  description?: string;
  active?: boolean;            // Set to false to disable without deleting.
}
```

**Response: `200 OK`**

Returns the updated `Webhook` object (without `secret`).

### 16.4 Delete Webhook

```
DELETE /v1/webhooks/:webhook_id
```

**Response: `204 No Content`**

### 16.5 Rotate Webhook Secret

Generates a new signing secret. The old secret stops working immediately.

```
POST /v1/webhooks/:webhook_id/rotate-secret
```

**Response: `200 OK`**

```typescript
interface RotateSecretResponse {
  secret: string;              // New HMAC signing secret. Shown ONCE.
}
```

### Webhook Delivery

- HTTP POST to the registered URL
- Content-Type: `application/json`
- Includes `X-Agentsy-Signature` header for verification (HMAC-SHA256 of the body using the webhook secret)
- Retries: 3 attempts with exponential backoff (1s, 10s, 100s)
- Timeout: 30 seconds per delivery attempt

### Verification

The `X-Agentsy-Signature` header contains a hex-encoded HMAC-SHA256 digest. The input to the HMAC is the **raw request body** (the exact UTF-8 bytes sent in the POST, not re-serialized or normalized JSON). The secret is the UTF-8 string returned at webhook creation.

```typescript
import crypto from "crypto";

function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  // rawBody must be the raw HTTP request body string, NOT parsed and re-serialized JSON
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}
```

### Event Envelope

All webhook events share this envelope structure:

```typescript
interface WebhookEvent<T> {
  id: string;                  // Unique event ID (for idempotency)
  type: string;                // Event type
  org_id: string;              // org_...
  created_at: string;          // ISO 8601
  data: T;                     // Event-specific payload
}
```

### Event Types

#### `run.completed`

Fired when an agent run completes successfully.

```typescript
interface RunCompletedWebhook {
  run_id: string;              // run_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  session_id: string | null;   // ses_...
  environment_id: string | null; // env_...
  status: "completed";
  input: RunInput;
  output: RunOutput;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  model: string;
  trace_id: string;
  metadata: Record<string, unknown>;
  started_at: string;          // ISO 8601
  completed_at: string;        // ISO 8601
}
```

**Example payload:**

```json
{
  "id": "evt_a1b2c3d4e5f6",
  "type": "run.completed",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "created_at": "2026-03-19T14:30:03.420Z",
  "data": {
    "run_id": "run_hT2cF8nM6jLz",
    "agent_id": "ag_kP9xW2nM5vBz",
    "version_id": "ver_qJ3tY8cF6hNm",
    "session_id": "ses_qJ6tY3cF8hNz",
    "environment_id": "env_rL7wK4xP2dGs",
    "status": "completed",
    "input": { "type": "text", "text": "What is the status of order #12345?" },
    "output": { "type": "text", "text": "Order #12345 is currently in transit and expected to arrive by March 21st." },
    "total_tokens_in": 1250,
    "total_tokens_out": 340,
    "total_cost_usd": 0.0089,
    "duration_ms": 3420,
    "model": "claude-sonnet-4",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "metadata": {},
    "started_at": "2026-03-19T14:30:00.000Z",
    "completed_at": "2026-03-19T14:30:03.420Z"
  }
}
```

#### `run.failed`

Fired when an agent run fails.

```typescript
interface RunFailedWebhook {
  run_id: string;              // run_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  session_id: string | null;   // ses_...
  environment_id: string | null; // env_...
  status: "failed" | "timeout";
  input: RunInput;
  output: RunOutput | null;    // Partial output if available
  error: string;               // Error message
  error_type: "timeout" | "max_iterations" | "max_tokens" | "max_cost" | "guardrail_triggered" | "tool_error" | "provider_error" | "internal_error";
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  duration_ms: number;
  model: string;
  trace_id: string;
  metadata: Record<string, unknown>;
  started_at: string;          // ISO 8601
  failed_at: string;           // ISO 8601
}
```

**Example payload:**

```json
{
  "id": "evt_f6e5d4c3b2a1",
  "type": "run.failed",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "created_at": "2026-03-19T14:30:31.200Z",
  "data": {
    "run_id": "run_failedRunId",
    "agent_id": "ag_kP9xW2nM5vBz",
    "version_id": "ver_qJ3tY8cF6hNm",
    "session_id": null,
    "environment_id": "env_rL7wK4xP2dGs",
    "status": "failed",
    "input": { "type": "text", "text": "Generate a report on all customers" },
    "output": null,
    "error": "Tool execution timed out: salesforce.query exceeded 30000ms",
    "error_type": "tool_error",
    "total_tokens_in": 450,
    "total_tokens_out": 28,
    "total_cost_usd": 0.0024,
    "duration_ms": 31200,
    "model": "claude-sonnet-4",
    "trace_id": "9c8b7a6f5e4d3c2b",
    "metadata": {},
    "started_at": "2026-03-19T14:30:00.000Z",
    "failed_at": "2026-03-19T14:30:31.200Z"
  }
}
```

#### `eval.completed`

Fired when an eval experiment finishes (success or failure).

```typescript
interface EvalCompletedWebhook {
  experiment_id: string;       // exp_...
  agent_id: string;            // ag_...
  version_id: string;          // ver_...
  dataset_id: string;          // eds_...
  name: string | null;
  status: "completed" | "failed";
  summary_scores: Record<string, number>;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  total_cost_usd: number;
  total_duration_ms: number;
  error: string | null;
  baseline_comparison: BaselineComparison | null;
  started_at: string;          // ISO 8601
  completed_at: string;        // ISO 8601
}

interface BaselineComparison {
  baseline_id: string;         // ebl_...
  baseline_scores: Record<string, number>;
  score_deltas: Record<string, number>;  // grader -> (new_score - baseline_score)
  regressions_count: number;
  improvements_count: number;
  has_regression: boolean;     // True if any grader score dropped
}
```

**Example payload:**

```json
{
  "id": "evt_eval123",
  "type": "eval.completed",
  "org_id": "org_V1StGXR8_Z5jdHi6B",
  "created_at": "2026-03-19T14:30:46.200Z",
  "data": {
    "experiment_id": "exp_xW8bN2kP6vRz",
    "agent_id": "ag_kP9xW2nM5vBz",
    "version_id": "ver_qJ3tY8cF6hNm",
    "dataset_id": "eds_mN7vB4kP1wQz",
    "name": "v3-prompt-update",
    "status": "completed",
    "summary_scores": {
      "tool_accuracy": 0.96,
      "response_quality": 0.88,
      "output_similarity": 0.91
    },
    "total_cases": 25,
    "passed_cases": 23,
    "failed_cases": 2,
    "total_cost_usd": 0.42,
    "total_duration_ms": 45200,
    "error": null,
    "baseline_comparison": {
      "baseline_id": "ebl_prevBaseline",
      "baseline_scores": {
        "tool_accuracy": 0.92,
        "response_quality": 0.85,
        "output_similarity": 0.89
      },
      "score_deltas": {
        "tool_accuracy": 0.04,
        "response_quality": 0.03,
        "output_similarity": 0.02
      },
      "regressions_count": 1,
      "improvements_count": 3,
      "has_regression": true
    },
    "started_at": "2026-03-19T14:30:01.000Z",
    "completed_at": "2026-03-19T14:30:46.200Z"
  }
}
```

---

## Appendix A: Supported Models

The following model identifiers are accepted in the `model` field:

| Model ID | Provider | Notes |
|----------|----------|-------|
| `claude-opus-4` | Anthropic | Highest capability |
| `claude-sonnet-4` | Anthropic | Recommended for agents |
| `claude-haiku-4` | Anthropic | Fast, low-cost |
| `gpt-4o` | OpenAI | Multi-modal |
| `gpt-4o-mini` | OpenAI | Fast, low-cost |
| `o3` | OpenAI | Reasoning model |
| `o3-mini` | OpenAI | Fast reasoning |
| `o4-mini` | OpenAI | Fast reasoning |

Model availability may vary by organization plan. Contact support for access to additional models.

## Appendix B: HTTP Status Code Summary

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PATCH, PUT, or synchronous POST |
| 201 | Created | Successful resource creation (POST) |
| 202 | Accepted | Async operation started (async runs, experiments, document uploads) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Malformed request body or invalid parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Valid key but insufficient permissions (expired, revoked, wrong role) |
| 404 | Not Found | Resource does not exist or is not accessible by this organization |
| 409 | Conflict | Resource already exists (duplicate slug, etc.) |
| 422 | Validation Error | Request body fails schema validation |
| 429 | Rate Limit Exceeded | Request, token, or concurrency limit hit |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Platform is down or LLM provider is unreachable |

## Appendix C: SDK Quick Reference

The TypeScript SDK wraps all API endpoints with type-safe methods:

```typescript
import { Agentsy } from "@agentsy/sdk";

const agentsy = new Agentsy({ apiKey: "sk-agentsy-..." });

// Agents
const agent = await agentsy.agents.create({ name: "My Agent", slug: "my-agent" });
const agents = await agentsy.agents.list({ limit: 10 });
const version = await agentsy.agents.versions.create("ag_...", { ... });

// Runs
const result = await agentsy.agents.run("ag_...", { input: "Hello", stream: false });
const stream = await agentsy.agents.run("ag_...", { input: "Hello", stream: true });
for await (const event of stream) {
  if (event.type === "step.text_delta") process.stdout.write(event.delta);
}
const run = await agentsy.runs.get("run_...");
const steps = await agentsy.runs.steps("run_...");

// Sessions
const session = await agentsy.sessions.create("ag_...", { metadata: { user_id: "u1" } });
const messages = await agentsy.sessions.messages("ses_...");

// Knowledge Bases
const kb = await agentsy.knowledgeBases.create("ag_...", { name: "Docs" });
await agentsy.knowledgeBases.uploadDocument("kb_...", file);
const results = await agentsy.knowledgeBases.search("kb_...", { query: "refund" });

// Evals
const dataset = await agentsy.eval.datasets.create({ name: "golden-v1" });
await agentsy.eval.datasets.addCase("eds_...", { input: "...", expected_output: "..." });
const experiment = await agentsy.eval.experiments.run({
  agent_id: "ag_...",
  version_id: "ver_...",
  dataset_id: "eds_...",
  graders: [{ name: "quality", type: "llm_judge", config: { rubric: "..." } }],
});

// Deployments
await agentsy.deployments.create({
  agent_id: "ag_...",
  version_id: "ver_...",
  environment_id: "env_...",
});

// Usage
const usage = await agentsy.usage.summary();
const daily = await agentsy.usage.daily({ start_date: "2026-03-01", end_date: "2026-03-19" });

// Connectors
const catalog = await agentsy.connectors.catalog();
const connection = await agentsy.connectors.connect("con_gmail", { agent_id: "ag_..." });
const connections = await agentsy.connectors.list({ agent_id: "ag_..." });
await agentsy.connectors.disconnect("conn_...");
```

---

## 17. Connector Catalog

Connectors are managed MCP server connections to external services. Agentsy hosts the MCP server, handles OAuth flows, and manages credential lifecycle. Connected services expose their tools automatically to the agent's tool registry.

### 17.1 List Connector Catalog

Returns the full catalog of available connectors with metadata.

```
GET /v1/connectors/catalog
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter by category (productivity, crm, dev_tools, communication, data, infrastructure) |
| `search` | string | No | Search by name or description |

**Response: `200 OK`**

```typescript
interface ConnectorCatalogResponse {
  connectors: ConnectorDefinition[];
}

interface ConnectorDefinition {
  id: string;                    // con_gmail, con_slack, etc.
  name: string;                  // "Gmail"
  description: string;           // "Read, send, and manage emails"
  icon_url: string;              // URL to connector icon
  category: string;              // "communication"
  auth_type: "oauth2" | "api_key"; // How the connector authenticates
  scopes?: string[];             // OAuth scopes requested
  tools: ConnectorToolSummary[]; // Tools provided by this connector
  status: "available" | "coming_soon" | "beta";
}

interface ConnectorToolSummary {
  name: string;                  // "gmail_send_email"
  description: string;           // "Send an email"
  risk_level: "read" | "write" | "admin";
}
```

### 17.2 Initiate Connector OAuth Flow

Starts an OAuth authorization flow for a connector. Returns a URL to redirect the user to.

```
POST /v1/connectors/:connector_id/connect
```

**Request Body:**

```typescript
interface ConnectRequest {
  agent_id: string;              // Agent to assign this connection to
  environment?: string;          // "all" | "development" | "staging" | "production" (default: "all")
  redirect_uri?: string;         // Where to redirect after OAuth completion (default: dashboard)
}
```

**Response: `200 OK`**

```typescript
interface ConnectResponse {
  authorization_url: string;     // Redirect user here to complete OAuth
  state: string;                 // CSRF state token
  connection_id: string;         // conn_... (pending until OAuth completes)
}
```

### 17.3 OAuth Callback

Internal endpoint — handles the OAuth callback from the external service. Not called directly by users.

```
GET /v1/connectors/callback
```

Exchanges the authorization code for tokens, encrypts and stores them in `tenant_secrets`, creates the connection record, and redirects to the dashboard.

### 17.4 Connect via API Key

For connectors that use API key auth (e.g., Stripe, PostgreSQL).

```
POST /v1/connectors/:connector_id/connect/api-key
```

**Request Body:**

```typescript
interface ApiKeyConnectRequest {
  agent_id: string;
  api_key: string;               // Encrypted in transit (TLS), stored encrypted at rest
  environment?: string;          // Default: "all"
  metadata?: Record<string, string>; // e.g., { host: "db.example.com", database: "mydb" }
}
```

**Response: `201 Created`**

```typescript
interface ConnectionResponse {
  id: string;                    // conn_...
  connector_id: string;          // con_stripe
  agent_id: string;
  status: "active" | "expired" | "error";
  connected_at: string;
  tools: ConnectorToolSummary[];
}
```

### 17.5 List Agent Connections

Lists all active connector connections for an agent.

```
GET /v1/agents/:agent_id/connections
```

**Response: `200 OK`**

```typescript
interface ConnectionListResponse {
  connections: ConnectionDetail[];
}

interface ConnectionDetail {
  id: string;                    // conn_...
  connector_id: string;          // con_gmail
  connector_name: string;        // "Gmail"
  agent_id: string;
  environment: string;
  status: "active" | "expired" | "error";
  connected_at: string;
  last_used_at: string | null;
  account_label?: string;        // "john@acme.com" (display only, from OAuth profile)
  tools: ConnectorToolSummary[];
}
```

### 17.6 Get Connection Status

Check health/status of a specific connection.

```
GET /v1/connections/:connection_id
```

**Response: `200 OK`**

Returns a `ConnectionDetail` with additional `health_check` field:

```typescript
interface ConnectionStatusResponse extends ConnectionDetail {
  health_check: {
    status: "healthy" | "token_expired" | "auth_revoked" | "service_error";
    last_checked_at: string;
    error_message?: string;
  };
}
```

### 17.7 Disconnect

Removes a connector connection, revokes OAuth tokens, and cleans up stored credentials.

```
DELETE /v1/connections/:connection_id
```

**Response: `200 OK`**

```typescript
interface DisconnectResponse {
  id: string;
  status: "disconnected";
  disconnected_at: string;
}
```

### 17.8 Refresh Connection

Force-refreshes OAuth tokens for a connection.

```
POST /v1/connections/:connection_id/refresh
```

**Response: `200 OK`**

```typescript
interface RefreshResponse {
  id: string;
  status: "active";
  refreshed_at: string;
  expires_at: string;
}
```

---

## 18. Logs Streaming

Stream run logs for monitoring and debugging via SSE. Backs the `agentsy logs --tail` CLI command.

### 18.1 Stream Logs

```
GET /v1/logs?agent_id=ag_...&env=production&status=failed&tail=true
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `agent_id` | string | — | Filter by agent ID |
| `env` | string | — | Filter by environment (development, staging, production) |
| `status` | string | — | Filter by run status (completed, failed, running) |
| `tail` | boolean | false | If true, keep connection open and stream new events as they occur |
| `since` | string | 1h ago | ISO 8601 timestamp. Only return logs after this time. |
| `limit` | number | 100 | Max number of historical log entries before switching to live tail |

**Response: `200 OK` (SSE stream when `tail=true`, JSON array otherwise)**

Each SSE event is a run log entry:

```typescript
interface LogEntry {
  timestamp: string;       // ISO 8601
  run_id: string;
  agent_id: string;
  agent_name: string;
  environment: string;
  status: string;          // "started" | "step" | "completed" | "failed"
  step_type?: string;      // "llm_call" | "tool_call" | "retrieval" | "approval"
  message: string;         // Human-readable log line
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  duration_ms?: number;
  error?: string;
}
```

---

## 19. Alert Rules

Alert rules monitor agent metrics and trigger notifications when thresholds are exceeded.

### 19.1 Create Alert Rule

```
POST /v1/alerts
```

**Request body:**

```typescript
interface CreateAlertRuleRequest {
  name: string;
  agent_id?: string;           // Optional. Null = org-wide alert.
  condition_type: "error_rate" | "latency_p95" | "cost_per_run" | "run_failure_count";
  threshold: number;
  comparison_op?: "gt" | "gte" | "lt" | "lte"; // Default: "gt"
  window_minutes?: number;     // Default: 5
  cooldown_minutes?: number;   // Default: 60
  notification_channels: Array<{
    type: "in_app" | "email" | "webhook";
    target?: string;           // Email address or webhook URL
  }>;
}
```

**Response: `201 Created`**

```typescript
interface AlertRule {
  id: string;             // alr_...
  name: string;
  agent_id?: string;
  condition_type: string;
  threshold: number;
  comparison_op: string;
  window_minutes: number;
  cooldown_minutes: number;
  notification_channels: Array<{ type: string; target?: string }>;
  enabled: boolean;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}
```

### 19.2 List Alert Rules

```
GET /v1/alerts
```

### 19.3 Update Alert Rule

```
PATCH /v1/alerts/:alert_id
```

### 19.4 Delete Alert Rule

```
DELETE /v1/alerts/:alert_id
```

---

## 20. Notifications

In-app notifications for alert triggers, approval requests, and other events.

### 20.1 List Notifications

```
GET /v1/notifications?unread=true&limit=20
```

**Response: `200 OK`** — `PaginatedResponse<Notification>`

```typescript
interface Notification {
  id: string;             // ntf_...
  type: string;           // "alert_triggered" | "approval_requested" | "deploy_completed" | "eval_completed"
  title: string;
  body?: string;
  resource_type?: string; // "run" | "deployment" | "experiment"
  resource_id?: string;
  channel: string;
  read_at?: string;
  created_at: string;
}
```

### 20.2 Mark Notification as Read

```
POST /v1/notifications/:notification_id/read
```

### 20.3 Mark All Notifications as Read

```
POST /v1/notifications/read-all
```

---

## 21. Run Artifacts

Output files from code execution, file uploads, and tool outputs.

### 21.1 List Run Artifacts

```
GET /v1/runs/:run_id/artifacts
```

**Response: `200 OK`** — `Array<RunArtifact>`

```typescript
interface RunArtifact {
  id: string;              // art_...
  run_id: string;
  step_id?: string;
  file_name: string;
  file_path: string;       // /output/chart.png
  mime_type?: string;
  size_bytes: number;
  source: string;          // "code_execution" | "file_upload" | "tool_output"
  created_at: string;
}
```

### 21.2 Download Run Artifact

```
GET /v1/runs/:run_id/artifacts/:artifact_id
```

**Response: `200 OK`** — Binary file with `Content-Type` and `Content-Disposition` headers.

### 21.3 Upload Input File for Run

```
POST /v1/runs/:run_id/files
Content-Type: multipart/form-data
```

**Request body**: Multipart form with `file` field.

**Limits**: Max 50MB per file, max 10 files per run.

**Response: `201 Created`**

```typescript
interface RunFileUpload {
  artifact_id: string;     // art_...
  file_name: string;
  size_bytes: number;
  mime_type: string;
  path: string;            // /input/uploads/sales.csv
}
```

---

## 22. Agent Repositories

Git repository management for agents.

### 22.1 Get Agent Repository

```
GET /v1/agents/:agent_id/repo
```

**Response: `200 OK`**

```typescript
interface AgentRepo {
  id: string;              // rep_...
  agent_id: string;
  storage_path: string;
  default_branch: string;
  head_sha?: string;
  size_bytes: number;
  pipeline_config?: PipelineConfig;
  evolve_config?: EvolutionConfig;
  created_at: string;
  updated_at: string;
}
```

### 22.2 List Agent Commits

```
GET /v1/agents/:agent_id/repo/commits?limit=20&offset=0
```

**Response: `200 OK`** — `PaginatedResponse<Commit>`

```typescript
interface Commit {
  sha: string;
  message: string;
  author: string;
  author_email: string;
  timestamp: string;
  version_id?: string;     // ver_... if this commit created a version
}
```

### 22.3 Get Commit Diff

```
GET /v1/agents/:agent_id/repo/diff?from=:sha1&to=:sha2
```

**Response: `200 OK`**

```typescript
interface RepoDiff {
  from_sha: string;
  to_sha: string;
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted";
    diff: string;         // unified diff format
  }>;
}
```

---

## 23. CI/CD Pipelines

Pipeline runs triggered by pushes, PRs, and evolution sessions.

### 23.1 List Pipeline Runs

```
GET /v1/agents/:agent_id/pipelines?limit=20&offset=0
```

**Response: `200 OK`** — `PaginatedResponse<PipelineRun>`

```typescript
interface PipelineRun {
  id: string;
  agent_id: string;
  trigger: "push" | "pr" | "evolve" | "manual";
  commit_sha: string;
  branch?: string;
  status: "queued" | "running" | "passed" | "failed" | "cancelled";
  stages: Array<{
    name: string;          // "validate" | "eval" | "gate" | "deploy" | "notify"
    status: "pending" | "running" | "passed" | "failed" | "skipped";
    duration_ms?: number;
    details?: Record<string, unknown>;
  }>;
  eval_results?: {
    total_cases: number;
    passed_cases: number;
    composite_score: number;
    regressions: number;
  };
  deploy_env?: string;
  duration_ms?: number;
  created_at: string;
}
```

### 23.2 Get Pipeline Run

```
GET /v1/agents/:agent_id/pipelines/:run_id
```

**Response: `200 OK`** — `PipelineRun` (same schema as above, with full stage details).

### 23.3 Retry Failed Pipeline

```
POST /v1/agents/:agent_id/pipelines/:run_id/retry
```

**Response: `202 Accepted`** — Returns new `PipelineRun`.

---

## 24. Agent Evolution

Autonomous agent self-improvement via mutation and evaluation.

### 24.1 Start Evolution Session

```
POST /v1/agents/:agent_id/evolve
```

**Request body**:

```typescript
interface StartEvolutionRequest {
  /** Override budget for this session. */
  budget?: {
    max_mutations?: number;
    max_cost_usd?: number;
    max_duration_minutes?: number;
  };
  /** Override directives for this session. */
  directives?: string;
}
```

**Response: `202 Accepted`**

```typescript
interface EvolutionSession {
  id: string;              // evo_...
  agent_id: string;
  status: string;
  baseline_version_id: string;
  config: EvolutionConfig;
  total_mutations: number;
  kept_mutations: number;
  discarded_mutations: number;
  baseline_composite_score?: number;
  final_composite_score?: number;
  total_cost_usd: number;
  triggered_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}
```

### 24.2 List Evolution Sessions

```
GET /v1/agents/:agent_id/evolve?limit=20&offset=0
```

**Response: `200 OK`** — `PaginatedResponse<EvolutionSession>`

### 24.3 Get Evolution Session

```
GET /v1/agents/:agent_id/evolve/:session_id
```

**Response: `200 OK`** — `EvolutionSession` with full details.

### 24.4 Cancel Evolution Session

```
POST /v1/agents/:agent_id/evolve/:session_id/cancel
```

**Response: `200 OK`** — Session is stopped gracefully. Kept mutations are committed.

### 24.5 List Mutations in Session

```
GET /v1/agents/:agent_id/evolve/:session_id/mutations
```

**Response: `200 OK`** — `Array<EvolutionMutation>`

```typescript
interface EvolutionMutation {
  id: string;              // mut_...
  sequence_number: number;
  mutation_type: string;
  status: string;          // "kept" | "discarded" | "error"
  description: string;
  hypothesis?: string;
  config_diff: Array<{ field: string; before: unknown; after: unknown }>;
  composite_score?: number;
  per_grader_scores?: Record<string, number>;
  decision_reason?: string;
  experiment_id?: string;
  commit_sha?: string;
  cost_usd: number;
  duration_ms?: number;
  created_at: string;
}
```

### 24.6 Stream Evolution Session Events

```
GET /v1/agents/:agent_id/evolve/:session_id/stream
```

**Response: `200 OK`** — `text/event-stream`

SSE event types:

```typescript
{ event: "mutation.started", data: { mutation_id, sequence_number, mutation_type, description } }
{ event: "mutation.evaluating", data: { mutation_id, experiment_id } }
{ event: "mutation.completed", data: { mutation_id, status, composite_score, decision_reason } }
{ event: "session.completed", data: { kept, discarded, score_delta, result_version_id } }
{ event: "session.failed", data: { error } }
{ event: "session.budget_exhausted", data: { reason, kept, discarded } }
```

### 24.7 Promote Evolved Version

```
POST /v1/agents/:agent_id/evolve/:session_id/promote
```

**Request body**:

```typescript
interface PromoteRequest {
  environment: "staging" | "production";
}
```

**Response: `200 OK`** — Returns deployment record.

**Errors**:
- `403 Forbidden` — Production promotion requires org admin role.
- `409 Conflict` — Session has no result version (no mutations were kept).
