# Agentsy

**Operating system for AI agents** — define, test, deploy, and monitor agents in production. One platform for durable runs, tools, evals, observability, and multi-tenant isolation.

> *The winning agent platform won’t have the most features — it will have the **most reliable** agents.*

---

## Architecture

```
Client  →  agentsy-api (Fastify)  →  Temporal Cloud  →  agentsy-worker
              ↕                           ↕
         PostgreSQL 16              LLM providers
         (RLS + pgvector)          (Anthropic, OpenAI)
              ↕
            Redis 7
    (rate limits, pub/sub, cache — non-critical path)
              ↕
          Tigris (S3)
    (artifacts, KB files — when wired)
```

| Service | Role |
|--------|------|
| **agentsy-api** | REST, SSE, Better Auth, tenant RLS context, rate limits |
| **agentsy-web** | Next.js 15 dashboard |
| **agentsy-worker** | Temporal worker — agent loop, tools, evals |
| **PostgreSQL** | Fly Managed Postgres; Drizzle ORM; RLS per org |
| **Redis** | Rate limiting, idempotency, (planned) run-event pub/sub |
| **Temporal** | Durable workflows (Cloud in prod; in-process loop in `agentsy dev`) |

---

## Monorepo layout

```
apps/
  api/      → agentsy-api (Fastify)
  web/      → agentsy-web (Next.js)
  worker/   → agentsy-worker (Temporal)
packages/
  sdk/      → @agentsy/sdk (published)
  client/   → @agentsy/client (published)
  eval/     → @agentsy/eval (published)
  cli/      → @agentsy/cli (published)
  db/       → @agentsy/db (Drizzle schema + migrations — internal)
  ui/       → @agentsy/ui (internal)
  shared/   → @agentsy/shared (internal)
```

**Build**: Turborepo · **pnpm** workspaces · TypeScript strict · ES2022 · Node **≥ 22**.

---

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

### Environment (API / worker)

- **`DATABASE_URL`** — PostgreSQL (omit in local SQLite mode where supported; see `@agentsy/db`)
- **`REDIS_URL`** — optional; rate limits and idempotency degrade if unset
- **Temporal** — `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, optional mTLS PEMs (`TEMPORAL_CLIENT_CERT` / `TEMPORAL_CLIENT_KEY`)

### Database migrations (Postgres)

```bash
export DATABASE_URL='postgresql://...'
pnpm --filter @agentsy/db db:migrate
```

See [`packages/db/README.md`](packages/db/README.md) for schema, RLS/triggers (migration `0001`), and seed.

---

## Implementation plan (phases)

Work is sequenced in **`docs/implementation-plan.md`** (15 phases, PRD milestones 1–4 + post-beta).

| Phases | Scope |
|--------|--------|
| **0–10** | **Private beta** — scaffold → auth → runtime → streaming → evals → memory/KB → tools/MCP → connectors → deploy → dashboard → CLI → webhooks |
| **11, 11.5, 12** | **Post-beta** — agent Git repos, E2B code execution, auto-evolution |

**Do not implement in beta** (per plan): tables `run_artifacts`, `agent_repos`, `evolution_*`; API §21–24; SDK `defineEvolution` / `CodeExecutionConfig`; CLI `push` / `pull` / `evolve`.

Phase checkpoint: [`docs/phase-0-review.md`](docs/phase-0-review.md).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/prd-v1.md`](docs/prd-v1.md) | Product requirements, beta vs P0 |
| [`docs/architecture-v1.md`](docs/architecture-v1.md) | Services, flows, local dev |
| [`docs/technology-decisions.md`](docs/technology-decisions.md) | ADRs (Temporal, Drizzle, RLS, Redis, etc.) |
| [`docs/spec-data-model.md`](docs/spec-data-model.md) | Drizzle / Postgres schema |
| [`docs/spec-api.md`](docs/spec-api.md) | REST + SSE |
| [`docs/spec-sdk.md`](docs/spec-sdk.md) | SDK & client |
| [`docs/deployment-flyio.md`](docs/deployment-flyio.md) | Fly, Postgres, Redis, secrets, CI |
| [`docs/user-journeys.md`](docs/user-journeys.md) | End-to-end journeys |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Phases, tasks, acceptance |
| [`CLAUDE.md`](CLAUDE.md) | AI/agent coding rules for this repo |

Research / blueprint PDFs (optional context): `docs/agent-os-blueprint-2026-03.md`, `docs/agent-evals-engine-2026-03.md`.

---

## Conventions (short)

- **IDs**: prefixed nanoid — `org_…`, `run_…` — via `@agentsy/shared`
- **API fields**: `snake_case` · **TS code**: `camelCase`
- **Tenancy**: `org_id` + Postgres RLS (`app.org_id`)
- **Errors**: typed `ApiError` · boundaries validated with **Zod**

---

## License & status

Private beta codebase — **not** published as open source unless stated elsewhere. npm packages (`@agentsy/*`) may be published under their own license when released.
