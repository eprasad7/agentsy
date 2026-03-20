# Agentsy SDK Design Specification

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**Implements**: PRD v1 (R-1.x, R-2.x, R-4.x, R-7.x, R-9.x), Technology Decisions (D-10.x)
**Stack**: TypeScript, Commander.js, Vercel AI SDK, Zod, SSE

---

## Table of Contents

1. [Overview](#1-overview)
2. [Package Structure](#2-package-structure)
3. [Project File Structure](#3-project-file-structure)
4. [Configuration File](#4-configuration-file)
5. [Environment Variables](#5-environment-variables)
6. [Module 1: Agent Definition SDK (`@agentsy/sdk`)](#6-module-1-agent-definition-sdk-agentsysdk)
7. [Module 2: Client SDK (`@agentsy/client`)](#7-module-2-client-sdk-agentsyclient)
8. [Module 3: Eval SDK (`@agentsy/eval`)](#8-module-3-eval-sdk-agentsyeval)
9. [Module 4: CLI (`@agentsy/cli`)](#9-module-4-cli-agentsycli)
10. [Error Types](#10-error-types)
11. [Code Examples](#11-code-examples)
12. [Versioning Strategy](#12-versioning-strategy)
13. [Appendix: ID Prefix Reference](#13-appendix-id-prefix-reference)

---

## 1. Overview

The Agentsy SDK is the primary interface for developers to define, test, deploy, and interact with AI agents on the Agentsy platform. It is TypeScript-first, type-safe, and designed so that a developer can go from zero to a deployed agent in under 30 minutes.

The SDK is split into four packages, each with a distinct responsibility:

| Package | npm Name | Purpose | Published |
|---------|----------|---------|-----------|
| Agent Definition SDK | `@agentsy/sdk` | Define agents, tools, guardrails, memory config | Yes |
| Client SDK | `@agentsy/client` | Call deployed agents from application code | Yes |
| Eval SDK | `@agentsy/eval` | Define datasets, experiments, graders; run evals programmatically | Yes |
| CLI | `@agentsy/cli` | Project scaffolding, local dev, deploy, eval commands | Yes (global install) |

All four packages share types from an internal `@agentsy/shared` package (not published to npm; monorepo-internal only).

---

## 2. Package Structure

The SDK lives in the Agentsy monorepo (Turborepo + pnpm workspaces):

```
agentsy/
  apps/
    web/              # Next.js dashboard
    api/              # Fastify API server
    worker/           # Temporal worker
  packages/
    sdk/              # @agentsy/sdk — agent definition
    client/           # @agentsy/client — API client
    eval/             # @agentsy/eval — eval engine
    cli/              # @agentsy/cli — CLI tool
    db/               # @agentsy/db — Drizzle schema + migrations (internal)
    ui/               # @agentsy/ui — shared React components (internal)
    shared/           # @agentsy/shared — shared types + utilities (internal)
```

### Package Dependencies

```
@agentsy/cli
  ├── @agentsy/sdk
  ├── @agentsy/eval
  ├── @agentsy/client
  └── @agentsy/shared

@agentsy/sdk
  └── @agentsy/shared

@agentsy/client
  └── @agentsy/shared

@agentsy/eval
  ├── @agentsy/sdk
  ├── @agentsy/client
  └── @agentsy/shared
```

### Build & Publish

- All packages target ES2022 + CJS/ESM dual output via `tsup`.
- Minimum Node.js version: 20.x.
- Each published package has its own `package.json` with `"exports"` field for proper module resolution.
- Packages are published under the `@agentsy` npm scope.

---

## 3. Project File Structure

When a developer runs `agentsy init`, the following structure is created. This is the canonical layout for an Agentsy project:

```
my-agent/
  agentsy.config.ts        # Agent definition + project configuration
  tools/
    index.ts               # Tool barrel export
    get-order.ts            # Example native tool
    refund-policy.ts        # Example native tool
  evals/
    datasets/
      golden.json           # Eval dataset (JSON)
    graders.ts              # Custom grader definitions
  .env                      # Local environment variables (git-ignored)
  .env.example              # Template for required env vars
  .gitignore
  package.json
  tsconfig.json
```

### Template Variants

`agentsy init --template basic` — The structure above.
`agentsy init --template with-eval` — Adds a pre-populated eval dataset (10 cases), sample graders, and a `scripts/eval.ts` file.
`agentsy init --template with-knowledge` — Adds a `knowledge/` directory with sample documents and knowledge base configuration in `agentsy.config.ts`.

---

## 4. Configuration File

The `agentsy.config.ts` file is the single source of truth for an Agentsy project. It exports a default agent definition and optional project-level configuration.

```typescript
// agentsy.config.ts
import { agentsy } from "@agentsy/sdk";
import { getOrder, getRefundPolicy, sendReply } from "./tools";

export default agentsy.defineAgent({
  slug: "support-agent",
  name: "Support Agent",
  description: "Handles customer support inquiries",
  model: "claude-sonnet-4",
  fallbackModel: "gpt-4o",
  systemPrompt: "You are a helpful customer support agent for Acme Corp...",
  tools: [getOrder, getRefundPolicy, sendReply],
  guardrails: {
    maxIterations: 10,
    maxTokens: 50_000,
    timeoutMs: 300_000,
    outputValidation: [
      { type: "no_pii" },
      { type: "on_topic", config: { topics: ["customer support", "orders", "refunds"] } },
    ],
  },
  memory: {
    sessionHistory: {
      maxMessages: 20,
    },
    knowledgeBases: ["product-docs"],
  },
  modelParams: {
    temperature: 0.7,
    maxOutputTokens: 4096,
  },
});
```

### Multi-Agent Projects

A project can define multiple agents by exporting a config object:

```typescript
// agentsy.config.ts
import { agentsy } from "@agentsy/sdk";
import { supportAgent } from "./agents/support";
import { triageAgent } from "./agents/triage";

export default agentsy.defineProject({
  agents: [supportAgent, triageAgent],
  defaults: {
    model: "claude-sonnet-4",
    guardrails: {
      maxIterations: 10,
      maxTokens: 50_000,
      timeoutMs: 300_000,
    },
  },
});
```

---

## 5. Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AGENTSY_API_KEY` | API key for the Agentsy platform | `sk-agentsy-org_V1St-Tz4Rv8bNq1Lm...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for local dev) | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key (for local dev, embeddings) | `sk-...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTSY_BASE_URL` | Platform API base URL | `https://api.agentsy.com` |
| `AGENTSY_ENV` | Target environment for deploy/run | `production` |
| `AGENTSY_LOG_LEVEL` | CLI log verbosity | `info` |
| `AGENTSY_DEV_PORT` | Port for local dev server | `4321` |

### `.env.example`

```bash
# Agentsy platform (required for deploy, optional for local dev)
AGENTSY_API_KEY=

# LLM providers (required for local dev — SDK calls providers directly)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Optional
# AGENTSY_BASE_URL=https://api.agentsy.com
# AGENTSY_ENV=production
# AGENTSY_DEV_PORT=4321
```

---

## 6. Module 1: Agent Definition SDK (`@agentsy/sdk`)

### 6.1 Package Entry Point

```typescript
// packages/sdk/src/index.ts
export { agentsy } from "./agentsy";
export type {
  AgentConfig,
  ProjectConfig,
  ToolDefinition,
  NativeToolDefinition,
  McpToolDefinition,
  GuardrailsConfig,
  OutputValidation,
  MemoryConfig,
  SessionHistoryConfig,
  ModelParams,
  SystemPromptFn,
  ToolContext,
  RunInput,
  RunOutput,
} from "./types";
```

### 6.1.1 RunInput / RunOutput — Structured I/O Envelopes

These types define the JSONB envelopes stored in `runs.input` and `runs.output`. They are the canonical representation of agent I/O across the platform — used by the Client SDK, Eval SDK, and API layer.

```typescript
// packages/sdk/src/types.ts

/**
 * Structured input envelope for an agent run.
 * Stored as JSONB in: runs.input
 *
 * Three variants:
 *   - "text"       — simple string input (most common)
 *   - "messages"   — multi-turn message array (chat-style)
 *   - "structured" — arbitrary JSON data (form submissions, API payloads, etc.)
 */
export type RunInput =
  | { type: "text"; text: string }
  | { type: "messages"; messages: Array<{ role: string; content: string }> }
  | { type: "structured"; data: Record<string, unknown> };

/**
 * Structured output envelope from an agent run.
 * Stored as JSONB in: runs.output
 *
 * Three variants mirror RunInput:
 *   - "text"       — plain text response
 *   - "messages"   — multi-message response (e.g., assistant + tool results)
 *   - "structured" — structured JSON response (when output schema is used)
 */
export type RunOutput =
  | { type: "text"; text: string }
  | { type: "messages"; messages: Array<{ role: string; content: string }> }
  | { type: "structured"; data: Record<string, unknown> };
```

### 6.2 Core API

```typescript
// packages/sdk/src/agentsy.ts
import type { AgentConfig, ProjectConfig, ToolDefinition } from "./types";

export const agentsy = {
  /**
   * Define a single agent. Returns a validated, frozen AgentConfig object.
   * This is the primary API for single-agent projects.
   */
  defineAgent(config: AgentConfig): Readonly<AgentConfig>;

  /**
   * Define a native tool with Zod input/output schemas.
   * Returns a ToolDefinition that can be passed to `defineAgent({ tools: [...] })`.
   */
  defineTool<TInput, TOutput>(
    definition: NativeToolDefinition<TInput, TOutput>
  ): ToolDefinition;

  /**
   * Define a project with multiple agents and shared defaults.
   * Used for multi-agent projects.
   */
  defineProject(config: ProjectConfig): Readonly<ProjectConfig>;
};
```

### 6.3 AgentConfig

The complete type definition for `agentsy.defineAgent()`. Every field maps to a column or JSONB field in the data model.

```typescript
// packages/sdk/src/types.ts
import { z } from "zod";

/**
 * Full agent configuration. Validated with Zod at definition time.
 * Serialized to the `agent_versions` table as:
 *   - systemPrompt → agent_versions.system_prompt
 *   - model → agent_versions.model
 *   - fallbackModel → agent_versions.fallback_model
 *   - tools → agent_versions.tools_config (ToolsConfig JSONB)
 *   - guardrails → agent_versions.guardrails_config (GuardrailsConfig JSONB)
 *   - modelParams → agent_versions.model_params (ModelParams JSONB)
 *   - slug → agents.slug (URL-safe routing key)
 *   - name → agents.name (human-readable display name)
 *   - description → agents.description, agent_versions.description
 */
export interface AgentConfig {
  /**
   * URL-safe identifier for the agent. Used for API routing and CLI references.
   * Must be lowercase alphanumeric + hyphens, 3-63 chars.
   * Maps to: agents.slug
   */
  slug: string;

  /**
   * Human-readable display name for the agent.
   * If omitted, derived from slug (e.g., "support-agent" → "Support Agent").
   * Maps to: agents.name
   */
  name?: string;

  /**
   * Human-readable description of the agent's purpose.
   * Maps to: agents.description
   */
  description?: string;

  /**
   * Primary model identifier. Uses Vercel AI SDK model strings.
   * Maps to: agent_versions.model
   *
   * Supported P0 values:
   *   Anthropic: "claude-sonnet-4", "claude-haiku-3.5", "claude-opus-4"
   *   OpenAI: "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"
   */
  model: ModelIdentifier;

  /**
   * Fallback model used when the primary provider is unavailable.
   * Maps to: agent_versions.fallback_model
   */
  fallbackModel?: ModelIdentifier;

  /**
   * System prompt — either a static string or a dynamic function that
   * receives context (session metadata, current date, etc.) and returns a string.
   * Maps to: agent_versions.system_prompt (static or serialized)
   */
  systemPrompt: string | SystemPromptFn;

  /**
   * Array of tool definitions (native functions and/or MCP server connections).
   * Maps to: agent_versions.tools_config (ToolsConfig JSONB)
   */
  tools?: ToolDefinition[];

  /**
   * Guardrail configuration — safety limits and output validation.
   * Maps to: agent_versions.guardrails_config (GuardrailsConfig JSONB)
   */
  guardrails?: GuardrailsConfig;

  /**
   * Memory configuration — session history and knowledge base references.
   */
  memory?: MemoryConfig;

  /**
   * Model parameters — temperature, top-p, max output tokens, stop sequences.
   * Maps to: agent_versions.model_params (ModelParams JSONB)
   */
  modelParams?: ModelParams;
}

/**
 * Model identifier string. Provider-prefixed for clarity.
 */
/**
 * Model can be specified as a string (direct model ID) or as a capability class object.
 * The capability class syntax is the recommended approach per PRD section 5.10.
 */
export type ModelIdentifier =
  | "claude-sonnet-4"
  | "claude-haiku-3.5"
  | "claude-opus-4"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "o3"
  | "o4-mini"
  | (string & {}) // Allow custom model strings for future providers
  | ModelSpec;

/**
 * Capability class model specification. Resolved to a concrete model ID at runtime
 * via the model registry (architecture-v1.md section 3.4).
 *
 * Example: { class: "balanced", provider: "anthropic" } -> "claude-sonnet-4"
 */
export interface ModelSpec {
  /** Capability class: "fast", "balanced", "powerful" */
  class: "fast" | "balanced" | "powerful";
  /** Provider preference. If the primary provider fails, falls back to another provider in the same class. */
  provider?: "anthropic" | "openai";
}

/**
 * Dynamic system prompt function. Receives runtime context, returns prompt string.
 * Used when the system prompt needs to include dynamic data (current date,
 * user profile from session metadata, A/B test variants, etc.).
 */
export type SystemPromptFn = (context: SystemPromptContext) => string | Promise<string>;

export interface SystemPromptContext {
  /** Session metadata (userId, channel, custom fields) from the sessions table */
  sessionMetadata?: Record<string, unknown>;
  /** ISO 8601 date string for the current date */
  currentDate: string;
  /** The agent's name */
  agentName: string;
  /** The environment (development, staging, production) */
  environment: "development" | "staging" | "production";
}
```

### 6.4 Tool Definitions

Tools come in two types: native functions and MCP server connections.

```typescript
/**
 * Union type for all tool definition types.
 * Discriminated on the `type` field.
 */
export type ToolDefinition = NativeToolDefinition<any, any> | McpToolDefinition;

/**
 * A native tool — a TypeScript function with Zod-validated input and output schemas.
 * The function runs in the Agentsy runtime (Temporal activity) with full access
 * to the ToolContext (secrets, HTTP client, etc.).
 *
 * Serialized to agent_versions.tools_config as:
 *   { name, type: "native", description, inputSchema: zodToJsonSchema(input) }
 */
export interface NativeToolDefinition<TInput = unknown, TOutput = unknown> {
  /**
   * Discriminator. Always "native" for function tools.
   */
  type: "native";

  /**
   * Tool name. Must be unique within an agent. Used in LLM tool_call responses.
   * Convention: snake_case, descriptive (e.g., "get_order", "send_email").
   * Maps to: agent_versions.tools_config[].name
   */
  name: string;

  /**
   * Human-readable description shown to the LLM to help it decide when to use this tool.
   * Maps to: agent_versions.tools_config[].description
   */
  description: string;

  /**
   * Zod schema for the tool's input parameters.
   * Converted to JSON Schema for the LLM's tool definition.
   * Validated at runtime before the tool function is called.
   */
  input: z.ZodType<TInput>;

  /**
   * Optional Zod schema for the tool's output.
   * Used for runtime validation and documentation. Not sent to the LLM.
   */
  output?: z.ZodType<TOutput>;

  /**
   * The tool's implementation function. Receives validated input and a ToolContext.
   * Must return TOutput (or a Promise<TOutput>).
   *
   * Executed as a Temporal activity with:
   *   - Timeout: guardrails.toolTimeout (default 30s)
   *   - Retry: 1 retry on transient failure (5xx, network error)
   *   - Result size limit: guardrails.maxToolResultSize (default 10KB)
   */
  execute: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;

  /**
   * Optional per-tool timeout in milliseconds. Overrides the global tool timeout.
   * Maps to: agent_versions.tools_config[].timeout
   */
  timeout?: number;

  /**
   * Risk classification for this tool. Determines approval behavior at runtime.
   * - "read": Auto-approved in all environments (e.g., get_order, search_docs)
   * - "write": Requires approval in production by default (e.g., process_refund, send_email)
   * - "admin": Requires approval in all environments (e.g., delete_account, modify_permissions)
   * Default: "read"
   * Maps to: agent_versions.tools_config[].riskLevel
   */
  riskLevel?: "read" | "write" | "admin";

  /**
   * Override the default approval behavior for this tool.
   * If not set, the environment default applies (reads auto-approve, writes need approval in prod).
   * Maps to: agent_versions.tools_config[].approvalPolicy
   */
  approvalPolicy?: {
    /** Override: always auto-approve this tool regardless of risk level. */
    autoApprove?: boolean;
    /** Override: always require approval regardless of risk level. */
    requireApproval?: boolean;
    /** Environments where approval is required. Default depends on riskLevel. */
    requireApprovalIn?: Array<"development" | "staging" | "production">;
  };
}

/**
 * An MCP server connection — connects to an external MCP server that exposes tools.
 * The runtime discovers available tools from the MCP server at startup.
 *
 * Serialized to agent_versions.tools_config as:
 *   { name, type: "mcp", mcpServerUrl, mcpTransport }
 */
export interface McpToolDefinition {
  /**
   * Discriminator. Always "mcp" for MCP server connections.
   */
  type: "mcp";

  /**
   * Display name for this MCP server connection (e.g., "github-tools", "salesforce").
   * Maps to: agent_versions.tools_config[].name
   */
  name: string;

  /**
   * URL of the MCP server.
   * - For stdio transport (local dev): path to the MCP server binary or script
   * - For streamable-http transport (remote): HTTP(S) URL of the MCP server
   *
   * Maps to: agent_versions.tools_config[].mcpServerUrl
   */
  serverUrl: string;

  /**
   * Transport protocol for communicating with the MCP server.
   * - "stdio": Local process communication (for dev, local MCP servers)
   * - "streamable-http": HTTP-based communication (for remote/deployed MCP servers)
   *
   * Maps to: agent_versions.tools_config[].mcpTransport
   */
  transport: "stdio" | "streamable-http";

  /**
   * Optional description of what this MCP server provides.
   * Maps to: agent_versions.tools_config[].description
   */
  description?: string;

  /**
   * Optional authentication headers for remote MCP servers.
   * Values can reference secrets by name: "${secret:GITHUB_TOKEN}".
   * The runtime resolves these from the per-tenant encrypted secrets in PostgreSQL.
   */
  headers?: Record<string, string>;

  /**
   * Optional per-tool timeout in milliseconds for tools from this MCP server.
   * Maps to: agent_versions.tools_config[].timeout
   */
  timeout?: number;

  /**
   * Risk classification for tools exposed by this MCP server.
   * Applied as the default risk level for all tools from this server.
   * Individual tool overrides can be configured in the dashboard.
   * - "read": Auto-approved in all environments
   * - "write": Requires approval in production by default
   * - "admin": Requires approval in all environments
   * Default: "read"
   * Maps to: agent_versions.tools_config[].riskLevel
   */
  riskLevel?: "read" | "write" | "admin";
}

/**
 * Context object passed to native tool execute functions.
 * Provides access to platform services without requiring direct imports.
 */
export interface ToolContext {
  /** Retrieve a secret value by name from the org's secrets vault */
  getSecret(name: string): Promise<string>;

  /** The current run ID (run_...) */
  runId: string;

  /** The current agent ID (ag_...) */
  agentId: string;

  /** The current organization ID (org_...) */
  orgId: string;

  /** The current session ID, if in a multi-turn conversation (ses_...) */
  sessionId?: string;

  /** The current environment (development, staging, production) */
  environment: "development" | "staging" | "production";

  /** A pre-configured fetch function with timeout and retry handling */
  fetch: typeof globalThis.fetch;

  /** Emit a structured log entry attached to the current run's trace */
  log(level: "debug" | "info" | "warn" | "error", message: string, data?: Record<string, unknown>): void;
}
```

### 6.5 Guardrails Configuration

```typescript
/**
 * Guardrail configuration for an agent. Defines safety limits and output validation.
 * Maps to: agent_versions.guardrails_config (GuardrailsConfig JSONB)
 *
 * All fields are optional with sensible defaults.
 */
export interface GuardrailsConfig {
  /**
   * Maximum number of agentic loop iterations (LLM call → tool → LLM call → ...).
   * Prevents infinite loops. The LLM's "I need to call another tool" counts as 1 iteration.
   * Default: 10 (per PRD R-1.6)
   */
  maxIterations?: number;

  /**
   * Maximum total tokens (input + output) across all LLM calls in a single run.
   * Acts as a cost circuit breaker. Exceeding this stops the run with a `timeout` status.
   * Default: 50_000 (per PRD R-1.7)
   */
  maxTokens?: number;

  /**
   * Maximum wall-clock time for a single run, in milliseconds.
   * Includes all LLM calls, tool executions, and retrieval operations.
   * Default: 300_000 (5 minutes, per PRD R-1.8)
   */
  timeoutMs?: number;

  /**
   * Maximum size of a single tool result, in bytes.
   * Tool outputs exceeding this limit are truncated with a warning appended.
   * Prevents context window blowout from verbose tool responses.
   * Default: 10_240 (10KB, per PRD R-2.6)
   */
  maxToolResultSize?: number;

  /**
   * Per-tool execution timeout in milliseconds.
   * Can be overridden at the individual tool level via ToolDefinition.timeout.
   * Default: 30_000 (30s, per PRD R-2.4)
   */
  toolTimeout?: number;

  /**
   * Output validation rules applied to the agent's final response.
   * Each validator runs after the agent produces its final output.
   * If any validator fails, the agent is re-prompted with the violation description.
   */
  outputValidation?: OutputValidation[];
}

/**
 * Output validation rule. Applied to the agent's final response.
 * Validators are checked in order; the first failure triggers re-prompting.
 */
export type OutputValidation =
  | { type: "no_pii"; config?: NoPiiConfig }
  | { type: "on_topic"; config: OnTopicConfig }
  | { type: "content_policy"; config?: ContentPolicyConfig }
  | { type: "json_schema"; config: JsonSchemaValidationConfig }
  | { type: "custom"; config: CustomValidationConfig };

export interface NoPiiConfig {
  /** PII categories to detect. Default: all categories. */
  categories?: ("email" | "phone" | "ssn" | "credit_card" | "address" | "name")[];
}

export interface OnTopicConfig {
  /** Allowed topics. Agent output is checked for relevance to these topics. */
  topics: string[];
  /** Model used for topic classification. Default: same as agent's model. */
  classifierModel?: ModelIdentifier;
}

export interface ContentPolicyConfig {
  /** Content categories to block. Default: ["harmful", "illegal", "sexual"]. */
  blockedCategories?: string[];
}

export interface JsonSchemaValidationConfig {
  /** JSON Schema that the agent's output must conform to. */
  schema: Record<string, unknown>;
}

export interface CustomValidationConfig {
  /** Name of the custom validator function. Must be registered in the project. */
  name: string;
  /** Arbitrary configuration passed to the custom validator. */
  config?: Record<string, unknown>;
}
```

### 6.6 Memory Configuration

```typescript
/**
 * Memory configuration for an agent.
 * Controls conversation history persistence and knowledge base access.
 */
export interface MemoryConfig {
  /**
   * Session history configuration.
   * Controls how conversation history is managed within a session.
   */
  sessionHistory?: SessionHistoryConfig;

  /**
   * Knowledge base names to attach to this agent.
   * These must exist in the organization's knowledge bases.
   * Maps to: knowledge_bases.name (matched by name within the org)
   * RAG retrieval from these KBs is automatically injected before each LLM call (per PRD R-3.4).
   */
  knowledgeBases?: string[];

  /**
   * Number of top-K knowledge chunks to retrieve per query.
   * Default: 5
   */
  retrievalTopK?: number;

  /**
   * Minimum similarity score (0.0-1.0) for retrieved chunks.
   * Chunks below this threshold are discarded.
   * Default: 0.7
   */
  retrievalMinScore?: number;
}

export interface SessionHistoryConfig {
  /**
   * Maximum number of messages to include from conversation history.
   * Older messages beyond this window are excluded from the LLM context.
   * Default: 20 (per PRD R-3.2)
   */
  maxMessages?: number;

  /**
   * Strategy for handling messages beyond maxMessages.
   * - "truncate": Simply drop oldest messages.
   * - "summarize": Summarize older messages into a condensed context block.
   * Default: "truncate"
   */
  overflow?: "truncate" | "summarize";
}
```

### 6.7 Model Parameters

```typescript
/**
 * Model generation parameters. Passed through to the LLM provider via Vercel AI SDK.
 * Maps to: agent_versions.model_params (ModelParams JSONB)
 */
export interface ModelParams {
  /**
   * Sampling temperature. 0.0 = deterministic, 1.0 = creative.
   * Default: provider default (typically 1.0)
   */
  temperature?: number;

  /**
   * Nucleus sampling parameter. Restricts to tokens within cumulative probability topP.
   * Default: provider default
   */
  topP?: number;

  /**
   * Maximum number of tokens the model can generate in a single response.
   * This is per LLM call, NOT per run (maxTokens in guardrails is per run).
   * Default: provider default
   */
  maxOutputTokens?: number;

  /**
   * Sequences that stop generation when encountered.
   * Default: none
   */
  stopSequences?: string[];
}
```

### 6.8 Project Configuration

```typescript
/**
 * Project-level configuration for multi-agent projects.
 * Returned by agentsy.defineProject().
 */
export interface ProjectConfig {
  /**
   * Array of agent definitions in this project.
   * Each agent is independently deployable.
   */
  agents: AgentConfig[];

  /**
   * Default values applied to all agents unless overridden.
   * Agent-level config takes precedence over defaults.
   */
  defaults?: {
    model?: ModelIdentifier;
    fallbackModel?: ModelIdentifier;
    guardrails?: GuardrailsConfig;
    memory?: MemoryConfig;
    modelParams?: ModelParams;
  };
}
```

### 6.9 Validation Schemas (Zod)

All configuration is validated at definition time using Zod. Invalid configs fail fast with descriptive error messages.

```typescript
// packages/sdk/src/schemas.ts
import { z } from "zod";

export const agentSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Agent slug must be lowercase alphanumeric + hyphens, must start and end with alphanumeric"
  );

export const agentDisplayNameSchema = z.string().min(1).max(255).optional();

export const modelIdentifierSchema = z.string().min(1).max(100);

export const guardrailsConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(100).optional().default(10),
  maxTokens: z.number().int().min(1000).max(1_000_000).optional().default(50_000),
  timeoutMs: z.number().int().min(5_000).max(3_600_000).optional().default(300_000),
  maxToolResultSize: z.number().int().min(1024).max(1_048_576).optional().default(10_240),
  toolTimeout: z.number().int().min(1_000).max(600_000).optional().default(30_000),
  outputValidation: z.array(z.object({
    type: z.enum(["no_pii", "on_topic", "content_policy", "json_schema", "custom"]),
    config: z.record(z.unknown()).optional(),
  })).optional().default([]),
}).optional().default({});

export const modelParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).optional(),
  stopSequences: z.array(z.string()).optional(),
}).optional().default({});

export const sessionHistoryConfigSchema = z.object({
  maxMessages: z.number().int().min(1).max(200).optional().default(20),
  overflow: z.enum(["truncate", "summarize"]).optional().default("truncate"),
}).optional();

export const memoryConfigSchema = z.object({
  sessionHistory: sessionHistoryConfigSchema,
  knowledgeBases: z.array(z.string()).optional(),
  retrievalTopK: z.number().int().min(1).max(50).optional().default(5),
  retrievalMinScore: z.number().min(0).max(1).optional().default(0.7),
}).optional();

const riskLevelSchema = z.enum(["read", "write", "admin"]).optional().default("read");

const approvalPolicySchema = z.object({
  autoApprove: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  requireApprovalIn: z.array(z.enum(["development", "staging", "production"])).optional(),
}).optional();

export const nativeToolSchema = z.object({
  type: z.literal("native"),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1024),
  input: z.instanceof(z.ZodType),
  output: z.instanceof(z.ZodType).optional(),
  execute: z.function(),
  timeout: z.number().int().min(1_000).max(600_000).optional(),
  riskLevel: riskLevelSchema,
  approvalPolicy: approvalPolicySchema,
});

export const mcpToolSchema = z.object({
  type: z.literal("mcp"),
  name: z.string().min(1).max(255),
  serverUrl: z.string().min(1),
  transport: z.enum(["stdio", "streamable-http"]),
  description: z.string().optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().int().min(1_000).max(600_000).optional(),
  riskLevel: riskLevelSchema,
});

export const toolDefinitionSchema = z.discriminatedUnion("type", [
  nativeToolSchema,
  mcpToolSchema,
]);

export const agentConfigSchema = z.object({
  slug: agentSlugSchema,
  name: agentDisplayNameSchema, // human-readable; derived from slug if omitted
  description: z.string().max(1024).optional(),
  model: modelIdentifierSchema,
  fallbackModel: modelIdentifierSchema.optional(),
  systemPrompt: z.union([z.string().min(1), z.function()]),
  tools: z.array(toolDefinitionSchema).optional().default([]),
  guardrails: guardrailsConfigSchema,
  memory: memoryConfigSchema,
  modelParams: modelParamsSchema,
});
```

### 6.10 `defineTool` Implementation Pattern

```typescript
// packages/sdk/src/define-tool.ts
import { z } from "zod";
import type { NativeToolDefinition, ToolContext } from "./types";

/**
 * Type-safe tool definition helper.
 *
 * Usage:
 *   const getOrder = agentsy.defineTool({
 *     name: "get_order",
 *     description: "Look up an order by ID",
 *     input: z.object({ orderId: z.string() }),
 *     output: z.object({ id: z.string(), status: z.string(), total: z.number() }),
 *     execute: async ({ orderId }, ctx) => {
 *       const secret = await ctx.getSecret("ORDERS_API_KEY");
 *       const res = await ctx.fetch(`https://api.acme.com/orders/${orderId}`, {
 *         headers: { Authorization: `Bearer ${secret}` },
 *       });
 *       return res.json();
 *     },
 *   });
 */
export function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType = z.ZodUnknown,
>(
  definition: {
    name: string;
    description: string;
    input: TInput;
    output?: TOutput;
    execute: (
      input: z.infer<TInput>,
      context: ToolContext
    ) => z.infer<TOutput> | Promise<z.infer<TOutput>>;
    timeout?: number;
  }
): NativeToolDefinition<z.infer<TInput>, z.infer<TOutput>> {
  // Validate the definition at build time
  nativeToolSchema.parse({ ...definition, type: "native" });

  return Object.freeze({
    type: "native" as const,
    ...definition,
  });
}
```

---

## 7. Module 2: Client SDK (`@agentsy/client`)

The Client SDK is used by application code to call deployed agents. It communicates with the Agentsy REST API.

### 7.1 Package Entry Point

```typescript
// packages/client/src/index.ts
export { AgentsyClient } from "./client";
export type { RunInput, RunOutput } from "@agentsy/sdk";
export type {
  AgentsyClientConfig,
  RunRequest,
  RunResponse,
  RunStreamEvent,
  AsyncRunResult,
  RunStatus,
  Session,
  SessionCreateInput,
  SessionListOptions,
  KnowledgeBase,
  KnowledgeBaseCreateInput,
  KnowledgeBaseSearchResult,
  RunListOptions,
  RunDetail,
  RunTrace,
  RunStep,
  PaginatedResponse,
  RequestOptions,
} from "./types";
export {
  AgentsyError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  TimeoutError,
  ServerError,
  NetworkError,
} from "./errors";
```

### 7.2 Client Constructor

```typescript
// packages/client/src/client.ts

export interface AgentsyClientConfig {
  /**
   * API key for authentication.
   * Format: sk-agentsy-{org_prefix}-{random}
   * Sent as: Authorization: Bearer <apiKey>
   */
  apiKey: string;

  /**
   * Base URL for the Agentsy API.
   * Default: "https://api.agentsy.com"
   */
  baseUrl?: string;

  /**
   * Default timeout for requests in milliseconds.
   * Default: 30_000 (30 seconds). Streaming requests use a longer timeout.
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for transient errors (5xx, network errors).
   * Uses exponential backoff: 500ms, 1000ms, 2000ms, ...
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Custom headers added to every request.
   */
  defaultHeaders?: Record<string, string>;

  /**
   * Request interceptor. Called before every HTTP request.
   * Can modify the request or add logging/metrics.
   */
  onRequest?: (request: RequestInit & { url: string }) => RequestInit & { url: string };

  /**
   * Response interceptor. Called after every HTTP response.
   * Can add logging/metrics or transform responses.
   */
  onResponse?: (response: Response, request: RequestInit & { url: string }) => void;
}

export class AgentsyClient {
  readonly agents: AgentsResource;
  /** @deprecated Use client.runs for async polling (get, cancel, poll). */
  // readonly tasks: TasksResource; — removed, folded into client.runs

  readonly sessions: SessionsResource;
  readonly knowledgeBases: KnowledgeBasesResource;
  readonly runs: RunsResource;

  constructor(config: AgentsyClientConfig) {
    // Validate API key format
    // Configure HTTP client with retry logic, interceptors
    // Initialize resource namespaces
  }
}
```

### 7.3 `client.agents` — Agent Execution

```typescript
// packages/client/src/resources/agents.ts

export class AgentsResource {
  /**
   * Run an agent synchronously. Waits for the complete response.
   *
   * REST: POST /v1/agents/{agentId}/run
   * Returns: Full RunResponse with output, trace ID, cost, token counts.
   *
   * @param agentId - Agent ID (ag_...) or agent slug
   * @param input - Plain string (auto-wrapped as { type: "text" }) or structured RunInput
   * @param options - Optional request overrides (sessionId, model, metadata, etc.)
   */
  async run(
    agentId: string,
    input: string | RunInput,
    options?: RunRequest
  ): Promise<RunResponse>;

  /**
   * Run an agent with streaming via SSE. Returns an async iterator
   * that yields RunStreamEvents as they arrive.
   *
   * REST: POST /v1/agents/{agentId}/run (Accept: text/event-stream)
   *
   * Yields events:
   *   - { type: "text_delta", delta: string }           — Token-level text chunk
   *   - { type: "tool_call_start", toolName, toolCallId } — Tool call begins
   *   - { type: "tool_call_args", delta: string }        — Streaming tool arguments
   *   - { type: "tool_call_end", toolCallId, result }    — Tool call complete
   *   - { type: "step_complete", step: RunStep }         — Step finished
   *   - { type: "run_complete", output: RunResponse }     — Run finished
   *   - { type: "error", error: AgentsyError }           — Error occurred
   *
   * @param agentId - Agent ID (ag_...) or agent slug
   * @param input - Plain string (auto-wrapped as { type: "text" }) or structured RunInput
   * @param options - Optional request overrides (sessionId, model, metadata, etc.)
   */
  async stream(
    agentId: string,
    input: string | RunInput,
    options?: RunRequest
  ): Promise<AsyncIterable<RunStreamEvent>>;

  /**
   * Run an agent asynchronously. Returns immediately with a run ID.
   * Use client.runs.poll() to poll for the result.
   *
   * REST: POST /v1/agents/{agentId}/run { async: true }
   * Returns: { id: string } (run ID for polling)
   *
   * Use for long-running agents where you don't want to hold a connection open.
   *
   * @param agentId - Agent ID (ag_...) or agent slug
   * @param input - Plain string (auto-wrapped as { type: "text" }) or structured RunInput
   * @param options - Optional request overrides (sessionId, model, metadata, etc.)
   */
  async runAsync(
    agentId: string,
    input: string | RunInput,
    options?: RunRequest
  ): Promise<AsyncRunResult>;
}
```

### 7.4 Request and Response Types

```typescript
// packages/client/src/types.ts
import type { RunInput, RunOutput } from "@agentsy/sdk";

/**
 * Options for an agent run request. Passed as the optional third argument
 * to client.agents.run(), .stream(), and .runAsync().
 *
 * The input itself is passed as the second argument (string | RunInput).
 * These options control session, model overrides, metadata, and guardrails.
 */
export interface RunRequest {
  /**
   * Session ID for multi-turn conversations.
   * If provided, conversation history from this session is included in context.
   * If omitted, the run is single-turn (no history).
   * Format: ses_...
   */
  sessionId?: string;

  /**
   * Run in async mode. Returns a run ID instead of waiting for the result.
   * Default: false
   */
  async?: boolean;

  /**
   * Override the agent's model for this run.
   */
  model?: ModelIdentifier;

  /**
   * Additional metadata attached to the run.
   * Stored in: runs.metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Override guardrails for this run.
   * Merged with the agent's default guardrails (run-level overrides win).
   */
  guardrails?: Partial<GuardrailsConfig>;
}

/**
 * Output from a completed agent run.
 */
export interface RunResponse {
  /** Run ID. Format: run_... */
  id: string;

  /** Agent ID. Format: ag_... */
  agentId: string;

  /** Agent version ID. Format: ver_... */
  versionId: string;

  /** Session ID, if this was a multi-turn run. Format: ses_... */
  sessionId?: string;

  /** Run status. For sync runs, always "completed" on success. */
  status: "completed" | "failed" | "timeout" | "cancelled";

  /** The agent's final output. Maps to: runs.output (JSONB) */
  output: RunOutput;

  /** Error message if status is "failed". */
  error?: string;

  /** Token usage for the entire run. */
  usage: {
    /** Total input tokens across all LLM calls. Maps to: runs.total_tokens_in */
    inputTokens: number;
    /** Total output tokens across all LLM calls. Maps to: runs.total_tokens_out */
    outputTokens: number;
    /** Total cost in USD. Maps to: runs.total_cost_usd */
    costUsd: number;
  };

  /** Total run duration in milliseconds. Maps to: runs.duration_ms */
  durationMs: number;

  /** Primary model used. Maps to: runs.model */
  model: string;

  /** OpenTelemetry trace ID for drill-down. Maps to: runs.trace_id */
  traceId: string;

  /** ISO 8601 timestamps. */
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

/**
 * SSE stream events emitted during a streaming agent run.
 */
export type RunStreamEvent =
  | RunStreamTextDelta
  | RunStreamToolCallStart
  | RunStreamToolCallArgs
  | RunStreamToolCallEnd
  | RunStreamStepComplete
  | RunStreamRunComplete
  | RunStreamError;

export interface RunStreamTextDelta {
  type: "text_delta";
  /** Incremental text chunk from the LLM. */
  delta: string;
}

export interface RunStreamToolCallStart {
  type: "tool_call_start";
  /** Name of the tool being called. Maps to: run_steps.tool_name */
  toolName: string;
  /** Unique ID for this tool call (from the LLM). */
  toolCallId: string;
  /** Step ID. Format: stp_... */
  stepId: string;
}

export interface RunStreamToolCallArgs {
  type: "tool_call_args";
  /** Incremental JSON argument chunk. */
  delta: string;
  /** Tool call ID this chunk belongs to. */
  toolCallId: string;
}

export interface RunStreamToolCallEnd {
  type: "tool_call_end";
  /** Tool call ID that completed. */
  toolCallId: string;
  /** Step ID. Format: stp_... */
  stepId: string;
  /** Tool result (may be truncated per maxToolResultSize). */
  result: unknown;
  /** Duration of the tool execution in milliseconds. */
  durationMs: number;
}

export interface RunStreamStepComplete {
  type: "step_complete";
  /** The completed step. */
  step: RunStep;
}

export interface RunStreamRunComplete {
  type: "run_complete";
  /** The full run response. */
  output: RunResponse;
}

export interface RunStreamError {
  type: "error";
  /** The error that occurred. */
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * A single step within a run trace.
 * Maps to: run_steps table.
 */
export interface RunStep {
  /** Step ID. Format: stp_... */
  id: string;
  /** Run ID. Format: run_... */
  runId: string;
  /** Position in the step sequence (0-indexed). Maps to: run_steps.step_order */
  stepOrder: number;
  /** Step type. Maps to: run_steps.type */
  type: "llm_call" | "tool_call" | "retrieval" | "guardrail";
  /** Model used (for llm_call steps). Maps to: run_steps.model */
  model?: string;
  /** Tool name (for tool_call steps). Maps to: run_steps.tool_name */
  toolName?: string;
  /** Input (prompt or tool arguments). Maps to: run_steps.input */
  input?: string;
  /** Output (response or tool result). Maps to: run_steps.output */
  output?: string;
  /** Token counts for this step. */
  tokensIn: number;
  tokensOut: number;
  /** Cost in USD for this step. Maps to: run_steps.cost_usd */
  costUsd: number;
  /** Duration in milliseconds. Maps to: run_steps.duration_ms */
  durationMs?: number;
  /** Error message if this step failed. Maps to: run_steps.error */
  error?: string;
  /** Step metadata. Maps to: run_steps.metadata */
  metadata?: Record<string, unknown>;
  /** ISO 8601 timestamps. */
  startedAt?: string;
  completedAt?: string;
}

/**
 * Result of an async run request. Contains the run ID for polling.
 */
export interface AsyncRunResult {
  /** Run ID for polling status. Format: run_... */
  id: string;
}

/**
 * Status of an async run (retrieved via client.runs.get()).
 */
export interface RunStatus {
  /** Run ID. Format: run_... */
  id: string;
  /** Current status. */
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  /** The run response, available when status is "completed". */
  output?: RunResponse;
  /** Error message, available when status is "failed". */
  error?: string;
  /** Progress indicator (0-100), if available. */
  progress?: number;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}
```

### 7.5 Async Run Polling (folded into `client.runs`)

The async polling methods live on the existing `client.runs` resource (see Section 7.8).
The following methods are added to `RunsResource`:

```typescript
// packages/client/src/resources/runs.ts (additions for async polling)

export class RunsResource {
  // ... existing list(), get(), getTrace() methods ...

  /**
   * Cancel a running async run.
   *
   * REST: POST /v1/runs/{runId}/cancel
   *
   * @param runId - Run ID to cancel (from client.agents.runAsync())
   */
  async cancel(runId: string, options?: RequestOptions): Promise<void>;

  /**
   * Poll a run until it completes or fails.
   * Uses exponential backoff: 1s, 2s, 4s, ... up to maxInterval.
   *
   * This is a convenience method — not a separate API call.
   * Internally calls client.runs.get() repeatedly.
   *
   * @param runId - Run ID to poll
   * @param options - Polling configuration
   */
  async poll(
    runId: string,
    options?: {
      /** Interval between polls in milliseconds. Default: 1000 */
      intervalMs?: number;
      /** Maximum interval with backoff. Default: 10_000 */
      maxIntervalMs?: number;
      /** Maximum total wait time. Default: 300_000 (5 min) */
      timeoutMs?: number;
      /** Callback on each poll. Receives the current RunStatus. */
      onPoll?: (status: RunStatus) => void;
    }
  ): Promise<RunResponse>;

  /**
   * Approve a pending tool call for a run with an active approval gate.
   *
   * REST: POST /v1/runs/{runId}/approve
   *
   * @param runId - Run ID with a pending approval
   */
  async approve(runId: string, options?: RequestOptions): Promise<void>;

  /**
   * Deny a pending tool call for a run with an active approval gate.
   *
   * REST: POST /v1/runs/{runId}/deny
   *
   * @param runId - Run ID with a pending approval
   * @param reason - Optional reason for denial
   */
  async deny(runId: string, reason?: string, options?: RequestOptions): Promise<void>;
}
```

### 7.6 `client.sessions` — Session Management

```typescript
// packages/client/src/resources/sessions.ts

export interface SessionCreateInput {
  /**
   * Agent ID to create the session for. Format: ag_...
   * Maps to: sessions.agent_id
   */
  agentId: string;

  /**
   * Optional metadata for the session.
   * Typically includes end-user ID, channel, and custom fields.
   * Maps to: sessions.metadata (SessionMetadata JSONB)
   */
  metadata?: {
    userId?: string;
    channel?: string;
    [key: string]: unknown;
  };
}

export interface Session {
  /** Session ID. Format: ses_... */
  id: string;
  /** Agent ID. Format: ag_... */
  agentId: string;
  /** Session metadata. */
  metadata: Record<string, unknown>;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface SessionListOptions {
  /** Filter by agent ID. Format: ag_... */
  agentId?: string;
  /** Pagination cursor (session ID to start after). */
  cursor?: string;
  /** Number of sessions per page. Default: 20, max: 100. */
  limit?: number;
}

export class SessionsResource {
  /**
   * Create a new session for multi-turn conversations.
   *
   * REST: POST /v1/sessions
   *
   * @param input - Session creation parameters
   */
  async create(
    input: SessionCreateInput,
    options?: RequestOptions
  ): Promise<Session>;

  /**
   * Get a session by ID.
   *
   * REST: GET /v1/sessions/{sessionId}
   *
   * @param sessionId - Session ID. Format: ses_...
   */
  async get(
    sessionId: string,
    options?: RequestOptions
  ): Promise<Session>;

  /**
   * List sessions with optional filtering and pagination.
   *
   * REST: GET /v1/sessions?agentId=ag_...&cursor=ses_...&limit=20
   *
   * @param listOptions - Filtering and pagination options
   */
  async list(
    listOptions?: SessionListOptions,
    options?: RequestOptions
  ): Promise<PaginatedResponse<Session>>;

  /**
   * Delete a session and all associated messages.
   * This is a soft delete (sets sessions.deleted_at).
   *
   * REST: DELETE /v1/sessions/{sessionId}
   *
   * @param sessionId - Session ID. Format: ses_...
   */
  async delete(
    sessionId: string,
    options?: RequestOptions
  ): Promise<void>;
}
```

### 7.7 `client.knowledgeBases` — Knowledge Base Management

```typescript
// packages/client/src/resources/knowledge-bases.ts

export interface KnowledgeBaseCreateInput {
  /**
   * Agent ID to associate the knowledge base with. Format: ag_...
   * Maps to: knowledge_bases.agent_id
   */
  agentId: string;

  /**
   * Display name for the knowledge base.
   * Maps to: knowledge_bases.name
   */
  name: string;

  /** Optional description. Maps to: knowledge_bases.description */
  description?: string;

  /**
   * Embedding model to use. Default: "text-embedding-3-small"
   * Maps to: knowledge_bases.embedding_model
   */
  embeddingModel?: string;

  /**
   * Chunk size in tokens. Default: 512
   * Maps to: knowledge_bases.chunk_size
   */
  chunkSize?: number;

  /**
   * Chunk overlap in tokens. Default: 64
   * Maps to: knowledge_bases.chunk_overlap
   */
  chunkOverlap?: number;
}

export interface KnowledgeBase {
  /** Knowledge base ID. Format: kb_... */
  id: string;
  /** Agent ID. Format: ag_... */
  agentId: string;
  /** Display name. */
  name: string;
  /** Description. */
  description?: string;
  /** Embedding model used. */
  embeddingModel: string;
  /** Embedding dimensions. */
  embeddingDimensions: number;
  /** Chunk size in tokens. */
  chunkSize: number;
  /** Chunk overlap in tokens. */
  chunkOverlap: number;
  /** Total number of chunks. Maps to: knowledge_bases.total_chunks */
  totalChunks: number;
  /** Total number of source documents. Maps to: knowledge_bases.total_documents */
  totalDocuments: number;
  /** Total size in bytes. Maps to: knowledge_bases.total_size_bytes */
  totalSizeBytes: number;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseSearchResult {
  /** Chunk ID. Format: kc_... */
  chunkId: string;
  /** Source document name. Maps to: knowledge_chunks.document_name */
  documentName: string;
  /** Chunk content text. Maps to: knowledge_chunks.content */
  content: string;
  /** Similarity score (0.0-1.0, higher is more similar). */
  score: number;
  /** Chunk metadata. Maps to: knowledge_chunks.metadata */
  metadata: Record<string, unknown>;
}

export interface KnowledgeBaseUploadOptions {
  /**
   * Source file name. Used for tracking and display.
   * Maps to: knowledge_chunks.document_name
   */
  fileName: string;

  /**
   * File content as a Buffer, Blob, or ReadableStream.
   * Supported formats: PDF, TXT, MD, CSV (per PRD R-3.3)
   */
  content: Buffer | Blob | ReadableStream;

  /**
   * MIME type of the file. Inferred from fileName if not provided.
   */
  contentType?: string;

  /**
   * Optional metadata attached to all chunks created from this document.
   */
  metadata?: Record<string, unknown>;
}

export class KnowledgeBasesResource {
  /**
   * Create a new knowledge base.
   *
   * REST: POST /v1/knowledge-bases
   */
  async create(
    input: KnowledgeBaseCreateInput,
    options?: RequestOptions
  ): Promise<KnowledgeBase>;

  /**
   * Get a knowledge base by ID.
   *
   * REST: GET /v1/knowledge-bases/{knowledgeBaseId}
   */
  async get(
    knowledgeBaseId: string,
    options?: RequestOptions
  ): Promise<KnowledgeBase>;

  /**
   * List knowledge bases, optionally filtered by agent.
   *
   * REST: GET /v1/knowledge-bases?agentId=ag_...
   */
  async list(
    listOptions?: { agentId?: string; cursor?: string; limit?: number },
    options?: RequestOptions
  ): Promise<PaginatedResponse<KnowledgeBase>>;

  /**
   * Upload a document to a knowledge base.
   * The document is chunked, embedded, and stored for RAG retrieval.
   *
   * REST: POST /v1/knowledge-bases/{knowledgeBaseId}/upload
   * Content-Type: multipart/form-data
   *
   * This is a long-running operation. Returns immediately with an upload ID.
   * The chunking and embedding happen asynchronously.
   */
  async upload(
    knowledgeBaseId: string,
    file: KnowledgeBaseUploadOptions,
    options?: RequestOptions
  ): Promise<{ uploadId: string; status: "processing" }>;

  /**
   * Search a knowledge base using hybrid search (vector + keyword).
   *
   * REST: POST /v1/knowledge-bases/{knowledgeBaseId}/search
   *
   * Uses the hybrid search query pattern (RRF over pgvector + tsvector).
   */
  async search(
    knowledgeBaseId: string,
    query: string,
    searchOptions?: {
      /** Number of results to return. Default: 5 */
      topK?: number;
      /** Minimum similarity score. Default: 0.7 */
      minScore?: number;
    },
    options?: RequestOptions
  ): Promise<KnowledgeBaseSearchResult[]>;

  /**
   * Delete a knowledge base and all its chunks.
   * Soft delete (sets knowledge_bases.deleted_at).
   *
   * REST: DELETE /v1/knowledge-bases/{knowledgeBaseId}
   */
  async delete(
    knowledgeBaseId: string,
    options?: RequestOptions
  ): Promise<void>;
}
```

### 7.8 `client.runs` — Run History & Traces

```typescript
// packages/client/src/resources/runs.ts

export interface RunListOptions {
  /** Filter by agent ID. Format: ag_... */
  agentId?: string;
  /** Filter by session ID. Format: ses_... */
  sessionId?: string;
  /** Filter by run status. */
  status?: "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  /** Filter by start date (ISO 8601). */
  startDate?: string;
  /** Filter by end date (ISO 8601). */
  endDate?: string;
  /** Sort order. Default: "desc" (newest first). */
  sort?: "asc" | "desc";
  /** Pagination cursor (run ID). */
  cursor?: string;
  /** Number of runs per page. Default: 20, max: 100. */
  limit?: number;
}

export interface RunDetail extends RunResponse {
  /** Parent run ID for sub-agent calls. Format: run_... */
  parentRunId?: string;
  /** Environment ID. Format: env_... */
  environmentId?: string;
  /** Run metadata. Maps to: runs.metadata */
  metadata: Record<string, unknown>;
}

export interface RunTrace {
  /** Run ID. Format: run_... */
  runId: string;
  /** OpenTelemetry trace ID. Maps to: runs.trace_id */
  traceId: string;
  /** Ordered list of steps in this run. */
  steps: RunStep[];
  /** Total run duration in milliseconds. */
  durationMs: number;
  /** Total cost in USD. */
  totalCostUsd: number;
  /** Total tokens in. */
  totalTokensIn: number;
  /** Total tokens out. */
  totalTokensOut: number;
}

export class RunsResource {
  /**
   * List runs with filtering and pagination.
   *
   * REST: GET /v1/runs?agentId=ag_...&status=failed&limit=20
   */
  async list(
    listOptions?: RunListOptions,
    options?: RequestOptions
  ): Promise<PaginatedResponse<RunDetail>>;

  /**
   * Get a single run by ID.
   *
   * REST: GET /v1/runs/{runId}
   */
  async get(
    runId: string,
    options?: RequestOptions
  ): Promise<RunDetail>;

  /**
   * Get the full trace for a run (all steps with inputs, outputs, costs).
   *
   * REST: GET /v1/runs/{runId}/trace
   */
  async getTrace(
    runId: string,
    options?: RequestOptions
  ): Promise<RunTrace>;
}
```

### 7.9 Pagination

```typescript
/**
 * Standard paginated response envelope.
 * All list endpoints return this shape.
 */
export interface PaginatedResponse<T> {
  /** Array of results for the current page. */
  data: T[];
  /** Cursor to the next page. Null if this is the last page. */
  nextCursor: string | null;
  /** Whether there are more results after this page. */
  hasMore: boolean;
}
```

### 7.10 Request Options

```typescript
/**
 * Per-request options that can override client defaults.
 */
export interface RequestOptions {
  /** Override the default timeout for this request. */
  timeout?: number;
  /** Override max retries for this request. */
  maxRetries?: number;
  /** Additional headers for this request. */
  headers?: Record<string, string>;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
}
```

### 7.11 Retry Logic

The client implements automatic retry with exponential backoff for transient errors:

```
Retryable errors:
  - HTTP 429 (Rate Limited) — uses Retry-After header if present
  - HTTP 500, 502, 503, 504 (Server errors)
  - Network errors (ECONNRESET, ETIMEDOUT, etc.)

Not retried:
  - HTTP 400 (Bad Request)
  - HTTP 401 (Unauthorized)
  - HTTP 403 (Forbidden)
  - HTTP 404 (Not Found)
  - HTTP 409 (Conflict)
  - HTTP 422 (Unprocessable Entity)

Backoff formula:
  delay = min(baseDelay * 2^attempt + jitter, maxDelay)
  where baseDelay = 500ms, maxDelay = 30_000ms, jitter = random(0, 250ms)

Rate limit handling:
  If response includes Retry-After header, use that value instead of
  the computed backoff delay.
```

### 7.12 HTTP Client Internals

```typescript
// packages/client/src/http.ts

/**
 * Internal HTTP client used by all resource classes.
 * Not exported — consumers use the resource methods.
 */
class HttpClient {
  private config: AgentsyClientConfig;

  constructor(config: AgentsyClientConfig) {
    this.config = config;
  }

  /**
   * Make an HTTP request with retry, timeout, and interceptors.
   */
  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.config.baseUrl ?? "https://api.agentsy.com"}${path}`;

    let request: RequestInit & { url: string } = {
      url,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "User-Agent": `agentsy-client-ts/${SDK_VERSION}`,
        ...this.config.defaultHeaders,
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal ?? AbortSignal.timeout(options?.timeout ?? this.config.timeout ?? 30_000),
    };

    // Apply request interceptor
    if (this.config.onRequest) {
      request = this.config.onRequest(request);
    }

    const maxRetries = options?.maxRetries ?? this.config.maxRetries ?? 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(request.url, request);

        // Apply response interceptor
        if (this.config.onResponse) {
          this.config.onResponse(response, request);
        }

        if (response.ok) {
          return (await response.json()) as T;
        }

        const errorBody = await response.json().catch(() => ({}));
        const error = this.createError(response.status, errorBody);

        if (!this.isRetryable(response.status) || attempt === maxRetries) {
          throw error;
        }

        lastError = error;
        const delay = this.getRetryDelay(response, attempt);
        await this.sleep(delay);
      } catch (err) {
        if (err instanceof AgentsyError) throw err;
        if (attempt === maxRetries) throw new NetworkError(String(err));
        lastError = err as Error;
        await this.sleep(this.computeBackoff(attempt));
      }
    }

    throw lastError ?? new NetworkError("Request failed after retries");
  }

  /**
   * Make a streaming SSE request. Returns an async iterator of parsed events.
   */
  async *stream<T>(
    method: "POST",
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): AsyncGenerator<T> {
    // Similar to request() but:
    // - Sets Accept: text/event-stream
    // - Uses a longer timeout (default: 5 minutes for streaming)
    // - Parses SSE events from the response body
    // - Yields parsed JSON objects from each "data:" line
    // - Handles reconnection on network errors (SSE auto-reconnect)
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private getRetryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
    return this.computeBackoff(attempt);
  }

  private computeBackoff(attempt: number): number {
    const baseDelay = 500;
    const maxDelay = 30_000;
    const jitter = Math.random() * 250;
    return Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createError(status: number, body: any): AgentsyError {
    const message = body?.error?.message ?? body?.message ?? "Unknown error";
    const code = body?.error?.code ?? "unknown";
    switch (status) {
      case 401: return new AuthenticationError(message);
      case 403: return new AuthenticationError(message);
      case 404: return new NotFoundError(message);
      case 409: return new ValidationError(message, code);
      case 422: return new ValidationError(message, code);
      case 429: return new RateLimitError(message, body?.retryAfter);
      default:
        if (status >= 500) return new ServerError(message, status);
        return new AgentsyError(message, code, status);
    }
  }
}
```

---

## 8. Module 3: Eval SDK (`@agentsy/eval`)

### 8.1 Package Entry Point

```typescript
// packages/eval/src/index.ts
export { agentsyEval } from "./eval";
export type {
  DatasetDefinition,
  DatasetCase,
  ExperimentDefinition,
  ExperimentResult,
  ExperimentSummary,
  CaseResult,
  ScoreResult,
  GraderDefinition,
  GraderFn,
  GraderContext,
  BuiltInGraderType,
  ToolMode,
} from "./types";
export {
  exactMatch,
  jsonSchema,
  regex,
  numericThreshold,
  embeddingSimilarity,
  toolNameMatch,
  toolArgsMatch,
  llmJudge,
  trajectoryMatch,
  unnecessarySteps,
} from "./graders";
```

### 8.2 Core API

```typescript
// packages/eval/src/eval.ts

export const agentsyEval = {
  /**
   * Define an eval dataset. Validates case structure.
   * Returns a DatasetDefinition that can be referenced by experiments.
   */
  defineDataset(definition: DatasetDefinition): Readonly<DatasetDefinition>;

  /**
   * Define an eval experiment. Configures which agent, dataset, graders,
   * and tool mode to use.
   */
  defineExperiment(definition: ExperimentDefinition): Readonly<ExperimentDefinition>;

  /**
   * Run an experiment programmatically. Executes the agent against
   * every case in the dataset, applies graders, and returns results.
   *
   * This is the same engine used by `agentsy eval run` in the CLI.
   */
  run(experiment: ExperimentDefinition): Promise<ExperimentResult>;

  /**
   * Compare two experiment results and produce a diff report.
   * Identifies regressions, improvements, and unchanged cases.
   */
  compare(
    baseline: ExperimentResult,
    candidate: ExperimentResult
  ): ComparisonResult;
};
```

### 8.3 Dataset Definition

```typescript
// packages/eval/src/types.ts
import type { RunInput, RunOutput } from "@agentsy/sdk";

/**
 * An eval dataset — a versioned collection of test cases.
 * Maps to: eval_datasets + eval_dataset_cases tables.
 */
export interface DatasetDefinition {
  /**
   * Dataset name. Must be unique within the organization.
   * Maps to: eval_datasets.name
   */
  name: string;

  /**
   * Human-readable description.
   * Maps to: eval_datasets.description
   */
  description?: string;

  /**
   * Array of test cases.
   * Maps to: eval_dataset_cases rows.
   */
  cases: DatasetCase[];
}

/**
 * A single test case within a dataset.
 * Maps to: eval_dataset_cases table.
 */
export interface DatasetCase {
  /**
   * The input to send to the agent.
   * Accepts a plain string (auto-wrapped as { type: "text", text: "..." })
   * or a structured RunInput envelope.
   * Maps to: eval_dataset_cases.input (JSONB)
   */
  input: string | RunInput;

  /**
   * Optional expected output. Used by graders like exactMatch and embeddingSimilarity.
   * Maps to: eval_dataset_cases.expected_output
   */
  expectedOutput?: string;

  /**
   * Optional expected tool calls. Used by trajectory graders.
   * Maps to: eval_dataset_cases.expected_tool_calls (ExpectedToolCall[] JSONB)
   */
  expectedToolCalls?: ExpectedToolCall[];

  /**
   * Optional metadata for categorization, filtering, or custom grader input.
   * Maps to: eval_dataset_cases.metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Mocked tool results for this case. When toolMode is "mock",
   * the runtime returns these instead of executing real tools.
   * Maps to: eval_dataset_cases.mocked_tool_results (MockedToolResult[] JSONB)
   */
  mockedToolResults?: MockedToolResult[];
}

export interface ExpectedToolCall {
  /** Expected tool name. */
  name: string;
  /** Expected arguments (partial match). */
  arguments?: Record<string, unknown>;
  /** Expected position in the tool call sequence (0-indexed). */
  order?: number;
}

export interface MockedToolResult {
  /** Tool name to mock. */
  toolName: string;
  /** Argument match criteria. If provided, the mock only activates when args match. */
  argumentsMatch?: Record<string, unknown>;
  /** The mocked return value. */
  result: unknown;
}
```

### 8.4 Experiment Definition

```typescript
/**
 * An experiment — running an agent against a dataset with specific graders.
 * Maps to: eval_experiments table.
 */
export interface ExperimentDefinition {
  /**
   * Experiment name. Auto-generated if not provided.
   * Maps to: eval_experiments.name
   */
  name?: string;

  /**
   * The agent config to test. Pass the result of agentsy.defineAgent().
   */
  agent: AgentConfig;

  /**
   * The dataset to test against. Pass the result of agentsy.defineDataset()
   * or a dataset name (resolved from the platform or local file).
   */
  dataset: DatasetDefinition | string;

  /**
   * Array of grader definitions to score each case.
   * If omitted, defaults to [exactMatch()] when expectedOutput is present.
   */
  graders: GraderDefinition[];

  /**
   * Tool execution mode for this experiment.
   * - "mock": Tools return mocked responses from the dataset case (default, per D-7.4)
   * - "dry-run": Tools execute but don't commit side effects (requires tool support)
   * - "live": Tools execute for real (use with caution)
   *
   * Maps to: eval_experiments.config.toolMode
   */
  toolMode?: ToolMode;

  /**
   * Number of cases to run in parallel.
   * Higher parallelism = faster experiments but more concurrent API calls.
   * Default: 5
   * Maps to: eval_experiments.config.parallelism
   */
  parallelism?: number;

  /**
   * Model to use for LLM-as-judge graders.
   * Default: "claude-sonnet-4" (per D-7.2)
   * Maps to: eval_experiments.config.judgeModel
   */
  judgeModel?: ModelIdentifier;

  /**
   * Whether to automatically set this experiment as the baseline if all cases pass.
   * Default: false
   */
  setAsBaseline?: boolean;
}

export type ToolMode = "mock" | "dry-run" | "live";
```

### 8.5 Built-In Graders

All graders implement the `GraderDefinition` interface and return a `ScoreResult`.

```typescript
/**
 * A grader definition — either a built-in grader or a custom function.
 */
export type GraderDefinition = BuiltInGrader | CustomGrader;

export interface BuiltInGrader {
  /** Grader name (for display in results). */
  name: string;
  /** Built-in grader type. Maps to: eval_experiments.config.graders[].type */
  type: BuiltInGraderType;
  /** Grader-specific configuration. Maps to: eval_experiments.config.graders[].config */
  config?: Record<string, unknown>;
  /** Internal: the grader scoring function. */
  __graderFn: GraderFn;
}

export interface CustomGrader {
  /** Grader name (for display in results). */
  name: string;
  /** Always "custom" for custom graders. */
  type: "custom";
  /** The custom scoring function. */
  fn: GraderFn;
}

export type BuiltInGraderType =
  | "exact_match"
  | "json_schema"
  | "regex"
  | "numeric_threshold"
  | "embedding_similarity"
  | "tool_name_match"
  | "tool_args_match"
  | "llm_judge"
  | "tool_sequence"
  | "unnecessary_steps";

/**
 * The grader function signature. Receives the case, the agent's output,
 * and a context object. Returns a ScoreResult.
 */
export type GraderFn = (
  input: GraderInput,
  context: GraderContext
) => ScoreResult | Promise<ScoreResult>;

export interface GraderInput {
  /** The original input from the dataset case. */
  input: RunInput;
  /** The agent's actual output. */
  output: RunOutput;
  /** The expected output from the dataset case (if provided). */
  expectedOutput?: string;
  /** The expected tool calls from the dataset case (if provided). */
  expectedToolCalls?: ExpectedToolCall[];
  /** The actual tool calls the agent made (from the run trace). */
  actualToolCalls?: ActualToolCall[];
  /** The full run trace steps. */
  steps?: RunStep[];
  /** The dataset case metadata. */
  metadata?: Record<string, unknown>;
}

export interface ActualToolCall {
  /** Tool name. */
  name: string;
  /** Tool arguments as JSON. */
  arguments: Record<string, unknown>;
  /** Tool result. */
  result: unknown;
  /** Order in which this tool was called (0-indexed). */
  order: number;
}

export interface GraderContext {
  /** Make an LLM call (for LLM-as-judge graders). Uses the experiment's judgeModel. */
  llm: (prompt: string) => Promise<string>;
  /** Compute embedding similarity between two strings. */
  embed: (a: string, b: string) => Promise<number>;
}

/**
 * Score result from a grader.
 * Maps to: eval_experiment_results.scores (ScoreResult JSONB values)
 */
export interface ScoreResult {
  /** Score between 0.0 (fail) and 1.0 (pass). */
  score: number;
  /** Grader name (for display). Maps to: ScoreResult.name */
  name: string;
  /** Grader type. Maps to: ScoreResult.graderType */
  graderType: string;
  /** LLM judge explanation (for llm_judge graders). Maps to: ScoreResult.reasoning */
  reasoning?: string;
  /** Additional metadata. Maps to: ScoreResult.metadata */
  metadata?: Record<string, unknown>;
}
```

### 8.6 Built-In Grader Factory Functions

```typescript
// packages/eval/src/graders/index.ts

/**
 * Exact string match. Score: 1.0 if output === expectedOutput, 0.0 otherwise.
 * Deterministic. Zero cost.
 *
 * Options:
 *   - caseSensitive: boolean (default: true)
 *   - trim: boolean (default: true) — trim whitespace before comparing
 *   - normalize: boolean (default: false) — normalize whitespace
 */
export function exactMatch(options?: {
  caseSensitive?: boolean;
  trim?: boolean;
  normalize?: boolean;
}): BuiltInGrader;

/**
 * JSON Schema validation. Score: 1.0 if output is valid JSON matching the schema, 0.0 otherwise.
 * Deterministic. Zero cost.
 *
 * @param schema - JSON Schema object to validate against
 */
export function jsonSchema(schema: Record<string, unknown>): BuiltInGrader;

/**
 * Regex match. Score: 1.0 if output matches the pattern, 0.0 otherwise.
 * Deterministic. Zero cost.
 *
 * @param pattern - Regex pattern (string or RegExp)
 * @param flags - Optional regex flags (e.g., "i" for case-insensitive)
 */
export function regex(pattern: string | RegExp, flags?: string): BuiltInGrader;

/**
 * Numeric threshold. Extracts a number from the output and checks it against a threshold.
 * Score: 1.0 if the extracted number meets the condition, 0.0 otherwise.
 * Deterministic. Zero cost.
 *
 * @param options - Comparison configuration
 */
export function numericThreshold(options: {
  /** Comparison operator */
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  /** Threshold value */
  value: number;
  /** Regex to extract the number from output. Default: first number found. */
  extractPattern?: string;
}): BuiltInGrader;

/**
 * Embedding similarity. Score: cosine similarity between output and expectedOutput embeddings.
 * Semantic. Costs: 2 embedding API calls per case.
 *
 * Uses the embedding model configured in the experiment (default: text-embedding-3-small).
 *
 * @param options - Similarity configuration
 */
export function embeddingSimilarity(options?: {
  /** Minimum similarity score to consider a pass. Default: 0.8 */
  threshold?: number;
}): BuiltInGrader;

/**
 * Tool name match. Score: proportion of expected tool names that were actually called.
 * Deterministic. Zero cost.
 *
 * Example: expected ["get_order", "send_email"], actual ["get_order"] → score 0.5
 *
 * @param options - Match configuration
 */
export function toolNameMatch(options?: {
  /** Require exact set match (no extra tools allowed). Default: false */
  strict?: boolean;
}): BuiltInGrader;

/**
 * Tool arguments match. Score: average similarity of expected vs actual tool arguments.
 * Deterministic. Zero cost.
 *
 * Compares each expected tool call's arguments against the actual arguments using
 * deep equality on the specified fields.
 */
export function toolArgsMatch(): BuiltInGrader;

/**
 * LLM-as-judge grader. Uses an LLM to score the output against a rubric.
 * Semantic. Costs: 1 LLM call per case (using the experiment's judgeModel).
 *
 * The judge model evaluates the output on a 0-1 scale based on the provided rubric.
 * Returns the score and the judge's reasoning.
 *
 * @param options - Judge configuration
 */
export function llmJudge(options: {
  /**
   * Scoring rubric. Describes what constitutes a good response.
   * This is included in the judge prompt.
   *
   * Example: "The response should accurately answer the customer's question
   *           about their order status, be polite, and not make up information."
   */
  rubric: string;

  /**
   * Scoring scale description. Default: "0.0 = completely wrong, 1.0 = perfect"
   */
  scale?: string;

  /**
   * Whether to include the input in the judge prompt. Default: true
   */
  includeInput?: boolean;

  /**
   * Whether to include the expected output in the judge prompt. Default: true if available
   */
  includeExpectedOutput?: boolean;

  /**
   * Custom judge prompt template. If provided, overrides the default prompt.
   * Use placeholders: {{input}}, {{output}}, {{expected_output}}, {{rubric}}
   */
  promptTemplate?: string;
}): BuiltInGrader;

/**
 * Trajectory match (tool sequence). Score: 1.0 if the agent called tools
 * in the expected order, 0.0 otherwise.
 * Deterministic. Zero cost.
 *
 * Compares the expected tool call sequence (from expectedToolCalls with order)
 * against the actual sequence from the run trace.
 *
 * @param options - Sequence match configuration
 */
export function trajectoryMatch(options?: {
  /** Allow extra tool calls between expected ones. Default: true */
  allowExtraCalls?: boolean;
}): BuiltInGrader;

/**
 * Unnecessary steps detector. Score: 1.0 minus (number of extra tool calls / total calls).
 * Penalizes the agent for making tool calls not in the expected set.
 * Deterministic. Zero cost.
 *
 * Example: expected 2 tool calls, agent made 5 → score = 1.0 - (3/5) = 0.4
 */
export function unnecessarySteps(): BuiltInGrader;
```

### 8.7 Custom Grader Interface

Developers can define custom graders as plain functions:

```typescript
// evals/graders.ts
import type { CustomGrader, GraderInput, GraderContext, ScoreResult } from "@agentsy/eval";

/**
 * Custom grader: checks that the agent's response mentions the order ID
 * from the input.
 */
export const mentionsOrderId: CustomGrader = {
  name: "mentions_order_id",
  type: "custom",
  fn: async (input: GraderInput): Promise<ScoreResult> => {
    // Extract order ID from the input
    const orderIdMatch = input.input.match(/order\s+#?(\w+)/i);
    if (!orderIdMatch) {
      return { score: 1.0, name: "mentions_order_id", graderType: "custom" };
    }

    const orderId = orderIdMatch[1];
    const mentioned = input.output.includes(orderId);

    return {
      score: mentioned ? 1.0 : 0.0,
      name: "mentions_order_id",
      graderType: "custom",
      reasoning: mentioned
        ? `Output mentions order ID ${orderId}`
        : `Output does not mention order ID ${orderId}`,
    };
  },
};

/**
 * Custom grader: uses the LLM judge to evaluate politeness.
 * Demonstrates using the context.llm() helper.
 */
export const politenessCheck: CustomGrader = {
  name: "politeness",
  type: "custom",
  fn: async (input: GraderInput, context: GraderContext): Promise<ScoreResult> => {
    const response = await context.llm(
      `Rate the politeness of this customer support response on a scale of 0 to 1.
       Response: "${input.output}"
       Return ONLY a JSON object: {"score": <number>, "reasoning": "<explanation>"}`
    );

    const result = JSON.parse(response);
    return {
      score: result.score,
      name: "politeness",
      graderType: "custom",
      reasoning: result.reasoning,
    };
  },
};
```

### 8.8 Experiment Results

```typescript
/**
 * Full experiment result. Returned by agentsyEval.run().
 * Maps to: eval_experiments + eval_experiment_results tables.
 */
export interface ExperimentResult {
  /** Experiment ID. Format: exp_... */
  id: string;

  /** Experiment name. */
  name: string;

  /** Status. */
  status: "completed" | "failed";

  /**
   * Summary scores — average of each grader across all cases.
   * Maps to: eval_experiments.summary_scores
   * Example: { "exact_match": 0.85, "llm_judge": 0.92, "politeness": 0.95 }
   */
  summaryScores: Record<string, number>;

  /** Total number of cases. Maps to: eval_experiments.total_cases */
  totalCases: number;

  /** Number of cases that passed all graders (score >= threshold). Maps to: eval_experiments.passed_cases */
  passedCases: number;

  /** Number of cases that failed at least one grader. Maps to: eval_experiments.failed_cases */
  failedCases: number;

  /** Total cost of the experiment in USD. Maps to: eval_experiments.total_cost_usd */
  totalCostUsd: number;

  /** Total duration in milliseconds. Maps to: eval_experiments.total_duration_ms */
  totalDurationMs: number;

  /** Per-case results. */
  results: CaseResult[];

  /** Error message if the experiment failed. */
  error?: string;

  /** ISO 8601 timestamps. */
  startedAt: string;
  completedAt: string;
}

/**
 * Result for a single case within an experiment.
 * Maps to: eval_experiment_results table.
 */
export interface CaseResult {
  /** Result ID. Format: exr_... */
  id: string;

  /** Case ID. Format: edc_... */
  caseId: string;

  /** Run ID for this case's agent execution. Format: run_... */
  runId: string;

  /** The original input. Maps to: eval_experiment_results.input (JSONB) */
  input: RunInput;

  /** The expected output (if provided). */
  expectedOutput?: string;

  /** The agent's actual output. Maps to: eval_experiment_results.output (JSONB) */
  output: RunOutput;

  /** Scores from all graders. Maps to: eval_experiment_results.scores */
  scores: Record<string, ScoreResult>;

  /** Whether the case passed all graders. Maps to: eval_experiment_results.passed */
  passed: boolean;

  /** Execution duration in ms. Maps to: eval_experiment_results.duration_ms */
  durationMs: number;

  /** Cost in USD. Maps to: eval_experiment_results.cost_usd */
  costUsd: number;

  /** Error if the case failed to execute. Maps to: eval_experiment_results.error */
  error?: string;
}
```

### 8.9 Comparison Results

```typescript
/**
 * Result of comparing two experiments.
 * Returned by agentsyEval.compare().
 */
export interface ComparisonResult {
  /** Baseline experiment summary. */
  baseline: {
    id: string;
    name: string;
    summaryScores: Record<string, number>;
    totalCases: number;
    passedCases: number;
  };

  /** Candidate experiment summary. */
  candidate: {
    id: string;
    name: string;
    summaryScores: Record<string, number>;
    totalCases: number;
    passedCases: number;
  };

  /** Summary score deltas. Positive = improvement, negative = regression. */
  scoreDeltas: Record<string, number>;

  /** Per-case diffs. */
  caseDiffs: CaseDiff[];

  /** Number of cases that improved. */
  improvements: number;

  /** Number of cases that regressed. */
  regressions: number;

  /** Number of cases unchanged. */
  unchanged: number;
}

export interface CaseDiff {
  /** Case ID. Format: edc_... */
  caseId: string;
  /** The input for context. Maps to: eval_dataset_cases.input (JSONB) */
  input: RunInput;
  /** Baseline scores for this case. */
  baselineScores: Record<string, number>;
  /** Candidate scores for this case. */
  candidateScores: Record<string, number>;
  /** Score deltas per grader. */
  deltas: Record<string, number>;
  /** Overall verdict. */
  verdict: "improved" | "regressed" | "unchanged";
}
```

---

## 9. Module 4: CLI (`@agentsy/cli`)

Built with Commander.js. Installed globally via `npm install -g @agentsy/cli` or used via `npx @agentsy/cli`.

### 9.1 Package Entry Point

```typescript
// packages/cli/src/index.ts
import { Command } from "commander";

const program = new Command()
  .name("agentsy")
  .description("The Agentsy CLI — build, test, and deploy AI agents")
  .version(CLI_VERSION);

// Register all commands
program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(evalCommand);
program.addCommand(logsCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(rollbackCommand);
program.addCommand(secretsCommand);

program.parse();
```

### 9.2 `agentsy init` — Project Scaffolding

Scaffolds a new Agentsy project with the selected template. Creates all files, installs dependencies, and optionally runs `agentsy login`.

```typescript
// packages/cli/src/commands/init.ts

interface InitOptions {
  /** Project template. Default: "basic" */
  template: "basic" | "with-eval" | "with-knowledge";
  /** Package manager. Default: auto-detected */
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  /** Skip dependency installation. Default: false */
  skipInstall?: boolean;
  /** Target directory. Default: current directory */
  directory?: string;
}

/**
 * agentsy init [directory]
 *
 * Options:
 *   -t, --template <template>    Project template (basic, with-eval, with-knowledge) [default: basic]
 *   -p, --package-manager <pm>   Package manager (npm, pnpm, yarn, bun)
 *   --skip-install               Skip npm install
 *
 * Behavior:
 *   1. Prompts for project name if not provided
 *   2. Creates directory structure (see Section 3)
 *   3. Generates agentsy.config.ts with template-specific content
 *   4. Generates tools/ with example tool files
 *   5. Generates evals/ with starter dataset (if template includes eval)
 *   6. Generates knowledge/ with sample docs (if template includes knowledge)
 *   7. Creates .env.example, .gitignore, package.json, tsconfig.json
 *   8. Installs dependencies (@agentsy/sdk, @agentsy/eval, zod, typescript)
 *   9. Prints next steps
 */
const initCommand = new Command("init")
  .description("Scaffold a new Agentsy agent project")
  .argument("[directory]", "Target directory for the project")
  .option("-t, --template <template>", "Project template", "basic")
  .option("-p, --package-manager <pm>", "Package manager to use")
  .option("--skip-install", "Skip dependency installation")
  .action(async (directory, options: InitOptions) => { /* ... */ });
```

### 9.3 `agentsy dev` — Local Development Server

Starts a local development server with a SQLite backend, built-in trace viewer, and agent playground.

```typescript
// packages/cli/src/commands/dev.ts

interface DevOptions {
  /** Port for the dev server. Default: 4321 (or AGENTSY_DEV_PORT env var) */
  port: number;
  /** Config file path. Default: agentsy.config.ts */
  config: string;
  /** Enable verbose logging. Default: false */
  verbose: boolean;
}

/**
 * agentsy dev
 *
 * Options:
 *   -p, --port <port>      Dev server port [default: 4321]
 *   -c, --config <path>    Path to agentsy.config.ts [default: agentsy.config.ts]
 *   -v, --verbose          Enable verbose logging
 *
 * Behavior:
 *   1. Loads and validates agentsy.config.ts
 *   2. Initializes SQLite database (in-memory or .agentsy/dev.db)
 *   3. Starts the agent runtime (agentic loop) in local mode
 *   4. Starts a local HTTP API server (same endpoints as the platform)
 *   5. Starts a web UI at http://localhost:{port} with:
 *      - Agent playground (chat interface)
 *      - Trace viewer (real-time, shows every step)
 *      - Run history
 *   6. Watches agentsy.config.ts and tools/ for changes (hot reload in P1)
 *   7. LLM calls go directly to providers (user's API keys, no Agentsy proxy)
 *
 * Local API endpoints (same shape as platform):
 *   POST http://localhost:{port}/v1/agents/{slug}/run
 *   GET  http://localhost:{port}/v1/runs
 *   GET  http://localhost:{port}/v1/runs/{runId}/trace
 */
const devCommand = new Command("dev")
  .description("Start local development server with trace viewer")
  .option("-p, --port <port>", "Dev server port", "4321")
  .option("-c, --config <path>", "Config file path", "agentsy.config.ts")
  .option("-v, --verbose", "Verbose logging")
  .action(async (options: DevOptions) => { /* ... */ });
```

### 9.4 `agentsy deploy` — Deploy to Platform

Deploys the agent to the Agentsy platform. Creates a new immutable agent version.

```typescript
// packages/cli/src/commands/deploy.ts

interface DeployOptions {
  /** Target environment. Default: "production" */
  env: "development" | "staging" | "production";
  /** Config file path. Default: agentsy.config.ts */
  config: string;
  /** Version description / changelog. */
  message?: string;
  /** Skip confirmation prompt. */
  yes: boolean;
  /** Dry run — validate and show diff without deploying. */
  dryRun: boolean;
}

/**
 * agentsy deploy
 *
 * Options:
 *   -e, --env <environment>   Target environment (development, staging, production) [default: production]
 *   -c, --config <path>       Config file path [default: agentsy.config.ts]
 *   -m, --message <message>   Version description / changelog
 *   -y, --yes                 Skip confirmation prompt
 *   --dry-run                 Validate and show diff without deploying
 *
 * Behavior:
 *   1. Loads and validates agentsy.config.ts
 *   2. Resolves dynamic system prompt (calls it with stub context for validation)
 *   3. Serializes agent config to API format (tools → ToolsConfig JSON, etc.)
 *   4. Calls POST /v1/agents (create or update agent record)
 *   5. Calls POST /v1/agents/{id}/versions (creates new agent_versions row)
 *   6. Calls POST /v1/deployments (creates deployment, supersedes previous active)
 *   7. Prints: agent ID, version number, environment, API endpoint URL
 *
 * Output:
 *   ✓ Deployed support-agent v3 to production
 *   → API: https://api.agentsy.com/v1/agents/ag_kP9xW2nM5vBz/run
 *   → Dashboard: https://app.agentsy.com/agents/ag_kP9xW2nM5vBz
 */
const deployCommand = new Command("deploy")
  .description("Deploy agent to the Agentsy platform")
  .option("-e, --env <environment>", "Target environment", "production")
  .option("-c, --config <path>", "Config file path", "agentsy.config.ts")
  .option("-m, --message <message>", "Version description")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--dry-run", "Validate without deploying")
  .action(async (options: DeployOptions) => { /* ... */ });
```

### 9.5 `agentsy eval run` — Run Eval Suite

Runs experiments defined in the project's `evals/` directory.

```typescript
// packages/cli/src/commands/eval.ts

interface EvalRunOptions {
  /** Dataset name or path. Default: all datasets in evals/ */
  dataset?: string;
  /** Config file path. Default: agentsy.config.ts */
  config: string;
  /** Tool mode for eval. Default: "mock" */
  toolMode: "mock" | "dry-run" | "live";
  /** Parallelism. Default: 5 */
  parallelism: number;
  /** Compare against stored baseline. Default: true */
  compareBaseline: boolean;
  /** Regression threshold — exit code 1 if any grader drops by more than this. Default: 0.05 */
  regressionThreshold: number;
  /** Output format. Default: "table" */
  format: "table" | "json" | "markdown";
  /** Run against the platform (deployed agent) instead of locally. Default: false */
  remote: boolean;
  /** Verbose output — show per-case details. */
  verbose: boolean;
}

/**
 * agentsy eval run
 *
 * Options:
 *   -d, --dataset <name>              Dataset to run (default: all)
 *   -c, --config <path>               Config file path [default: agentsy.config.ts]
 *   -t, --tool-mode <mode>            Tool mode: mock, dry-run, live [default: mock]
 *   -p, --parallelism <n>             Parallel case execution [default: 5]
 *   --no-compare-baseline             Skip baseline comparison
 *   --regression-threshold <n>        Max allowed score drop [default: 0.05]
 *   -f, --format <format>             Output: table, json, markdown [default: table]
 *   --remote                          Run against deployed agent
 *   -v, --verbose                     Show per-case details
 *
 * Output (table format):
 *
 *   Experiment: support-agent-eval-2026-03-19T10:30:00Z
 *   Dataset: golden (25 cases)
 *   Tool mode: mock
 *
 *   ┌──────────────────────┬─────────┬──────────┬────────┐
 *   │ Grader               │ Score   │ Baseline │ Delta  │
 *   ├──────────────────────┼─────────┼──────────┼────────┤
 *   │ exact_match          │ 0.920   │ 0.880    │ +0.040 │
 *   │ llm_judge            │ 0.945   │ 0.960    │ -0.015 │
 *   │ tool_name_match      │ 1.000   │ 1.000    │  0.000 │
 *   │ politeness           │ 0.970   │ 0.950    │ +0.020 │
 *   └──────────────────────┴─────────┴──────────┴────────┘
 *
 *   Passed: 23/25 (92%) | Cost: $0.42 | Duration: 34s
 *   Baseline: 22/25 (88%) → +1 improvement, 0 regressions
 *
 * Exit codes:
 *   0 — All cases passed, no regressions beyond threshold
 *   1 — Regression detected (per PRD R-4.11, CI integration)
 *   2 — Experiment failed to run (config error, network error)
 */
const evalRunCommand = new Command("run")
  .description("Run eval experiments")
  .option("-d, --dataset <name>", "Dataset to run")
  .option("-c, --config <path>", "Config file path", "agentsy.config.ts")
  .option("-t, --tool-mode <mode>", "Tool mode", "mock")
  .option("-p, --parallelism <n>", "Parallel cases", "5")
  .option("--no-compare-baseline", "Skip baseline comparison")
  .option("--regression-threshold <n>", "Max score drop", "0.05")
  .option("-f, --format <format>", "Output format", "table")
  .option("--remote", "Run against deployed agent")
  .option("-v, --verbose", "Verbose output")
  .action(async (options: EvalRunOptions) => { /* ... */ });
```

### 9.6 `agentsy eval compare` — Compare Experiments

```typescript
// packages/cli/src/commands/eval-compare.ts

interface EvalCompareOptions {
  /** Output format. Default: "table" */
  format: "table" | "json" | "markdown";
  /** Show only cases that changed. Default: false */
  onlyDiffs: boolean;
}

/**
 * agentsy eval compare <baseline-id> <candidate-id>
 *
 * Arguments:
 *   baseline-id    — Experiment ID (exp_...) or name of the baseline
 *   candidate-id   — Experiment ID (exp_...) or name of the candidate
 *
 * Options:
 *   -f, --format <format>     Output: table, json, markdown [default: table]
 *   --only-diffs              Show only changed cases
 *
 * Output:
 *
 *   Comparing: support-agent-eval-v2 (baseline) vs support-agent-eval-v3 (candidate)
 *
 *   Summary:
 *     Improvements: 3 cases
 *     Regressions:  1 case
 *     Unchanged:    21 cases
 *
 *   ┌───────┬────────────────────────────────┬──────────────┬──────────────┬─────────┐
 *   │ Case  │ Input (truncated)              │ Baseline     │ Candidate    │ Verdict │
 *   ├───────┼────────────────────────────────┼──────────────┼──────────────┼─────────┤
 *   │ #3    │ "Where is my order #12345?"    │ 0.80         │ 1.00         │ ↑       │
 *   │ #7    │ "I want a refund for..."       │ 1.00         │ 0.60         │ ↓       │
 *   │ #12   │ "Can you help me with..."      │ 0.70         │ 0.90         │ ↑       │
 *   │ #19   │ "What's your return policy?"   │ 0.85         │ 1.00         │ ↑       │
 *   └───────┴────────────────────────────────┴──────────────┴──────────────┴─────────┘
 */
const evalCompareCommand = new Command("compare")
  .description("Compare two eval experiments")
  .argument("<baseline-id>", "Baseline experiment ID or name")
  .argument("<candidate-id>", "Candidate experiment ID or name")
  .option("-f, --format <format>", "Output format", "table")
  .option("--only-diffs", "Show only changed cases")
  .action(async (baselineId, candidateId, options: EvalCompareOptions) => { /* ... */ });

// Parent eval command
const evalCommand = new Command("eval")
  .description("Evaluation commands");
evalCommand.addCommand(evalRunCommand);
evalCommand.addCommand(evalCompareCommand);
```

### 9.7 `agentsy logs` — Tail Run Logs

```typescript
// packages/cli/src/commands/logs.ts

interface LogsOptions {
  /** Agent slug or ID to filter by. */
  agent?: string;
  /** Run status to filter by. */
  status?: "completed" | "failed" | "running" | "timeout";
  /** Number of recent runs to show. Default: 20 */
  limit: number;
  /** Follow mode — continuously stream new runs. Default: false */
  follow: boolean;
  /** Environment to filter by. Default: "production" */
  env: "development" | "staging" | "production";
}

/**
 * agentsy logs
 *
 * Options:
 *   -a, --agent <name>      Filter by agent name or ID
 *   -s, --status <status>   Filter by status
 *   -n, --limit <n>         Number of runs [default: 20]
 *   -f, --follow            Stream new runs in real-time
 *   -e, --env <env>         Environment [default: production]
 *
 * Output:
 *
 *   run_hT2cF8nM6jLz  support-agent  completed  1.2s  $0.003  2 min ago
 *   run_xW4bN7kP9vRm  support-agent  failed     0.8s  $0.001  5 min ago
 *   run_qJ3tY8cF6hNm  triage-agent   completed  3.4s  $0.012  12 min ago
 */
const logsCommand = new Command("logs")
  .description("View recent agent run logs")
  .option("-a, --agent <name>", "Filter by agent")
  .option("-s, --status <status>", "Filter by status")
  .option("-n, --limit <n>", "Number of runs", "20")
  .option("-f, --follow", "Stream new runs")
  .option("-e, --env <env>", "Environment", "production")
  .action(async (options: LogsOptions) => { /* ... */ });
```

### 9.8 `agentsy login` / `agentsy logout` — Authentication

```typescript
// packages/cli/src/commands/auth.ts

/**
 * agentsy login
 *
 * Behavior:
 *   1. Opens the default browser to https://app.agentsy.com/cli-auth
 *   2. User authenticates via Better Auth (email, Google, GitHub)
 *   3. Browser redirects to localhost callback with auth token
 *   4. CLI stores the token in ~/.agentsy/credentials.json
 *   5. Prints: "Logged in as user@example.com (Acme Corp)"
 *
 * Alternative (for CI/headless):
 *   agentsy login --token <api-key>
 *   Stores the provided API key directly.
 *
 * Options:
 *   --token <key>   Authenticate with API key (for CI)
 */
const loginCommand = new Command("login")
  .description("Authenticate with the Agentsy platform")
  .option("--token <key>", "API key for CI authentication")
  .action(async (options) => { /* ... */ });

/**
 * agentsy logout
 *
 * Behavior:
 *   1. Removes ~/.agentsy/credentials.json
 *   2. Prints: "Logged out"
 */
const logoutCommand = new Command("logout")
  .description("Remove stored credentials")
  .action(async () => { /* ... */ });
```

### 9.9 `agentsy rollback` — Rollback Deployment

```typescript
// packages/cli/src/commands/rollback.ts

interface RollbackOptions {
  /** Target environment. Default: "production" */
  env: "development" | "staging" | "production";
  /** Version number to rollback to. Default: previous version. */
  version?: number;
  /** Skip confirmation prompt. */
  yes: boolean;
}

/**
 * agentsy rollback <agent-name>
 *
 * Arguments:
 *   agent-name   — Agent slug or ID
 *
 * Options:
 *   -e, --env <env>        Target environment [default: production]
 *   -v, --version <n>      Target version number (default: previous version)
 *   -y, --yes              Skip confirmation
 *
 * Behavior:
 *   1. Fetches current and previous deployments for the agent + environment
 *   2. Shows diff between current and target version (prompt changes, model changes)
 *   3. Prompts for confirmation (unless --yes)
 *   4. Creates a new deployment pointing to the target version
 *   5. Prints: "Rolled back support-agent to v2 in production"
 */
const rollbackCommand = new Command("rollback")
  .description("Rollback an agent to a previous version")
  .argument("<agent-name>", "Agent name or ID")
  .option("-e, --env <env>", "Target environment", "production")
  .option("-v, --version <n>", "Target version number")
  .option("-y, --yes", "Skip confirmation")
  .action(async (agentName, options: RollbackOptions) => { /* ... */ });
```

### 9.10 `agentsy secrets` — Secrets Management

```typescript
// packages/cli/src/commands/secrets.ts

/**
 * agentsy secrets set <key> <value>
 *
 * Options:
 *   -e, --env <env>   Environment scope [default: production]
 *
 * Behavior:
 *   1. Sends the value to the Agentsy API, which encrypts it (AES-256-GCM) and stores it in PostgreSQL
 *   2. Creates a tenant_secrets row with the encrypted value
 *   3. Prints: "Secret GITHUB_TOKEN set for production"
 */
const secretsSetCommand = new Command("set")
  .description("Set a secret value")
  .argument("<key>", "Secret key name")
  .argument("<value>", "Secret value")
  .option("-e, --env <env>", "Environment", "production")
  .action(async (key, value, options) => { /* ... */ });

/**
 * agentsy secrets get <key>
 *
 * Options:
 *   -e, --env <env>   Environment scope [default: production]
 *
 * Behavior:
 *   Shows the secret metadata (name, environment, last rotated, last accessed) but NEVER the value.
 *   Secrets are write-only. Plaintext values cannot be retrieved after creation.
 *   To change a secret, use `agentsy secrets set` to overwrite it.
 *
 * Output:
 *   Key:            GITHUB_TOKEN
 *   Environment:    production
 *   Last rotated:   2026-03-15T10:30:00Z
 *   Last accessed:  2026-03-19T14:32:48Z
 *   Created:        2026-03-01T00:00:00Z
 */
const secretsGetCommand = new Command("get")
  .description("Get secret metadata (value is never shown)")
  .argument("<key>", "Secret key name")
  .option("-e, --env <env>", "Environment", "production")
  .action(async (key, options) => { /* ... */ });

/**
 * agentsy secrets list
 *
 * Options:
 *   -e, --env <env>   Filter by environment
 *
 * Output:
 *   ┌──────────────────┬──────────────┬──────────────────────┐
 *   │ Key              │ Environment  │ Last Rotated         │
 *   ├──────────────────┼──────────────┼──────────────────────┤
 *   │ GITHUB_TOKEN     │ production   │ 2026-03-15T10:00:00Z │
 *   │ SALESFORCE_KEY   │ production   │ 2026-03-01T08:00:00Z │
 *   │ SLACK_WEBHOOK    │ staging      │ 2026-02-20T14:00:00Z │
 *   └──────────────────┴──────────────┴──────────────────────┘
 */
const secretsListCommand = new Command("list")
  .description("List all secrets")
  .option("-e, --env <env>", "Filter by environment")
  .action(async (options) => { /* ... */ });

// Parent command
const secretsCommand = new Command("secrets")
  .description("Manage secrets");
secretsCommand.addCommand(secretsSetCommand);
secretsCommand.addCommand(secretsGetCommand);
secretsCommand.addCommand(secretsListCommand);
```

---

## 10. Error Types

All SDK packages share a common error hierarchy. Errors are thrown by the Client SDK and surfaced in CLI output.

```typescript
// packages/shared/src/errors.ts

/**
 * Base error class for all Agentsy errors.
 * All SDK errors extend this class.
 */
export class AgentsyError extends Error {
  /** Machine-readable error code (e.g., "rate_limit_exceeded", "agent_not_found") */
  readonly code: string;
  /** HTTP status code (if the error originated from an API response) */
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "AgentsyError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Authentication or authorization failure.
 * HTTP 401 or 403.
 */
export class AuthenticationError extends AgentsyError {
  constructor(message: string = "Invalid or expired API key") {
    super(message, "authentication_error", 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Rate limit exceeded.
 * HTTP 429. Includes retry-after information.
 */
export class RateLimitError extends AgentsyError {
  /** Seconds until the rate limit resets */
  readonly retryAfter?: number;

  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message, "rate_limit_exceeded", 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Resource not found.
 * HTTP 404.
 */
export class NotFoundError extends AgentsyError {
  constructor(message: string = "Resource not found") {
    super(message, "not_found", 404);
    this.name = "NotFoundError";
  }
}

/**
 * Validation error — bad request payload.
 * HTTP 400 or 422.
 */
export class ValidationError extends AgentsyError {
  constructor(message: string, code: string = "validation_error") {
    super(message, code, 422);
    this.name = "ValidationError";
  }
}

/**
 * Request or agent run timed out.
 * HTTP 408 or agent guardrail timeout.
 */
export class TimeoutError extends AgentsyError {
  constructor(message: string = "Request timed out") {
    super(message, "timeout", 408);
    this.name = "TimeoutError";
  }
}

/**
 * Server error on the Agentsy platform.
 * HTTP 500, 502, 503, 504.
 */
export class ServerError extends AgentsyError {
  constructor(message: string = "Internal server error", status: number = 500) {
    super(message, "server_error", status);
    this.name = "ServerError";
  }
}

/**
 * Network error — failed to reach the Agentsy API.
 * No HTTP status (connection refused, DNS failure, etc.).
 */
export class NetworkError extends AgentsyError {
  constructor(message: string = "Network error") {
    super(message, "network_error");
    this.name = "NetworkError";
  }
}

/**
 * Agent execution error — the agent run failed.
 * Contains the run ID for debugging.
 */
export class AgentRunError extends AgentsyError {
  /** Run ID for debugging. Format: run_... */
  readonly runId: string;
  /** Trace ID for observability. */
  readonly traceId?: string;

  constructor(message: string, runId: string, traceId?: string) {
    super(message, "agent_run_error");
    this.name = "AgentRunError";
    this.runId = runId;
    this.traceId = traceId;
  }
}

/**
 * Eval execution error — an experiment failed to run.
 */
export class EvalError extends AgentsyError {
  /** Experiment ID if available. Format: exp_... */
  readonly experimentId?: string;

  constructor(message: string, experimentId?: string) {
    super(message, "eval_error");
    this.name = "EvalError";
    this.experimentId = experimentId;
  }
}
```

### Error Hierarchy Diagram

```
AgentsyError
├── AuthenticationError     (401, 403)
├── RateLimitError          (429)
├── NotFoundError           (404)
├── ValidationError         (400, 422)
├── TimeoutError            (408)
├── ServerError             (500, 502, 503, 504)
├── NetworkError            (no HTTP status)
├── AgentRunError           (agent execution failure)
└── EvalError               (experiment failure)
```

---

## 11. Code Examples

### 11.1 Basic Agent (Customer Support)

```typescript
// agentsy.config.ts
import { agentsy } from "@agentsy/sdk";
import { z } from "zod";

const getOrder = agentsy.defineTool({
  name: "get_order",
  description: "Look up a customer order by order ID",
  input: z.object({
    orderId: z.string().describe("The order ID (e.g., ORD-12345)"),
  }),
  output: z.object({
    id: z.string(),
    status: z.enum(["pending", "shipped", "delivered", "cancelled"]),
    total: z.number(),
    items: z.array(z.object({ name: z.string(), quantity: z.number() })),
    shippedAt: z.string().nullable(),
    trackingUrl: z.string().nullable(),
  }),
  execute: async ({ orderId }, ctx) => {
    const apiKey = await ctx.getSecret("ORDERS_API_KEY");
    const res = await ctx.fetch(`https://api.acme.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Order API returned ${res.status}`);
    return res.json();
  },
});

export default agentsy.defineAgent({
  slug: "support-agent",
  description: "Customer support agent for Acme Corp",
  model: "claude-sonnet-4",
  fallbackModel: "gpt-4o",
  systemPrompt: `You are a customer support agent for Acme Corp.
You help customers check order status, answer questions about products,
and resolve issues. Be friendly, concise, and accurate.
Never make up information — if you don't know, say so.
Always refer to the customer by name if available.`,
  tools: [getOrder],
  guardrails: {
    maxIterations: 10,
    maxTokens: 50_000,
    timeoutMs: 300_000,
    outputValidation: [{ type: "no_pii" }],
  },
  memory: {
    sessionHistory: { maxMessages: 20 },
  },
  modelParams: {
    temperature: 0.7,
  },
});
```

### 11.2 Agent with Multiple Tools

```typescript
// tools/index.ts
import { agentsy } from "@agentsy/sdk";
import { z } from "zod";

export const getOrder = agentsy.defineTool({
  name: "get_order",
  description: "Look up a customer order by order ID",
  input: z.object({ orderId: z.string() }),
  execute: async ({ orderId }, ctx) => {
    const apiKey = await ctx.getSecret("ORDERS_API_KEY");
    const res = await ctx.fetch(`https://api.acme.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.json();
  },
});

export const getRefundPolicy = agentsy.defineTool({
  name: "get_refund_policy",
  description: "Get the refund policy for a product category",
  input: z.object({
    category: z.string().describe("Product category (e.g., 'electronics', 'clothing')"),
  }),
  execute: async ({ category }) => {
    const policies: Record<string, string> = {
      electronics: "30-day return window. Must be unopened. Full refund.",
      clothing: "60-day return window. Must have tags. Full refund or exchange.",
      default: "14-day return window. Contact support for details.",
    };
    return { policy: policies[category] ?? policies.default };
  },
});

export const initiateRefund = agentsy.defineTool({
  name: "initiate_refund",
  description: "Initiate a refund for an order. Requires order ID and reason.",
  input: z.object({
    orderId: z.string(),
    reason: z.string().describe("Customer's reason for the refund"),
    amount: z.number().optional().describe("Partial refund amount. Omit for full refund."),
  }),
  output: z.object({
    refundId: z.string(),
    status: z.enum(["pending", "approved", "rejected"]),
    amount: z.number(),
  }),
  execute: async ({ orderId, reason, amount }, ctx) => {
    const apiKey = await ctx.getSecret("ORDERS_API_KEY");
    const res = await ctx.fetch("https://api.acme.com/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId, reason, amount }),
    });
    return res.json();
  },
});

// MCP server connection for Salesforce
export const salesforce = {
  type: "mcp" as const,
  name: "salesforce",
  description: "Salesforce CRM tools — search accounts, get contacts, update cases",
  serverUrl: "https://mcp.salesforce.com/v1",
  transport: "streamable-http" as const,
  headers: {
    Authorization: "Bearer ${secret:SALESFORCE_TOKEN}",
  },
};
```

```typescript
// agentsy.config.ts
import { agentsy } from "@agentsy/sdk";
import { getOrder, getRefundPolicy, initiateRefund, salesforce } from "./tools";

export default agentsy.defineAgent({
  slug: "support-agent",
  model: "claude-sonnet-4",
  systemPrompt: `You are a customer support agent for Acme Corp.
You can look up orders, check refund policies, initiate refunds,
and access the Salesforce CRM for customer account information.`,
  tools: [getOrder, getRefundPolicy, initiateRefund, salesforce],
  guardrails: {
    maxIterations: 15,
    maxTokens: 80_000,
    timeoutMs: 300_000,
    outputValidation: [
      { type: "no_pii" },
      { type: "on_topic", config: { topics: ["customer support", "orders", "refunds", "accounts"] } },
    ],
  },
});
```

### 11.3 Agent with Knowledge Base

```typescript
// agentsy.config.ts
import { agentsy } from "@agentsy/sdk";

export default agentsy.defineAgent({
  slug: "docs-agent",
  description: "Answers questions based on product documentation",
  model: "claude-sonnet-4",
  systemPrompt: ({ currentDate }) =>
    `You are a helpful assistant that answers questions about Acme Corp's products.
Use the knowledge base to find accurate answers. Today is ${currentDate}.
If the knowledge base doesn't contain the answer, say "I don't have that information
in my documentation. Please contact support@acme.com."`,
  tools: [],
  memory: {
    knowledgeBases: ["product-docs", "faq"],
    retrievalTopK: 8,
    retrievalMinScore: 0.75,
    sessionHistory: { maxMessages: 10 },
  },
  guardrails: {
    maxIterations: 5,
    maxTokens: 30_000,
  },
  modelParams: {
    temperature: 0.3, // Lower temperature for factual Q&A
  },
});
```

```typescript
// scripts/upload-docs.ts — One-time script to populate the knowledge base
import { AgentsyClient } from "@agentsy/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
});

async function uploadDocs() {
  // Create the knowledge base
  const kb = await client.knowledgeBases.create({
    agentId: "ag_kP9xW2nM5vBz",
    name: "product-docs",
    description: "Acme Corp product documentation",
    chunkSize: 512,
    chunkOverlap: 64,
  });

  console.log(`Created knowledge base: ${kb.id}`);

  // Upload all markdown files from docs/
  const docsDir = join(__dirname, "../knowledge");
  const files = readdirSync(docsDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const content = readFileSync(join(docsDir, file));
    await client.knowledgeBases.upload(kb.id, {
      fileName: file,
      content: new Blob([content], { type: "text/markdown" }),
      contentType: "text/markdown",
    });
    console.log(`Uploaded: ${file}`);
  }
}

uploadDocs().catch(console.error);
```

### 11.4 Running Evals

```json
// evals/datasets/golden.json
{
  "name": "golden",
  "description": "Golden dataset for support agent evaluation",
  "cases": [
    {
      "input": "Where is my order #ORD-12345?",
      "expectedOutput": "Your order #ORD-12345 has been shipped",
      "expectedToolCalls": [
        { "name": "get_order", "arguments": { "orderId": "ORD-12345" }, "order": 0 }
      ],
      "mockedToolResults": [
        {
          "toolName": "get_order",
          "result": {
            "id": "ORD-12345",
            "status": "shipped",
            "total": 79.99,
            "items": [{ "name": "Widget Pro", "quantity": 1 }],
            "shippedAt": "2026-03-17T10:00:00Z",
            "trackingUrl": "https://track.example.com/ABC123"
          }
        }
      ]
    },
    {
      "input": "I want a refund for order #ORD-67890. The product was damaged.",
      "expectedToolCalls": [
        { "name": "get_order", "arguments": { "orderId": "ORD-67890" }, "order": 0 },
        { "name": "initiate_refund", "order": 1 }
      ],
      "mockedToolResults": [
        {
          "toolName": "get_order",
          "result": {
            "id": "ORD-67890",
            "status": "delivered",
            "total": 149.99,
            "items": [{ "name": "Gadget X", "quantity": 1 }],
            "shippedAt": "2026-03-10T10:00:00Z",
            "trackingUrl": null
          }
        },
        {
          "toolName": "initiate_refund",
          "result": {
            "refundId": "REF-001",
            "status": "approved",
            "amount": 149.99
          }
        }
      ],
      "metadata": { "category": "refund", "priority": "high" }
    },
    {
      "input": "What's your return policy for electronics?",
      "expectedOutput": "30-day return window",
      "expectedToolCalls": [
        { "name": "get_refund_policy", "arguments": { "category": "electronics" }, "order": 0 }
      ],
      "mockedToolResults": [
        {
          "toolName": "get_refund_policy",
          "result": { "policy": "30-day return window. Must be unopened. Full refund." }
        }
      ]
    }
  ]
}
```

```typescript
// evals/experiment.ts
import { agentsyEval, exactMatch, llmJudge, toolNameMatch, trajectoryMatch } from "@agentsy/eval";
import agentConfig from "../agentsy.config";
import goldenDataset from "./datasets/golden.json";

const dataset = agentsyEval.defineDataset(goldenDataset);

const experiment = agentsyEval.defineExperiment({
  name: "support-agent-eval",
  agent: agentConfig,
  dataset,
  toolMode: "mock",
  parallelism: 5,
  judgeModel: "claude-sonnet-4",
  graders: [
    exactMatch({ caseSensitive: false, trim: true }),
    llmJudge({
      rubric: `The response should:
1. Accurately reflect the data returned by tools
2. Be helpful and address the customer's question directly
3. Be polite and professional
4. Not make up information not provided by tools`,
    }),
    toolNameMatch(),
    trajectoryMatch({ allowExtraCalls: true }),
  ],
});

// Run programmatically
async function main() {
  const result = await agentsyEval.run(experiment);

  console.log(`Passed: ${result.passedCases}/${result.totalCases}`);
  console.log(`Cost: $${result.totalCostUsd.toFixed(4)}`);

  for (const [grader, score] of Object.entries(result.summaryScores)) {
    console.log(`  ${grader}: ${score.toFixed(3)}`);
  }

  // Exit with code 1 if any case failed (for CI)
  if (result.failedCases > 0) {
    process.exit(1);
  }
}

main();
```

### 11.5 Streaming in a Next.js App

```typescript
// app/api/chat/route.ts (Next.js Route Handler)
import { AgentsyClient } from "@agentsy/client";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
});

export async function POST(request: Request) {
  const { message, sessionId } = await request.json();

  const stream = await client.agents.stream("support-agent", message, {
    sessionId,
  });

  // Convert Agentsy stream to a ReadableStream for the Response
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          // Send each event as an SSE message
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

```tsx
// app/components/Chat.tsx (React Client Component)
"use client";

import { useState, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function Chat({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);

    // Add an empty assistant message to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, sessionId }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

          const event = JSON.parse(line.slice(6));

          switch (event.type) {
            case "text_delta":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.delta,
                };
                return updated;
              });
              break;

            case "run_complete":
              // Capture session ID for multi-turn
              if (event.output.sessionId) {
                setSessionId(event.output.sessionId);
              }
              break;

            case "error":
              console.error("Stream error:", event.error);
              break;
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, sessionId]);

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i} data-role={msg.role}>
            <strong>{msg.role === "user" ? "You" : "Agent"}:</strong>
            <p>{msg.content}</p>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### 11.6 Sync Agent Call (Simple)

```typescript
// Simplest possible usage — one-shot agent call
import { AgentsyClient } from "@agentsy/client";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
});

const result = await client.agents.run("support-agent", "Where is my order #ORD-12345?");

console.log(result.output);
// → { type: "text", text: "Your order #ORD-12345 has been shipped and is currently in transit..." }

// Extract the text content:
if (result.output.type === "text") {
  console.log(result.output.text);
}

console.log(`Cost: $${result.usage.costUsd}`);
console.log(`Duration: ${result.durationMs}ms`);
console.log(`Trace: ${result.traceId}`);
```

### 11.7 Async Agent Execution with Polling

```typescript
import { AgentsyClient } from "@agentsy/client";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
});

// Start async run
const { id: runId } = await client.agents.runAsync(
  "research-agent",
  "Analyze all customer feedback from last quarter and summarize trends"
);

console.log(`Run started: ${runId}`);

// Poll until complete
const result = await client.runs.poll(runId, {
  intervalMs: 2000,
  timeoutMs: 600_000, // 10 minute timeout for long research
  onPoll: (status) => {
    console.log(`Status: ${status.status}, Progress: ${status.progress ?? "unknown"}%`);
  },
});

console.log(result.output);
```

### 11.8 Error Handling

```typescript
import {
  AgentsyClient,
  AgentsyError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  TimeoutError,
} from "@agentsy/client";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
  maxRetries: 3,
});

try {
  const result = await client.agents.run("support-agent", "Hello");
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error("Invalid API key. Check AGENTSY_API_KEY.");
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s.`);
  } else if (error instanceof NotFoundError) {
    console.error("Agent not found. Check the agent name or ID.");
  } else if (error instanceof TimeoutError) {
    console.error("Agent timed out. Consider increasing timeoutMs.");
  } else if (error instanceof AgentsyError) {
    console.error(`Agentsy error [${error.code}]: ${error.message}`);
  } else {
    throw error; // Unknown error, re-throw
  }
}
```

### 11.9 Multi-Turn Conversation

```typescript
import { AgentsyClient } from "@agentsy/client";

const client = new AgentsyClient({
  apiKey: process.env.AGENTSY_API_KEY!,
});

// Create a session
const session = await client.sessions.create({
  agentId: "ag_kP9xW2nM5vBz",
  metadata: {
    userId: "user-456",
    channel: "web",
  },
});

// Turn 1
const turn1 = await client.agents.run("support-agent", "I need help with my recent order", {
  sessionId: session.id,
});
console.log("Agent:", turn1.output);

// Turn 2 — agent remembers context from turn 1
const turn2 = await client.agents.run("support-agent", "The order number is ORD-12345", {
  sessionId: session.id,
});
console.log("Agent:", turn2.output);

// Turn 3 — agent has full context
const turn3 = await client.agents.run("support-agent", "Can I get a refund?", {
  sessionId: session.id,
});
console.log("Agent:", turn3.output);
```

### 11.10 CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/eval.yml
name: Agent Eval

on:
  pull_request:
    paths:
      - "agentsy.config.ts"
      - "tools/**"
      - "evals/**"

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - run: npm install

      - name: Run agent eval
        env:
          AGENTSY_API_KEY: ${{ secrets.AGENTSY_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx agentsy eval run --format markdown --regression-threshold 0.05

      - name: Post results to PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            // The CLI writes markdown output to stdout
            // Parse and post as PR comment
            // (implementation details omitted for brevity)
```

---

## 12. Versioning Strategy

### Semantic Versioning

All published packages follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (x.0.0): Breaking API changes (removed exports, changed function signatures, incompatible type changes)
- **MINOR** (0.x.0): New features, new exports, new optional parameters
- **PATCH** (0.0.x): Bug fixes, documentation updates, internal refactoring

### Version Synchronization

All four published packages (`@agentsy/sdk`, `@agentsy/client`, `@agentsy/eval`, `@agentsy/cli`) are versioned together. A release of any package bumps all packages to the same version. This avoids version compatibility confusion.

```
@agentsy/sdk     0.5.0
@agentsy/client  0.5.0
@agentsy/eval    0.5.0
@agentsy/cli     0.5.0
```

### Pre-release Versions

During private beta, all packages use `0.x.y` versioning (pre-1.0). This signals that breaking changes may occur without a major version bump.

```
0.1.0  — Initial private beta release
0.2.0  — Eval SDK added
0.3.0  — Knowledge base support
...
1.0.0  — GA release (stable API contract)
```

### API Version

The REST API is versioned in the URL path: `/v1/agents/...`. SDK versions and API versions are independent. The SDK targets a specific API version (set in `User-Agent` and `X-API-Version` headers). API version bumps (e.g., `/v2/`) are a separate process from SDK version bumps.

### Deprecation Policy

- Deprecated APIs are marked with `@deprecated` JSDoc tags.
- Deprecated APIs produce console warnings in development.
- Deprecated APIs are maintained for at least 6 months (or 3 minor versions) before removal.
- Removal of deprecated APIs requires a major version bump.

---

## 13. Appendix: ID Prefix Reference

Quick reference for all ID prefixes used across the SDK. These map directly to the data model specification.

| Entity | Prefix | Example | SDK Type |
|--------|--------|---------|----------|
| Organization | `org_` | `org_V1StGXR8_Z5jdHi6B` | Not directly exposed in SDK |
| Organization Member | `mem_` | `mem_a3k9Xp2mQ7wR` | Not directly exposed in SDK |
| API Key | `key_` | `key_Tz4Rv8bNq1Lm` | Not directly exposed in SDK |
| Agent | `ag_` | `ag_kP9xW2nM5vBz` | `RunResponse.agentId` |
| Agent Version | `ver_` | `ver_qJ3tY8cF6hNm` | `RunResponse.versionId` |
| Environment | `env_` | `env_rL7wK4xP2dGs` | `RunDetail.environmentId` |
| Deployment | `dep_` | `dep_mN5vB9kP3wQx` | Not directly exposed in SDK |
| Run | `run_` | `run_hT2cF8nM6jLz` | `RunResponse.id` |
| Run Step | `stp_` | `stp_xW4bN7kP9vRm` | `RunStep.id` |
| Session | `ses_` | `ses_qJ6tY3cF8hNz` | `Session.id`, `RunRequest.sessionId` |
| Message | `msg_` | `msg_rL9wK2xP5dGm` | Not directly exposed in SDK |
| Eval Dataset | `eds_` | `eds_mN7vB4kP1wQz` | `DatasetDefinition` (on platform) |
| Eval Dataset Case | `edc_` | `edc_hT5cF9nM3jLx` | `CaseResult.caseId` |
| Eval Experiment | `exp_` | `exp_xW8bN2kP6vRz` | `ExperimentResult.id` |
| Eval Experiment Result | `exr_` | `exr_qJ4tY7cF1hNm` | `CaseResult.id` |
| Eval Baseline | `ebl_` | `ebl_rL3wK8xP4dGz` | Not directly exposed in SDK |
| Knowledge Base | `kb_` | `kb_mN9vB5kP2wQx` | `KnowledgeBase.id` |
| Knowledge Chunk | `kc_` | `kc_hT7cF3nM8jLz` | `KnowledgeBaseSearchResult.chunkId` |
| Secret | `sec_` | `sec_xW6bN4kP7vRm` | Not directly exposed in SDK |
| Usage Daily | `usg_` | `usg_qJ8tY5cF2hNx` | Not directly exposed in SDK |
