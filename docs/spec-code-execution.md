# Code Execution Tool Specification

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**Depends on**: Tool System (Phase 6), E2B Integration (D-5.1)
**Implements**: PRD R-2.8 (Code execution sandbox via E2B)

---

## Table of Contents

1. [Core Thesis](#1-core-thesis)
2. [Architecture](#2-architecture)
3. [Built-In Code Execution Tool](#3-built-in-code-execution-tool)
4. [Sandbox Lifecycle](#4-sandbox-lifecycle)
5. [Language Support](#5-language-support)
6. [Security Model](#6-security-model)
7. [File & Data Passing](#7-file--data-passing)
8. [SDK Surface](#8-sdk-surface)
9. [Data Model Additions](#9-data-model-additions)
10. [API Additions](#10-api-additions)
11. [Evolution Engine Integration](#11-evolution-engine-integration)
12. [Dashboard UX](#12-dashboard-ux)
13. [Phasing](#13-phasing)

---

## 1. Core Thesis

The most capable AI agents don't just call APIs — they write and execute code when the task demands it. A support agent might write a SQL query to investigate a data issue. A research agent might write Python to parse and analyze a dataset. The evolution meta-agent might write a script to analyze scoring patterns across hundreds of mutations.

Code execution is the ultimate general-purpose tool. Instead of building a specialized tool for every possible data transformation, analysis, or computation, the agent writes code on the fly and runs it in a sandboxed environment.

**Key insight from autoresearch**: The agent's power comes from being able to *write* the code that modifies `train.py`, not just call pre-built tools. Agentsy agents need the same capability — the ability to think in code when code is the best medium for the task.

### When agents should reach for code execution

| Scenario | Why code beats a pre-built tool |
|----------|-------------------------------|
| Data analysis | Agent writes pandas/numpy code for the specific dataset shape |
| Data transformation | Agent writes parsing logic for arbitrary formats (CSV, XML, JSON) |
| Mathematical computation | Agent writes exact formulas instead of approximating in natural language |
| Visualization | Agent writes matplotlib/plotly charts to explain findings |
| Regex/text processing | Agent writes precise patterns for the specific input |
| API exploration | Agent writes requests to test hypotheses about external APIs |
| File manipulation | Agent writes scripts to process uploaded files |
| Debugging | Agent writes diagnostic code to reproduce and isolate issues |
| Evolution analysis | Meta-agent writes scripts to analyze scoring patterns across mutations |

---

## 2. Architecture

```
┌─────────────────────────────────────────────┐
│              Agentsy Runtime                 │
│                                              │
│  Agent Run (Temporal Workflow)               │
│    │                                         │
│    ├── LLM Call → "I'll write Python to..."  │
│    │                                         │
│    ├── Tool Call: execute_code               │
│    │     │                                   │
│    │     ▼                                   │
│    │  ┌──────────────────────────────┐       │
│    │  │  CodeExecutionActivity       │       │
│    │  │                              │       │
│    │  │  1. Acquire sandbox          │       │
│    │  │  2. Upload files (if any)    │       │
│    │  │  3. Execute code             │       │
│    │  │  4. Capture stdout/stderr    │       │
│    │  │  5. Download output files    │       │
│    │  │  6. Return result            │       │
│    │  │  7. Release sandbox          │       │
│    │  └──────────┬───────────────────┘       │
│    │             │                            │
│    │             ▼                            │
│    │  ┌──────────────────────────────┐       │
│    │  │  E2B Sandbox (Firecracker)   │       │
│    │  │                              │       │
│    │  │  - Isolated microVM          │       │
│    │  │  - Python 3.12 + packages    │       │
│    │  │  - Node.js 22 + npm          │       │
│    │  │  - 60s default timeout       │       │
│    │  │  - 512MB RAM default         │       │
│    │  │  - No network (configurable) │       │
│    │  │  - Ephemeral filesystem      │       │
│    │  └──────────────────────────────┘       │
│    │                                         │
│    ├── LLM Call → processes result            │
│    └── ...                                   │
└─────────────────────────────────────────────┘
```

### Sandbox Provider Abstraction

The runtime talks to sandboxes through a provider interface, allowing E2B today and Firecracker/self-hosted later:

```typescript
interface SandboxProvider {
  create(config: SandboxConfig): Promise<Sandbox>;
  destroy(sandboxId: string): Promise<void>;
}

interface Sandbox {
  id: string;
  execute(code: string, language: Language): Promise<ExecutionResult>;
  uploadFile(path: string, content: Buffer): Promise<void>;
  downloadFile(path: string): Promise<Buffer>;
  installPackages(packages: string[]): Promise<void>;
}

interface SandboxConfig {
  template: string;          // E2B template ID (pre-configured environment)
  timeoutMs: number;         // Max execution time
  memoryMb: number;          // RAM limit
  networkAccess: boolean;    // Allow outbound network
  persistFilesystem: boolean; // Keep files between executions in same run
}
```

---

## 3. Built-In Code Execution Tool

Agentsy provides `execute_code` as a **platform built-in tool** — available to any agent without user implementation. It's a first-class citizen alongside native tools and MCP tools.

### 3.1 Tool Definition

```typescript
// Built-in, registered by the runtime when code execution is enabled
{
  type: "builtin",
  name: "execute_code",
  description: "Execute code in a sandboxed environment. Use this when you need to perform computations, data analysis, file processing, or any task best expressed as code. Supports Python and JavaScript/TypeScript.",
  input: z.object({
    language: z.enum(["python", "javascript", "typescript"]),
    code: z.string().describe("The code to execute. Must be a complete, runnable script."),
    packages: z.array(z.string()).optional()
      .describe("Packages to install before execution (e.g., ['pandas', 'numpy'])"),
    files: z.record(z.string(), z.string()).optional()
      .describe("Files to create before execution. Keys are file paths, values are contents."),
    timeout_ms: z.number().optional()
      .describe("Execution timeout in milliseconds. Default: 60000 (60s). Max: 300000 (5m)."),
  }),
  output: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number(),
    output_files: z.record(z.string(), z.string()).optional(),
    execution_time_ms: z.number(),
    truncated: z.boolean(),
  }),
  riskLevel: "write",  // Requires approval in production by default
}
```

### 3.2 How the LLM Uses It

The LLM sees `execute_code` in its tool list like any other tool. When it decides code is the best approach, it generates:

```json
{
  "tool": "execute_code",
  "arguments": {
    "language": "python",
    "code": "import pandas as pd\nimport json\n\ndata = json.loads(open('/input/sales.json').read())\ndf = pd.DataFrame(data)\n\nmonthly = df.groupby('month')['revenue'].sum()\nprint(monthly.to_json())\nprint(f'\\nTotal: ${monthly.sum():,.2f}')",
    "packages": ["pandas"],
    "files": {
      "/input/sales.json": "[{\"month\":\"Jan\",\"revenue\":12000}...]"
    }
  }
}
```

The runtime:
1. Acquires a sandbox
2. Installs `pandas`
3. Creates `/input/sales.json`
4. Executes the Python script
5. Captures stdout/stderr
6. Returns the result to the LLM

### 3.3 Multi-Turn Code Execution

Within a single agent run, the sandbox can optionally persist between `execute_code` calls. This allows the agent to:

1. Write a script → execute → see error
2. Fix the script → execute again (files from step 1 still exist)
3. Build on previous output → execute a follow-up analysis

This is controlled by `sandbox.persistFilesystem` in the agent config. Default: `true` (persist within a single run).

### 3.4 Output Handling

```typescript
interface ExecutionResult {
  stdout: string;         // Captured standard output (truncated at 100KB)
  stderr: string;         // Captured standard error (truncated at 10KB)
  exit_code: number;      // 0 = success, non-zero = error
  output_files: Record<string, string>;  // Files written to /output/
  execution_time_ms: number;
  truncated: boolean;     // True if stdout/stderr was truncated
}
```

**Output conventions**:
- Agent writes to stdout for text results (the LLM reads this)
- Agent writes files to `/output/` for binary results (charts, CSVs, etc.)
- `/output/` files are downloadable via the API and visible in the dashboard
- stdout is truncated at 100KB to prevent context window overflow
- stderr is truncated at 10KB (enough for error messages)

---

## 4. Sandbox Lifecycle

### 4.1 Pool Management

To minimize cold start latency, the platform maintains a warm pool of pre-created sandboxes:

```
Warm Pool (per E2B template)
  ├── python-base: 5 warm instances (Python 3.12, common packages pre-installed)
  ├── node-base: 3 warm instances (Node.js 22, TypeScript)
  └── data-science: 3 warm instances (Python + pandas, numpy, scipy, matplotlib)
```

**Warm sandbox allocation**: ~200ms (assign from pool)
**Cold sandbox creation**: ~2-4s (boot new E2B instance)

### 4.2 Lifecycle Within a Run

```
Run starts
  │
  ├── First execute_code call
  │     ├── Acquire sandbox from pool (or create)
  │     ├── Execute code
  │     └── Keep sandbox alive (if persistFilesystem=true)
  │
  ├── Second execute_code call
  │     ├── Reuse same sandbox
  │     ├── Files from first call still exist
  │     └── Execute code
  │
  ├── ... more tool calls (code or otherwise) ...
  │
  └── Run completes
        └── Sandbox destroyed (always, no state leaks between runs)
```

### 4.3 Sandbox Templates

Pre-configured E2B templates for common use cases:

| Template | Pre-installed | Use case |
|----------|--------------|----------|
| `python-base` | Python 3.12, pip, standard library | General Python execution |
| `data-science` | + pandas, numpy, scipy, matplotlib, seaborn, scikit-learn | Data analysis, ML |
| `node-base` | Node.js 22, npm, TypeScript | JavaScript/TypeScript execution |
| `full-stack` | Python 3.12 + Node.js 22 | Multi-language workflows |

Users can also specify custom E2B template IDs for specialized environments.

---

## 5. Language Support

### 5.1 Python (Primary)

Python is the default and most capable language for code execution:

- **Version**: Python 3.12
- **Package install**: `pip install` via the `packages` parameter
- **Pre-installed** (data-science template): pandas, numpy, scipy, matplotlib, seaborn, scikit-learn, requests, beautifulsoup4, Pillow, openpyxl
- **File I/O**: Full filesystem access within the sandbox
- **Network**: Disabled by default, configurable per agent

### 5.2 JavaScript / TypeScript

- **Version**: Node.js 22 with TypeScript via tsx
- **Package install**: `npm install` via the `packages` parameter
- **Pre-installed**: typescript, tsx, lodash, zod, date-fns
- **Use case**: When the agent's codebase is JS/TS or the task involves JSON/web APIs

### 5.3 Shell (Restricted)

- **Not exposed as a separate language** — agents can run shell commands via Python's `subprocess` or Node's `child_process`
- This avoids giving the LLM direct shell access while still enabling file operations, package management, etc.

---

## 6. Security Model

### 6.1 Isolation Layers

```
Layer 1: E2B Firecracker microVM
  - Hardware-level isolation (KVM)
  - Separate kernel per sandbox
  - No shared memory with host or other sandboxes

Layer 2: Resource Limits
  - CPU: 1 vCPU (configurable up to 4)
  - RAM: 512MB default (configurable up to 4GB)
  - Disk: 1GB ephemeral storage
  - Execution time: 60s default (configurable up to 5m)

Layer 3: Network Policy
  - Default: no network access
  - Configurable: allow outbound HTTPS to allowlisted domains
  - Never: inbound connections, DNS rebinding, private IP ranges

Layer 4: Multi-tenancy
  - One sandbox per run (never shared between runs or orgs)
  - Sandbox destroyed after run completes
  - No persistent storage between runs
  - Org billing tracks sandbox compute time
```

### 6.2 Risk Classification

`execute_code` is classified as `riskLevel: "write"` because:
- It can produce side effects (write files, make network requests if enabled)
- It runs arbitrary user-influenced code (LLM-generated)
- It consumes compute resources (billing impact)

**Approval behavior**:
- Development: auto-approved (fast iteration)
- Staging: auto-approved (testing)
- Production: requires approval by default (configurable to auto-approve)

### 6.3 Code Injection Mitigation

The LLM generates code based on user input, which creates a code injection surface:

1. **Sandbox isolation is the primary defense** — even if injected code runs, it's in an ephemeral VM with no access to secrets, host systems, or other tenants
2. **No secrets in sandbox** — API keys, tokens, and secrets are **never** injected into the sandbox environment. If the agent needs to call an authenticated API from code, it should use a native tool instead
3. **Network disabled by default** — prevents exfiltration even if code is compromised
4. **Output size limits** — prevents memory exhaustion attacks via huge outputs
5. **Execution timeout** — prevents infinite loops and crypto mining

### 6.4 Cost Controls

| Resource | Default Limit | Max Configurable |
|----------|--------------|-----------------|
| Execution time per call | 60s | 300s (5m) |
| RAM per sandbox | 512MB | 4GB |
| Total sandbox time per run | 300s (5m) | 1800s (30m) |
| Total sandbox cost per run | $0.10 | configurable |
| Package install timeout | 30s | 60s |
| Output size (stdout) | 100KB | 500KB |
| Output files total size | 10MB | 50MB |

Cost is tracked per sandbox-second and rolled into the run's `total_cost_usd`.

---

## 7. File & Data Passing

### 7.1 Input Files

Agents can pass data into the sandbox via two mechanisms:

**Inline files** (via `files` parameter):
```json
{
  "files": {
    "/input/data.csv": "name,age\nAlice,30\nBob,25",
    "/input/config.json": "{\"threshold\": 0.5}"
  }
}
```

**Run context files** (uploaded by users or previous tools):
- Files uploaded via the API (`POST /v1/runs/{runId}/files`) are mounted at `/input/uploads/`
- Files produced by previous `execute_code` calls in the same run are at `/output/` (with filesystem persistence)

### 7.2 Output Files

Code writes output files to `/output/`:

```python
import matplotlib.pyplot as plt

# ... analysis code ...

plt.savefig('/output/chart.png')
with open('/output/summary.csv', 'w') as f:
    f.write(summary_df.to_csv())
```

Output files are:
- Returned in the tool result as `output_files` (text files, base64 for binary)
- Stored as run artifacts (downloadable via API)
- Visible in the dashboard trace viewer
- Included in SSE stream events (file references, not inline data)

### 7.3 Data Size Guardrails

| Path | Max Size | Behavior if exceeded |
|------|---------|---------------------|
| Inline input files (total) | 5MB | Tool call rejected with error |
| Upload input files (total) | 50MB | Upload rejected |
| stdout | 100KB | Truncated with `truncated: true` |
| stderr | 10KB | Truncated |
| Output files (total) | 10MB | Execution continues but excess files dropped |
| Output files (per file) | 5MB | File dropped with warning in stderr |

---

## 8. SDK Surface

### 8.1 Agent Configuration

Code execution is enabled per agent via a `codeExecution` block in the agent config:

```typescript
export default agentsy.defineAgent({
  slug: "research-agent",
  name: "Research Agent",
  model: "claude-sonnet-4",
  systemPrompt: "You are a research agent. When you need to analyze data, write Python code.",
  tools: [searchWeb, readDocument],

  // Enable code execution
  codeExecution: {
    enabled: true,
    // Default language when the LLM doesn't specify
    defaultLanguage: "python",
    // Sandbox template (pre-installed packages)
    template: "data-science",
    // Resource limits
    limits: {
      timeoutMs: 120_000,     // 2 minutes per execution
      memoryMb: 1024,         // 1GB RAM
      maxExecutionsPerRun: 10, // Max code executions per agent run
    },
    // Network access
    network: {
      enabled: false,         // Default: no network
      // allowedDomains: ["api.example.com"],  // Allowlist if enabled
    },
    // Persist sandbox filesystem between execute_code calls in same run
    persistFilesystem: true,
    // Custom packages to pre-install (in addition to template)
    packages: {
      python: ["openai", "tiktoken"],
      // javascript: ["axios"],
    },
    // Approval override for code execution
    approvalPolicy: {
      autoApprove: true,  // Auto-approve in all environments
    },
  },
});
```

### 8.2 Disabling Code Execution

Code execution is **opt-in**. Agents without `codeExecution: { enabled: true }` do not have the `execute_code` tool available. This is the safe default.

### 8.3 System Prompt Injection

When code execution is enabled, the runtime appends guidance to the system prompt:

```
## Code Execution

You have access to a sandboxed code execution environment via the `execute_code` tool.

Use it when:
- You need to perform calculations or data analysis
- You need to process, transform, or visualize data
- You need to work with files (CSV, JSON, etc.)
- The task is best expressed as code rather than natural language

Guidelines:
- Write complete, runnable scripts (not fragments)
- Use print() to output results you want to see
- Write output files to /output/ (e.g., /output/chart.png)
- Input files from the user are at /input/uploads/
- Handle errors gracefully — if code fails, read the error and try again
- Prefer simple, readable code over clever one-liners
```

---

## 9. Data Model Additions

### 9.1 New Columns on agent_versions

```typescript
// Add to agent_versions.tools_config type
type ToolsConfig = Array<{
  name: string;
  type: "native" | "mcp" | "builtin";  // NEW: "builtin" for platform tools
  // ... existing fields ...
}>;

// Add to GuardrailsConfig
type GuardrailsConfig = {
  // ... existing fields ...
  codeExecution?: {
    maxExecutionsPerRun?: number;      // Default: 10
    maxTotalSandboxTimeMs?: number;    // Default: 300_000 (5m)
    maxCostPerRunUsd?: number;         // Default: 0.10
  };
};
```

### 9.2 New Columns on run_steps

```typescript
// When step_type is "tool_call" and the tool is "execute_code"
// The step's input/output JSONB already captures the code and result.
// Add sandbox metadata:
type ToolCallStepMetadata = {
  // ... existing fields ...
  sandbox?: {
    sandboxId: string;
    template: string;
    language: "python" | "javascript" | "typescript";
    executionTimeMs: number;
    memoryUsedMb: number;
    packagesInstalled: string[];
    outputFileCount: number;
    outputFileTotalBytes: number;
    truncated: boolean;
  };
};
```

### 9.3 Run Artifacts Table

Output files from code execution are stored as run artifacts:

```typescript
export const runArtifacts = pgTable(
  "run_artifacts",
  {
    id: varchar("id", { length: 30 }).primaryKey(), // art_...
    runId: varchar("run_id", { length: 30 })
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    stepId: varchar("step_id", { length: 30 })
      .references(() => runSteps.id, { onDelete: "set null" }),
    orgId: varchar("org_id", { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // File metadata
    fileName: varchar("file_name", { length: 255 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(), // /output/chart.png
    mimeType: varchar("mime_type", { length: 100 }),
    sizeBytes: integer("size_bytes").notNull(),
    // Storage
    storagePath: varchar("storage_path", { length: 500 }).notNull(), // S3/R2 path
    // Context
    source: varchar("source", { length: 50 }).notNull(), // "code_execution" | "file_upload" | "tool_output"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("run_artifacts_run_id_idx").on(table.runId),
    index("run_artifacts_org_id_idx").on(table.orgId),
  ]
);
```

### 9.4 New ID Prefix

| Table | Prefix | Example |
|-------|--------|---------|
| run_artifacts | `art_` | `art_kP9xW2nM5vBz` |

---

## 10. API Additions

### 10.1 Run Artifacts

```
GET    /v1/runs/{runId}/artifacts              — List artifacts for a run
GET    /v1/runs/{runId}/artifacts/{artifactId}  — Download artifact file
POST   /v1/runs/{runId}/files                   — Upload input file for a run
```

### 10.2 Sandbox Management (Internal)

```
POST   /v1/internal/sandboxes/acquire           — Acquire sandbox from pool
POST   /v1/internal/sandboxes/{id}/execute       — Execute code in sandbox
POST   /v1/internal/sandboxes/{id}/upload        — Upload file to sandbox
GET    /v1/internal/sandboxes/{id}/download/{path} — Download file from sandbox
DELETE /v1/internal/sandboxes/{id}               — Destroy sandbox
```

These are internal endpoints used by the Temporal worker, not exposed to users.

### 10.3 SSE Stream Events

New stream event types for code execution:

```typescript
// When code execution starts
{ type: "code_execution.started", data: { step_id, language, code_preview } }

// When code execution completes
{ type: "code_execution.completed", data: { step_id, exit_code, execution_time_ms, output_preview } }

// When an output file is created
{ type: "code_execution.file_created", data: { step_id, file_name, mime_type, size_bytes, artifact_id } }

// When code execution fails
{ type: "code_execution.failed", data: { step_id, exit_code, error_preview } }
```

---

## 11. Evolution Engine Integration

The evolution meta-agent is a prime user of code execution. With `execute_code`, the meta-agent can:

### 11.1 Analyze Scoring Patterns

```python
# Meta-agent writes this to understand why certain mutations fail
import json
import pandas as pd

ledger = json.loads(open('/input/evolution-ledger.json').read())
df = pd.DataFrame(ledger)

# Which mutation types have the best keep rate?
keep_rate = df.groupby('mutation_type')['status'].apply(
    lambda x: (x == 'kept').mean()
).sort_values(ascending=False)

print("Keep rate by mutation type:")
print(keep_rate.to_string())

# Which graders are hardest to improve?
scores = pd.json_normalize(df['per_grader_scores'].dropna())
print("\nMost resistant graders:")
print(scores.mean().sort_values().head(5).to_string())
```

### 11.2 Generate Mutation Hypotheses

```python
# Meta-agent analyzes the agent's eval failures to propose targeted mutations
import json

results = json.loads(open('/input/eval-results.json').read())
failures = [r for r in results if not r['passed']]

# Categorize failures
categories = {}
for f in failures:
    for grader, score in f['scores'].items():
        if score['score'] < 0.5:
            categories.setdefault(grader, []).append({
                'input': f['input'][:200],
                'output': f['output'][:200],
                'score': score['score'],
                'reasoning': score.get('reasoning', '')
            })

print(json.dumps(categories, indent=2))
```

### 11.3 Evolution Config

The evolution engine's meta-agent should always have code execution enabled:

```typescript
// Internal: meta-agent config used by the evolution engine
const metaAgentConfig = agentsy.defineAgent({
  slug: "__evolution-meta-agent",
  model: "claude-sonnet-4",
  systemPrompt: EVOLUTION_META_AGENT_PROMPT,
  tools: [/* mutation proposal tools */],
  codeExecution: {
    enabled: true,
    template: "data-science",
    limits: {
      timeoutMs: 120_000,
      memoryMb: 1024,
      maxExecutionsPerRun: 20,
    },
    network: { enabled: false },
    approvalPolicy: { autoApprove: true },
  },
});
```

---

## 12. Dashboard UX

### 12.1 Trace Viewer — Code Execution Steps

Code execution steps in the trace viewer show:

```
┌─────────────────────────────────────────────────────┐
│ Step 3: execute_code (Python)              1.2s     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Code                                    [Copy] [▼]  │
│  ┌────────────────────────────────────────────────┐  │
│  │ import pandas as pd                            │  │
│  │ import json                                    │  │
│  │                                                │  │
│  │ data = json.loads(open('/input/sales.json')... │  │
│  │ df = pd.DataFrame(data)                        │  │
│  │ monthly = df.groupby('month')['revenue'].sum() │  │
│  │ print(monthly.to_json())                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Output                              exit_code: 0    │
│  ┌────────────────────────────────────────────────┐  │
│  │ {"Jan":12000,"Feb":15000,"Mar":18000}          │  │
│  │                                                │  │
│  │ Total: $45,000.00                              │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Files                                               │
│  📊 chart.png (45KB)  [Preview] [Download]           │
│  📄 summary.csv (2KB) [Download]                     │
│                                                      │
│  Sandbox: python-base │ 512MB │ 1.2s │ $0.001       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 12.2 Code Execution Analytics

On the agent overview page, show code execution metrics:

- Executions per run (average)
- Success rate (exit_code 0)
- Average execution time
- Total sandbox cost
- Most installed packages

---

## 13. Phasing

### Phase 11.5: Code Execution (New)

Sits between Agent Git Repos (Phase 11) and Auto-Evolution (Phase 12), since the evolution meta-agent benefits from code execution.

**Prerequisites**:
- Phase 2 complete (agent runtime, tool execution)
- Phase 6 complete (tool system, approval gates)
- E2B account and API key

**Steps**:

1. **Sandbox provider abstraction** — Interface + E2B implementation
2. **Sandbox pool manager** — Warm pool, acquire/release, timeout enforcement
3. **`execute_code` built-in tool** — Registration, input/output handling, truncation
4. **File I/O** — Input file mounting, output file capture, artifact storage
5. **`codeExecution` agent config** — SDK types, validation, system prompt injection
6. **`run_artifacts` table** — Migration, CRUD, S3/R2 storage
7. **SSE stream events** — Code execution lifecycle events
8. **Trace viewer integration** — Code display, output display, file preview/download
9. **Cost tracking** — Per-sandbox-second billing, guardrail enforcement
10. **Evolution integration** — Wire code execution into meta-agent config

**Estimated duration**: 5-7 days

### Dependency Chain

```
Phase 6 (Tool System)
  └── Phase 11.5 (Code Execution)
        └── Phase 12 (Auto-Evolution Engine)
              └── Meta-agent uses execute_code for analysis
```

---

## Appendix: E2B Integration Details

### E2B SDK Usage

```typescript
import { Sandbox } from "@e2b/code-interpreter";

// Create sandbox from template
const sandbox = await Sandbox.create({
  template: "data-science",
  apiKey: process.env.E2B_API_KEY,
  timeout: 120_000,
});

// Execute Python code
const result = await sandbox.runCode("print('hello')", {
  language: "python",
});

console.log(result.stdout);  // "hello\n"
console.log(result.stderr);  // ""

// Upload file
await sandbox.files.write("/input/data.csv", "name,age\nAlice,30");

// Download file
const content = await sandbox.files.read("/output/result.csv");

// Destroy sandbox
await sandbox.close();
```

### E2B Pricing (as of March 2026)

| Resource | Cost |
|----------|------|
| Sandbox-second (1 vCPU, 512MB) | ~$0.0001/s |
| Warm pool reservation | ~$0.05/hour per instance |
| Network egress | Standard cloud rates |

A typical code execution (5s, 512MB) costs ~$0.0005. An evolution session with 20 code executions costs ~$0.01 in sandbox compute.
