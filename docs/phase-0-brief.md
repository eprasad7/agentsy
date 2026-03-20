# Phase 0: Project Scaffold & Infrastructure — Implementation Brief

**Goal**: Monorepo builds, infra provisioned, 25 beta tables defined, local dev works, CI passes.
**Duration**: 3–4 days
**Dependencies**: None (first phase)

---

## Prerequisites (Obtain Before Starting)

1. GitHub org `agentsy` with `agentsy` monorepo
2. npm scope `@agentsy` registered
3. Fly.io account with `flyctl` installed
4. Temporal Cloud namespace `agentsy-prod` with mTLS cert/key pair
5. Google + GitHub OAuth credentials (for Better Auth)
6. Anthropic + OpenAI API keys
7. Domain `agentsy.com` with DNS for `app.agentsy.com` and `api.agentsy.com`
8. Node.js 22.x, pnpm 9.x, Turborepo installed globally

---

## Steps

### 0.1 — Initialize Monorepo

Create root workspace config.

```
package.json            → workspaces: ["apps/*", "packages/*"]
pnpm-workspace.yaml     → packages: ['apps/*', 'packages/*']
turbo.json              → pipeline: { build, dev, lint, typecheck, test }
tsconfig.base.json      → target: ES2022, strict, moduleResolution: NodeNext
.npmrc                  → shamefully-hoist=false, strict-peer-dependencies=true
.eslintrc.cjs           → TypeScript plugin, import sorting
.prettierrc             → trailing commas, single quotes, 2-space indent
.editorconfig
.gitignore
```

**Done when**: `pnpm install && turbo build` succeeds (even with empty packages).

---

### 0.2 — Create Package Stubs

Create all directories with `package.json` + `tsconfig.json` stubs.

```
apps/api/         → "agentsy-api"
apps/web/         → "agentsy-web"
apps/worker/      → "agentsy-worker"
packages/sdk/     → "@agentsy/sdk"
packages/client/  → "@agentsy/client"
packages/eval/    → "@agentsy/eval"
packages/cli/     → "@agentsy/cli"
packages/db/      → "@agentsy/db"
packages/ui/      → "@agentsy/ui"
packages/shared/  → "@agentsy/shared"
```

Each `tsconfig.json` extends `../../tsconfig.base.json`.

**Done when**: `pnpm -r ls` lists all 10 packages.

---

### 0.3 — `@agentsy/shared` — ID Generator & Core Types

**Ref**: spec-data-model.md section 1 (nanoid), spec-sdk.md section 6.1.1 (RunInput/RunOutput)

```
packages/shared/src/
  id.ts           → newId(prefix) using customAlphabet nanoid (21 chars)
  types.ts        → RunInput, RunOutput, ApiError, PaginatedResponse, SSE event types
  constants.ts    → Guardrail defaults, capability class → model mappings
  pricing.ts      → Per-model token pricing table (USD/1M tokens)
  index.ts        → Barrel export
```

**ID prefixes** (from spec-data-model.md):
```
org, mem, key, ag, ver, env, dep, run, stp, ses, msg,
eds, edc, exp, exr, ebl, kb, kc, sec, usg, whk, con, conn, alr, ntf
```

**Test**: `packages/shared/src/__tests__/id.test.ts` — correct prefix, correct length, URL-safe chars.

**Done when**: `newId("org")` returns `org_` + 21 alphanumeric chars. All types compile.

---

### 0.4 — `@agentsy/db` — Drizzle Schema (25 Beta Tables)

**Ref**: spec-data-model.md sections 2–3 (tables 3.1–3.25)

