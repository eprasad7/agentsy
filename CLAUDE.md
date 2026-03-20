# Agentsy — Project Instructions

## What Is This

Agentsy is an operating system for AI agents. One platform to define, test, deploy, and monitor agents in production. Think "Vercel for agents." The winning agent platform won't have the most features — it will have the most **reliable** agents.

## Architecture

```
Client → agentsy-api (Fastify) → Temporal Cloud → agentsy-worker
                ↕                                        ↕
            PostgreSQL 16                         LLM Providers
          (Fly Managed + RLS)                   (Anthropic, OpenAI)
                ↕
              Redis 7
         (rate limits, pub/sub)
```

| Service | Tech | Role |
|---------|------|------|
| `agentsy-api` | Fastify + Node.js | REST API, SSE streaming, auth, RLS context |
| `agentsy-web` | Next.js 15, React 19 | Dashboard |
| `agentsy-worker` | Temporal TypeScript SDK | Durable execution: LLM calls, tool execution, evals |
| PostgreSQL 16 | Fly Managed Postgres + pgvector | Primary data, vectors, RLS tenant isolation |
| Redis 7 | Self-managed on Fly | Rate limits, pub/sub, caching (non-critical) |
| Temporal Cloud | Managed | Workflow orchestration, checkpointing, signals |
| Tigris | Fly-native S3 | Object storage (KB files, artifacts) |

## Monorepo Layout

```
apps/
  api/              → Fastify API server (agentsy-api)
  web/              → Next.js 15 dashboard (agentsy-web)
  worker/           → Temporal worker (agentsy-worker)
packages/
  sdk/              → @agentsy/sdk (defineAgent, defineTool) — published
  client/           → @agentsy/client (API client) — published
  eval/             → @agentsy/eval (datasets, graders, experiments) — published
  cli/              → @agentsy/cli (agentsy init/dev/deploy) — published
  db/               → @agentsy/db (Drizzle schema + migrations) — internal
  ui/               → @agentsy/ui (React components) — internal
  shared/           → @agentsy/shared (types, ID gen, constants) — internal
```

**Build**: Turborepo + pnpm workspaces. Target ES2022. Dual CJS/ESM via tsup. Node.js 22+.

## Stack Decisions (Key Ones)

| Area | Decision |
|------|----------|
| Agentic loop | Model-driven (NOT graph-based state machines) |
| Durable execution | Temporal Cloud |
| Database | PostgreSQL 16 + pgvector (Fly Managed Postgres) |
| ORM | Drizzle ORM |
| Vector search | pgvector + BM25 + RRF hybrid |
| Auth | Better Auth (library, NOT Clerk/Auth0) |
| Tenant isolation | PostgreSQL RLS (per-transaction context) |
| Secrets | AES-256-GCM encrypted columns in PostgreSQL (NOT a vault) |
| LLM interface | Vercel AI SDK |
| LLM providers | Anthropic (P0), OpenAI (P0) |
| Tool interface | MCP (Model Context Protocol) + native TypeScript tools |
| Eval engine | Custom, built on platform traces (NOT Braintrust/DeepEval) |
| Frontend | Next.js 15 + shadcn/ui + Tailwind + Recharts |
| State management | TanStack Query + Zustand |
| Streaming | SSE for agent runs; WebSocket for dashboard |
| Hosting | Fly.io (3 services) |
| CI/CD | GitHub Actions |
| Object storage | Tigris (Fly-native S3) |

## Database Conventions

**IDs**: Prefixed nanoid — `{prefix}_{21chars}`. Examples: `org_V1StGXR8_Z5jdHi6B`, `run_hT2cF8nM6jLz`.

```typescript
import { newId } from "@agentsy/shared";
const id = newId("org"); // → "org_V1StGXR8_Z5jdHi6B"
```

**Timestamps**: All `timestamptz` in UTC. Every table has `created_at` (default now) and `updated_at` (via trigger). Soft-delete tables have nullable `deleted_at`.

**Multi-tenancy**: Every table has `org_id`. RLS policies filter by `current_setting('app.org_id')`. API sets this per-transaction.

**Soft delete**: `organizations`, `agents`, `sessions`, `knowledge_bases`, `eval_datasets`. RLS policies include `deleted_at IS NULL`.

**JSONB**: Typed with TypeScript interfaces. Validated with Zod at app layer before insert.

## Agent Run Flow

1. Client → API: `POST /v1/agents/:id/run`
2. API validates auth, checks RLS, rate limits
3. API starts Temporal workflow → returns `run_id`
4. Worker loads config, enters loop: LLM call → tool check → tool exec → iterate
5. Worker publishes events → Redis pub/sub → API → SSE → Client
6. Worker writes `run_steps` to Postgres, updates `runs` on completion

**Approval gates**: Tools with `riskLevel: "write"` pause at Temporal signal. API receives approve/deny, worker resumes.

## Key Patterns

- **Capability classes**: `"balanced" | "fast" | "reasoning"` resolve to concrete models at runtime
- **Tool risk levels**: `"read"` (auto-approve), `"write"` (approval in prod), `"admin"` (approval everywhere)
- **Eval modes**: `"mock"` (default), `"dry-run"`, `"live"` for tool execution during evals
- **Redis degradation**: Redis is non-critical. Rate limits fall back to permissive if Redis is down
- **Local dev parity**: `agentsy dev` uses SQLite (not Postgres), in-process loops (not Temporal), single-tenant (no RLS). Same SDK, same configs

## Beta Scope

**Phases 0–10** = private beta. **Phases 11–12** = post-beta.

During beta implementation, do NOT implement:
- Tables: `run_artifacts`, `agent_repos`, `evolution_sessions`, `evolution_mutations`
- API sections 21–24 (Artifacts, Repos, Pipelines, Evolution)
- SDK: `defineEvolution`, `CodeExecutionConfig`
- CLI: `push`, `pull`, `evolve`

## Spec Reference

| Doc | What |
|-----|------|
| `docs/prd-v1.md` | Product requirements, priorities, milestones |
| `docs/architecture-v1.md` | System architecture, service topology, flows |
| `docs/technology-decisions.md` | All D-x.x decisions with rationale |
| `docs/spec-data-model.md` | Full Drizzle schema (29 tables, 25 beta) |
| `docs/spec-api.md` | REST API endpoints (sections 1–24) |
| `docs/spec-sdk.md` | SDK types, tool definitions, eval SDK |
| `docs/deployment-flyio.md` | Fly.io deployment runbook |
| `docs/user-journeys.md` | 20 end-to-end user journeys |
| `docs/implementation-plan.md` | 15 phases with steps, files, acceptance criteria |
| `docs/spec-code-execution.md` | E2B sandbox code execution (post-beta) |
| `docs/spec-agent-evolution.md` | Auto-evolution engine (post-beta) |

## Code Style

- TypeScript strict mode everywhere
- No `any` types (use `unknown` + type guards)
- Zod for validation at system boundaries (API input, JSONB before insert)
- Errors are typed: `ApiError { code, message, details? }`
- snake_case for DB columns, API request/response fields
- camelCase for TypeScript code
- Prefer `const` assertions and discriminated unions
