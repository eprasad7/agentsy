# Agent Auto-Evolution & Git-Native Versioning Specification

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft
**Depends on**: Eval Engine (Phase 4), Agent Versioning (Phase 2), Deployment & Environments (Phase 7)
**Inspired by**: [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — autonomous self-improving research loop

---

## Table of Contents

1. [Core Thesis](#1-core-thesis)
2. [Agent Git Repositories](#2-agent-git-repositories)
3. [CI/CD Pipeline](#3-cicd-pipeline)
4. [Auto-Evolution Engine](#4-auto-evolution-engine)
5. [Mutation Strategies](#5-mutation-strategies)
6. [Evolution Ledger](#6-evolution-ledger)
7. [Safety & Governance](#7-safety--governance)
8. [SDK Surface](#8-sdk-surface)
9. [Data Model Additions](#9-data-model-additions)
10. [API Additions](#10-api-additions)
11. [Dashboard UX](#11-dashboard-ux)
12. [Phasing](#12-phasing)

---

## 1. Core Thesis

Karpathy's autoresearch proved a powerful pattern: a tight **propose → execute → evaluate → keep/discard** loop, running autonomously, can dramatically improve a system overnight without human intervention. The key ingredients:

| Principle | autoresearch | Agentsy equivalent |
|-----------|-------------|-------------------|
| Single metric | `val_bpb` — one number, lower is better | Eval grader composite score |
| Fixed evaluation budget | 5-minute wall clock per experiment | Cost + time budget per eval run |
| Atomic modifications | Only `train.py` changes | Agent config mutations (instructions, tools, model, guardrails) |
| Git as experiment log | Keep = advance branch, discard = `git reset` | Agent repo: keep = commit + version bump, discard = revert |
| TSV ledger | Every experiment logged with commit, metric, status | `evolution_runs` table + per-mutation results |
| Simplicity pressure | "All else equal, simpler is better" | Prefer fewer tools, shorter instructions, cheaper models |
| Never stop | 100+ experiments overnight | Scheduled evolution sessions with budget caps |
| Human steers via `program.md` | Humans set direction, agents execute | Evolution directives in natural language |

Agentsy adapts this pattern for agent configuration rather than model training code. The "code" being optimized is the agent definition: system prompt, tool selection, guardrails, model choice, and parameters.

---

## 2. Agent Git Repositories

Every agent gets its own Git repository managed by the Agentsy platform. This is the source of truth for agent configuration and the backbone for CI/CD, versioning, and evolution.

### 2.1 Repository Structure

When an agent is created (via `agentsy init` or the dashboard), a Git repository is initialized with this canonical structure:

```
my-agent/
  agentsy.config.ts          # Agent definition (defineAgent)
  tools/
    index.ts                  # Tool barrel export
    get-order.ts              # Native tool definitions
  evals/
    datasets/
      golden.json             # Golden eval dataset
      regression.json         # Regression cases
    graders.ts                # Custom graders
  knowledge/                  # Optional: documents for RAG
    product-docs.md
  evolve.config.ts            # Optional: evolution configuration
  .agentsy/
    evolution-ledger.tsv      # Local evolution history (synced to platform)
  .env.example
  .gitignore
  package.json
  tsconfig.json
```

### 2.2 Repository Lifecycle

```
agentsy init "support-agent"
  → creates local project directory
  → initializes git repo
  → creates remote repo on Agentsy platform (org-scoped)
  → sets remote origin to agentsy://org_xxx/support-agent

agentsy push
  → validates agentsy.config.ts
  → runs evals if configured (pre-push gate)
  → pushes to Agentsy remote
  → triggers CI pipeline
  → creates new agent_version on success

agentsy pull
  → pulls latest from Agentsy remote
  → merges into local working tree
```

### 2.3 Remote Storage

Agent repos are stored as bare Git repositories on the platform. Each organization gets a namespace:

```
/repos/{org_id}/{agent_slug}.git
```

The platform exposes a Git-compatible transport (via SSH or HTTPS) so standard Git operations work:

```bash
git clone agentsy://org_xxx/support-agent
git push origin main
git log --oneline
```

Under the hood, the platform uses server-side hooks to:
1. Validate `agentsy.config.ts` schema on push
2. Create an `agent_version` record for each commit on main
3. Trigger CI pipeline if configured
4. Trigger evolution session if auto-evolve is enabled

### 2.4 Branching Model

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready configuration. Each commit = one agent version. |
| `evolve/*` | Created by the evolution engine for mutation experiments. Auto-deleted after keep/discard. |
| `experiment/*` | Created by users or CI for manual experimentation. |
| `feature/*` | Standard feature branches for human development. |

The evolution engine works exclusively on `evolve/*` branches:
1. Creates `evolve/session-{evo_id}` from `main`
2. For each mutation: commit on branch → run eval → keep or reset
3. If kept: fast-forward `main` to the new commit
4. If discarded: `git reset --hard` to previous commit (branch only, never main)
5. At session end: merge all kept mutations into `main` as a single squash commit, delete branch

---

## 3. CI/CD Pipeline

### 3.1 Pipeline Triggers

| Trigger | Action |
|---------|--------|
| `git push origin main` | Full CI: lint → eval → deploy (if auto-deploy enabled) |
| `git push origin feature/*` | CI: lint → eval (no deploy) |
| Pull request to `main` | CI: lint → eval → compare against baseline → post results as PR comment |
| `agentsy deploy` CLI command | Manual deploy: creates version → deploys to target environment |
| Evolution session completion | Auto: squash-merge to main → full CI pipeline |
| Schedule (cron) | Triggered eval runs, evolution sessions |

### 3.2 Pipeline Definition

The pipeline is defined in `agentsy.config.ts` alongside the agent definition:

```typescript
export default agentsy.defineProject({
  agents: [supportAgent],
  ci: {
    // Run evals on every push
    evalOnPush: true,
    // Which datasets to use for CI evals
    evalDatasets: ["golden", "regression"],
    // Fail the pipeline if any grader score drops below baseline
    regressionGate: true,
    // Minimum composite score to pass
    minScore: 0.85,
    // Auto-deploy to staging on main push (requires eval pass)
    autoDeploy: {
      staging: { onPush: "main", requireEval: true },
      production: { onPush: false }, // manual only
    },
    // Notifications
    notify: {
      onFailure: ["slack:#agent-alerts"],
      onDeploy: ["slack:#agent-deploys"],
    },
  },
});
```

### 3.3 Pipeline Execution

Pipelines run as Temporal workflows on the worker infrastructure:

```
CIPipelineWorkflow
  ├── ValidateConfigActivity    — parse + schema-check agentsy.config.ts
  ├── CreateVersionActivity     — snapshot config into agent_versions
  ├── RunEvalsActivity          — execute eval experiments against datasets
  │     ├── per-case activities (parallelized)
  │     └── aggregate scores
  ├── CompareBaselineActivity   — compare against active eval_baseline
  ├── GateDecisionActivity      — pass/fail based on regression + min score
  ├── DeployActivity            — (if auto-deploy) deploy to target environment
  └── NotifyActivity            — send results to configured channels
```

### 3.4 PR Integration

When a PR is opened against `main`, the pipeline runs evals and posts a comparison:

```markdown
## Eval Results — support-agent

| Grader | Baseline | This PR | Delta |
|--------|----------|---------|-------|
| answer_correctness | 0.87 | 0.91 | +0.04 |
| tool_precision | 0.92 | 0.90 | -0.02 |
| latency_p50 | 2.1s | 1.8s | -0.3s |
| cost_per_run | $0.03 | $0.02 | -$0.01 |
| **composite** | **0.86** | **0.88** | **+0.02** |

**Status**: PASS (no regressions, composite above 0.85)
```

---

## 4. Auto-Evolution Engine

The evolution engine is a meta-agent that autonomously improves agent configurations through iterative mutation and evaluation. It is the direct analogue of autoresearch's self-improvement loop, adapted for agent config space.

### 4.1 Evolution Loop

```
┌─────────────────────────────────────────────────────┐
│                  Evolution Session                    │
│                                                       │
│  1. Load current agent config (HEAD of main)          │
│  2. Load evolution directives                         │
│  3. Load eval baseline scores                         │
│                                                       │
│  ┌─────────── Mutation Loop ──────────────┐          │
│  │                                         │          │
│  │  4. Meta-agent proposes a mutation      │          │
│  │  5. Apply mutation to agent config      │          │
│  │  6. Commit on evolve/* branch           │          │
│  │  7. Run eval suite                      │          │
│  │  8. Compare against current best        │          │
│  │                                         │          │
│  │  IF improved:                           │          │
│  │    9a. KEEP — advance branch pointer    │          │
│  │    9b. Update current best scores       │          │
│  │    9c. Log to evolution ledger          │          │
│  │                                         │          │
│  │  IF not improved:                       │          │
│  │    9a. DISCARD — git reset              │          │
│  │    9b. Log to evolution ledger          │          │
│  │                                         │          │
│  │  10. Check budget (cost, iterations)    │          │
│  │  11. If budget remains → loop to 4     │          │
│  │                                         │          │
│  └─────────────────────────────────────────┘          │
│                                                       │
│  12. Squash-merge kept mutations into main            │
│  13. Create new agent_version                         │
│  14. Optionally deploy (if auto-promote enabled)      │
│  15. Notify owner with session summary                │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### 4.2 Meta-Agent

The meta-agent is itself a Claude-powered agent that reads the current agent config, evolution directives, eval results history, and proposes targeted mutations. It has access to:

- Current `agentsy.config.ts` (the agent being evolved)
- Evolution directives (natural language goals)
- Last N eval results (what worked, what didn't)
- Evolution ledger (full history of mutations and outcomes)
- Simplicity heuristics (tool count, instruction length, model cost)

The meta-agent's system prompt:

```
You are an agent optimizer. Your job is to propose ONE atomic modification
to the agent configuration that is likely to improve the target metric.

Rules:
- Only modify fields listed in the "mutable" set
- Never modify fields in the "frozen" set
- Prefer simple changes over complex ones
- Learn from the evolution ledger — don't repeat failed mutations
- Each mutation should have a clear hypothesis
- Explain what you changed and why in 1-2 sentences

Output format:
{
  "mutation_type": "instruction_rewrite" | "tool_add" | "tool_remove" | ...
  "description": "Shortened refund instructions to reduce confusion",
  "hypothesis": "Concise instructions reduce hallucination on edge cases",
  "diff": { ... }  // the actual config changes
}
```

### 4.3 Scoring & Comparison

Each mutation is scored against the eval suite. The evolution engine uses the same graders and datasets as the CI pipeline. Comparison logic:

```typescript
function shouldKeep(
  currentBest: Record<string, number>,
  candidate: Record<string, number>,
  config: EvolutionConfig
): { keep: boolean; reason: string } {
  // 1. Hard gate: no regression on any individual grader beyond threshold
  for (const [grader, score] of Object.entries(candidate)) {
    const baseline = currentBest[grader] ?? 0;
    if (baseline - score > config.maxRegressionPerGrader) {
      return { keep: false, reason: `${grader} regressed by ${baseline - score}` };
    }
  }

  // 2. Composite score must improve
  const currentComposite = compositeScore(currentBest, config.weights);
  const candidateComposite = compositeScore(candidate, config.weights);

  if (candidateComposite <= currentComposite) {
    return { keep: false, reason: `composite ${candidateComposite} <= ${currentComposite}` };
  }

  // 3. Simplicity bonus: if scores are equal, prefer simpler config
  // (fewer tools, shorter instructions, cheaper model)

  return { keep: true, reason: `composite improved ${currentComposite} → ${candidateComposite}` };
}
```

---

## 5. Mutation Strategies

Instead of modifying training code (like autoresearch), the evolution engine mutates agent configuration. Each strategy targets a specific dimension:

### 5.1 Instruction Rewrite

Rephrase, shorten, restructure, or add specificity to the system prompt.

```typescript
// Before
systemPrompt: "You are a helpful customer support agent for Acme Corp. Help users with orders and refunds."

// After (mutation: add specificity)
systemPrompt: "You are Acme Corp's support agent. For refund requests: verify order ID, check 30-day window, calculate prorated amount. For order status: use get-order tool, summarize shipping ETA. Never guess amounts — always look them up."
```

### 5.2 Tool Selection

Add, remove, or reorder tools. Hypothesis: removing unnecessary tools reduces confusion and cost.

```typescript
// Before: 5 tools
tools: [getOrder, getRefundPolicy, sendReply, searchKB, escalateToHuman]

// After: removed searchKB (hypothesis: KB retrieval is handled by memory config, redundant tool causes confusion)
tools: [getOrder, getRefundPolicy, sendReply, escalateToHuman]
```

### 5.3 Guardrail Tuning

Adjust thresholds, add or remove output validations.

```typescript
// Before
guardrails: { maxIterations: 10, maxTokens: 50_000 }

// After (hypothesis: tighter iteration limit forces more efficient tool use)
guardrails: { maxIterations: 6, maxTokens: 30_000 }
```

### 5.4 Model Swap

Try different models or model classes. Hypothesis: cheaper model might perform equally well for simple routing tasks.

```typescript
// Before
model: "claude-sonnet-4"

// After (hypothesis: haiku is sufficient for this agent's task complexity)
model: "claude-haiku-4"
```

### 5.5 Parameter Sweep

Systematic exploration of temperature, max tokens, and other model parameters.

```typescript
// Before
modelParams: { temperature: 0.7 }

// After (hypothesis: lower temperature reduces hallucination on factual queries)
modelParams: { temperature: 0.3 }
```

### 5.6 Few-Shot Example Curation

Add, remove, or modify examples in the system prompt.

### 5.7 Memory Configuration

Adjust session history length, knowledge base selection, retrieval parameters.

### 5.8 Composite Mutations

The meta-agent may propose multiple changes if the evolution directives suggest it, but each mutation commit is atomic. The ledger tracks exactly what changed.

---

## 6. Evolution Ledger

Every mutation attempt is logged, regardless of outcome. This is the equivalent of autoresearch's `results.tsv`.

### 6.1 Local Ledger (`.agentsy/evolution-ledger.tsv`)

Checked into the agent repo for offline reference:

```tsv
session_id	mutation_id	timestamp	type	description	hypothesis	composite_score	status	commit_sha	cost_usd	duration_ms
evo_abc123	mut_001	2026-03-20T02:00:00Z	baseline	initial config	-	0.850	baseline	a1b2c3d	0.00	0
evo_abc123	mut_002	2026-03-20T02:05:00Z	instruction_rewrite	shortened refund instructions	concise instructions reduce hallucination	0.870	keep	e4f5g6h	0.42	45000
evo_abc123	mut_003	2026-03-20T02:11:00Z	tool_remove	removed searchKB tool	KB retrieval via memory is sufficient	0.865	discard	-	0.38	42000
evo_abc123	mut_004	2026-03-20T02:16:00Z	model_swap	switched to haiku	haiku sufficient for simple routing	0.830	discard	-	0.12	38000
evo_abc123	mut_005	2026-03-20T02:21:00Z	parameter_sweep	temperature 0.7→0.3	lower temp reduces hallucination	0.890	keep	i7j8k9l	0.41	44000
```

### 6.2 Platform Ledger

Stored in the `evolution_runs` and `evolution_mutations` tables (see [Data Model Additions](#9-data-model-additions)). Queryable via API and visible in the dashboard.

---

## 7. Safety & Governance

autoresearch operates in a sandboxed training loop where the worst case is wasted compute. Agent evolution has higher stakes — a bad mutation could reach production users. Safety rails are non-negotiable.

### 7.1 Budget Caps

Every evolution session has hard limits:

```typescript
evolve: {
  budget: {
    maxMutations: 50,          // max number of mutations per session
    maxCostUsd: 10.00,         // total LLM cost cap for the session
    maxDurationMinutes: 120,   // wall clock limit
    maxCostPerMutation: 1.00,  // per-mutation cost cap (abort if exceeded)
  },
}
```

If any limit is reached, the session stops gracefully: kept mutations are committed, the ledger is finalized, and the owner is notified.

### 7.2 Regression Protection

A mutation is **never kept** if:
- Any individual grader score drops by more than `maxRegressionPerGrader` (default: 0.05)
- The composite score does not improve
- Any safety grader (PII, jailbreak resistance) drops at all (zero tolerance)

### 7.3 Approval Gates

Evolution results require explicit human approval before reaching production:

| Auto-promote level | Behavior |
|-------------------|----------|
| `none` (default) | Evolution results stay on branch. Human must review and merge. |
| `staging` | Auto-deploy evolved version to staging. Human promotes to production. |
| `production` | Auto-deploy to production if all gates pass. **Requires org admin approval to enable.** |

### 7.4 Diff Review

Every evolution session produces a human-readable diff:

```diff
--- agentsy.config.ts (ver_041, baseline)
+++ agentsy.config.ts (ver_042, evolved)

  systemPrompt:
-   "You are a helpful customer support agent for Acme Corp.
-    Help users with orders and refunds."
+   "You are Acme Corp's support agent. For refund requests:
+    verify order ID, check 30-day window, calculate prorated
+    amount. Never guess amounts — always look them up."

  model:
    "claude-sonnet-4" (unchanged)

  tools:
    getOrder (unchanged)
    getRefundPolicy (unchanged)
    sendReply (unchanged)
-   searchKB (removed)
    escalateToHuman (unchanged)

  modelParams:
-   temperature: 0.7
+   temperature: 0.3
```

### 7.5 Rollback

One-click revert to any previous version:

```bash
agentsy rollback ver_041
# or from dashboard: [Rollback to ver_041]
```

This creates a new version (ver_043) with the config from ver_041 — no history is destroyed.

### 7.6 Evolution Audit Log

Every evolution action is recorded in the platform audit log:
- Session start/stop
- Each mutation attempt (with full config diff)
- Keep/discard decisions (with reasoning)
- Deployment actions
- Human approvals/rejections

---

## 8. SDK Surface

### 8.1 Evolution Configuration

```typescript
// evolve.config.ts
import { agentsy } from "@agentsy/sdk";

export default agentsy.defineEvolution({
  // Target metric — which eval dataset + graders to optimize
  metric: {
    dataset: "golden",
    graders: ["answer_correctness", "tool_precision", "cost_threshold"],
    weights: {
      answer_correctness: 0.5,
      tool_precision: 0.3,
      cost_threshold: 0.2,
    },
  },

  // What the optimizer can change
  mutable: [
    "systemPrompt",
    "tools",
    "guardrails",
    "modelParams",
    "model",
  ],

  // What stays fixed
  frozen: [
    "name",
    "slug",
    "connectors",
    "memory.knowledgeBases",
  ],

  // Natural language directives for the meta-agent
  directives: `
    Focus on reducing hallucination in refund amount calculations.
    Prefer fewer tool calls over more.
    Don't sacrifice accuracy for speed.
    Try making the agent work with claude-haiku-4 if quality holds.
  `,

  // Budget
  budget: {
    maxMutations: 50,
    maxCostUsd: 10.00,
    maxDurationMinutes: 120,
  },

  // Schedule
  schedule: "0 2 * * *", // nightly at 2am UTC

  // Safety
  safety: {
    maxRegressionPerGrader: 0.05,
    zeroToleranceGraders: ["pii_check", "jailbreak_resistance"],
  },

  // Auto-promote level
  autoPromote: "staging", // "none" | "staging" | "production"

  // Simplicity pressure — prefer simpler configs when scores are equal
  simplicityPressure: true,
});
```

### 8.2 CLI Commands

```bash
# Start an evolution session manually
agentsy evolve
agentsy evolve --budget-usd 5.00 --max-mutations 20

# View evolution history
agentsy evolve history
agentsy evolve history --session evo_abc123

# Compare evolved version against baseline
agentsy evolve compare ver_041 ver_042

# Promote evolved version
agentsy evolve promote ver_042 --env staging
agentsy evolve promote ver_042 --env production

# Rollback
agentsy rollback ver_041
```

### 8.3 Programmatic API

```typescript
import { agentsyEval } from "@agentsy/eval";

// Run evolution programmatically (e.g., in a custom script)
const session = await agentsyEval.evolve({
  agent: "support-agent",
  config: evolutionConfig,
});

// Session is async — returns immediately with session ID
console.log(session.id); // evo_abc123

// Poll or stream results
for await (const event of session.stream()) {
  console.log(event);
  // { type: "mutation_complete", mutation_id: "mut_002", status: "keep", score: 0.87 }
  // { type: "mutation_complete", mutation_id: "mut_003", status: "discard", score: 0.865 }
  // { type: "session_complete", kept: 2, discarded: 3, final_score: 0.89 }
}
```

---

## 9. Data Model Additions

### 9.1 New Enums

```typescript
export const evolutionSessionStatusEnum = pgEnum("evolution_session_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "budget_exhausted",
]);

export const mutationStatusEnum = pgEnum("mutation_status", [
  "pending",
  "evaluating",
  "kept",
  "discarded",
  "error",
]);

export const mutationTypeEnum = pgEnum("mutation_type", [
  "baseline",
  "instruction_rewrite",
  "tool_add",
  "tool_remove",
  "tool_reorder",
  "guardrail_tune",
  "model_swap",
  "parameter_sweep",
  "few_shot_add",
  "few_shot_remove",
  "memory_config",
  "composite",
]);

export const autoPromoteLevelEnum = pgEnum("auto_promote_level", [
  "none",
  "staging",
  "production",
]);
```

### 9.2 New ID Prefixes

| Table | Prefix | Example |
|-------|--------|---------|
| evolution_sessions | `evo_` | `evo_kP9xW2nM5vBz` |
| evolution_mutations | `mut_` | `mut_qJ3tY8cF6hNm` |
| agent_repos | `rep_` | `rep_rL7wK4xP2dGs` |

### 9.3 agent_repos

Tracks the Git repository backing each agent.

```typescript
export const agentRepos = pgTable(
  "agent_repos",
  {
    id: varchar("id", { length: 30 }).primaryKey(), // rep_...
    agentId: varchar("agent_id", { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    orgId: varchar("org_id", { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Storage path on platform (e.g., /repos/org_xxx/support-agent.git)
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    // Default branch (usually "main")
    defaultBranch: varchar("default_branch", { length: 100 }).notNull().default("main"),
    // Latest commit SHA on default branch
    headSha: varchar("head_sha", { length: 40 }),
    // Repo size in bytes (for quota enforcement)
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    // CI/CD pipeline configuration (from agentsy.config.ts ci block)
    pipelineConfig: jsonb("pipeline_config").$type<PipelineConfig>(),
    // Evolution configuration (from evolve.config.ts)
    evolveConfig: jsonb("evolve_config").$type<EvolutionConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_repos_agent_id_idx").on(table.agentId),
    index("agent_repos_org_id_idx").on(table.orgId),
  ]
);

type PipelineConfig = {
  evalOnPush?: boolean;
  evalDatasets?: string[];
  regressionGate?: boolean;
  minScore?: number;
  autoDeploy?: Record<string, { onPush: string | false; requireEval?: boolean }>;
  notify?: { onFailure?: string[]; onDeploy?: string[] };
};

type EvolutionConfig = {
  metric?: {
    dataset: string;
    graders: string[];
    weights: Record<string, number>;
  };
  mutable?: string[];
  frozen?: string[];
  directives?: string;
  budget?: {
    maxMutations?: number;
    maxCostUsd?: number;
    maxDurationMinutes?: number;
    maxCostPerMutation?: number;
  };
  schedule?: string; // cron expression
  safety?: {
    maxRegressionPerGrader?: number;
    zeroToleranceGraders?: string[];
  };
  autoPromote?: "none" | "staging" | "production";
  simplicityPressure?: boolean;
};
```

### 9.4 evolution_sessions

A single evolution run — one invocation of the mutation loop.

```typescript
export const evolutionSessions = pgTable(
  "evolution_sessions",
  {
    id: varchar("id", { length: 30 }).primaryKey(), // evo_...
    orgId: varchar("org_id", { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 30 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    repoId: varchar("repo_id", { length: 30 })
      .notNull()
      .references(() => agentRepos.id, { onDelete: "cascade" }),
    // Version at session start (baseline)
    baselineVersionId: varchar("baseline_version_id", { length: 30 })
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict" }),
    // Version at session end (if mutations were kept)
    resultVersionId: varchar("result_version_id", { length: 30 })
      .references(() => agentVersions.id, { onDelete: "set null" }),
    status: evolutionSessionStatusEnum("status").notNull().default("queued"),
    // Snapshot of evolution config used for this session
    config: jsonb("config").$type<EvolutionConfig>().notNull(),
    // Session metrics
    totalMutations: integer("total_mutations").notNull().default(0),
    keptMutations: integer("kept_mutations").notNull().default(0),
    discardedMutations: integer("discarded_mutations").notNull().default(0),
    errorMutations: integer("error_mutations").notNull().default(0),
    baselineCompositeScore: doublePrecision("baseline_composite_score"),
    finalCompositeScore: doublePrecision("final_composite_score"),
    totalCostUsd: doublePrecision("total_cost_usd").notNull().default(0),
    totalDurationMs: integer("total_duration_ms"),
    // Git context
    branchName: varchar("branch_name", { length: 255 }),
    startCommitSha: varchar("start_commit_sha", { length: 40 }),
    endCommitSha: varchar("end_commit_sha", { length: 40 }),
    // Trigger context
    triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // "schedule" | "manual" | "api"
    triggeredByUserId: varchar("triggered_by_user_id", { length: 255 }),
    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("evolution_sessions_org_id_idx").on(table.orgId),
    index("evolution_sessions_agent_id_idx").on(table.agentId),
    index("evolution_sessions_status_idx").on(table.status),
    index("evolution_sessions_created_at_idx").on(table.createdAt),
  ]
);
```

### 9.5 evolution_mutations

Individual mutation attempts within a session.

```typescript
export const evolutionMutations = pgTable(
  "evolution_mutations",
  {
    id: varchar("id", { length: 30 }).primaryKey(), // mut_...
    sessionId: varchar("session_id", { length: 30 })
      .notNull()
      .references(() => evolutionSessions.id, { onDelete: "cascade" }),
    orgId: varchar("org_id", { length: 30 })
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Sequence number within the session (1-indexed)
    sequenceNumber: integer("sequence_number").notNull(),
    mutationType: mutationTypeEnum("mutation_type").notNull(),
    status: mutationStatusEnum("status").notNull().default("pending"),
    // Human-readable description of what changed
    description: text("description").notNull(),
    // Meta-agent's hypothesis for why this should improve scores
    hypothesis: text("hypothesis"),
    // The actual config diff (JSON patch format)
    configDiff: jsonb("config_diff").$type<ConfigDiff>().notNull(),
    // Eval results for this mutation
    experimentId: varchar("experiment_id", { length: 30 })
      .references(() => evalExperiments.id, { onDelete: "set null" }),
    compositeScore: doublePrecision("composite_score"),
    perGraderScores: jsonb("per_grader_scores")
      .$type<Record<string, number>>(),
    // Why kept or discarded
    decisionReason: text("decision_reason"),
    // Git context
    commitSha: varchar("commit_sha", { length: 40 }),
    // Cost and duration for this mutation's eval
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("evolution_mutations_session_id_idx").on(table.sessionId),
    index("evolution_mutations_org_id_idx").on(table.orgId),
    uniqueIndex("evolution_mutations_session_sequence_idx").on(
      table.sessionId,
      table.sequenceNumber
    ),
  ]
);

type ConfigDiff = {
  field: string;         // e.g., "systemPrompt", "tools", "model"
  before: unknown;       // previous value
  after: unknown;        // new value
}[];
```

**RLS**: All tables use `org_id = current_setting('app.org_id')`.

---

## 10. API Additions

### 10.1 Agent Repos

```
POST   /v1/agents/{agentId}/repo              — Initialize repo for agent
GET    /v1/agents/{agentId}/repo              — Get repo metadata
GET    /v1/agents/{agentId}/repo/commits      — List commits (paginated)
GET    /v1/agents/{agentId}/repo/diff          — Get diff between versions
```

### 10.2 Evolution Sessions

```
POST   /v1/agents/{agentId}/evolve            — Start evolution session
GET    /v1/agents/{agentId}/evolve            — List evolution sessions (paginated)
GET    /v1/agents/{agentId}/evolve/{sessionId} — Get session details
POST   /v1/agents/{agentId}/evolve/{sessionId}/cancel — Cancel running session
GET    /v1/agents/{agentId}/evolve/{sessionId}/mutations — List mutations in session
GET    /v1/agents/{agentId}/evolve/{sessionId}/stream — SSE stream of session events
```

### 10.3 Evolution Promotion

```
POST   /v1/agents/{agentId}/evolve/{sessionId}/promote — Promote evolved version
  Body: { environment: "staging" | "production" }
  Requires: org admin for production
```

### 10.4 CI Pipeline

```
GET    /v1/agents/{agentId}/pipelines          — List pipeline runs (paginated)
GET    /v1/agents/{agentId}/pipelines/{runId}  — Get pipeline run details
POST   /v1/agents/{agentId}/pipelines/{runId}/retry — Retry failed pipeline
```

### 10.5 Webhook Events

New webhook event types:

| Event | Payload |
|-------|---------|
| `evolution.started` | `{ session_id, agent_id, trigger }` |
| `evolution.mutation_complete` | `{ session_id, mutation_id, status, score }` |
| `evolution.completed` | `{ session_id, kept, discarded, score_delta }` |
| `pipeline.started` | `{ run_id, agent_id, trigger, commit_sha }` |
| `pipeline.completed` | `{ run_id, status, eval_results }` |
| `pipeline.failed` | `{ run_id, error, stage }` |

---

## 11. Dashboard UX

### 11.1 Agent Detail — Evolution Tab

```
┌─────────────────────────────────────────────────────────┐
│  support-agent › Evolution                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Score Trend          [0.75 ─── 0.82 ─── 0.85 ─── 0.89] │
│                       ver_039  ver_040  ver_041  ver_042  │
│                                                          │
│  Last Session: 4h ago (nightly) │ Next: tonight 2am      │
│  Status: 5 mutations — 2 kept, 3 discarded               │
│  Cost: $3.42 │ Duration: 18m                             │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Mutation History (evo_abc123)                        │ │
│  ├──────┬────────┬───────────────────────┬──────┬──────┤ │
│  │ #    │ Type   │ Description           │ Score│Status│ │
│  ├──────┼────────┼───────────────────────┼──────┼──────┤ │
│  │ 1    │ base   │ initial config        │ 0.850│ —    │ │
│  │ 2    │ instr  │ shortened refund...   │ 0.870│ KEEP │ │
│  │ 3    │ tool-  │ removed searchKB      │ 0.865│ DROP │ │
│  │ 4    │ model  │ switched to haiku     │ 0.830│ DROP │ │
│  │ 5    │ param  │ temp 0.7→0.3          │ 0.890│ KEEP │ │
│  └──────┴────────┴───────────────────────┴──────┴──────┘ │
│                                                          │
│  [View Config Diff]  [Promote ver_042 to Staging]        │
│  [Run Evolution Now] [Edit Directives]                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Agent Detail — CI/CD Tab

```
┌─────────────────────────────────────────────────────────┐
│  support-agent › CI/CD                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Pipeline Runs                                           │
│  ┌──────┬──────────┬──────────┬───────┬────────┬───────┐│
│  │ #    │ Trigger  │ Commit   │ Eval  │ Deploy │Status ││
│  ├──────┼──────────┼──────────┼───────┼────────┼───────┤│
│  │ 47   │ push     │ a1b2c3d  │ PASS  │ staging│   ✓   ││
│  │ 46   │ evolve   │ e4f5g6h  │ PASS  │ —      │   ✓   ││
│  │ 45   │ push     │ i7j8k9l  │ FAIL  │ —      │   ✗   ││
│  │ 44   │ manual   │ m0n1o2p  │ PASS  │ prod   │   ✓   ││
│  └──────┴──────────┴──────────┴───────┴────────┴───────┘│
│                                                          │
│  Environments                                            │
│  ┌─────────────┬──────────┬──────────┬─────────────────┐│
│  │ Environment │ Version  │ Deployed │ Status          ││
│  ├─────────────┼──────────┼──────────┼─────────────────┤│
│  │ production  │ ver_041  │ 2d ago   │ ● healthy       ││
│  │ staging     │ ver_042  │ 4h ago   │ ● healthy       ││
│  │ development │ ver_043  │ 1m ago   │ ● healthy       ││
│  └─────────────┴──────────┴──────────┴─────────────────┘│
│                                                          │
│  [Promote ver_042 staging → production]                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 11.3 Agent Detail — Repository Tab

```
┌─────────────────────────────────────────────────────────┐
│  support-agent › Repository                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Clone: agentsy://org_acme/support-agent                 │
│  Branch: main (a1b2c3d)                                  │
│                                                          │
│  Recent Commits                                          │
│  ┌──────────┬──────────────────────────────┬───────────┐│
│  │ SHA      │ Message                      │ Author    ││
│  ├──────────┼──────────────────────────────┼───────────┤│
│  │ a1b2c3d  │ evolve: +0.04 composite      │ agentsy   ││
│  │ e4f5g6h  │ Add escalation instructions  │ ishwar    ││
│  │ i7j8k9l  │ evolve: +0.02 composite      │ agentsy   ││
│  │ m0n1o2p  │ Initial agent setup          │ ishwar    ││
│  └──────────┴──────────────────────────────┴───────────┘│
│                                                          │
│  Files                                                   │
│  📄 agentsy.config.ts                                    │
│  📁 tools/                                               │
│  📁 evals/                                               │
│  📄 evolve.config.ts                                     │
│  📄 package.json                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 12. Phasing

This feature set spans multiple implementation phases:

### Phase 2 Addition: Agent Git Repos (Foundation)

- Initialize bare Git repo when agent is created
- Store agent config in repo
- `agentsy push` / `agentsy pull` commands
- Agent version creation from Git commits
- `agent_repos` table

### Phase 4 Addition: Evolution Ledger

- `evolution_sessions` and `evolution_mutations` tables
- Ledger write/read logic
- TSV export to repo

### Phase 7 Addition: CI/CD Pipeline

- Pipeline Temporal workflow
- Push hooks (validate → eval → deploy)
- PR eval comparison
- Auto-deploy logic
- Pipeline API endpoints

### Phase 11 (New): Auto-Evolution Engine

- Meta-agent implementation
- Mutation strategy library
- Evolution loop Temporal workflow
- Evolution API endpoints
- Evolution dashboard tab
- Schedule-based evolution (cron)
- Budget enforcement
- Promotion flow with approval gates

### Phase 11 Dependencies

```
Phase 2 (Agent Definition & Versioning)
  └── Phase 4 (Eval Engine)
        └── Phase 7 (Deployment & Environments)
              └── Phase 11 (Auto-Evolution Engine)
```

The evolution engine is the capstone feature that ties together versioning, evaluation, deployment, and autonomous optimization into a closed loop.

---

## Appendix: Comparison with autoresearch

| Dimension | autoresearch | Agentsy Evolution |
|-----------|-------------|-------------------|
| What's being optimized | `train.py` (Python code) | Agent config (prompt, tools, model, params) |
| Evaluation metric | `val_bpb` (bits per byte) | Composite eval score (configurable) |
| Evaluation budget | 5 min wall clock | Configurable cost + time + iteration caps |
| Search space | Arbitrary code changes | Structured mutation types |
| Version control | Git branch, advance or reset | Git repo per agent, same pattern |
| Experiment log | `results.tsv` | `evolution_mutations` table + local TSV |
| Human interface | `program.md` | Evolution directives (natural language) |
| Safety | None needed (sandboxed training) | Budget caps, regression gates, approval flows |
| Simplicity pressure | "All else equal, simpler" | Configurable simplicity scoring |
| Deployment | N/A (research only) | Auto-promote to staging/production with gates |
| Multi-tenancy | Single user | Org-scoped with RLS |