```
packages/db/src/schema/
  enums.ts                    → 11 pgEnum definitions
  organizations.ts            → Table 3.1
  organization-members.ts     → Table 3.2
  api-keys.ts                 → Table 3.3
  agents.ts                   → Table 3.4
  agent-versions.ts           → Table 3.5 (JSONB: ModelSpec, ToolsConfig, GuardrailsConfig)
  environments.ts             → Table 3.6
  deployments.ts              → Table 3.7
  sessions.ts                 → Table 3.8
  runs.ts                     → Table 3.9 (JSONB: RunInput, RunOutput; parent_run_id self-FK)
  run-steps.ts                → Table 3.10 (JSONB: StepMetadata)
  messages.ts                 → Table 3.11
  eval-datasets.ts            → Table 3.12
  eval-dataset-cases.ts       → Table 3.13 (JSONB: ExpectedToolCall, MockedToolResult)
  eval-experiments.ts         → Table 3.14 (JSONB: ExperimentConfig)
  eval-experiment-results.ts  → Table 3.15 (JSONB: ScoreResult)
  eval-baselines.ts           → Table 3.16
  knowledge-bases.ts          → Table 3.17
  knowledge-chunks.ts         → Table 3.18 (pgvector + tsvector)
  tenant-secrets.ts           → Table 3.19
  webhooks.ts                 → Table 3.20
  usage-daily.ts              → Table 3.21
  connectors.ts               → Table 3.22
  connector-connections.ts    → Table 3.23
  alert-rules.ts              → Table 3.24
  notifications.ts            → Table 3.25
  index.ts                    → Barrel export
```

**Enums** (spec-data-model.md section 2):
```typescript
orgPlanEnum: "free" | "pro" | "team" | "enterprise"
orgMemberRoleEnum: "admin" | "member"
environmentTypeEnum: "development" | "staging" | "production"
runStatusEnum: "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "timeout"
stepTypeEnum: "llm_call" | "tool_call" | "retrieval" | "guardrail" | "approval_request"
messageRoleEnum: "system" | "user" | "assistant" | "tool"
evalExperimentStatusEnum: "queued" | "running" | "completed" | "failed" | "cancelled"
deploymentStatusEnum: "active" | "superseded" | "rolled_back"
approvalStatusEnum: "pending" | "approved" | "denied"
alertConditionTypeEnum: "error_rate" | "latency_p95" | "cost_per_run" | "run_failure_count"
notificationTypeEnum: "alert_triggered" | "approval_requested" | "deploy_completed" | "eval_completed"
```

**Custom types** (spec-data-model.md section 3):
```typescript
// pgvector
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType(config) { return `vector(${config?.dimensions ?? 1536})`; },
  toDriver(value) { return `[${value.join(",")}]`; },
  fromDriver(value) { return value.slice(1,-1).split(",").map(Number); },
});

// tsvector
const tsvector = customType<{ data: string }>({
  dataType() { return "tsvector"; },
});
```

**Critical notes**:
- Every table has `org_id` (for RLS), `created_at`, `updated_at`
- `agent_versions` is immutable (no `updated_at`)
- `runs.parent_run_id` self-references for multi-agent orchestration
- JSONB columns have documented TypeScript type contracts
- Do NOT create post-beta tables (run_artifacts, agent_repos, evolution_sessions, evolution_mutations)

Also create:
```
packages/db/
  src/client.ts           → DB client factory (Postgres prod, SQLite dev)
  src/seed.ts             → Seed: test org + test user + test API key
  src/rls.sql             → All RLS policies
  src/triggers.sql        → set_updated_at, knowledge_chunks_tsv_trigger
  drizzle.config.ts       → Drizzle Kit config
```

**Test**: `packages/db/src/__tests__/schema.test.ts` — all schemas compile, relations valid.

**Done when**: `drizzle-kit generate` produces valid SQL for all 25 tables.

---

### 0.5 — Provision Fly Managed Postgres

**Ref**: deployment-flyio.md section 2.4

```bash
fly mpg create --name agentsy-db --region iad --plan launch-2
fly mpg attach agentsy-db --app agentsy-api
fly mpg attach agentsy-db --app agentsy-worker
```

Post-provision SQL:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Run migrations: `pnpm drizzle-kit migrate`

Enable RLS on all 25 tables. Create `agentsy_app` and `agentsy_service` roles. Apply RLS policies and triggers from `rls.sql` and `triggers.sql`.

**Done when**: All 25 tables exist, RLS policies active, extensions enabled.

---

### 0.6 — Provision Redis

**Ref**: deployment-flyio.md section 2.5

Deploy Redis 7 on Fly Machine with persistent volume and password auth.

**Done when**: `redis-cli -h agentsy-redis.internal ping` → PONG from API machine.

---

### 0.7 — Connect Temporal Cloud

**Ref**: deployment-flyio.md section 3, architecture-v1.md section 2.3

```
apps/worker/src/
  client.ts       → Temporal connection (mTLS, namespace: agentsy-prod)
  worker.ts       → Worker bootstrap, polls agentsy-agent-runs task queue
  workflows/
    index.ts      → Empty registry
  activities/
    index.ts      → Empty registry
```

Store mTLS cert/key in `fly secrets`.

**Done when**: Worker starts, connects to Temporal Cloud, polls without errors.

---

### 0.8 — Provision Tigris Object Storage

**Ref**: deployment-flyio.md section 1

```bash
fly storage create -a agentsy-api
```

Wrap with S3-compatible client in `packages/shared/src/storage.ts`.

**Done when**: Can put/get an object via S3 SDK.

---

### 0.9 — App Scaffolds

Minimal Fastify server and Next.js app:

```
apps/api/src/
  index.ts          → Fastify bootstrap with health endpoint
  fly.toml          → Fly config (iad region, 256mb)

apps/web/
  src/app/layout.tsx → Root layout
  src/app/page.tsx   → Placeholder home
  next.config.ts
  fly.toml

apps/api/Dockerfile  → Multi-stage build
apps/web/Dockerfile  → Next.js standalone
apps/worker/Dockerfile → Node.js + Temporal SDK
```

**Done when**: `GET /health` returns 200 from API. Next.js renders a page.

---

### 0.10 — GitHub Actions CI

**Ref**: deployment-flyio.md section 4

```
.github/workflows/
  ci.yml      → On PR: install → lint → typecheck → test
  deploy.yml  → On merge to main: build → deploy (initially disabled)
```

**Done when**: PR triggers CI, all checks pass on the scaffold.

---

### 0.11 — SQLite Local Dev Mode

**Ref**: architecture-v1.md section 9, technology-decisions.md D-2.5

Create SQLite-compatible schema subset in `packages/db/src/sqlite-schema/`. No RLS, no pgvector, no tsvector. DB client factory in `client.ts` switches based on `NODE_ENV`.

**Done when**: SQLite tables create and basic CRUD works.

---

## Acceptance Criteria (Phase 0 Complete)

| Check | Evidence |
|-------|----------|
| Monorepo builds | `pnpm install && turbo build` succeeds |
| Lint passes | `turbo lint` returns 0 errors |
| Types pass | `turbo typecheck` returns 0 errors |
| ID generator | Unit test passes |
| Schema compiles | 25 Drizzle table definitions, all JSONB typed |
| Migrations | `drizzle-kit generate` produces valid SQL |
| Postgres | 25 tables, RLS active, extensions enabled |
| Redis | Ping succeeds |
| Temporal | Worker connects and polls |
| Tigris | Put/get object succeeds |
| SQLite | Dev mode CRUD works |
| CI | PR workflow runs and passes |
| Seed | Test org + user + API key created |

---

## What NOT To Do in Phase 0

- Do not implement auth middleware (Phase 1)
- Do not implement agent runtime or tool execution (Phase 2)
- Do not implement API endpoints beyond `/health` (Phase 1+)
- Do not create post-beta tables (run_artifacts, agent_repos, evolution_sessions, evolution_mutations)
- Do not set up observability/tracing (Phase 2+)
- Do not configure auto-deploy in CI (Phase 7)
