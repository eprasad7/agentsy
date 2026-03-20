# Agentsy Implementation Plan

**Author**: Planning Agent
**Date**: March 2026
**Status**: Draft
**References**: PRD v1, Architecture v1, Technology Decisions, Data Model Spec, API Spec, SDK Spec, Deployment Runbook, User Journeys, Agent Evolution Spec, Code Execution Spec

---

## Overview

### Total Phases

15 phases (Phase 0-12 + Phase 6b + Phase 11.5), mapping to PRD Milestones 1-4 (weeks 1-16) plus post-beta milestones. Each phase builds on the previous. A developer should complete phases sequentially; some sub-tasks within a phase can be parallelized.

### Phase-to-Milestone Mapping

| Phase | Name | PRD Milestone | Estimated Duration |
|-------|------|---------------|-------------------|
| 0 | Project Scaffold & Infrastructure | Pre-milestone | 3-4 days |
| 1 | Auth & Multi-Tenancy | Milestone 1 | 3-4 days |
| 2 | Agent Definition & Runtime | Milestone 1 | 5-7 days |
| 3 | Streaming & API | Milestone 1-2 | 3-4 days |
| 4 | Eval Engine | Milestone 3 | 5-7 days |
| 5 | Memory & Knowledge Base | Milestone 4 | 4-5 days |
| 6 | Tool System & MCP | Milestone 4 | 3-4 days |
| 6b | Connector Catalog | Milestone 4 | 5-7 days |
| 7 | Deployment & Environments | Milestone 4 | 3-4 days |
| 8 | Dashboard & Observability | Milestone 2-4 | 5-7 days |
| 9 | CLI Polish & DX | Milestone 1-4 | 3-4 days |
| 10 | Webhooks & Integration | Milestone 4 | 2-3 days |
| 11 | Agent Git Repos & CI/CD | Post-beta | 5-7 days |
| 11.5 | Code Execution (E2B Sandbox) | Post-beta | 5-7 days |
| 12 | Auto-Evolution Engine | Post-beta | 7-10 days |

### Phase-to-Journey Mapping

| Journey | Description | Primary Phase | Supporting Phases |
|---------|-------------|---------------|-------------------|
| J1 | Signup & Onboarding | Phase 1 | Phase 8, 9 |
| J2 | Create & Define an Agent | Phase 2 | Phase 9 |
| J3 | Local Development & Testing | Phase 2, 3 | Phase 9 |
| J4 | Write & Run Evals | Phase 4 | Phase 9 |
| J5 | Deploy to Production | Phase 7 | Phase 9 |
| J6 | Monitor & Debug in Production | Phase 8 | Phase 3 |
| J7 | Integrate via API & SDK | Phase 3 | Phase 2 |
| J8 | Team Collaboration | Phase 1 | Phase 8 |
| J9 | Knowledge Base & RAG | Phase 5 | Phase 9 |
| J10 | Connect MCP Servers | Phase 6 | Phase 2, 6b |
| J17 | Connect via Connector Catalog | Phase 6b | Phase 8 |
| J11 | LLM-as-Judge Evals | Phase 4 | - |
| J12 | Add Failing Run to Eval Dataset | Phase 4 | Phase 8 |
| J13 | Agent Dashboard Overview | Phase 8 | - |
| J14 | Fallback Model Configuration | Phase 2 | - |
| J15 | CI/CD Integration | Phase 4 | Phase 9 |
| J16 | Alerting & Notifications | Phase 8 | Phase 10 |
| J18 | Agent Git Repo & CI/CD | Phase 11 | Phase 7, 9 |
| J20 | Code Execution in Agent Runs | Phase 11.5 | Phase 6 |
| J19 | Agent Auto-Evolution | Phase 12 | Phase 4, 11, 11.5 |

### Prerequisites (Accounts & Credentials)

Before starting Phase 0, obtain the following:

1. **GitHub organization**: Create `agentsy` org, create `agentsy` monorepo
2. **npm organization**: Register `@agentsy` scope on npmjs.com
3. **Fly.io account**: Create account, install `flyctl`, authenticate
4. **Temporal Cloud account**: Create namespace `agentsy-prod`, generate mTLS client cert/key pair
5. **Google OAuth credentials**: Create OAuth 2.0 client in Google Cloud Console (for Better Auth)
6. **GitHub OAuth credentials**: Create OAuth App in GitHub Developer Settings (for Better Auth)
7. **Anthropic API key**: For development/testing
8. **OpenAI API key**: For development/testing and embeddings
9. **Domain**: Register `agentsy.com`, configure DNS for `app.agentsy.com` and `api.agentsy.com`
10. **Node.js 22.x**: Install via nvm or fnm
11. **pnpm 9.x**: Install globally (`npm install -g pnpm`)
12. **Turborepo**: Install globally (`npm install -g turbo`)

---

## Phase 0: Project Scaffold & Infrastructure

### Prerequisites
- All accounts and credentials from the list above.

### Steps

#### 0.1 Initialize monorepo with Turborepo + pnpm workspaces

**What**: Create the monorepo root with pnpm workspace config and Turborepo pipeline.
**Spec reference**: architecture-v1.md Appendix "Monorepo Structure", technology-decisions.md D-12.3.
**Journey**: Foundation for all journeys.
**Acceptance criteria**: `pnpm install` succeeds, `turbo build` runs (even if no packages exist yet).

Create the following root files:
- `package.json` with `"workspaces"` pointing to `apps/*` and `packages/*`
- `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`
- `turbo.json` with pipeline definitions for `build`, `dev`, `lint`, `typecheck`, `test`
- `.npmrc` with `shamefully-hoist=false`, `strict-peer-dependencies=true`

#### 0.2 Create package structure (empty packages)

**What**: Create all app and package directories with `package.json` and `tsconfig.json` stubs.
**Spec reference**: architecture-v1.md Appendix, spec-sdk.md section 2.
**Journey**: Foundation for all journeys.
**Acceptance criteria**: Every package has a valid `package.json`, all are recognized by pnpm workspaces.

Create directories:
- `apps/web/` -- Next.js 15 dashboard (agentsy-web)
- `apps/api/` -- Fastify API server (agentsy-api)
- `apps/worker/` -- Temporal worker (agentsy-worker)
- `packages/sdk/` -- `@agentsy/sdk`
- `packages/client/` -- `@agentsy/client`
- `packages/eval/` -- `@agentsy/eval`
- `packages/cli/` -- `@agentsy/cli`
- `packages/db/` -- `@agentsy/db` (internal)
- `packages/ui/` -- `@agentsy/ui` (internal)
- `packages/shared/` -- `@agentsy/shared` (internal)

#### 0.3 TypeScript / ESLint / Prettier configuration

**What**: Root-level TS config with project references, shared ESLint config, Prettier config.
**Spec reference**: technology-decisions.md D-12.3 (ES2022, CJS/ESM dual output via tsup).
**Journey**: Foundation for all journeys.
**Acceptance criteria**: `turbo lint` and `turbo typecheck` run across all packages with zero errors on the empty stubs.

Create:
- `tsconfig.base.json` -- shared compiler options (target ES2022, strict, module NodeNext)
- Each package's `tsconfig.json` extending the base
- `.eslintrc.cjs` (or `eslint.config.mjs`) at root -- TypeScript plugin, import sorting, no-unused-vars
- `.prettierrc` -- trailing commas, single quotes, 2-space indent
- `.editorconfig`

#### 0.4 Set up `@agentsy/shared` with ID generator and core types

**What**: Implement the nanoid ID generator and shared type definitions.
**Spec reference**: spec-data-model.md section 1 "Nanoid Generator", spec-sdk.md section 6.1.1 RunInput/RunOutput.
**Journey**: Foundation for all journeys.
**Acceptance criteria**: `newId('org')` returns `org_` prefixed IDs. All shared types compile.

Files to create:
- `packages/shared/src/id.ts` -- `newId()` function per spec-data-model.md section 1
- `packages/shared/src/types.ts` -- `RunInput`, `RunOutput`, `ApiError`, `PaginatedResponse`, SSE event types
- `packages/shared/src/constants.ts` -- Default guardrail values, capability class mappings, model registry
- `packages/shared/src/index.ts` -- barrel export

#### 0.5 Set up `@agentsy/db` with Drizzle schema and enum types

**What**: Implement the full Postgres schema using Drizzle ORM, including all enum types and all 25 tables (21 core + 2 connector + 2 alerting/notification tables).
**Spec reference**: spec-data-model.md sections 2 and 3 (all tables 3.1 through 3.25).
**Journey**: Foundation for all data operations.
**Acceptance criteria**: `drizzle-kit generate` produces SQL migration files. Schema compiles with correct TypeScript types.

Files to create:
- `packages/db/src/schema/enums.ts` -- All pg enums per spec-data-model.md section 2
- `packages/db/src/schema/organizations.ts` -- Table 3.1 `organizations`
- `packages/db/src/schema/organization-members.ts` -- Table 3.2 `organization_members`
- `packages/db/src/schema/api-keys.ts` -- Table 3.3 `api_keys`
- `packages/db/src/schema/agents.ts` -- Table 3.4 `agents`
- `packages/db/src/schema/agent-versions.ts` -- Table 3.5 `agent_versions` (with JSONB type contracts: ModelSpec, ToolsConfig, GuardrailsConfig, ModelParams)
- `packages/db/src/schema/environments.ts` -- Table 3.6 `environments`
- `packages/db/src/schema/deployments.ts` -- Table 3.7 `deployments`
- `packages/db/src/schema/sessions.ts` -- Table 3.8 `sessions`
- `packages/db/src/schema/runs.ts` -- Table 3.9 `runs` (with RunInput, RunOutput, RunMetadata JSONB types). **Important**: Include `parent_run_id` nullable FK (self-reference) per PRD section 6 "Multi-Agent Orchestration" — the data model must be multi-agent-aware from day one even though orchestration is P2.
- `packages/db/src/schema/run-steps.ts` -- Table 3.10 `run_steps` (with StepMetadata JSONB type)
- `packages/db/src/schema/messages.ts` -- Table 3.11 `messages`
- `packages/db/src/schema/eval-datasets.ts` -- Table 3.12 `eval_datasets`
- `packages/db/src/schema/eval-dataset-cases.ts` -- Table 3.13 `eval_dataset_cases` (with all JSONB types: ExpectedToolCall, MockedToolResult, TrajectoryStep, ApprovalExpectation, MemoryExpectation)
- `packages/db/src/schema/eval-experiments.ts` -- Table 3.14 `eval_experiments` (with ExperimentConfig JSONB type)
- `packages/db/src/schema/eval-experiment-results.ts` -- Table 3.15 `eval_experiment_results` (with ScoreResult JSONB type)
- `packages/db/src/schema/eval-baselines.ts` -- Table 3.16 `eval_baselines`
- `packages/db/src/schema/knowledge-bases.ts` -- Table 3.17 `knowledge_bases`
- `packages/db/src/schema/knowledge-chunks.ts` -- Table 3.18 `knowledge_chunks` (with pgvector custom type, tsvector custom type)
- `packages/db/src/schema/tenant-secrets.ts` -- Table 3.19 `tenant_secrets`
- `packages/db/src/schema/webhooks.ts` -- Table 3.20 `webhooks`
- `packages/db/src/schema/usage-daily.ts` -- Table 3.21 `usage_daily`
- `packages/db/src/schema/connectors.ts` -- Table 3.22 `connectors` (platform-managed catalog)
- `packages/db/src/schema/connector-connections.ts` -- Table 3.23 `connector_connections` (per-agent active connections with encrypted OAuth tokens)
- `packages/db/src/schema/alert-rules.ts` -- Table 3.24 `alert_rules` (per Amendment A9)
- `packages/db/src/schema/notifications.ts` -- Table 3.25 `notifications` (per Amendment A9)
- `packages/db/src/schema/index.ts` -- Barrel export of all tables
- `packages/db/src/index.ts` -- DB client factory (Postgres for prod, SQLite for dev)
- `packages/db/drizzle.config.ts` -- Drizzle Kit configuration

#### 0.6 Database setup (Fly Managed Postgres)

**What**: Provision Fly Managed Postgres with pgvector extension, run initial migration.
**Spec reference**: deployment-flyio.md section 2.4, spec-data-model.md section 5 (RLS policies).
**Journey**: Foundation for all journeys.
**Acceptance criteria**: `fly mpg connect agentsy-db` succeeds, `CREATE EXTENSION vector` works, migration creates all tables.

Commands:
```bash
fly mpg create --name agentsy-db --region iad --plan launch-2
fly mpg attach agentsy-db --app agentsy-api
fly mpg attach agentsy-db --app agentsy-worker
```

Post-deploy SQL per deployment-flyio.md section 2.4 (enable `vector` and `pg_trgm` extensions, tune shared_buffers).

Then apply RLS policies per spec-data-model.md section 5:
- Create `agentsy_app` role (used by API/worker connections)
- Create `agentsy_service` role (bypasses RLS for migrations/aggregation)
- Add RLS policies to every table: `org_id = current_setting('app.org_id')`
- Add soft-delete predicates where applicable
- Create the `set_updated_at()` trigger function and apply to all tables with `updated_at`
- Create the `knowledge_chunks_tsv_trigger()` per spec-data-model.md section 3.18

Files to create:
- `packages/db/src/rls.sql` -- All RLS policy definitions
- `packages/db/src/triggers.sql` -- `set_updated_at`, `knowledge_chunks_tsv_trigger`
- `packages/db/src/seed.ts` -- Seed script for development (creates test org, test agent, test API key)

#### 0.7 Redis setup

**What**: Deploy Redis 7 on Fly with persistent volume.
**Spec reference**: deployment-flyio.md section 2.5.
**Journey**: Foundation for rate limiting (J1), streaming (J3, J7).
**Acceptance criteria**: `redis-cli -h agentsy-redis.internal ping` returns PONG from API Machine.

Deploy using the `fly.toml` from deployment-flyio.md section 2.5. Set password via `fly secrets set -a agentsy-redis REDIS_PASSWORD="..."`.

#### 0.8 Temporal Cloud connection

**What**: Configure Temporal Cloud namespace, generate mTLS certs, verify worker can connect.
**Spec reference**: architecture-v1.md section 2.3, deployment-flyio.md section 3.
**Journey**: Foundation for agent runs (J2, J3), eval runs (J4).
**Acceptance criteria**: A minimal Temporal worker starts, connects to Temporal Cloud, and polls the `agentsy-agent-runs` task queue without errors.

Files to create:
- `apps/worker/src/client.ts` -- Temporal client connection (mTLS)
- `apps/worker/src/worker.ts` -- Worker bootstrap (registers workflows and activities)
- `apps/worker/src/workflows/index.ts` -- Empty workflow registry placeholder
- `apps/worker/src/activities/index.ts` -- Empty activity registry placeholder

#### 0.9 Tigris setup

**What**: Provision Tigris object storage bucket for knowledge base files, artifacts, backups.
**Spec reference**: deployment-flyio.md section 1 (Object Storage).
**Journey**: Foundation for knowledge base (J9).
**Acceptance criteria**: `fly storage create` succeeds, S3 SDK can put/get an object.

```bash
fly storage create -a agentsy-api
```

Files to create:
- `packages/shared/src/storage.ts` -- S3-compatible client wrapper (Tigris)

#### 0.10 CI basics (GitHub Actions)

**What**: Create GitHub Actions workflows for lint, typecheck, and test on every PR.
**Spec reference**: deployment-flyio.md section 4 (Deploy Pipeline), technology-decisions.md D-12.2.
**Journey**: Foundation for CI/CD (J15).
**Acceptance criteria**: A PR triggers the CI workflow, all checks pass on the empty monorepo.

Files to create:
- `.github/workflows/ci.yml` -- lint + typecheck + test on every PR
- `.github/workflows/deploy.yml` -- deploy pipeline (per deployment-flyio.md section 4, initially disabled)

#### 0.11 Local dev environment foundation

**What**: Create the SQLite-backed local development mode that mirrors production behavior.
**Spec reference**: architecture-v1.md section 9 (Local Development Architecture), technology-decisions.md D-2.5.
**Journey**: Foundation for J3 (local development).
**Acceptance criteria**: `@agentsy/db` can initialize a SQLite database, create tables, and run basic CRUD operations.

Files to create:
- `packages/db/src/sqlite-schema/` -- SQLite-compatible table definitions (subset of Postgres schema, no RLS, no pgvector)
- `packages/db/src/client.ts` -- Database client factory that returns Postgres or SQLite client based on environment

### Files to Create/Modify (Phase 0 Summary)

```
agentsy/
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .npmrc
  .eslintrc.cjs
  .prettierrc
  .editorconfig
  .gitignore
  .github/
    workflows/
      ci.yml
      deploy.yml
  apps/
    api/
      package.json
      tsconfig.json
      fly.toml
    web/
      package.json
      tsconfig.json
      fly.toml
    worker/
      package.json
      tsconfig.json
      fly.toml
      src/
        client.ts
        worker.ts
        workflows/index.ts
        activities/index.ts
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        id.ts
        types.ts
        constants.ts
        storage.ts
        index.ts
    db/
      package.json
      tsconfig.json
      drizzle.config.ts
      src/
        schema/
          enums.ts
          organizations.ts
          organization-members.ts
          api-keys.ts
          agents.ts
          agent-versions.ts
          environments.ts
          deployments.ts
          sessions.ts
          runs.ts
          run-steps.ts
          messages.ts
          eval-datasets.ts
          eval-dataset-cases.ts
          eval-experiments.ts
          eval-experiment-results.ts
          eval-baselines.ts
          knowledge-bases.ts
          knowledge-chunks.ts
          tenant-secrets.ts
          webhooks.ts
          usage-daily.ts
          index.ts
        sqlite-schema/
          (SQLite-compatible subset)
        client.ts
        index.ts
        rls.sql
        triggers.sql
        seed.ts
    sdk/
      package.json
      tsconfig.json
    client/
      package.json
      tsconfig.json
    eval/
      package.json
      tsconfig.json
    cli/
      package.json
      tsconfig.json
    ui/
      package.json
      tsconfig.json
```

### Tests (Phase 0)

- **Unit**: `packages/shared/src/__tests__/id.test.ts` -- ID generation produces correct prefixes and lengths
- **Unit**: `packages/db/src/__tests__/schema.test.ts` -- All table schemas compile, relations are valid
- **Integration**: `packages/db/src/__tests__/migration.test.ts` -- Drizzle generates valid SQL migrations
- **Integration**: `packages/db/src/__tests__/sqlite-client.test.ts` -- SQLite client creates tables and runs CRUD

### User Journey Verification

No user journeys are complete, but the foundation is in place for all of them.

### Definition of Done

- `pnpm install && turbo build && turbo lint && turbo typecheck && turbo test` all pass
- Fly Postgres has all tables created with RLS policies active
- Redis is running and accessible from API/worker Machines
- Temporal worker connects to Temporal Cloud and polls successfully
- Tigris bucket exists and is writable
- GitHub Actions CI runs on PR and passes

---

## Phase 1: Auth & Multi-Tenancy (Journey 1)

### Prerequisites
- Phase 0 complete (monorepo, database, Redis)

### Steps

#### 1.1 Initialize Fastify API server

**What**: Create the base Fastify application with health checks, error handling, CORS, and request logging.
**Spec reference**: architecture-v1.md section 2.1, spec-api.md section 1 (API Conventions).
**Journey**: J1 step 1.1 (sign up endpoint available).
**Acceptance criteria**: `GET /health` returns `200` with db/redis/temporal status. Error responses conform to RFC 7807 format per spec-api.md section 1.

Files to create:
- `apps/api/src/index.ts` -- Fastify app bootstrap (register plugins, start server)
- `apps/api/src/plugins/error-handler.ts` -- RFC 7807 error formatting
- `apps/api/src/plugins/cors.ts` -- CORS configuration
- `apps/api/src/plugins/request-logger.ts` -- Structured JSON logging with `run_id`, `org_id`, `trace_id`
- `apps/api/src/routes/health.ts` -- `GET /health` endpoint per deployment-flyio.md section 6

#### 1.2 Integrate Better Auth

**What**: Configure Better Auth as a library inside Fastify for email/password, Google OAuth, GitHub OAuth, session management, and organization management.
**Spec reference**: technology-decisions.md D-9.1 (Better Auth), architecture-v1.md section 5.3 (Auth Flow).
**Journey**: J1 step 1.1 (sign up), J1 step 1.4 (generate API key).
**Acceptance criteria**: A user can sign up with email/password or Google/GitHub OAuth. A session token (HTTP-only cookie) is returned. Organization is created on signup.

Files to create:
- `apps/api/src/auth/better-auth.ts` -- Better Auth configuration (email, Google, GitHub providers, org plugin)
- `apps/api/src/auth/auth-routes.ts` -- Mount Better Auth route handler into Fastify

#### 1.3 Implement user/org/session tables integration

**What**: Better Auth manages its own tables (`users`, `sessions`, `accounts`, `organizations`, `members`) in our Postgres. Create migrations for any additional fields we need (plan, billing_email, metadata on org).
**Spec reference**: spec-data-model.md tables 3.1 (organizations) and 3.2 (organization_members).
**Journey**: J1 step 1.1 (create org on signup).
**Acceptance criteria**: Org creation seeds 3 default environments (development, staging, production) per spec-data-model.md table 3.6.

Files to create/modify:
- `apps/api/src/auth/org-hooks.ts` -- After-create hook: seed environments, create initial metadata

#### 1.4 Implement API key generation and validation

**What**: Create endpoints to create, list, and revoke API keys. Implement SHA-256 hash-based validation middleware.
**Spec reference**: spec-data-model.md table 3.3 (api_keys), spec-api.md section 11, architecture-v1.md section 5.3.
**Journey**: J1 step 1.4 (generate API key).
**Acceptance criteria**: `POST /v1/api-keys` creates a key and returns it once. `Authorization: Bearer sk-agentsy-...` is validated via SHA-256 hash lookup. Revoked keys return 403.

Files to create:
- `apps/api/src/routes/api-keys.ts` -- CRUD endpoints for API keys
- `apps/api/src/middleware/api-key-auth.ts` -- API key validation (extract prefix, SHA-256 hash, lookup, check revoked/expired, update `last_used_at`)

#### 1.5 Implement RLS tenant context middleware

**What**: Create Fastify middleware that opens a Postgres transaction and sets `SET LOCAL app.org_id` for every authenticated request.
**Spec reference**: architecture-v1.md section 5.1 (Tenant Isolation), spec-data-model.md section 5.
**Journey**: All journeys (every API call goes through tenant context).
**Acceptance criteria**: Queries within a request are scoped to the authenticated org. Cross-tenant data access is impossible even with crafted SQL.

Files to create:
- `apps/api/src/middleware/tenant-context.ts` -- Opens transaction, sets `app.org_id`, commits/rolls back on response
- `apps/api/src/middleware/auth.ts` -- Combined middleware: Better Auth session OR API key -> resolves `org_id` -> sets tenant context

#### 1.6 Implement rate limiting (Redis)

**What**: Redis sliding window rate limiter with three dimensions: requests/min, tokens/day, concurrent runs.
**Spec reference**: spec-api.md section 1 "Rate Limiting", technology-decisions.md D-9.4.
**Journey**: J1 (rate limit headers in onboarding), all API journeys.
**Acceptance criteria**: Rate limit headers (`X-RateLimit-*`) are included on every response. 429 returned when limits exceeded. Graceful degradation to in-memory counters when Redis is unavailable.

Files to create:
- `apps/api/src/middleware/rate-limiter.ts` -- Redis Lua script sliding window, three dimensions, fallback to in-memory
- `apps/api/src/lib/redis.ts` -- Redis client with connection management and error handling

#### 1.7 Implement organization management endpoints

**What**: Endpoints for org settings, member management (invite, remove, role change).
**Spec reference**: spec-api.md section 12 (Organization & Members).
**Journey**: J8 (Team Collaboration).
**Acceptance criteria**: Admins can invite members by email. Members appear with correct roles.

Files to create:
- `apps/api/src/routes/organizations.ts` -- Org settings CRUD
- `apps/api/src/routes/members.ts` -- Member invite, list, remove, role update

#### 1.8 Implement secrets management API (moved from Phase 6)

**What**: CRUD endpoints for per-tenant encrypted secrets (write-only — values are never returned). AES-256-GCM encryption using `SECRETS_MASTER_KEY`.
**Spec reference**: spec-api.md section 10 (Secrets), spec-data-model.md table 3.19 (tenant_secrets), architecture-v1.md section 5.4.
**Journey**: J1 step 1.3 (connect LLM provider), J10 step 10.3 (tool credentials).
**Acceptance criteria**: `POST /v1/secrets` creates an encrypted secret. `GET /v1/secrets` lists secrets (names only, no values). `PUT /v1/secrets/:secret_id` updates a secret. `DELETE /v1/secrets/:secret_id` removes a secret. Secrets are scoped to environment (development/staging/production or "all").

> **Why moved to Phase 1**: The onboarding wizard (step 1.9 below) requires users to store LLM provider API keys as encrypted secrets. Without the secrets API, onboarding cannot be completed. The encryption implementation is straightforward (AES-256-GCM) and has no dependencies beyond Postgres.

Files to create:
- `apps/api/src/routes/secrets.ts` -- Secrets CRUD endpoints (POST, GET, PUT, DELETE per spec-api.md section 10)
- `apps/api/src/lib/encryption.ts` -- AES-256-GCM encrypt/decrypt using `SECRETS_MASTER_KEY`

#### 1.9 Implement onboarding flow in dashboard

**What**: Create the Next.js web app with signup/login pages and the onboarding checklist.
**Spec reference**: user-journeys.md Journey 1 (steps 1.1, 1.2, 1.3, 1.4). PRD section 8 (Information Architecture).
**Journey**: J1 (all steps).
**Acceptance criteria**: New user sees the 3-step checklist. Each step can be completed. Dashboard home shows empty state.

Files to create:
- `apps/web/src/app/layout.tsx` -- Root layout with sidebar navigation per PRD section 8
- `apps/web/src/app/page.tsx` -- Dashboard home (empty state with onboarding checklist)
- `apps/web/src/app/signup/page.tsx` -- Signup page (Better Auth)
- `apps/web/src/app/login/page.tsx` -- Login page (Better Auth)
- `apps/web/src/app/settings/page.tsx` -- Settings shell
- `apps/web/src/app/settings/api-keys/page.tsx` -- API key management
- `apps/web/src/app/settings/secrets/page.tsx` -- LLM provider key management
- `apps/web/src/app/settings/members/page.tsx` -- Team member management
- `apps/web/src/components/onboarding-checklist.tsx`
- `apps/web/src/lib/api.ts` -- API client for web app (calls agentsy-api internally)

### Tests (Phase 1)

- **Unit**: `apps/api/src/__tests__/api-key-auth.test.ts` -- Key generation, SHA-256 hashing, prefix extraction, validation
- **Unit**: `apps/api/src/__tests__/rate-limiter.test.ts` -- Sliding window logic, in-memory fallback
- **Unit**: `apps/api/src/__tests__/encryption.test.ts` -- AES-256-GCM encrypt/decrypt roundtrip, key rotation
- **Integration**: `apps/api/src/__tests__/auth-flow.test.ts` -- Signup creates org + environments, login returns session
- **Integration**: `apps/api/src/__tests__/tenant-isolation.test.ts` -- Org A cannot access Org B data
- **Integration**: `apps/api/src/__tests__/api-keys.test.ts` -- Create, list, revoke, validate key lifecycle
- **Integration**: `apps/api/src/__tests__/secrets.test.ts` -- Secret CRUD, encryption, environment scoping, write-only validation

### User Journey Verification

- **J1 step 1.1**: User can sign up via email or OAuth
- **J1 step 1.2**: Onboarding checklist appears for new users
- **J1 step 1.3**: User can save LLM provider API key (encrypted in `tenant_secrets`) via dashboard or CLI
- **J1 step 1.4**: User can generate an API key and see it once
- **J8 step 8.1**: Admin can invite team members

### Definition of Done

- Demo: Sign up with email, see onboarding checklist, add Anthropic API key to secrets (via `POST /v1/secrets`), generate an API key, use the API key to call `GET /health` with auth headers. Verify `GET /v1/secrets` returns secret name but not value. Second org cannot see first org's data.

---

## Phase 2: Agent Definition & Runtime (Journeys 2, 3)

### Prerequisites
- Phase 1 complete (auth, multi-tenancy, API server, Temporal connection)

### Steps

#### 2.1 Implement `@agentsy/sdk` core: `defineAgent` and `defineTool`

**What**: The agent definition SDK with Zod validation, type-safe tool definitions, and configuration serialization.
**Spec reference**: spec-sdk.md sections 6.1-6.4 (Agent Definition SDK). Technology-decisions.md D-1.3 (Agent Definition Format).
**Journey**: J2 step 2.1 (define agent in code).
**Acceptance criteria**: `agentsy.defineAgent({...})` returns a frozen, validated `AgentConfig`. `agentsy.defineTool({...})` returns a typed `ToolDefinition`. Invalid configs throw descriptive Zod validation errors.

Files to create:
- `packages/sdk/src/agentsy.ts` -- `defineAgent`, `defineTool`, `defineProject` implementations
- `packages/sdk/src/types.ts` -- All type definitions per spec-sdk.md section 6.3 (AgentConfig, ModelIdentifier, ToolDefinition, NativeToolDefinition, McpToolDefinition, GuardrailsConfig, MemoryConfig, ModelParams, SystemPromptFn, ToolContext)
- `packages/sdk/src/validation.ts` -- Zod schemas for AgentConfig validation
- `packages/sdk/src/serialization.ts` -- Convert AgentConfig to API-compatible JSON (Zod schemas to JSON Schema for tool definitions)
- `packages/sdk/src/index.ts` -- Barrel export per spec-sdk.md section 6.1

#### 2.2 Implement Agent CRUD API endpoints

**What**: REST API for creating, listing, getting, updating, and deleting agents.
**Spec reference**: spec-api.md section 2 (Agent Management), spec-data-model.md table 3.4 (agents).
**Journey**: J2 step 2.2 (create agent via API or CLI).
**Acceptance criteria**: All five endpoints work: `POST /v1/agents`, `GET /v1/agents`, `GET /v1/agents/:id`, `PATCH /v1/agents/:id`, `DELETE /v1/agents/:id`. Cursor-based pagination per spec-api.md section 1.

Files to create:
- `apps/api/src/routes/agents.ts` -- Agent CRUD endpoints

#### 2.3 Implement Agent Version management

**What**: Create agent versions (immutable config snapshots) on deploy, list versions, get specific version.
**Spec reference**: spec-api.md section 2.6 (List Agent Versions), spec-data-model.md table 3.5 (agent_versions).
**Journey**: J2 (create agent creates version 1), J5 (deploy creates new version).
**Acceptance criteria**: `POST /v1/agents/:id/versions` creates an immutable version with monotonically increasing version number. Versions cannot be modified after creation.

Files to create:
- `apps/api/src/routes/agent-versions.ts` -- Version creation and listing endpoints

#### 2.4 Implement Temporal AgentRunWorkflow

**What**: The core agentic loop as a Temporal workflow. LLM call -> check for tool calls -> execute tools -> repeat -> return response.
**Spec reference**: architecture-v1.md section 3.1 (Agent Run Lifecycle), section 2.3 (agentsy-worker workflows and activities).
**Journey**: J3 (run agent locally and on platform).
**Acceptance criteria**: A workflow takes an agent config + input, executes the agentic loop, and returns a response. Guardrails enforced: maxIterations (R-1.6), maxTokens (R-1.7), timeout (R-1.8), maxCostUsd (R-1.8b). **Checkpointing (R-1.5)**: Temporal's built-in workflow replay mechanism provides automatic checkpointing at every activity boundary (each LLM call and tool call is a separate activity). If the worker crashes mid-run, Temporal replays the workflow from the last completed activity — no explicit checkpoint logic needed beyond structuring the agentic loop as sequential activity calls.

Files to create:
- `apps/worker/src/workflows/agent-run.ts` -- `AgentRunWorkflow` with agentic loop, guardrail checks, step recording
- `apps/worker/src/activities/llm-call.ts` -- `LLMCall` activity: call LLM via Vercel AI SDK, record tokens/cost/duration, create `run_step` row (type: `llm_call`)
- `apps/worker/src/activities/tool-execution.ts` -- `ToolExecution` activity: execute native tool function, timeout, retry on 5xx, result size cap (10KB), create `run_step` row (type: `tool_call`)
- `apps/worker/src/activities/persist-run.ts` -- Activity to create/update `runs` row with status, tokens, cost, duration

#### 2.5 Integrate Vercel AI SDK for Anthropic + OpenAI

**What**: Configure Vercel AI SDK providers for both Anthropic and OpenAI, implement model resolution from capability classes to concrete models.
**Spec reference**: architecture-v1.md section 3.4 (Model Resolution), technology-decisions.md D-3.1, D-3.3.
**Journey**: J2 (define agent with model), J14 (fallback model configuration).
**Acceptance criteria**: Agent runs can use Anthropic or OpenAI models. Capability class `{ class: "balanced", provider: "anthropic" }` resolves to `claude-sonnet-4`. Direct model IDs also work.

Files to create:
- `apps/worker/src/providers/model-registry.ts` -- Capability class to model mapping per architecture-v1.md section 3.4
- `apps/worker/src/providers/provider-factory.ts` -- Creates Vercel AI SDK provider instances for Anthropic/OpenAI
- `apps/worker/src/providers/model-resolver.ts` -- Resolves ModelSpec (class or direct) to concrete model ID

#### 2.6 Implement tool execution with risk levels

**What**: Tool risk classification (`read`/`write`/`admin`) and execution with timeout, retry, and result size limit.
**Spec reference**: architecture-v1.md section 5.2 (Tool Safety), PRD R-2.4 through R-2.9.
**Journey**: J2 (define tools with risk levels), J3 (execute tools locally).
**Acceptance criteria**: `read` tools auto-approve. `write` tools require approval in production (configurable). Tools timeout after 30s default. Results truncated at 10KB.

Already covered by `tool-execution.ts` in step 2.4. Additional files:
- `apps/worker/src/tools/risk-policy.ts` -- Evaluate approval policy based on tool risk level, environment, and per-tool overrides

#### 2.7 Implement guardrails enforcement

**What**: Max iterations, max tokens, max cost USD, and timeout enforcement within the agentic loop.
**Spec reference**: PRD R-1.6 through R-1.8b, spec-data-model.md table 3.5 GuardrailsConfig JSONB type.
**Journey**: J3 (agent respects guardrails during execution).
**Acceptance criteria**: Agent run terminates with status `timeout` when maxIterations, maxTokens, maxCostUsd, or timeoutMs is exceeded. Clear error message indicates which guardrail was hit.

Files to create:
- `apps/worker/src/guardrails/guardrail-checker.ts` -- Check all guardrail conditions after each LLM call/tool call

#### 2.8 Implement capability class model routing and fallback

**What**: When primary provider fails, automatically retry with fallback model (same capability class, different provider).
**Spec reference**: architecture-v1.md sections 3.4 (Model Resolution) and 7 (LLM Provider Failure).
**Journey**: J14 (fallback model configuration).
**Acceptance criteria**: If Anthropic returns 5xx after retries, the runtime switches to OpenAI (same capability class). Retry policy: immediate, 1s, 2s, 4s backoff, then fallback.

Files to create:
- `apps/worker/src/providers/fallback-handler.ts` -- Retry + fallback logic per architecture-v1.md section 7

#### 2.9 Implement agent run API endpoint

**What**: `POST /v1/agents/:id/run` that starts a Temporal workflow, creates a `runs` row, and returns run ID.
**Spec reference**: spec-api.md section 3 (Agent Runs), architecture-v1.md section 3.1.
**Journey**: J3 (run agent), J7 (integrate via API).
**Acceptance criteria**: Sync mode returns the final response. Async mode (`async: true`) returns `run_id` immediately. `GET /v1/runs/:id` returns run status and result.

Files to create:
- `apps/api/src/routes/runs.ts` -- `POST /v1/agents/:id/run` (sync + async), `GET /v1/runs/:id`, `GET /v1/runs` (list with filters), `GET /v1/runs/:run_id/steps` (list run steps per spec-api.md 3.4), `POST /v1/runs/:run_id/cancel` (cancel in-progress run per spec-api.md 3.5)

#### 2.10 Implement `agentsy dev` local dev server (basic)

**What**: Local development server with SQLite backend, in-process execution (no Temporal), built-in playground.
**Spec reference**: architecture-v1.md section 9 (Local Development Architecture), spec-sdk.md section 9.
**Journey**: J3 (local development and testing).
**Acceptance criteria**: `agentsy dev` starts a server on `localhost:4321`. Loads `agentsy.config.ts`, runs agent against local SQLite, shows traces in browser. Terminal chat REPL is available for quick testing without opening a browser.

Files to create:
- `packages/cli/src/commands/dev.ts` -- `agentsy dev` command: load config, start local Fastify server, create SQLite DB, serve playground UI. Prints URL and starts terminal REPL.
- `packages/cli/src/dev/local-runner.ts` -- In-process agentic loop (Promise-based, no Temporal) that mirrors `AgentRunWorkflow`
- `packages/cli/src/dev/local-server.ts` -- Local Fastify server with `/run`, `/runs`, `/health` endpoints
- `packages/cli/src/dev/playground.ts` -- Serve a minimal chat UI + trace viewer on `localhost:4321`
- `packages/cli/src/dev/terminal-repl.ts` -- Interactive terminal chat REPL (readline-based) per user-journeys.md Journey 3 step 3.5. Sends input to local runner, streams response tokens to stdout, shows cost summary after each turn.

#### 2.11 Implement `agentsy init` scaffold

**What**: Project scaffolding command that creates a new Agentsy project from a template.
**Spec reference**: spec-sdk.md section 3 (Project File Structure), section 9 (CLI).
**Journey**: J2 step 2.1 (scaffold project).
**Acceptance criteria**: `agentsy init my-agent --template basic` creates the project structure per spec-sdk.md section 3 with `agentsy.config.ts`, `tools/`, `evals/`, `.env.example`.

Files to create:
- `packages/cli/src/commands/init.ts` -- Scaffolding command
- `packages/cli/src/templates/basic/` -- Template files for basic project
- `packages/cli/src/templates/with-eval/` -- Template files for eval-ready project

### Tests (Phase 2)

- **Unit**: `packages/sdk/src/__tests__/define-agent.test.ts` -- Config validation, default values, Zod error messages
- **Unit**: `packages/sdk/src/__tests__/define-tool.test.ts` -- Tool definition with Zod schemas, risk levels
- **Unit**: `apps/worker/src/__tests__/model-resolver.test.ts` -- Capability class resolution, direct model passthrough
- **Unit**: `apps/worker/src/__tests__/guardrail-checker.test.ts` -- All guardrail conditions trigger correctly
- **Unit**: `apps/worker/src/__tests__/risk-policy.test.ts` -- Risk level + environment -> approval decision
- **Integration**: `apps/worker/src/__tests__/agent-run-workflow.test.ts` -- Complete agentic loop with mocked LLM, tool execution, guardrail enforcement
- **Integration**: `apps/api/src/__tests__/agents.test.ts` -- Agent CRUD endpoints
- **Integration**: `apps/api/src/__tests__/runs.test.ts` -- Run creation, status polling, sync/async modes
- **E2E**: Run `agentsy init && agentsy dev` and execute a test agent run against a real LLM

### User Journey Verification

- **J2 steps 2.1-2.5**: Define agent in TypeScript, define tools with risk levels
- **J3 steps 3.1-3.6**: `agentsy dev` starts, agent responds to input, traces are visible
- **J14 steps 14.1-14.5**: Fallback model triggers when primary fails

### Definition of Done

- Demo: `agentsy init my-agent && cd my-agent && agentsy dev` -> open localhost:4321 -> chat with agent -> see trace timeline -> agent calls tools -> guardrails work -> deploy to platform with `agentsy deploy` -> call `POST /v1/agents/ag_xxx/run` -> get response.

---

## Phase 3: Streaming & API (Journeys 3, 7)

### Prerequisites
- Phase 2 complete (agent runtime, run endpoints)

### Steps

#### 3.1 Implement SSE streaming from worker to client

**What**: Worker publishes events to Redis pub/sub per run. API subscribes and forwards as SSE to clients.
**Spec reference**: architecture-v1.md section 3.3 (Streaming Architecture), spec-api.md section 15 (SSE Streaming Format).
**Journey**: J3 (see live execution), J7 (stream responses in client app).
**Acceptance criteria**: Client opens SSE connection, receives all event types per architecture-v1.md section 3.3 table (run.started, step.thinking, step.text_delta, step.tool_call, step.tool_result, step.approval_requested, step.approval_resolved, step.completed, run.completed, run.failed). Reconnection with `Last-Event-ID` replays missed events.

Files to create:
- `apps/worker/src/streaming/event-emitter.ts` -- Publish events to Redis pub/sub channel `run:{run_id}:events`
- `apps/api/src/streaming/sse-handler.ts` -- SSE endpoint handler: subscribe to Redis channel, format events, handle reconnection with `Last-Event-ID`
- `apps/api/src/routes/runs-stream.ts` -- `POST /v1/agents/:id/run` with `stream: true` returns SSE

#### 3.2 Implement stream event types

**What**: Define and emit all SSE event types with correct payloads.
**Spec reference**: architecture-v1.md section 3.3 SSE event types table.
**Journey**: J3 (live trace updates), J7 (streaming integration).
**Acceptance criteria**: Each event type carries the correct data. `step.text_delta` streams token-by-token. `step.tool_call` includes tool name and arguments. `run.completed` includes total_tokens, total_cost, duration.

Files to create:
- `packages/shared/src/events.ts` -- TypeScript types for all SSE events (already partially in types.ts, extract to dedicated file)

#### 3.3 Implement `@agentsy/client` SDK

**What**: The client SDK for calling deployed agents from application code. Three modes: sync, stream, async.
**Spec reference**: spec-sdk.md section 7 (Module 2: Client SDK), PRD R-7.5.
**Journey**: J7 (integrate via API & SDK).
**Acceptance criteria**: `client.agents.run()` returns a response. `client.agents.stream()` returns an async iterable of SSE events. `client.agents.runAsync()` returns a run ID for polling.

Files to create:
- `packages/client/src/client.ts` -- `AgentsyClient` class with:
  - `agents.run()` — sync run
  - `agents.stream()` — streaming via SSE
  - `agents.runAsync()` — async run (returns run ID)
  - `runs.get()` — get run status/result
  - `runs.poll()` — poll until run completes (with configurable interval and timeout)
  - `runs.cancel()` — cancel in-progress run (spec-api.md 3.5)
  - `runs.steps()` — list run steps (spec-api.md 3.4)
  - `sessions.create()` — create a session (spec-api.md 4.1)
  - `sessions.list()` — list sessions (spec-api.md 4.2)
  - `sessions.messages()` — get session messages (spec-api.md 4.3)
  - `sessions.delete()` — delete a session (spec-api.md 4.4)
- `packages/client/src/streaming.ts` -- SSE parser for client-side streaming
- `packages/client/src/types.ts` -- Client-specific types
- `packages/client/src/index.ts` -- Barrel export

#### 3.4 Implement session management (multi-turn)

**What**: `session_id` parameter on run requests enables multi-turn conversations. Create sessions, load conversation history, persist messages.
**Spec reference**: spec-api.md section 4 (Sessions), spec-data-model.md tables 3.8 (sessions) and 3.11 (messages).
**Journey**: J7 (multi-turn integration via SDK).
**Acceptance criteria**: Passing `session_id` loads previous messages as context. New sessions are created on first use. Message history is capped at configurable window (default 20).

Files to create:
- `apps/api/src/routes/sessions.ts` -- Session CRUD endpoints
- `apps/worker/src/activities/session-history.ts` -- Load conversation history from `messages` table, apply window limit
- `apps/worker/src/activities/persist-messages.ts` -- Save user input and agent response as messages in session

#### 3.5 Implement OpenAI-compatible endpoint

**What**: `POST /v1/chat/completions` endpoint that accepts OpenAI-format requests and returns OpenAI-format responses.
**Spec reference**: spec-api.md section 14 (OpenAI-Compatible Endpoint), PRD R-7.4.
**Journey**: J7 step 7.4 (drop-in replacement for OpenAI SDK).
**Acceptance criteria**: OpenAI Python/TypeScript SDK can call this endpoint and receive properly formatted responses. Streaming works with `stream: true`.

Files to create:
- `apps/api/src/routes/openai-compat.ts` -- `/v1/chat/completions` endpoint with request/response translation

### Tests (Phase 3)

- **Unit**: `packages/client/src/__tests__/client.test.ts` -- Client instantiation, request formatting, response parsing
- **Unit**: `packages/client/src/__tests__/streaming.test.ts` -- SSE parser handles all event types, reconnection
- **Integration**: `apps/api/src/__tests__/sse-streaming.test.ts` -- SSE connection receives events, reconnection replays
- **Integration**: `apps/api/src/__tests__/sessions.test.ts` -- Multi-turn conversation maintains context
- **Integration**: `apps/api/src/__tests__/openai-compat.test.ts` -- OpenAI SDK can call the endpoint

### User Journey Verification

- **J3 steps 3.7-3.8**: Live streaming of agent responses in playground
- **J7 all steps**: Client SDK sync, stream, and async modes work. Session management works. OpenAI compatibility works.

### Definition of Done

- Demo: Use `@agentsy/client` to stream an agent response token-by-token. Send a follow-up message with `session_id` and see the agent use conversation history. Call the same agent with the OpenAI SDK via the compat endpoint.

---

## Phase 4: Eval Engine (Journeys 4, 11, 12)

### Prerequisites
- Phase 2 complete (agent runtime, tool execution)
- Phase 3 complete (client SDK for programmatic runs)

### Steps

#### 4.1 Implement Dataset CRUD API

**What**: Create, list, get, update, and delete eval datasets. Upload dataset cases in bulk (JSON).
**Spec reference**: spec-api.md section 7 (Eval Engine), spec-data-model.md tables 3.12 (eval_datasets) and 3.13 (eval_dataset_cases).
**Journey**: J4 step 4.1 (create dataset).
**Acceptance criteria**: `POST /v1/eval/datasets` creates a dataset. `POST /v1/eval/datasets/:id/cases` bulk uploads cases. Cases match the full schema per spec-data-model.md table 3.13 (including expected_tool_calls, expected_trajectory, tool_mocks, etc.).

Files to create:
- `apps/api/src/routes/eval-datasets.ts` -- Dataset CRUD + case upload endpoints
- `apps/api/src/routes/eval-cases.ts` -- Individual case CRUD, bulk operations

#### 4.2 Implement `@agentsy/eval` SDK with eval case format

**What**: The eval SDK for defining datasets, experiments, and graders programmatically in TypeScript.
**Spec reference**: spec-sdk.md section 8 (Module 3: Eval SDK), PRD section 5.4.1 (Eval Dataset Case Schema).
**Journey**: J4 step 4.1 (define eval dataset in code).
**Acceptance criteria**: `agentsy.eval({...})` starts an experiment. `agentsy.defineDataset({...})` creates a typed dataset. All fields from the EvalCase interface in PRD 5.4.1 are supported.

Files to create:
- `packages/eval/src/types.ts` -- EvalCase, ExpectedToolCall, TrajectoryStep, ApprovalExpectation, MemoryExpectation, GraderConfig, ExperimentConfig
- `packages/eval/src/dataset.ts` -- `defineDataset()`, `loadDataset()` from JSON file
- `packages/eval/src/experiment.ts` -- `runExperiment()` orchestration
- `packages/eval/src/index.ts` -- Barrel export

#### 4.3 Implement deterministic graders (4 graders)

**What**: `exact_match`, `json_schema`, `regex`, `numeric_threshold` graders.
**Spec reference**: PRD R-4.4, spec-data-model.md table 3.14 ExperimentConfig grader types.
**Journey**: J4 step 4.3 (run evals with deterministic graders).
**Acceptance criteria**: Each grader returns a `ScoreResult` with `score` (0.0-1.0), `name`, `graderType`. `exact_match` compares strings. `json_schema` validates against a JSON Schema. `regex` matches a pattern. `numeric_threshold` checks a value is within bounds.

Files to create:
- `packages/eval/src/graders/exact-match.ts`
- `packages/eval/src/graders/json-schema.ts`
- `packages/eval/src/graders/regex.ts`
- `packages/eval/src/graders/numeric-threshold.ts`
- `packages/eval/src/graders/index.ts` -- Grader registry

#### 4.4 Implement semantic graders (3 graders)

**What**: `embedding_similarity`, `tool_name_match`, `tool_args_match` graders.
**Spec reference**: PRD R-4.5.
**Journey**: J4 step 4.3 (run evals with semantic graders).
**Acceptance criteria**: `embedding_similarity` computes cosine similarity between agent output and expected output embeddings. `tool_name_match` checks if the agent called the expected tools. `tool_args_match` checks if tool arguments match (partial match supported per PRD 5.4.1).

Files to create:
- `packages/eval/src/graders/embedding-similarity.ts` -- Uses OpenAI text-embedding-3-small
- `packages/eval/src/graders/tool-name-match.ts`
- `packages/eval/src/graders/tool-args-match.ts`

#### 4.5 Implement LLM-as-judge grader

**What**: Pointwise scoring with a configurable rubric. Uses Claude Sonnet as default judge model.
**Spec reference**: PRD R-4.6, technology-decisions.md D-7.2.
**Journey**: J11 (LLM-as-Judge Evals).
**Acceptance criteria**: Grader sends the agent output + rubric to judge model, receives a 0.0-1.0 score with reasoning. Judge model is configurable (default: balanced class). Rubric is user-defined.

Files to create:
- `packages/eval/src/graders/llm-judge.ts` -- LLM-as-judge implementation with configurable model and rubric

#### 4.6 Implement trajectory graders (2 graders)

**What**: `tool_sequence` (did the agent call tools in the expected order?) and `unnecessary_steps` (did the agent take extra steps?).
**Spec reference**: PRD R-4.7.
**Journey**: J4 step 4.3 (trajectory evaluation).
**Acceptance criteria**: `tool_sequence` compares the actual tool call sequence against `expected_trajectory`. `unnecessary_steps` flags steps that don't appear in the expected trajectory.

Files to create:
- `packages/eval/src/graders/tool-sequence.ts`
- `packages/eval/src/graders/unnecessary-steps.ts`

#### 4.7 Implement EvalExperimentWorkflow (Temporal)

**What**: Temporal workflow that runs an agent against every case in a dataset, grades results, aggregates scores.
**Spec reference**: architecture-v1.md section 3.5 (Eval Execution).
**Journey**: J4 step 4.2 (run experiment).
**Acceptance criteria**: Parent workflow spawns child `AgentRunWorkflow` per case (with tool mocking). Grader activities score each case. Results aggregated into `eval_experiments` and `eval_experiment_results` tables. Configurable parallelism (default: 5 concurrent cases).

Files to create:
- `apps/worker/src/workflows/eval-experiment.ts` -- `EvalExperimentWorkflow` parent workflow
- `apps/worker/src/activities/grading.ts` -- Grader activity (runs all configured graders for a case)
- `apps/worker/src/activities/tool-mocking.ts` -- Mock tool responses from dataset `mocked_tool_results`

#### 4.8 Implement experiment comparison and baseline tracking

**What**: Compare two experiments side-by-side. Promote an experiment to baseline. Detect regressions.
**Spec reference**: PRD R-4.8, R-4.9, spec-data-model.md tables 3.14-3.16.
**Journey**: J4 step 4.4 (compare experiments), J4 step 4.5 (set baseline).
**Acceptance criteria**: `POST /v1/eval/experiments/:id/compare/:other_id` returns per-case score deltas. `POST /v1/eval/experiments/:id/set-baseline` promotes experiment to active baseline. New experiments are automatically compared against the active baseline.

Files to create:
- `apps/api/src/routes/eval-experiments.ts` -- Experiment CRUD, start, compare, set-baseline endpoints
- `apps/api/src/routes/eval-baselines.ts` -- Baseline management endpoints

#### 4.9 Implement "Create eval case from run trace" (Journey 12)

**What**: One-click conversion of a production run into an eval test case.
**Spec reference**: user-journeys.md Journey 12 (all steps), PRD Flow 2 step 4.
**Journey**: J12 (add failing run to eval dataset).
**Acceptance criteria**: `POST /v1/eval/datasets/:dataset_id/cases/from-run` (per spec-api.md 7.17) accepts `{ run_id }` in the body, extracts input, output, tool calls, and tool results from the run trace, and creates an `eval_dataset_cases` row in the specified dataset. Tool results become mocked tool results.

Files to create:
- `apps/api/src/routes/eval-cases-from-run.ts` -- Run-to-eval-case conversion endpoint per spec-api.md 7.17 (`POST /v1/eval/datasets/:dataset_id/cases/from-run`)

#### 4.10 Implement `agentsy eval run` and `agentsy eval compare` CLI commands

**What**: CLI commands for running evals locally or against the platform, and comparing results.
**Spec reference**: spec-sdk.md section 9 (CLI), PRD R-4.10, R-4.11.
**Journey**: J4 (CLI eval workflow), J15 (CI/CD integration).
**Acceptance criteria**: `agentsy eval run --dataset golden` runs the experiment and prints results. `agentsy eval compare` compares against baseline. `--ci` flag returns exit code 1 on regression. `--pr-comment` outputs markdown for GitHub PR comment.

Files to create:
- `packages/cli/src/commands/eval-run.ts` -- `agentsy eval run` command
- `packages/cli/src/commands/eval-compare.ts` -- `agentsy eval compare` command
- `packages/cli/src/formatters/eval-report.ts` -- Terminal and markdown output formatters

### Tests (Phase 4)

- **Unit**: `packages/eval/src/__tests__/exact-match.test.ts` -- Exact match grader
- **Unit**: `packages/eval/src/__tests__/json-schema.test.ts` -- JSON schema validation grader
- **Unit**: `packages/eval/src/__tests__/regex.test.ts` -- Regex match grader
- **Unit**: `packages/eval/src/__tests__/numeric-threshold.test.ts` -- Numeric threshold grader
- **Unit**: `packages/eval/src/__tests__/tool-name-match.test.ts` -- Tool name match grader
- **Unit**: `packages/eval/src/__tests__/tool-sequence.test.ts` -- Tool sequence match grader
- **Unit**: `packages/eval/src/__tests__/unnecessary-steps.test.ts` -- Unnecessary steps detection
- **Integration**: `apps/worker/src/__tests__/eval-experiment-workflow.test.ts` -- Full experiment execution with mocked tools
- **Integration**: `apps/api/src/__tests__/eval-datasets.test.ts` -- Dataset CRUD, case upload
- **Integration**: `apps/api/src/__tests__/eval-experiments.test.ts` -- Experiment creation, comparison, baseline
- **Integration**: `apps/api/src/__tests__/runs-to-eval.test.ts` -- Run trace to eval case conversion
- **E2E**: `agentsy eval run --dataset golden --ci` returns correct exit code

### User Journey Verification

- **J4 all steps**: Create dataset, run experiment, view results, compare, set baseline
- **J11 all steps**: LLM-as-judge eval with custom rubric
- **J12 all steps**: Click bad run -> add to eval dataset -> case appears with correct mocked tool results
- **J15 steps 15.4-15.5**: `agentsy eval run --ci` exits with code 1 on regression, outputs markdown

### Definition of Done

- Demo: Create a 5-case eval dataset with expected outputs and tool mocks. Run eval against a test agent. See 4/5 pass. Change the prompt, run eval again. Compare experiments -- see one regression. Set the passing experiment as baseline. Run `agentsy eval run --ci` in GitHub Actions -- see PR comment with results.

---

## Phase 5: Memory & Knowledge Base (Journey 9)

### Prerequisites
- Phase 2 complete (agent runtime)
- Phase 3 complete (sessions)

### Steps

#### 5.1 Implement session memory (conversation history)

**What**: Persist conversation messages across runs within a session. Configurable history window.
**Spec reference**: PRD R-3.1, R-3.2, spec-data-model.md table 3.11 (messages).
**Journey**: J7 (multi-turn via SDK), J9 step 9.1 (session context).
**Acceptance criteria**: When a run uses `session_id`, the previous N messages are loaded and included as conversation context. Window size is configurable (default 20 per PRD R-3.2). Older messages are truncated.

This builds on Phase 3 step 3.4 (session management). Enhance:
- `apps/worker/src/activities/session-history.ts` -- Add window limiting, token-aware truncation

#### 5.2 Implement Knowledge Base CRUD

**What**: Create, list, get, and delete knowledge bases. Each KB is scoped to an agent.
**Spec reference**: spec-api.md section 6 (Memory / Knowledge Bases), spec-data-model.md table 3.17 (knowledge_bases), PRD R-3.6.
**Journey**: J9 step 9.2 (create knowledge base).
**Acceptance criteria**: `POST /v1/agents/:agent_id/knowledge-bases` creates a KB. KBs are agent-scoped (agent A cannot access agent B's KB). Configurable embedding model, chunk size, chunk overlap.

Files to create:
- `apps/api/src/routes/knowledge-bases.ts` -- KB CRUD endpoints

#### 5.3 Implement document upload and chunking

**What**: Upload documents (PDF, TXT, MD, CSV) to a knowledge base. Documents are chunked with configurable size and overlap.
**Spec reference**: PRD R-3.3, spec-data-model.md table 3.18 (knowledge_chunks).
**Journey**: J9 step 9.3 (upload documents).
**Acceptance criteria**: `POST /v1/knowledge-bases/:id/upload` accepts file uploads. Documents are stored in Tigris. Content is extracted and chunked. Chunk records are created in `knowledge_chunks` with the document hash for deduplication.

Files to create:
- `apps/api/src/routes/knowledge-upload.ts` -- File upload endpoint (multipart/form-data) per spec-api.md 6.6. Also includes `GET /v1/knowledge-bases/:kb_id/documents/:document_hash/status` (6.7), `DELETE /v1/knowledge-bases/:kb_id/documents/:document_hash` (6.8), and `POST /v1/knowledge-bases/:kb_id/search` (6.9 — manual search/test retrieval)
- `apps/worker/src/activities/document-processing.ts` -- Extract text from PDF/TXT/MD/CSV, chunk with overlap
- `packages/shared/src/chunking.ts` -- Recursive character text splitter with token counting

#### 5.4 Implement embedding generation

**What**: Generate embeddings for each chunk using OpenAI text-embedding-3-small.
**Spec reference**: technology-decisions.md D-6.2, spec-data-model.md table 3.18 (embedding column).
**Journey**: J9 step 9.3 (documents become searchable).
**Acceptance criteria**: Each chunk's `embedding` column is populated with a 1536-dimension vector. Batch embedding (process multiple chunks per API call). KB stats updated (total_chunks, total_documents, total_size_bytes).

Files to create:
- `apps/worker/src/activities/embedding-generation.ts` -- Call OpenAI embedding API, batch processing, write to knowledge_chunks.embedding

#### 5.5 Implement pgvector indexing (HNSW)

**What**: Create HNSW index on the embedding column for fast cosine similarity search.
**Spec reference**: spec-data-model.md table 3.18 (HNSW index definition), technology-decisions.md D-2.2.
**Journey**: J9 step 9.4 (fast retrieval).
**Acceptance criteria**: Vector similarity queries execute in < 100ms for knowledge bases with up to 10,000 chunks.

This is handled by the migration in Phase 0 step 0.5 (index already defined in the schema). Verify the index is created correctly.

#### 5.6 Implement hybrid retrieval (vector + BM25 + RRF)

**What**: Combine vector similarity search (pgvector) and keyword search (tsvector) using Reciprocal Rank Fusion.
**Spec reference**: technology-decisions.md D-6.3, spec-data-model.md section 3.18 (Hybrid search query pattern).
**Journey**: J9 step 9.4 (hybrid retrieval).
**Acceptance criteria**: Retrieval returns top-K results combining vector and keyword scores. RRF query per spec-data-model.md section 3.18. Results include chunk content, document name, relevance score.

Files to create:
- `apps/worker/src/activities/retrieval-query.ts` -- `RetrievalQuery` activity: hybrid search with RRF, returns top-K chunks

#### 5.7 Implement RAG injection into system prompt

**What**: Inject retrieved knowledge chunks into the system prompt before each LLM call.
**Spec reference**: PRD R-3.4.
**Journey**: J9 step 9.5 (agent uses knowledge base in responses).
**Acceptance criteria**: When an agent has a knowledge base configured, retrieval runs before the LLM call. Top-K chunks are formatted and appended to the system prompt. Retrieval step appears in run trace (step type: `retrieval`).

Files to modify:
- `apps/worker/src/workflows/agent-run.ts` -- Add retrieval step before LLM call if knowledge base is configured
- `apps/worker/src/activities/retrieval-query.ts` -- Create `run_step` row (type: `retrieval`) with query and results_count

#### 5.8 Implement `agentsy kb` CLI commands

**What**: CLI commands for knowledge base management.
**Spec reference**: spec-sdk.md section 9.
**Journey**: J9 (knowledge base via CLI).
**Acceptance criteria**: `agentsy kb create --agent support-agent --name product-docs` creates a KB. `agentsy kb upload --kb product-docs ./docs/` uploads and processes documents.

Files to create:
- `packages/cli/src/commands/kb-create.ts`
- `packages/cli/src/commands/kb-upload.ts`

### Tests (Phase 5)

- **Unit**: `packages/shared/src/__tests__/chunking.test.ts` -- Text splitting with overlap, token counting
- **Integration**: `apps/worker/src/__tests__/document-processing.test.ts` -- PDF, TXT, MD, CSV extraction
- **Integration**: `apps/worker/src/__tests__/embedding-generation.test.ts` -- Batch embedding, dimension validation
- **Integration**: `apps/worker/src/__tests__/retrieval-query.test.ts` -- Hybrid search returns relevant results, RRF scoring
- **Integration**: `apps/api/src/__tests__/knowledge-bases.test.ts` -- KB CRUD, upload, agent scoping
- **E2E**: Upload a document, run an agent with KB, verify the response references document content

### User Journey Verification

- **J9 all steps**: Create KB, upload documents, agent retrieves from KB, retrieval visible in trace

### Definition of Done

- Demo: Create a knowledge base for an agent, upload a PDF manual, ask the agent a question about the manual's content, see the retrieval step in the trace viewer, see the agent's response cite information from the document.

---

## Phase 6: Tool System & MCP (Journey 10)

### Prerequisites
- Phase 2 complete (native tool execution)

### Steps

#### 6.1 Implement MCP client (Streamable HTTP transport)

**What**: Connect to remote MCP servers using Streamable HTTP transport. Discover available tools. Execute tool calls via MCP protocol.
**Spec reference**: PRD R-2.3, spec-sdk.md section 6.4 (McpToolDefinition), technology-decisions.md D-4.1.
**Journey**: J10 (connect MCP servers).
**Acceptance criteria**: Agent config can include MCP server connections. Tools are discovered at agent load time. Tool calls are proxied to the MCP server. Results are returned to the agentic loop.

Files to create:
- `apps/worker/src/tools/mcp-client.ts` -- MCP client for Streamable HTTP transport (tool discovery, tool execution)
- `apps/worker/src/tools/mcp-stdio.ts` -- MCP client for stdio transport (local dev)
- `apps/worker/src/tools/tool-registry.ts` -- Unified registry that combines native tools and MCP-discovered tools

#### 6.2 Implement tool credential injection from encrypted secrets

**What**: Decrypt per-tenant secrets and inject them into `ToolContext` at tool execution time.
**Spec reference**: architecture-v1.md section 5.4 (Secrets Management), spec-data-model.md table 3.19 (tenant_secrets).
**Journey**: J10 step 10.3 (tool authentication).
**Acceptance criteria**: Tool functions receive a `ToolContext` with decrypted secrets. Secrets are never logged or included in LLM context. `${secret:SECRET_NAME}` references in MCP headers are resolved.

Files to create:
- `apps/worker/src/tools/secret-resolver.ts` -- Decrypt AES-256-GCM secrets from `tenant_secrets`, resolve `${secret:...}` references
- `apps/worker/src/tools/tool-context.ts` -- `ToolContext` factory with secrets, HTTP client, logging

#### 6.3 Implement tool allow-list/deny-list per environment

**What**: Environment-level tool policies that restrict which tools an agent can call.
**Spec reference**: PRD R-2.11, spec-data-model.md table 3.6 (environments: toolAllowList, toolDenyList).
**Journey**: J10 step 10.4 (tool policy enforcement).
**Acceptance criteria**: If an environment has a `tool_allow_list`, only those tools are available. If `tool_deny_list` is set, those tools are blocked (deny takes precedence). Tools not in the allowed set are invisible to the LLM.

Files to modify:
- `apps/worker/src/tools/tool-registry.ts` -- Filter tools based on environment allow/deny lists

#### 6.4 Implement human-in-the-loop approval flow

**What**: Temporal signals for pausing/resuming workflows when write/admin tools need approval.
**Spec reference**: architecture-v1.md section 3.2 (Approval Gate Flow), PRD R-2.10.
**Journey**: J10 step 10.5 (approval gate).
**Acceptance criteria**: When a `write` or `admin` tool requires approval in the current environment, the workflow pauses. `POST /v1/runs/:run_id/approve` resumes with tool execution. `POST /v1/runs/:run_id/deny` resumes with tool skipped. Run step shows `approval_status: pending/approved/denied`.

Files to create:
- `apps/worker/src/workflows/approval-gate.ts` -- Temporal signal wait for approval
- `apps/api/src/routes/run-approval.ts` -- `POST /v1/runs/:run_id/approve`, `POST /v1/runs/:run_id/deny`

#### 6.5 Implement tool management API endpoints

**What**: REST endpoints for listing agent tools, adding/removing MCP server connections, and discovering MCP server tools.
**Spec reference**: spec-api.md section 5 (Tool Management).
**Journey**: J10 (connect MCP servers via dashboard).
**Acceptance criteria**: `GET /v1/agents/:agent_id/tools` lists all tools (native + MCP). `POST /v1/agents/:agent_id/tools/mcp` adds an MCP server connection. `DELETE /v1/agents/:agent_id/tools/mcp/:tool_name` removes an MCP tool. `GET /v1/agents/:agent_id/tools/mcp/:tool_name/discover` triggers MCP tool discovery.

Files to create:
- `apps/api/src/routes/tools.ts` -- Tool management endpoints (spec-api.md sections 5.1-5.4)

> **Note**: Secrets API was moved to Phase 1 (step 1.8) to unblock onboarding.

### Tests (Phase 6)

- **Unit**: `apps/worker/src/__tests__/secret-resolver.test.ts` -- Secret decryption, `${secret:...}` reference resolution
- **Unit**: `apps/worker/src/__tests__/risk-policy.test.ts` -- Approval policy evaluation per environment
- **Integration**: `apps/worker/src/__tests__/mcp-client.test.ts` -- MCP tool discovery and execution (mock server)
- **Integration**: `apps/worker/src/__tests__/approval-gate.test.ts` -- Workflow pause, approve, deny, resume
- **Integration**: `apps/api/src/__tests__/secrets.test.ts` -- Secret CRUD, encryption, environment scoping

### User Journey Verification

- **J10 all steps**: Connect MCP server, discover tools, execute tool call through MCP, tool authentication with secrets
- **J1 step 1.3**: LLM provider keys stored as encrypted secrets

### Definition of Done

- Demo: Define an agent with an MCP server connection (e.g., GitHub MCP server). Agent calls a tool from the MCP server. A `write` tool triggers an approval gate. Approve via API. Agent completes the run.

---

## Phase 6b: Connector Catalog (Journey 10, New)

### Prerequisites
- Phase 6 complete (MCP client, tool registry, secret resolver)

### Steps

#### 6b.1 Define connector data model

**What**: Database tables for the connector catalog (registry of available connectors) and connector connections (per-agent active connections).
**Spec reference**: PRD §5.11 (Connector Catalog), spec-api.md section 17.
**Journey**: New connector journey (see user-journeys.md).
**Acceptance criteria**: `connectors` table holds the catalog (seeded with 15 connectors). `connector_connections` table tracks active connections with encrypted OAuth tokens. Both tables have RLS policies.

Files to create:
- `packages/db/src/schema/connectors.ts` -- Table: `connectors` (id, name, slug, description, icon_url, category, auth_type, scopes, tools_manifest JSONB, status)
- `packages/db/src/schema/connector-connections.ts` -- Table: `connector_connections` (id, connector_id FK, agent_id FK, org_id, environment, status, account_label, encrypted_access_token, encrypted_refresh_token, token_expires_at, last_used_at, metadata JSONB)
- `packages/db/src/seeds/connector-catalog.ts` -- Seed the 15 starter connectors with their metadata and tool manifests

#### 6b.2 Build connector MCP server framework

**What**: A framework for creating connector MCP servers — each connector is a thin MCP server that wraps a service's REST API.
**Spec reference**: PRD §5.11 ("Each connector is a hosted MCP server managed by Agentsy").
**Journey**: Internal infrastructure.
**Acceptance criteria**: A connector MCP server can be created by defining routes (API endpoints) and mapping them to MCP tools. The framework handles credential injection, error handling, and rate limiting.

Files to create:
- `packages/connector-sdk/src/framework.ts` -- Base connector class with tool registration, credential injection, and error handling
- `packages/connector-sdk/src/types.ts` -- ConnectorDefinition, ConnectorTool, OAuthConfig types
- `packages/connector-sdk/src/oauth.ts` -- OAuth 2.0 authorization code flow (authorization URL generation, token exchange, token refresh)
- `packages/connector-sdk/package.json` -- Internal package `@agentsy/connector-sdk`

#### 6b.3 Implement OAuth flow infrastructure

**What**: Server-side OAuth 2.0 authorization code flow — generate auth URLs, handle callbacks, exchange codes for tokens, store encrypted tokens, auto-refresh.
**Spec reference**: spec-api.md sections 17.2, 17.3, 17.8 (OAuth flow, callback, refresh).
**Journey**: Connect a connector via dashboard.
**Acceptance criteria**: `POST /v1/connectors/:id/connect` returns an authorization URL. OAuth callback exchanges the code, encrypts tokens in `connector_connections`, and redirects to dashboard. Token refresh runs automatically before expiry.

Files to create:
- `apps/api/src/routes/connectors.ts` -- Connector catalog listing (17.1), OAuth connect (17.2), callback (17.3), API key connect (17.4), list connections (17.5), get status (17.6), disconnect (17.7), refresh (17.8)
- `apps/api/src/lib/oauth-client.ts` -- OAuth 2.0 client (authorization URL, token exchange, refresh)
- `apps/worker/src/jobs/token-refresh.ts` -- Scheduled job to auto-refresh OAuth tokens before expiry

#### 6b.4 Build starter connectors (15)

**What**: Implement the 15 starter connector MCP servers.
**Spec reference**: PRD §5.11 starter connector set.
**Journey**: All connector journeys.
**Acceptance criteria**: Each connector discovers its tools via the catalog. Each connector can execute tool calls using stored OAuth/API key credentials. All 15 connectors pass health checks.

Files to create (one per connector):
- `packages/connectors/gmail/` -- Gmail connector (read, send, search, draft)
- `packages/connectors/slack/` -- Slack connector (send message, read channels, search)
- `packages/connectors/google-drive/` -- Google Drive connector (list, read, search files)
- `packages/connectors/google-calendar/` -- Google Calendar connector (list, create, update events)
- `packages/connectors/notion/` -- Notion connector (search, read, create pages/databases)
- `packages/connectors/linear/` -- Linear connector (issues, projects, comments)
- `packages/connectors/github/` -- GitHub connector (repos, issues, PRs, files)
- `packages/connectors/jira/` -- Jira connector (issues, projects, comments)
- `packages/connectors/hubspot/` -- HubSpot connector (contacts, deals, companies)
- `packages/connectors/salesforce/` -- Salesforce connector (records, queries, reports)
- `packages/connectors/intercom/` -- Intercom connector (conversations, contacts, articles)
- `packages/connectors/figma/` -- Figma connector (files, components, comments)
- `packages/connectors/asana/` -- Asana connector (tasks, projects, sections)
- `packages/connectors/stripe/` -- Stripe connector (customers, charges, subscriptions) — API key auth
- `packages/connectors/postgresql/` -- PostgreSQL connector (query, schema inspection) — connection string auth

#### 6b.5 Integrate connectors into agent tool registry

**What**: When an agent has connected connectors, their tools appear in the unified tool registry alongside native tools and raw MCP tools.
**Spec reference**: PRD R-11.10 ("No distinction between native and connector tools at runtime").
**Journey**: Agent uses connector tools in runs.
**Acceptance criteria**: `GET /v1/agents/:id/tools` returns connector tools merged with native tools. Agent runs can call connector tools seamlessly. Connector tool calls appear in run traces with connector attribution.

Files to modify:
- `apps/worker/src/tools/tool-registry.ts` -- Add connector tool source alongside native and MCP tools
- `apps/worker/src/tools/connector-executor.ts` -- Execute connector tool calls by proxying to the hosted MCP server with decrypted credentials

#### 6b.6 Implement connector dashboard UI

**What**: Dashboard pages for browsing the connector catalog, connecting services, and managing connections.
**Spec reference**: PRD R-11.8, user-journeys.md connector journey.
**Journey**: Connect connectors via dashboard.
**Acceptance criteria**: Connector catalog page shows all available connectors with icons, categories, and search. Click "Connect" starts OAuth flow. Connected connectors show status. Agent detail page shows assigned connectors.

Files to create:
- `apps/web/src/app/connectors/page.tsx` -- Connector catalog browser with search and category filters
- `apps/web/src/app/connectors/callback/page.tsx` -- OAuth callback landing page
- `apps/web/src/components/connector-card.tsx` -- Connector card with icon, name, status, connect/disconnect button
- `apps/web/src/components/connector-assign-dialog.tsx` -- Dialog to assign connectors to agents

#### 6b.7 Implement `agentsy connectors` CLI commands

**What**: CLI commands for listing, connecting, and managing connectors.
**Spec reference**: PRD R-11.9.
**Journey**: Connect connectors via CLI.
**Acceptance criteria**: `agentsy connectors list` shows available connectors. `agentsy connectors connect gmail --agent support-agent` opens browser for OAuth. `agentsy connectors status` shows connection health.

Files to create:
- `packages/cli/src/commands/connectors.ts` -- `agentsy connectors list|connect|disconnect|status` commands

### Tests (Phase 6b)

- **Unit**: `packages/connector-sdk/src/__tests__/framework.test.ts` -- Connector framework tool registration, credential injection
- **Unit**: `apps/api/src/__tests__/oauth-client.test.ts` -- OAuth URL generation, token exchange, refresh
- **Integration**: `apps/api/src/__tests__/connectors.test.ts` -- Catalog listing, OAuth flow, connection CRUD
- **Integration**: `apps/worker/src/__tests__/connector-executor.test.ts` -- Connector tool execution with mocked credentials
- **Integration**: `packages/connectors/gmail/__tests__/gmail.test.ts` -- Gmail connector tool execution (mocked API)
- **E2E**: Connect Gmail connector to an agent, run agent, agent sends an email via Gmail tool

### User Journey Verification

- New connector journey: Browse catalog → connect Gmail → assign to agent → agent uses Gmail tools → trace shows connector tool calls
- **J10 extension**: Connectors appear alongside manually configured MCP servers in agent tool list

### Definition of Done

- Demo: Browse connector catalog in dashboard. Click "Connect Gmail" → OAuth flow → redirected back. Assign Gmail to support agent. Agent run calls `gmail_search_emails` tool. Trace shows the connector tool call with credentials injected. `agentsy connectors status` shows "active" for Gmail.

---

## Phase 7: Deployment & Environments (Journey 5)

### Prerequisites
- Phase 2 complete (agent versioning)
- Phase 6 complete (tool policies, secrets per environment)

### Steps

#### 7.1 Implement environment management

**What**: CRUD for environments (dev/staging/prod) with per-environment tool policies.
**Spec reference**: spec-api.md section 9 (Environments), spec-data-model.md table 3.6 (environments).
**Journey**: J5 step 5.1 (manage environments).
**Acceptance criteria**: Three default environments are seeded on org creation (Phase 1). Environment settings (tool allow/deny lists, require_approval_for_write_tools) are configurable.

Files to create:
- `apps/api/src/routes/environments.ts` -- Environment settings endpoints

#### 7.2 Implement deploy command (`agentsy deploy`)

**What**: CLI command that reads `agentsy.config.ts`, creates a new agent version, and creates a deployment record.
**Spec reference**: spec-sdk.md section 9 (CLI), PRD R-6.3, spec-api.md section 8 (Deployments).
**Journey**: J5 step 5.2 (deploy via CLI).
**Acceptance criteria**: `agentsy deploy --env production` creates a new version from the current config, marks the previous deployment as superseded, and the new deployment as active. Agent is now reachable via API.

Files to create:
- `packages/cli/src/commands/deploy.ts` -- `agentsy deploy` command
- `apps/api/src/routes/deployments.ts` -- Deployment CRUD, deployment creation logic (supersede previous)

#### 7.3 Implement deployment history

**What**: List all deployments for an agent, show which version is active per environment.
**Spec reference**: PRD R-6.5, spec-data-model.md table 3.7 (deployments).
**Journey**: J5 step 5.3 (view deployment history).
**Acceptance criteria**: `GET /v1/agents/:id/deployments` returns deployment history with version info. Active deployment is clearly marked.

Covered by step 7.2 (deployments endpoint).

#### 7.4 Implement version diff viewer

**What**: Compare two agent versions showing changes in system prompt, model, tools, and guardrails.
**Spec reference**: PRD R-6.5 (deploy history: prompt diff).
**Journey**: J5 step 5.4 (see what changed between versions).
**Acceptance criteria**: `GET /v1/agents/:id/versions/:v1/diff/:v2` returns a structured diff of prompt, model, tools_config, guardrails_config.

Files to create:
- `apps/api/src/routes/version-diff.ts` -- Version comparison endpoint

#### 7.5 Implement rollback command (`agentsy rollback`)

**What**: CLI and API command to revert to a previous agent version.
**Spec reference**: PRD R-6.4, spec-data-model.md table 3.7 (deployment flow step 3: rollback).
**Journey**: J5 step 5.5 (rollback).
**Acceptance criteria**: `agentsy rollback --to-version 3` creates a new deployment pointing to version 3. Previous active deployment is superseded. `POST /v1/agents/:id/rollback` does the same via API.

Files to create:
- `packages/cli/src/commands/rollback.ts` -- `agentsy rollback` command
- `apps/api/src/routes/rollback.ts` -- Rollback endpoint

#### 7.6 Implement `agentsy login` / `agentsy logout`

**What**: CLI authentication flow (opens browser for OAuth, stores token locally).
**Spec reference**: spec-sdk.md section 9 (CLI), PRD R-9.7.
**Journey**: J1 step 1.4 (authenticate CLI).
**Acceptance criteria**: `agentsy login` opens browser, user authenticates, token is stored in `~/.agentsy/config.json`. `agentsy logout` removes stored credentials. Subsequent CLI commands use the stored token.

Files to create:
- `packages/cli/src/commands/login.ts` -- Browser-based OAuth flow
- `packages/cli/src/commands/logout.ts` -- Remove stored credentials
- `packages/cli/src/auth/token-store.ts` -- Read/write credentials to `~/.agentsy/config.json`

#### 7.7 Implement `agentsy secrets set/get/list`

**What**: CLI commands for managing platform secrets.
**Spec reference**: spec-sdk.md section 9, user-journeys.md Journey 1 step 1.3.
**Journey**: J1 step 1.3 (set LLM API key via CLI).
**Acceptance criteria**: `agentsy secrets set ANTHROPIC_API_KEY sk-ant-...` stores encrypted secret. `agentsy secrets list` shows secret names. No command reveals plaintext values.

Files to create:
- `packages/cli/src/commands/secrets.ts` -- Secrets CLI commands

### Tests (Phase 7)

- **Integration**: `apps/api/src/__tests__/deployments.test.ts` -- Deploy, supersede, rollback lifecycle
- **Integration**: `apps/api/src/__tests__/version-diff.test.ts` -- Diff between versions shows changes
- **Integration**: `apps/api/src/__tests__/environments.test.ts` -- Environment settings, tool policies
- **E2E**: `agentsy deploy` then `agentsy rollback` and verify the correct version is serving

### User Journey Verification

- **J5 all steps**: Deploy, view history, compare versions, rollback
- **J1 step 1.3**: `agentsy secrets set` stores LLM key
- **J1 step 1.4**: `agentsy login` authenticates CLI

### Definition of Done

- Demo: `agentsy deploy --env staging` creates version 2. View deployment history in dashboard. See prompt diff between v1 and v2. `agentsy deploy --env production` promotes to prod. `agentsy rollback --to-version 1` reverts to v1. Verify the agent is serving v1 config.

---

## Phase 8: Dashboard & Observability (Journeys 6, 13, 16)

### Prerequisites
- Phase 2 complete (agent runs produce traces)
- Phase 3 complete (streaming)
- Phase 4 complete (eval results exist)

### Steps

#### 8.1 Implement design token system and component primitives

**What**: Set up the design token system (colors, spacing, typography) for the dashboard. Create base primitives (Box, Stack, Text, Button) using shadcn/ui + Tailwind.
**Spec reference**: technology-decisions.md D-11.2 (shadcn/ui), D-11.3 (Recharts).
**Journey**: All dashboard journeys.
**Acceptance criteria**: Token system exists with light + dark mode. All colors, spacing, and typography use tokens. WCAG 4.5:1 contrast ratios verified. 44x44px minimum touch targets.

Files to create:
- `packages/ui/src/tokens/` -- Color, spacing, typography tokens
- `packages/ui/src/primitives/` -- Box, Stack, Text, Button components
- `packages/ui/src/components/` -- Common components (Card, Table, Badge, Dialog, etc.) from shadcn/ui
- `apps/web/tailwind.config.ts` -- Tailwind config referencing design tokens

#### 8.2 Implement sidebar navigation and settings pages

**What**: Full sidebar navigation per PRD section 8. Settings pages: General, Environments, Billing.
**Spec reference**: PRD section 8 (Information Architecture), user-journeys.md navigation map.
**Journey**: J1 (settings), J5 (environments), J8 (team settings).
**Acceptance criteria**: Sidebar renders all navigation items per PRD section 8. Settings General shows org name and billing email. Settings Environments page shows dev/staging/prod with tool policies (allow/deny lists, require_approval_for_write_tools). Settings Billing shows plan info and limits.

Files to create:
- `apps/web/src/components/sidebar.tsx` -- Left sidebar navigation with all sections
- `apps/web/src/app/settings/general/page.tsx` -- Org general settings
- `apps/web/src/app/settings/environments/page.tsx` -- Environment management UI (tool policies per env)
- `apps/web/src/app/settings/billing/page.tsx` -- Billing/plan page

#### 8.3 Implement agent list view

**What**: Dashboard page showing all agents with key metrics.
**Spec reference**: PRD section 8 (Agents page hierarchy), user-journeys.md Journey 13.
**Journey**: J13 step 13.1 (agent list with trends).
**Acceptance criteria**: Table shows agent name, status, recent run count, success rate, avg cost. Sortable and filterable.

Files to create:
- `apps/web/src/app/agents/page.tsx` -- Agent list page
- `apps/web/src/components/agent-table.tsx` -- Agent table with metrics

#### 8.3 Implement agent overview with sparklines

**What**: Agent detail page with sparkline metric cards (success rate, avg cost, avg latency, error rate).
**Spec reference**: PRD R-5.5, user-journeys.md Journey 13 (steps 13.2-13.6).
**Journey**: J13 (agent dashboard overview).
**Acceptance criteria**: Four sparkline cards showing 7-day trends per architecture-v1.md section 6 (Application metrics). Data sourced from `usage_daily` table and aggregated from `runs`.

Files to create:
- `apps/web/src/app/agents/[id]/page.tsx` -- Agent overview page
- `apps/web/src/components/sparkline-card.tsx` -- Metric card with inline SVG sparkline
- `apps/web/src/components/sparkline.tsx` -- Custom SVG sparkline component

#### 8.4 Implement agent detail sub-pages

**What**: Full set of agent detail sub-pages per PRD section 8 page hierarchy.
**Spec reference**: PRD section 8 (Agent detail hierarchy), user-journeys.md Journeys 2, 5, 9, 10.
**Journey**: J2 (config), J5 (deployments), J9 (knowledge base), J10 (tools).
**Acceptance criteria**: Each sub-page loads data for the current agent. Navigation tabs switch between sub-pages. All pages match the hierarchy in PRD section 8.

Files to create:
- `apps/web/src/app/agents/create/page.tsx` -- Create Agent form (model picker, prompt editor, tool selector, guardrails) per user-journeys.md Journey 2 Path B
- `apps/web/src/app/agents/[id]/config/page.tsx` -- Agent config editor (prompt, model, tools, guardrails)
- `apps/web/src/app/agents/[id]/tools/page.tsx` -- MCP server connections and native tool list per J10
- `apps/web/src/app/agents/[id]/deployments/page.tsx` -- Version history with prompt diff viewer per J5
- `apps/web/src/app/agents/[id]/eval-history/page.tsx` -- Eval experiments filtered to this agent per J4
- `apps/web/src/app/agents/[id]/knowledge-base/page.tsx` -- KB upload, document list, chunk stats per J9
- `apps/web/src/app/agents/[id]/traces/page.tsx` -- Searchable trace list filtered to this agent
- `apps/web/src/components/agent-tabs.tsx` -- Tab navigation for agent sub-pages (Overview, Runs, Config, Tools, Evals, KB, Deployments, Traces)

#### 8.5 Implement run list with filters

**What**: Run history table filterable by agent, status, date range, cost.
**Spec reference**: PRD R-5.3, spec-api.md section 3 (runs list with filters).
**Journey**: J6 step 6.1 (view run history).
**Acceptance criteria**: Runs table with columns: status, agent, input preview, duration, cost, created_at. Filters for status, date range, agent. Cursor-based pagination.

Files to create:
- `apps/web/src/app/runs/page.tsx` -- Run list page
- `apps/web/src/components/run-table.tsx` -- Run table with filters
- `apps/web/src/app/agents/[id]/runs/page.tsx` -- Agent-specific run list

#### 8.5 Implement run detail with trace viewer

**What**: Trace timeline showing every step (LLM calls, tool calls, retrieval) with expandable details.
**Spec reference**: PRD R-5.2, R-5.4, R-5.6, user-journeys.md Journey 6 (steps 6.2-6.5).
**Journey**: J6 (monitor & debug), J12 (inspect failed run).
**Acceptance criteria**: Timeline shows steps in order with type icons. Each step expandable to show input/output, tokens, cost, duration. LLM calls show messages. Tool calls show arguments and results. Cost breakdown per step. Failed steps highlighted with error details.

Files to create:
- `apps/web/src/app/runs/[id]/page.tsx` -- Run detail page
- `apps/web/src/components/trace-viewer.tsx` -- Trace timeline component
- `apps/web/src/components/trace-step.tsx` -- Individual step component (LLM call, tool call, retrieval, approval)
- `apps/web/src/components/cost-breakdown.tsx` -- Per-step cost breakdown

#### 8.6 Implement approval handling in dashboard

**What**: UI for reviewing and approving/denying pending tool calls.
**Spec reference**: architecture-v1.md section 3.2 (Approval Gate Flow).
**Journey**: J6 step 6.3 (approve tool call from dashboard).
**Acceptance criteria**: Pending approval appears as a highlighted step in the trace viewer. "Approve" and "Deny" buttons send signals to the Temporal workflow. Step updates to show resolved status.

Files to create:
- `apps/web/src/components/approval-action.tsx` -- Approve/deny UI component

#### 8.7 Implement usage dashboard

**What**: Organization usage metrics: total tokens, total cost, by model, by agent, by day.
**Spec reference**: PRD R-5.7, spec-data-model.md table 3.21 (usage_daily).
**Journey**: J16 step 16.1 (view usage).
**Acceptance criteria**: Line charts showing daily usage trends. Breakdown by model and by agent. Total cost displayed prominently. Data sourced from `usage_daily` table.

Files to create:
- `apps/web/src/app/usage/page.tsx` -- Usage dashboard page
- `apps/web/src/components/usage-charts.tsx` -- Recharts line/bar charts

#### 8.8 Implement usage aggregation job and API endpoints

**What**: Nightly job (or near-real-time via Redis counters) to populate `usage_daily` table from `runs`. REST API endpoints for querying usage data.
**Spec reference**: spec-data-model.md table 3.21 (usage_daily), spec-api.md section 13 (Usage & Billing).
**Journey**: J16 (usage data availability).
**Acceptance criteria**: `usage_daily` rows are created for each org for each day with correct aggregate values. `GET /v1/usage/summary` returns aggregate usage for date range. `GET /v1/usage/daily` returns per-day breakdown by model/agent.

Files to create:
- `apps/worker/src/jobs/usage-aggregation.ts` -- Temporal scheduled workflow or cron job that aggregates runs into usage_daily
- `apps/api/src/routes/usage.ts` -- Usage API endpoints per spec-api.md sections 13.1 (summary) and 13.2 (daily breakdown)

#### 8.9 Implement eval experiment viewer

**What**: Eval results dashboard showing experiment list, per-case scores, and comparison view.
**Spec reference**: PRD R-4.8, user-journeys.md Journey 4.
**Journey**: J4 (eval results visualization).
**Acceptance criteria**: Experiment list shows status, score summary, cost. Experiment detail shows per-case results with pass/fail. Comparison view shows side-by-side score deltas.

Files to create:
- `apps/web/src/app/evals/page.tsx` -- Eval hub landing (datasets, experiments, graders overview)
- `apps/web/src/app/evals/datasets/page.tsx` -- Dataset list (create, version)
- `apps/web/src/app/evals/datasets/[id]/page.tsx` -- Dataset detail with cases table, stats, and "Add case" button
- `apps/web/src/app/evals/experiments/page.tsx` -- Experiments list with status and score summary
- `apps/web/src/app/evals/experiments/[id]/page.tsx` -- Experiment detail with per-case results
- `apps/web/src/app/evals/graders/page.tsx` -- Grader registry (available graders with config docs) per PRD section 8
- `apps/web/src/app/evals/baselines/page.tsx` -- Active baselines per agent with promote/compare actions
- `apps/web/src/components/eval-comparison.tsx` -- Side-by-side comparison view

#### 8.10 Implement "Add to eval dataset" button on run detail

**What**: One-click button on the run detail page to convert a run trace into an eval test case.
**Spec reference**: user-journeys.md Journey 12, PRD Flow 2 step 4.
**Journey**: J12 (add failing run to eval dataset).
**Acceptance criteria**: Button visible on run detail page. Click opens a dialog to select target dataset. Creates eval case with input, expected output (editable), and mocked tool results.

Files to create:
- `apps/web/src/components/add-to-eval-dialog.tsx` -- Dialog for selecting dataset and previewing eval case

#### 8.11 Implement alert rule configuration

**What**: Configure alert rules for error rate, latency, cost thresholds. Notification delivery via in-app, email, and webhook.
**Spec reference**: user-journeys.md Journey 16 (Alerting & Notifications).
**Journey**: J16 (alerting).
**Acceptance criteria**: Users can create alert rules (e.g., "error rate > 5% for 5 minutes"). Alerts trigger in-app notifications. Email and webhook delivery for critical alerts.

Files to create:
- `apps/web/src/app/settings/alerts/page.tsx` -- Alert configuration UI
- `apps/api/src/routes/alerts.ts` -- Alert rule CRUD endpoints
- `apps/worker/src/jobs/alert-checker.ts` -- Periodic job that evaluates alert conditions

#### 8.12 Implement notification system

**What**: In-app notification center with email and webhook delivery.
**Spec reference**: user-journeys.md Journey 16 (steps 16.3-16.5).
**Journey**: J16 (notifications).
**Acceptance criteria**: In-app notification bell with unread count. Click to see notification list. Mark as read. Email delivery for configured alerts. Webhook delivery for configured alerts.

Files to create:
- `apps/web/src/components/notification-center.tsx` -- Notification bell + dropdown
- `apps/api/src/routes/notifications.ts` -- Notification endpoints
- `apps/worker/src/jobs/notification-sender.ts` -- Email and webhook delivery

### Tests (Phase 8)

- **Unit**: `apps/web/src/__tests__/sparkline.test.tsx` -- Sparkline renders correctly with data
- **Unit**: `apps/web/src/__tests__/trace-viewer.test.tsx` -- Trace viewer renders steps in order
- **Unit**: `packages/ui/src/__tests__/tokens.test.ts` -- Design tokens produce valid CSS values, contrast ratios pass WCAG
- **Integration**: `apps/api/src/__tests__/usage-aggregation.test.ts` -- Daily aggregation produces correct totals
- **Integration**: `apps/api/src/__tests__/alerts.test.ts` -- Alert rules evaluate correctly, trigger notifications
- **E2E**: Navigate dashboard end-to-end: login -> agents list -> agent detail -> run detail -> trace viewer -> eval results

### User Journey Verification

- **J6 all steps**: View run history, click failed run, see trace, identify failure point
- **J13 all steps**: Agent dashboard with sparklines, health metrics, recent activity
- **J16 all steps**: Configure alert, trigger condition, receive notification

### Definition of Done

- Demo: Dashboard shows agent list with sparkline trends. Click an agent -> see overview with 4 metric cards. Click a run -> see full trace timeline with expandable steps, cost breakdown. Click "Add to eval dataset" on a run. View usage dashboard with cost charts. Configure an alert for error rate > 5%.

---

## Phase 9: CLI Polish & DX (Journey 15)

### Prerequisites
- Phases 1-8 substantially complete

### Steps

#### 9.1 Polish `agentsy init` scaffold

**What**: Improve templates with better defaults, add `with-knowledge` template.
**Spec reference**: spec-sdk.md section 3 (template variants).
**Journey**: J2 (create agent project).
**Acceptance criteria**: All three templates work: `basic`, `with-eval`, `with-knowledge`. Templates include `.env.example`, `.gitignore`, `tsconfig.json`, and working example code.

Files to modify:
- `packages/cli/src/templates/with-knowledge/` -- Add template with knowledge base config

#### 9.2 Implement `agentsy logs --tail`

**What**: Tail run logs from the platform in real-time.
**Spec reference**: PRD R-9.6, spec-sdk.md section 9.
**Journey**: J15 step 15.6 (tail logs in CI).
**Acceptance criteria**: `agentsy logs --tail` streams logs via SSE. `--agent support-agent` filters by agent. `--status failed` filters by status.

Files to create:
- `packages/cli/src/commands/logs.ts` -- `agentsy logs` command with filters and tail mode

#### 9.3 Implement hot reload in dev mode

**What**: Watch `agentsy.config.ts` and tool files for changes, hot reload agent config without restarting the dev server.
**Spec reference**: PRD R-9.8.
**Journey**: J3 (iterate quickly during local dev).
**Acceptance criteria**: Changing the system prompt in `agentsy.config.ts` takes effect on the next run without restarting `agentsy dev`.

Files to modify:
- `packages/cli/src/commands/dev.ts` -- Add file watcher (chokidar) for config and tool files

#### 9.4 Finalize CI/CD integration documentation

**What**: GitHub Actions examples for running evals in CI, blocking deploys on regression.
**Spec reference**: user-journeys.md Journey 15 (CI/CD Integration).
**Journey**: J15 (full CI/CD pipeline).
**Acceptance criteria**: Example GitHub Actions workflow that runs `agentsy eval run --ci --dataset golden` and posts results as PR comment.

Files to create:
- `packages/cli/src/templates/github-actions/eval.yml` -- Example CI workflow
- Documentation in templates

#### 9.5 Implement `agentsy` CLI entry point and help

**What**: Polish the CLI entry point with proper help text, version info, and subcommand routing.
**Spec reference**: spec-sdk.md section 9.
**Journey**: All CLI journeys.
**Acceptance criteria**: `agentsy --help` shows all commands with descriptions. `agentsy --version` shows version. Unknown commands show helpful error messages.

Files to create/modify:
- `packages/cli/src/index.ts` -- Commander.js program with all subcommands registered
- `packages/cli/bin/agentsy.js` -- Executable entry point

### Tests (Phase 9)

- **E2E**: `agentsy init my-agent --template basic && cd my-agent && agentsy dev` -> agent runs locally
- **E2E**: `agentsy init my-agent --template with-eval && cd my-agent && agentsy eval run` -> evals pass
- **E2E**: `agentsy login && agentsy deploy && agentsy logs --tail` -> see deployment logs

### User Journey Verification

- **J15 all steps**: Full CI/CD pipeline: PR -> eval -> PR comment -> merge -> deploy
- **J3 step 3.3**: Hot reload works during `agentsy dev`

### Definition of Done

- Demo: Complete developer journey from `agentsy init` through `agentsy dev` through `agentsy eval run --ci` through `agentsy deploy` through `agentsy logs --tail`. All commands work with clear output and helpful error messages.

---

## Phase 10: Webhooks & Integration

### Prerequisites
- Phase 3 complete (run events)
- Phase 4 complete (eval events)

### Steps

#### 10.1 Implement webhook registration CRUD

**What**: Create, list, update, and delete webhook endpoints. Each webhook subscribes to specific event types.
**Spec reference**: spec-api.md section 16 (Webhook Events), spec-data-model.md table 3.20 (webhooks).
**Journey**: J16 step 16.5 (webhook delivery).
**Acceptance criteria**: `POST /v1/webhooks` creates a webhook with URL and event list. Returns an HMAC signing secret once. `GET /v1/webhooks` lists registered webhooks. `PATCH /v1/webhooks/:webhook_id` updates webhook config. `DELETE /v1/webhooks/:webhook_id` removes a webhook. `POST /v1/webhooks/:webhook_id/rotate-secret` generates a new signing secret (per spec-api.md 16.5).

Files to create:
- `apps/api/src/routes/webhooks.ts` -- Webhook CRUD endpoints (spec-api.md 16.1-16.5 including rotate-secret)

#### 10.2 Implement event delivery

**What**: When subscribed events occur (run.completed, run.failed, eval.completed), deliver payloads to registered webhook URLs.
**Spec reference**: spec-api.md section 16.
**Journey**: J16 (webhook notifications).
**Acceptance criteria**: Events are delivered via HTTP POST with JSON payload. Payload includes event type, timestamp, and resource data. Delivery is asynchronous (does not block the main flow).

Files to create:
- `apps/worker/src/jobs/webhook-delivery.ts` -- Webhook delivery job (async, via Temporal or queue)

#### 10.3 Implement signature verification

**What**: Each webhook delivery includes an HMAC-SHA256 signature header for verification.
**Spec reference**: spec-api.md section 16.
**Journey**: J16 (secure webhook integration).
**Acceptance criteria**: `X-Agentsy-Signature` header is included on every delivery. Signature is `HMAC-SHA256(payload, signing_secret)`. Client libraries can verify the signature.

Files to modify:
- `apps/worker/src/jobs/webhook-delivery.ts` -- Add HMAC signature computation

#### 10.4 Implement retry logic

**What**: Retry failed webhook deliveries with exponential backoff.
**Spec reference**: spec-api.md section 16.
**Journey**: J16 (reliable delivery).
**Acceptance criteria**: Failed deliveries (non-2xx response or timeout) are retried up to 3 times with exponential backoff (1s, 10s, 60s). After all retries fail, the delivery is marked as failed with error details.

Files to modify:
- `apps/worker/src/jobs/webhook-delivery.ts` -- Add retry logic

#### 10.5 Implement webhook management UI

**What**: Dashboard page for managing webhook endpoints.
**Spec reference**: user-journeys.md Journey 16.
**Journey**: J16 (webhook configuration).
**Acceptance criteria**: Settings page shows registered webhooks. Create, edit, delete webhooks. View delivery history with status.

Files to create:
- `apps/web/src/app/settings/webhooks/page.tsx` -- Webhook management page
- `apps/web/src/components/webhook-form.tsx` -- Webhook creation/edit form

### Tests (Phase 10)

- **Unit**: `apps/worker/src/__tests__/webhook-delivery.test.ts` -- HMAC signature computation, retry logic
- **Integration**: `apps/api/src/__tests__/webhooks.test.ts` -- Webhook CRUD, event subscription
- **Integration**: `apps/worker/src/__tests__/webhook-integration.test.ts` -- End-to-end delivery on run.completed

### User Journey Verification

- **J16 step 16.5**: Webhook receives event on run completion

### Definition of Done

- Demo: Create a webhook for `run.completed`. Run an agent. Webhook endpoint receives the event with correct signature. Verify signature with HMAC-SHA256.

---

## Phase 11: Agent Git Repos & CI/CD (Journeys 18)

### Prerequisites
- Phase 2 complete (agent versioning)
- Phase 4 complete (eval engine)
- Phase 7 complete (deployment & environments)

### Steps

#### 11.1 Implement agent repository initialization

**What**: When an agent is created, initialize a bare Git repository on the platform. Store repo metadata in the `agent_repos` table.
**Spec reference**: spec-agent-evolution.md section 2 (Agent Git Repositories).
**Journey**: J18 step 1 (agent has a Git repo).
**Acceptance criteria**: `POST /v1/agents` also creates a bare Git repo at `/repos/{org_id}/{agent_slug}.git`. `agent_repos` row is created with `storage_path`, `default_branch`, and `head_sha`. `GET /v1/agents/{agentId}/repo` returns repo metadata.

Files to create:
- `apps/api/src/routes/agent-repos.ts` -- Repo metadata endpoints (GET, commits, diff)
- `apps/api/src/services/git-repo.ts` -- Git repo initialization and management (bare repo creation, server-side hooks)
- `packages/db/src/schema/agent-repos.ts` -- `agent_repos` table definition

#### 11.2 Implement Git transport layer

**What**: Expose Git-compatible transport (HTTPS) so `git clone`, `git push`, `git pull` work against agent repos.
**Spec reference**: spec-agent-evolution.md section 2.2 (Repository Lifecycle), 2.3 (Remote Storage).
**Journey**: J18 step 2 (clone and push agent repos).
**Acceptance criteria**: `git clone https://git.agentsy.com/org_xxx/support-agent.git` works with API key auth. `git push origin main` triggers server-side hooks. Standard Git operations (branch, log, diff) work.

Files to create:
- `apps/api/src/routes/git-transport.ts` -- Git smart HTTP transport (git-upload-pack, git-receive-pack)
- `apps/api/src/middleware/git-auth.ts` -- API key authentication for Git transport

#### 11.3 Implement server-side push hooks

**What**: On `git push` to main, validate `agentsy.config.ts`, create an `agent_version`, and trigger CI pipeline.
**Spec reference**: spec-agent-evolution.md section 2.3 (server-side hooks), section 3.1 (Pipeline Triggers).
**Journey**: J18 step 3 (push triggers version creation and CI).
**Acceptance criteria**: Push to main validates config schema. Invalid config rejects the push with error message. Valid push creates a new `agent_version` row from the committed config. CI pipeline is triggered.

Files to create:
- `apps/api/src/services/push-hook.ts` -- Server-side post-receive hook logic (validate, create version, trigger CI)
- `apps/api/src/services/config-parser.ts` -- Parse and validate agentsy.config.ts from repo contents

#### 11.4 Implement CI pipeline Temporal workflow

**What**: A Temporal workflow that runs the CI pipeline: validate → eval → compare baseline → gate → deploy → notify.
**Spec reference**: spec-agent-evolution.md section 3.2-3.3 (Pipeline Definition and Execution).
**Journey**: J18 step 4 (CI pipeline runs evals on push).
**Acceptance criteria**: Push to main triggers `CIPipelineWorkflow`. Workflow runs eval experiments against configured datasets. Compares results against active baseline. Passes/fails based on regression gate + minimum score. Auto-deploys to staging if configured. Sends notifications on failure/deploy.

Files to create:
- `apps/worker/src/workflows/ci-pipeline.ts` -- CIPipelineWorkflow (validate → eval → compare → gate → deploy → notify)
- `apps/worker/src/activities/ci-activities.ts` -- Pipeline activities (ValidateConfig, CreateVersion, RunEvals, CompareBaseline, GateDecision, Deploy, Notify)

#### 11.5 Implement pipeline API and dashboard

**What**: API endpoints for listing pipeline runs and a dashboard tab showing pipeline history.
**Spec reference**: spec-agent-evolution.md section 10.4 (CI Pipeline API), section 11.2 (CI/CD Tab).
**Journey**: J18 step 5 (view pipeline results).
**Acceptance criteria**: `GET /v1/agents/{agentId}/pipelines` lists pipeline runs with status. `GET /v1/agents/{agentId}/pipelines/{runId}` shows run details including eval results and gate decisions. Dashboard CI/CD tab shows pipeline history with trigger, commit, eval status, and deploy status.

Files to create:
- `apps/api/src/routes/pipelines.ts` -- Pipeline run list/detail endpoints
- `apps/web/src/app/agents/[id]/ci-cd/page.tsx` -- CI/CD dashboard tab
- `apps/web/src/app/agents/[id]/repo/page.tsx` -- Repository dashboard tab (commits, files)

#### 11.6 Implement PR eval integration

**What**: When a PR is opened against main, run evals and post a comparison comment.
**Spec reference**: spec-agent-evolution.md section 3.4 (PR Integration).
**Journey**: J18 step 6 (PR gets eval comparison).
**Acceptance criteria**: PR to main triggers eval pipeline. Results are compared against active baseline. A markdown comparison table is posted as a PR comment showing per-grader deltas. Status is PASS/FAIL.

Files to modify:
- `apps/worker/src/workflows/ci-pipeline.ts` -- Add PR comparison branch
- `apps/worker/src/activities/ci-activities.ts` -- Add PostPRComment activity

#### 11.7 Implement `agentsy push` and `agentsy pull` CLI commands

**What**: CLI commands that wrap `git push`/`git pull` with Agentsy remote configuration.
**Spec reference**: spec-agent-evolution.md section 2.2 (Repository Lifecycle).
**Journey**: J18 step 7 (push/pull agent code).
**Acceptance criteria**: `agentsy push` validates config locally, then pushes to Agentsy remote. `agentsy pull` pulls latest from Agentsy remote. Both commands handle authentication via stored API key.

Files to create:
- `packages/cli/src/commands/push.ts` -- `agentsy push` command
- `packages/cli/src/commands/pull.ts` -- `agentsy pull` command

### Tests (Phase 11)

- **Unit**: `apps/api/src/__tests__/git-repo.test.ts` -- Repo creation, config parsing
- **Unit**: `apps/api/src/__tests__/push-hook.test.ts` -- Push validation, version creation
- **Integration**: `apps/api/src/__tests__/agent-repos.test.ts` -- Repo CRUD, Git transport
- **Integration**: `apps/worker/src/__tests__/ci-pipeline.test.ts` -- Full pipeline: push → eval → gate → deploy
- **E2E**: Push to agent repo → CI runs evals → auto-deploys to staging

### User Journey Verification

- **J18**: Create agent → clone repo → edit config → push → CI runs → evals pass → deployed to staging → open PR → eval comparison posted

### Definition of Done

- Demo: `agentsy init "support-agent"` creates local project with Git repo. `agentsy push` sends to platform. CI pipeline runs evals against golden dataset. Pipeline passes. Agent auto-deploys to staging. Open PR with config change. Eval comparison comment appears on PR. Merge PR. Production deploy happens manually via `agentsy deploy --env production`.

---

## Phase 11.5: Code Execution — E2B Sandbox (Journey 20)

### Prerequisites
- Phase 2 complete (agent runtime, tool execution via Temporal activities)
- Phase 6 complete (tool system, approval gates, risk levels)
- E2B account and API key

### Steps

#### 11.5.1 Implement sandbox provider abstraction

**What**: A provider interface that abstracts sandbox lifecycle (create, execute, upload, download, destroy). E2B is the first implementation; the interface supports future Firecracker/self-hosted backends.
**Spec reference**: spec-code-execution.md section 2 (Architecture), technology-decisions.md D-5.1.
**Journey**: J20 foundation.
**Acceptance criteria**: `SandboxProvider` interface defined with `create()` and `destroy()`. `E2BSandboxProvider` implements it using the E2B SDK. `Sandbox` object supports `execute()`, `uploadFile()`, `downloadFile()`, `installPackages()`. Provider is injected via config (swappable for tests).

Files to create:
- `apps/worker/src/sandbox/provider.ts` -- SandboxProvider interface and SandboxConfig types
- `apps/worker/src/sandbox/e2b-provider.ts` -- E2B implementation using `@e2b/code-interpreter` SDK
- `apps/worker/src/sandbox/types.ts` -- ExecutionResult, Language, SandboxMetadata types

#### 11.5.2 Implement sandbox pool manager

**What**: A warm pool of pre-created sandboxes to minimize cold start latency. Pool size is configurable per template.
**Spec reference**: spec-code-execution.md section 4.1 (Pool Management).
**Journey**: J20 (fast code execution).
**Acceptance criteria**: Pool maintains N warm sandboxes per template. `acquire()` returns a warm sandbox in ~200ms. If pool is empty, falls back to cold creation (~2-4s). `release()` destroys the sandbox and replenishes the pool. Pool auto-scales based on usage. Sandbox timeout enforced (hard kill after limit).

Files to create:
- `apps/worker/src/sandbox/pool-manager.ts` -- Warm pool with acquire/release, auto-replenish, timeout enforcement

#### 11.5.3 Implement execute_code built-in tool

**What**: Register `execute_code` as a platform built-in tool. When an agent has `codeExecution.enabled: true`, the runtime injects this tool into the agent's tool list.
**Spec reference**: spec-code-execution.md section 3 (Built-In Code Execution Tool).
**Journey**: J20 step 1 (agent can execute code).
**Acceptance criteria**: `execute_code` tool accepts `language`, `code`, optional `packages`, `files`, and `timeout_ms`. Runtime acquires sandbox, installs packages, creates input files, executes code, captures stdout/stderr/exit_code, returns structured result. Output truncated at 100KB stdout / 10KB stderr. Sandbox persists between calls within same run (if `persistFilesystem: true`). Sandbox destroyed when run completes.

Files to create:
- `apps/worker/src/sandbox/execute-code-tool.ts` -- Built-in tool registration, input validation, execution orchestration
- `apps/worker/src/activities/code-execution-activity.ts` -- Temporal activity wrapping sandbox execute

#### 11.5.4 Implement file I/O and run artifacts

**What**: Input file mounting (inline + uploaded), output file capture, and persistent artifact storage (S3/R2).
**Spec reference**: spec-code-execution.md section 7 (File & Data Passing), section 9.3 (Run Artifacts Table).
**Journey**: J20 step 2 (agent reads/writes files in sandbox).
**Acceptance criteria**: Inline `files` parameter creates files in sandbox before execution. User-uploaded files mounted at `/input/uploads/`. Files written to `/output/` captured after execution. Artifacts stored in S3/R2 with metadata in `run_artifacts` table. `GET /v1/runs/{runId}/artifacts` lists artifacts. `GET /v1/runs/{runId}/artifacts/{id}` downloads file. Size limits enforced (5MB inline, 10MB output total).

Files to create:
- `packages/db/src/schema/run-artifacts.ts` -- `run_artifacts` table definition
- `apps/api/src/routes/run-artifacts.ts` -- Artifact list/download endpoints
- `apps/api/src/routes/run-files.ts` -- File upload endpoint (`POST /v1/runs/{runId}/files`)
- `apps/worker/src/sandbox/file-handler.ts` -- Input mounting, output capture, artifact storage

#### 11.5.5 Implement codeExecution agent config

**What**: Add `codeExecution` block to the SDK's `AgentConfig` type. Runtime reads this config to decide whether to inject `execute_code` and how to configure the sandbox.
**Spec reference**: spec-code-execution.md section 8 (SDK Surface).
**Journey**: J20 step 3 (developer enables code execution).
**Acceptance criteria**: `agentsy.defineAgent({ codeExecution: { enabled: true, ... } })` validates config. When enabled, runtime appends code execution guidance to system prompt. `template`, `limits`, `network`, `persistFilesystem`, `packages`, and `approvalPolicy` are all configurable. Code execution disabled by default (opt-in).

Files to modify:
- `packages/sdk/src/types.ts` -- Add `CodeExecutionConfig` type and `codeExecution` field to `AgentConfig`
- `packages/sdk/src/validation.ts` -- Add Zod schema for `CodeExecutionConfig`
- `apps/worker/src/workflows/agent-run.ts` -- Inject `execute_code` tool when enabled, append system prompt guidance

#### 11.5.6 Implement SSE stream events for code execution

**What**: Real-time stream events for code execution lifecycle (started, completed, file_created, failed).
**Spec reference**: spec-code-execution.md section 10.3 (SSE Stream Events).
**Journey**: J20 step 4 (user sees code execution in real-time).
**Acceptance criteria**: `code_execution.started` emitted when sandbox begins execution (includes language, code preview). `code_execution.completed` emitted on success (includes exit_code, execution_time, output preview). `code_execution.file_created` emitted per output file. `code_execution.failed` emitted on error. Events include step_id for trace correlation.

Files to modify:
- `apps/worker/src/streaming/event-emitter.ts` -- Add code execution event types
- `apps/worker/src/sandbox/execute-code-tool.ts` -- Emit events during execution

#### 11.5.7 Implement trace viewer code execution display

**What**: Dashboard trace viewer shows code execution steps with syntax-highlighted code, output, and downloadable files.
**Spec reference**: spec-code-execution.md section 12 (Dashboard UX).
**Journey**: J20 step 5 (user inspects code execution in dashboard).
**Acceptance criteria**: Code execution steps show: syntax-highlighted code block, stdout/stderr output, exit code and execution time, output file list with preview (images) and download links, sandbox metadata (template, memory, cost). Code block has copy button.

Files to create:
- `apps/web/src/components/code-execution-step.tsx` -- Code execution step component for trace viewer
- `apps/web/src/components/artifact-preview.tsx` -- File preview (images, CSV, text) and download

#### 11.5.8 Implement cost tracking and guardrails

**What**: Track sandbox compute cost per run. Enforce per-run limits on execution count, total sandbox time, and cost.
**Spec reference**: spec-code-execution.md section 6.4 (Cost Controls).
**Journey**: J20 step 6 (code execution is cost-controlled).
**Acceptance criteria**: Each sandbox execution tracks `execution_time_ms` and computes cost using per-second pricing. Running total maintained in workflow state. Run terminated with `guardrail_triggered` if `maxExecutionsPerRun`, `maxTotalSandboxTimeMs`, or `maxCostPerRunUsd` exceeded. Sandbox cost included in run's `total_cost_usd` and `usage_daily` aggregation.

Files to modify:
- `apps/worker/src/sandbox/execute-code-tool.ts` -- Add cost computation and guardrail checks
- `packages/shared/src/pricing.ts` -- Add sandbox pricing constants

### Tests (Phase 11.5)

- **Unit**: `apps/worker/src/__tests__/sandbox/e2b-provider.test.ts` -- Sandbox create, execute, upload, download, destroy (mocked E2B SDK)
- **Unit**: `apps/worker/src/__tests__/sandbox/pool-manager.test.ts` -- Pool acquire/release, auto-replenish, timeout
- **Unit**: `apps/worker/src/__tests__/sandbox/execute-code-tool.test.ts` -- Input validation, output truncation, file handling, cost tracking
- **Unit**: `apps/worker/src/__tests__/sandbox/file-handler.test.ts` -- Input mounting, output capture, size limits
- **Integration**: `apps/worker/src/__tests__/sandbox/code-execution-e2e.test.ts` -- Full flow: acquire sandbox → execute Python → capture output → store artifact → destroy
- **Integration**: `apps/api/src/__tests__/run-artifacts.test.ts` -- Artifact upload, list, download
- **E2E**: Agent with code execution enabled → LLM generates Python → code executes → result used in response → artifacts downloadable

### User Journey Verification

- **J20**: Enable code execution on agent → run agent with data analysis request → agent writes Python → sandbox executes → output displayed in trace viewer → output files downloadable → cost tracked in usage

### Definition of Done

- Demo: Create agent with `codeExecution: { enabled: true, template: "data-science" }`. Send message: "Analyze this sales data and create a chart" with CSV file attached. Agent writes pandas code, executes in sandbox, generates matplotlib chart. Chart visible in trace viewer. Chart downloadable as PNG. Total run cost includes sandbox compute time.

---

## Phase 12: Auto-Evolution Engine (Journey 19)

### Prerequisites
- Phase 4 complete (eval engine — graders, datasets, experiments, baselines)
- Phase 11 complete (agent Git repos, CI/CD pipelines)
- Phase 11.5 complete (code execution — meta-agent uses execute_code for analysis)

### Steps

#### 12.1 Implement evolution data model

**What**: Create the `evolution_sessions` and `evolution_mutations` tables, enums, and migration.
**Spec reference**: spec-agent-evolution.md section 9 (Data Model Additions).
**Journey**: J19 foundation.
**Acceptance criteria**: `evolution_sessions` table stores session metadata (status, scores, budget, git context). `evolution_mutations` table stores per-mutation attempts (type, hypothesis, config diff, scores, decision). All four new enums created. RLS policies applied. Migration runs cleanly.

Files to create:
- `packages/db/src/schema/evolution-sessions.ts` -- `evolution_sessions` table
- `packages/db/src/schema/evolution-mutations.ts` -- `evolution_mutations` table
- `packages/db/src/schema/enums-evolution.ts` -- `evolution_session_status`, `mutation_status`, `mutation_type`, `auto_promote_level` enums

#### 12.2 Implement evolution configuration SDK

**What**: Add `agentsy.defineEvolution()` to the SDK for declaring evolution config in `evolve.config.ts`.
**Spec reference**: spec-agent-evolution.md section 8.1 (Evolution Configuration).
**Journey**: J19 step 1 (configure evolution).
**Acceptance criteria**: `agentsy.defineEvolution({ metric, mutable, frozen, directives, budget, schedule, safety, autoPromote })` validates and returns a typed config object. Config is parsed from `evolve.config.ts` in the agent repo. Invalid configs throw descriptive errors.

Files to create:
- `packages/sdk/src/evolution.ts` -- `defineEvolution()` function and types (`EvolutionConfig`, `EvolutionMetric`, `EvolutionBudget`, `EvolutionSafety`)

#### 12.3 Implement meta-agent

**What**: The Claude-powered meta-agent that reads current agent config, evolution directives, and mutation history, then proposes atomic mutations.
**Spec reference**: spec-agent-evolution.md section 4.2 (Meta-Agent), section 5 (Mutation Strategies).
**Journey**: J19 step 2 (meta-agent proposes mutations).
**Acceptance criteria**: Meta-agent receives current config, directives, ledger history, and eval results. Returns a structured mutation proposal (type, description, hypothesis, config diff). Respects mutable/frozen field constraints. Avoids repeating previously discarded mutations. Supports all 8 mutation types: instruction_rewrite, tool_add, tool_remove, tool_reorder, guardrail_tune, model_swap, parameter_sweep, few_shot_add/remove, memory_config, composite.

Files to create:
- `apps/worker/src/evolution/meta-agent.ts` -- Meta-agent implementation (system prompt, structured output, mutation proposal)
- `apps/worker/src/evolution/mutation-types.ts` -- Mutation type definitions and config diff format
- `apps/worker/src/evolution/mutation-applier.ts` -- Apply a mutation diff to an agent config

#### 12.4 Implement evolution loop Temporal workflow

**What**: The core evolution loop as a Temporal workflow: load config → mutation loop (propose → apply → eval → keep/discard) → commit results.
**Spec reference**: spec-agent-evolution.md section 4.1 (Evolution Loop), section 4.3 (Scoring & Comparison).
**Journey**: J19 step 3 (evolution runs autonomously).
**Acceptance criteria**: `EvolutionSessionWorkflow` creates an `evolve/*` branch from main. Loops: meta-agent proposes mutation → applies to config → commits on branch → runs eval suite → compares against current best → keeps (advance) or discards (reset). Respects budget caps (max mutations, max cost, max duration, per-mutation cost). Session stops gracefully when budget exhausted. Kept mutations are squash-merged into main. New `agent_version` created. Evolution ledger TSV written to repo.

Files to create:
- `apps/worker/src/workflows/evolution-session.ts` -- EvolutionSessionWorkflow
- `apps/worker/src/activities/evolution-activities.ts` -- Activities: ProposeMutation, ApplyMutation, CommitMutation, RunEval, CompareMutation, KeepMutation, DiscardMutation, FinalizeSession

#### 12.5 Implement scoring and comparison logic

**What**: Composite score calculation, regression detection, simplicity pressure, and keep/discard decision logic.
**Spec reference**: spec-agent-evolution.md section 4.3 (Scoring & Comparison).
**Journey**: J19 step 4 (mutations are scored and compared).
**Acceptance criteria**: Composite score computed from weighted grader scores. Mutation rejected if any individual grader regresses beyond `maxRegressionPerGrader`. Zero-tolerance graders (safety) never allowed to regress. Simplicity pressure: when scores are equal, prefer config with fewer tools, shorter instructions, cheaper model. Decision reason logged for every mutation.

Files to create:
- `apps/worker/src/evolution/scoring.ts` -- Composite score calculation, regression detection, simplicity scoring, keep/discard decision

#### 12.6 Implement evolution ledger

**What**: Write every mutation attempt to both the platform DB and a local TSV file in the agent repo.
**Spec reference**: spec-agent-evolution.md section 6 (Evolution Ledger).
**Journey**: J19 step 5 (evolution history is tracked).
**Acceptance criteria**: Every mutation (kept or discarded) is written to `evolution_mutations` table with full context. Session summary is written to `evolution_sessions` table. Local TSV file (`.agentsy/evolution-ledger.tsv`) is appended and committed to repo. TSV contains: session_id, mutation_id, timestamp, type, description, hypothesis, composite_score, status, commit_sha, cost_usd, duration_ms.

Files to create:
- `apps/worker/src/evolution/ledger.ts` -- Ledger write logic (DB + TSV)

#### 12.7 Implement evolution API endpoints

**What**: REST API for starting, listing, cancelling, and streaming evolution sessions.
**Spec reference**: spec-agent-evolution.md section 10.2-10.3 (Evolution API).
**Journey**: J19 step 6 (manage evolution via API).
**Acceptance criteria**: `POST /v1/agents/{agentId}/evolve` starts a session (returns session ID). `GET /v1/agents/{agentId}/evolve` lists sessions. `GET /v1/agents/{agentId}/evolve/{sessionId}` returns session details with mutation list. `POST .../cancel` cancels a running session. `GET .../stream` returns SSE stream of mutation events. `POST .../promote` promotes evolved version to an environment.

Files to create:
- `apps/api/src/routes/evolution.ts` -- Evolution session CRUD, stream, promote endpoints

#### 12.8 Implement scheduled evolution

**What**: Cron-based evolution sessions triggered by the schedule in `evolve.config.ts`.
**Spec reference**: spec-agent-evolution.md section 8.1 (`schedule` field).
**Journey**: J19 step 7 (nightly evolution runs).
**Acceptance criteria**: When `evolve.config.ts` specifies a `schedule` (cron expression), the platform registers a Temporal cron schedule. At the configured time, the evolution workflow is triggered automatically. Schedule is updated when `evolve.config.ts` changes. Schedule can be paused/resumed via API.

Files to create:
- `apps/worker/src/evolution/scheduler.ts` -- Cron schedule registration and management

#### 12.9 Implement evolution safety gates

**What**: Approval gates, regression protection, budget enforcement, and rollback.
**Spec reference**: spec-agent-evolution.md section 7 (Safety & Governance).
**Journey**: J19 step 8 (evolution is safe).
**Acceptance criteria**: `autoPromote: "none"` — evolved version stays on branch, requires human merge. `autoPromote: "staging"` — auto-deploys to staging after session. `autoPromote: "production"` — requires org admin to enable. Diff review shows exactly what changed. `agentsy rollback` reverts to any previous version (creates new version with old config). Full audit log of all evolution actions.

Files to modify:
- `apps/worker/src/workflows/evolution-session.ts` -- Add promotion logic based on autoPromote level
- `apps/api/src/routes/evolution.ts` -- Add promote endpoint with permission check

#### 12.10 Implement evolution dashboard

**What**: Dashboard tabs for evolution history, mutation details, and score trends.
**Spec reference**: spec-agent-evolution.md section 11 (Dashboard UX).
**Journey**: J19 step 9 (view evolution results in dashboard).
**Acceptance criteria**: Evolution tab shows score trend chart, last session summary, mutation history table (type, description, score, status). Click mutation to see config diff and eval results. "Run Evolution Now" button triggers manual session. "Promote to Staging/Production" button available. "Edit Directives" opens evolution config editor.

Files to create:
- `apps/web/src/app/agents/[id]/evolution/page.tsx` -- Evolution dashboard tab
- `apps/web/src/components/evolution-history.tsx` -- Mutation history table component
- `apps/web/src/components/score-trend-chart.tsx` -- Score trend visualization
- `apps/web/src/components/evolution-diff-viewer.tsx` -- Config diff viewer for mutations

#### 12.11 Implement evolution CLI commands

**What**: CLI commands for manual evolution, history, comparison, and promotion.
**Spec reference**: spec-agent-evolution.md section 8.2 (CLI Commands).
**Journey**: J19 step 10 (manage evolution via CLI).
**Acceptance criteria**: `agentsy evolve` starts a manual evolution session (streams progress). `agentsy evolve --budget-usd 5.00 --max-mutations 20` overrides budget. `agentsy evolve history` shows past sessions. `agentsy evolve compare ver_041 ver_042` shows score diff. `agentsy evolve promote ver_042 --env staging` promotes evolved version.

Files to create:
- `packages/cli/src/commands/evolve.ts` -- `agentsy evolve`, `agentsy evolve history`, `agentsy evolve compare`, `agentsy evolve promote` commands

#### 12.12 Implement evolution webhook events

**What**: New webhook event types for evolution session lifecycle.
**Spec reference**: spec-agent-evolution.md section 10.5 (Webhook Events).
**Journey**: J19 (evolution notifications).
**Acceptance criteria**: `evolution.started`, `evolution.mutation_complete`, `evolution.completed` webhook events are delivered to subscribed endpoints. Events include session ID, mutation details, scores, and status.

Files to modify:
- `apps/worker/src/jobs/webhook-delivery.ts` -- Add evolution event types
- `apps/api/src/routes/webhooks.ts` -- Add evolution events to subscription options

### Tests (Phase 12)

- **Unit**: `apps/worker/src/__tests__/meta-agent.test.ts` -- Meta-agent proposes valid mutations, respects mutable/frozen, avoids repeats
- **Unit**: `apps/worker/src/__tests__/scoring.test.ts` -- Composite score, regression detection, simplicity pressure, keep/discard logic
- **Unit**: `apps/worker/src/__tests__/mutation-applier.test.ts` -- Config diff application for all mutation types
- **Unit**: `apps/worker/src/__tests__/ledger.test.ts` -- TSV write, DB write, ledger read
- **Integration**: `apps/worker/src/__tests__/evolution-session.test.ts` -- Full loop: propose → apply → eval → keep/discard → finalize
- **Integration**: `apps/api/src/__tests__/evolution.test.ts` -- Evolution API CRUD, stream, promote
- **E2E**: Start evolution session → meta-agent proposes 3 mutations → 1 kept, 2 discarded → merged to main → new version created → score improved

### User Journey Verification

- **J19**: Configure evolution → run manually → see 5 mutations (2 kept, 3 discarded) → composite score improves → promote to staging → verify evolved config is deployed → schedule nightly evolution → verify next run triggers at configured time

### Definition of Done

- Demo: Create agent with eval dataset (10 golden cases). Configure `evolve.config.ts` with directives ("reduce hallucination, prefer cheaper model"). Run `agentsy evolve`. Meta-agent proposes 5 mutations. 2 are kept (instruction rewrite, temperature reduction). Score improves from 0.85 to 0.89. Evolution ledger shows full history. Dashboard evolution tab shows score trend. Promote evolved version to staging. Schedule nightly evolution. Verify next session triggers at 2am.

---

## Cross-Phase Concerns

### OTel Instrumentation (Spans across Phases 2-8)

OpenTelemetry instrumentation should be added incrementally as features are built:

- **Phase 2**: Add root `AgentRun` span when workflow starts. Add `LLMCall` and `ToolExecution` child spans in activities.
- **Phase 3**: Propagate trace IDs through SSE events.
- **Phase 5**: Add `RetrievalQuery` span for knowledge base searches.
- **Phase 6**: Add `ApprovalGate` span for approval waits.
- **Phase 8**: Trace IDs are clickable in dashboard, linking to trace viewer.

Reference: architecture-v1.md section 6 (Observability), technology-decisions.md D-8.1.

Files to create (incrementally):
- `packages/shared/src/tracing.ts` -- OTel SDK initialization, span creation helpers
- `apps/worker/src/tracing/span-factory.ts` -- Span hierarchy for agent runs

### Output Validators / Guardrails (Phase 2, refined through Phases)

The PRD mentions output validators (PII detection, content policy) as part of guardrails (Q9 resolution). These should be implemented incrementally:

- **Phase 2**: Basic guardrails (maxIterations, maxTokens, maxCostUsd, timeoutMs) — already covered in step 2.7.
- **Phase 2 (addition)**: Add `outputValidators` field to `GuardrailsConfig` JSONB type. Initial validators: `pii_detection` (regex-based PII scan on agent output), `content_policy` (blocked phrase list). When a validator flags output, the run completes with status `guardrail_triggered` and the violation is recorded in run metadata.

Files to create:
- `apps/worker/src/guardrails/output-validators.ts` -- PII detection and content policy validators
- `apps/worker/src/guardrails/pii-patterns.ts` -- Regex patterns for SSN, credit card, email, phone detection

Reference: PRD Q9 resolution, spec-data-model.md table 3.5 GuardrailsConfig.

### Data Retention Job (Phase 8)

The PRD specifies 90-day default retention for run traces and conversation history (section 9). A scheduled job must enforce this:

- **Phase 8**: Implement a Temporal scheduled workflow that runs daily and deletes runs, run_steps, and messages older than the configured retention period (default 90 days). Retention period is configurable per org.

Files to create:
- `apps/worker/src/jobs/data-retention.ts` -- Daily cleanup job: soft-delete expired runs/steps/messages per org retention config

Reference: PRD section 9 (Data retention: Run traces 90 days configurable, Conversation history 90 days configurable).

### Performance Testing (Phase 2+, ongoing)

Key performance targets from PRD section 9 should be validated:

| Target | Acceptance Test | Phase |
|--------|----------------|-------|
| Time to first token < 2s (excl. LLM) | Load test: 10 concurrent runs, measure p95 platform overhead | Phase 3 |
| Dashboard page load < 1s | Lighthouse CI on all dashboard pages | Phase 8 |
| Trace viewer load < 2s (50 steps) | Load test with 50-step trace, measure render time | Phase 8 |
| Concurrent runs per org: 10 | Load test: 10 concurrent runs for single org, all complete | Phase 2 |
| Vector search < 100ms (10K chunks) | Benchmark query with 10K chunks, measure p95 | Phase 5 |

Files to create:
- `apps/api/src/__tests__/performance/` -- Performance test suite (k6 or Artillery scripts)

### Status Page (Phase 7)

PRD Risk table mentions "status page" for LLM provider outage communication. Add a basic status endpoint:

- `GET /v1/status` -- Returns health status of all subsystems (Postgres, Redis, Temporal, LLM providers). Checks are cached for 30s. This powers a future public status page.

Files to create:
- `apps/api/src/routes/status.ts` -- Subsystem health check endpoint (extends the existing `/health` endpoint with provider checks)

### Dockerfiles (Phase 0, refined through Phases 1-3)

Each app needs a Dockerfile for Fly.io deployment:
- `apps/api/Dockerfile` -- Multi-stage build, copy monorepo deps
- `apps/web/Dockerfile` -- Next.js standalone build
- `apps/worker/Dockerfile` -- Node.js with Temporal SDK

Reference: deployment-flyio.md section 2.

### Database Seed Script (Phase 0, expanded through Phases)

The seed script (`packages/db/src/seed.ts`) should be expanded as tables are added:
- Phase 0: Test org, test user
- Phase 1: API keys, environments
- Phase 2: Test agent, test version
- Phase 4: Test eval dataset with 5 cases
- Phase 5: Test knowledge base with sample chunks

---

## Gap Amendments (PRD Review)

The following amendments address gaps identified during a comprehensive review of the implementation plan against the PRD, architecture spec, user journeys, data model, API spec, and SDK spec. Each amendment is tagged with the phase it applies to and the gap severity.

---

### Amendment A1: Reconcile Clerk references with Better Auth (Phase 0.5) — MAJOR

**Gap**: The data model spec used `clerk_org_id` and `clerk_user_id` column names, but the platform uses Better Auth (not Clerk).

**Resolution**: The data model spec has been updated:
- `organizations.clerk_org_id` → `organizations.external_auth_id` (Better Auth org ID)
- `organization_members.clerk_user_id` → `organization_members.user_id` (Better Auth user ID)
- All `// clerk_user_id` comments → `// user_id (Better Auth)`
- ER diagram updated accordingly

**Action in Phase 0.5**: When implementing the Drizzle schema, use the updated column names from spec-data-model.md. The `external_auth_id` column stores the Better Auth organization identifier; `user_id` columns store Better Auth user identifiers.

---

### Amendment A2: Cost circuit breaker implementation detail (Phase 2.7) — MAJOR

**Gap**: `maxCostUsd` guardrail was listed but the cost estimation mechanism was unspecified.

**Add to step 2.7 acceptance criteria**:
- After each LLM call activity, compute incremental cost using a per-model pricing table in `packages/shared/src/constants.ts` (input token price + output token price per model).
- Maintain a running `accumulatedCostUsd` counter in the workflow state. After each `LLMCall` or `ToolExecution` activity completes, compare `accumulatedCostUsd` against `guardrails.maxCostUsd`.
- If exceeded, terminate the run with status `guardrail_triggered` and metadata `{ guardrail: "maxCostUsd", limit: 1.00, actual: 1.23 }`.
- For streaming, cost is estimated from the final token counts (not mid-stream).

**File addition**:
- `packages/shared/src/pricing.ts` — Per-model pricing table (USD per 1M input tokens, USD per 1M output tokens). Updated when new models are added to the registry.

---

### Amendment A3: Output validators as tracked Phase 2 deliverable (Phase 2.7b) — MAJOR

**Gap**: PII detection and content policy output validators were listed in Cross-Phase Concerns but not tracked as a phase deliverable with acceptance criteria.

**Add new step 2.7b: Implement output validators**

**What**: Post-response validators that scan agent output for PII and content policy violations before returning to the caller.
**Spec reference**: PRD Q9 resolution (P0 guardrails include output validators).
**Journey**: J3 (guardrails enforced during runs).
**Acceptance criteria**:
- When `guardrails.outputValidators` includes `pii_detection`, the final agent response is scanned for SSN, credit card, email, and phone patterns.
- When `guardrails.outputValidators` includes `content_policy`, the response is checked against a configurable blocked phrase list.
- If a validator triggers, the run completes with status `guardrail_triggered` and the violation type is recorded in run metadata.
- Validators run after the agentic loop completes but before the response is returned/streamed.

**Files** (already listed in Cross-Phase Concerns, now assigned to Phase 2.7b):
- `apps/worker/src/guardrails/output-validators.ts`
- `apps/worker/src/guardrails/pii-patterns.ts`

---

### Amendment A4: MCP stdio transport in Phase 2 local dev (Phase 2.10) — MAJOR

**Gap**: `agentsy dev` ships in Phase 2 but MCP stdio support is deferred to Phase 6. PRD R-2.2 says MCP stdio for local dev is Beta Core.

**Resolution**: Add basic MCP stdio client to Phase 2.10 for local dev only.

**Add to step 2.10 acceptance criteria**:
- When `agentsy.config.ts` includes MCP server definitions with `transport: "stdio"`, the local dev server spawns MCP server processes and connects via stdio.
- MCP tools discovered via stdio are available in the local playground.
- This is a minimal implementation (spawn process, JSON-RPC over stdin/stdout). The full Streamable HTTP transport remains in Phase 6.

**File addition to Phase 2.10**:
- `packages/cli/src/dev/mcp-stdio-client.ts` — Minimal MCP stdio client for local dev (process spawn, tool discovery, tool execution via JSON-RPC).

---

### Amendment A5: Capability class syntax in defineAgent (Phase 2.1) — MAJOR

**Gap**: The SDK spec's `ModelIdentifier` type only supported string model IDs, but the PRD and user journeys feature `{ class: "balanced", provider: "anthropic" }` syntax.

**Resolution**: The SDK spec has been updated to include `ModelSpec` as a union member of `ModelIdentifier`.

**Add to step 2.1 acceptance criteria**:
- `defineAgent({ model: "claude-sonnet-4" })` works (string model ID).
- `defineAgent({ model: { class: "balanced", provider: "anthropic" } })` works (capability class).
- Zod validation accepts both forms.
- Serialization converts `ModelSpec` to the same JSON shape for the API.

---

### Amendment A6: Client SDK approve/deny methods (Phase 6.4) — MAJOR

**Gap**: The approval API endpoints exist but `@agentsy/client` didn't expose methods to call them.

**Resolution**: The SDK spec has been updated to add `runs.approve()` and `runs.deny()` to `RunsResource`.

**Add to step 6.4 or Phase 3.3 update**:
- Add `client.runs.approve(runId)` method → `POST /v1/runs/:run_id/approve`
- Add `client.runs.deny(runId, reason?)` method → `POST /v1/runs/:run_id/deny`
- Test: stream a run, receive `step.approval_requested` event, call `client.runs.approve()`, run resumes.

---

### Amendment A7: Dashboard home page populated state (Phase 8.2b) — MAJOR

**Gap**: Phase 1.9 creates the dashboard home with the onboarding checklist (empty state), but no phase builds the post-onboarding populated dashboard.

**Add new step 8.2b: Implement dashboard home populated state**

**What**: After onboarding is complete, the dashboard home shows org-level metrics, recent runs feed, and deployment activity.
**Spec reference**: PRD section 8 (Dashboard home: Core metrics, Recent runs, Deployment activity).
**Journey**: J13 (agent dashboard overview — org-level view).
**Acceptance criteria**:
- Dashboard home shows 4 org-level sparkline metric cards: total runs (7d), success rate (7d), total cost (7d), active agents.
- "Recent Runs" feed shows the last 10 runs across all agents with status, agent name, duration, cost.
- "Deployment Activity" feed shows the last 5 deployments with agent name, version, environment, deployer.
- When the org has no agents yet, the onboarding checklist is shown instead.

**Files**:
- `apps/web/src/app/page.tsx` — Modify to switch between empty state (onboarding) and populated state
- `apps/web/src/components/dashboard-metrics.tsx` — Org-level sparkline cards
- `apps/web/src/components/recent-runs-feed.tsx` — Recent runs feed
- `apps/web/src/components/deployment-activity-feed.tsx` — Deployment activity feed

---

### Amendment A8: Logs streaming API endpoint (Phase 9.2) — MAJOR

**Gap**: `agentsy logs` CLI command was specified but had no backend API endpoint.

**Resolution**: A `GET /v1/logs` SSE endpoint has been added to spec-api.md section 18.

**Add to Phase 9.2 prerequisites**: Phase 8 must provide the usage/runs API endpoints.

**Add new API route**:
- `apps/api/src/routes/logs.ts` — `GET /v1/logs` endpoint. When `tail=true`, opens an SSE connection and streams new run events as they occur by subscribing to Redis pub/sub. When `tail=false`, returns recent log entries as JSON from the `runs` and `run_steps` tables.

**Update step 9.2 acceptance criteria**:
- `agentsy logs --agent support-agent --env production --tail` connects to `GET /v1/logs?agent_id=...&env=production&tail=true` via SSE.
- Historical logs returned before switching to live tail.
- Each log entry shows timestamp, agent name, run status, step type, and message.

---

### Amendment A9: Alerting data model (Phase 8.11) — MAJOR

**Gap**: Alert rules and notifications had no data model tables or API spec.

**Resolution**: Tables `alert_rules` (3.24) and `notifications` (3.25) have been added to spec-data-model.md. API endpoints added to spec-api.md sections 19 (Alert Rules) and 20 (Notifications).

**Update step 8.11**:
- Reference spec-data-model.md tables 3.24 and 3.25 for the schema.
- Reference spec-api.md sections 19 and 20 for the API endpoints.
- Add to Phase 0.5: include `alert_rules` and `notifications` tables in the Drizzle schema.

**Add to Phase 0.5 files**:
- `packages/db/src/schema/alert-rules.ts` — Table 3.24 `alert_rules`
- `packages/db/src/schema/notifications.ts` — Table 3.25 `notifications`

---

### Amendment A10: Concurrent run enforcement (Phase 1.6) — MAJOR

**Gap**: Concurrent run limiting was mentioned but the implementation mechanism was unspecified.

**Add to step 1.6 acceptance criteria**:
- Concurrent run counting uses a Redis key per org: `concurrent_runs:{org_id}`.
- On `POST /v1/agents/:id/run`: INCR the key. If the count exceeds the org's `maxConcurrentRuns` (default 10), return `429 Too Many Requests` with `Retry-After` header and DECR the key.
- On run completion or failure (worker callback): DECR the key.
- Safety: Set a TTL on the key (e.g., 1 hour) to auto-recover from crashes where DECR is missed.
- This is architecturally distinct from request-rate limiting (sliding window) and token-rate limiting (daily counter).

**Add to step 1.6 files**:
- `apps/api/src/middleware/concurrent-run-limiter.ts` — Redis INCR/DECR middleware for run endpoints

---

### Amendment A11: Prompt diff viewer UI component (Phase 8.4) — MINOR

**Add to step 8.4 files**:
- `apps/web/src/components/prompt-diff-viewer.tsx` — Side-by-side or inline text diff component using the `diff` npm package. Renders system prompt, model, tools, and guardrails changes between two agent versions.

---

### Amendment A12: Eval tool mocking modes (Phase 4.7) — MINOR

**Add to step 4.7 acceptance criteria**:
- `toolMode: "mock"` (default): Tools return mocked responses from dataset. Tools are never called.
- `toolMode: "dry-run"`: Tools are called but results are discarded; mocked results are used for scoring.
- `toolMode: "live"`: Tools are called and their actual results are used for scoring.
- Tests verify all three modes.

---

### Amendment A13: Eval cost estimate before run (Phase 4.10) — MINOR

**Add to step 4.10 acceptance criteria**:
- Before starting an experiment, the CLI displays an estimated cost: `Estimated cost: ~$X.XX (N cases × M graders × model pricing)`.
- If estimated cost exceeds $5, prompt for confirmation unless `--yes` flag is provided.
- In `--ci` mode, always proceed without confirmation.

---

### Amendment A14: Terminal REPL approval handling (Phase 2.10) — MINOR

**Add to step 2.10 acceptance criteria**:
- When a write tool with `approvalRequired: true` is called in local dev, the terminal REPL displays the tool name, arguments, and risk level, then prompts `Approve? [y/n]`.
- `y` resumes with tool execution. `n` skips the tool call and continues the agentic loop.

---

### Amendment A15: Local playground trace viewer detail (Phase 2.10) — MINOR

**Add to step 2.10 acceptance criteria**:
- Playground shows a split-pane view with chat on the left and step-by-step trace on the right.
- Each trace step shows type (llm_call/tool_call/retrieval), duration, and token count.
- Approval prompts appear inline in the chat pane.

---

### Amendment A16: Webhook event type for approvals (Phase 10.2) — MINOR

**Add `approval.requested` to the supported webhook event types**:
- When a run enters an approval gate, an `approval.requested` event is delivered to subscribed webhooks.
- Payload includes `run_id`, `agent_id`, `tool_name`, `tool_arguments`, and `risk_level`.

---

### Amendment A17: Encryption key rotation (Phase 1.8) — MINOR

**Add to step 1.8 or Cross-Phase Concerns**:
- `apps/api/src/lib/encryption.ts` should support key rotation: accept both `SECRETS_MASTER_KEY` (current) and `SECRETS_MASTER_KEY_PREVIOUS` (old).
- Decryption tries the current key first, falls back to the previous key.
- A one-time migration script re-encrypts all secrets with the new key: `packages/db/src/scripts/rotate-master-key.ts`.
- This is not required for beta launch but should be planned.

---

### Amendment A18: Idempotency key middleware (Phase 1) — MINOR

**Add new step 1.6b: Implement idempotency key middleware**

**What**: Store response payloads keyed by `(org_id, idempotency_key)` with 24-hour TTL in Redis. Return cached responses for duplicate mutating requests.
**Spec reference**: spec-api.md section 1 "Idempotency".
**Acceptance criteria**: `POST /v1/agents` with `Idempotency-Key: abc123` stores the response. A second `POST` with the same key returns the cached response without creating a duplicate.

**Files**:
- `apps/api/src/middleware/idempotency.ts` — Extract `Idempotency-Key` header, check Redis, cache response.

---

## Risks & Mitigations

| Risk | Phase | Mitigation |
|------|-------|------------|
| Temporal learning curve delays Phase 2 | 2 | Start with the simplest workflow (no approval gates). Add complexity incrementally. Temporal has excellent TypeScript documentation. |
| Better Auth lacks a specific feature | 1 | Better Auth covers email, OAuth, orgs, API keys. If a gap is found, wrap it with our own logic. |
| Vercel AI SDK doesn't support a required streaming feature | 2-3 | Pin to a known-good version. Fall back to direct provider SDK if needed. |
| pgvector performance at scale | 5 | Monitor query latency. HNSW index with m=16, ef_construction=64 per spec. Alert if p95 > 100ms. |
| SSE connection management complexity | 3 | Start with simple pub/sub. Add reconnection and replay incrementally. Test with concurrent connections. |
| Eval engine performance for large datasets | 4 | Default parallelism of 5 concurrent cases. Cache deterministic grader results. Profile and optimize bottlenecks. |

---

## Open Questions

| Question | Impact | Owner | Deadline | Options |
|----------|--------|-------|----------|---------|
| Better Auth's exact Fastify integration pattern | Phase 1 blocking | Backend lead | Week 1 | Review Better Auth docs, create spike |
| Temporal Cloud pricing for eval workloads (many short workflows) | Phase 4 cost | Platform lead | Week 4 | Contact Temporal sales, estimate based on beta volume |
| Custom domain setup for `api.agentsy.com` and `app.agentsy.com` on Fly.io | Phase 0 | DevOps | Week 1 | Fly.io custom domains via `fly certs` |
| SQLite + sqlite-vec for local dev vector search viability | Phase 5 (local dev) | SDK lead | Week 2 | Spike: install sqlite-vec, test cosine similarity performance |
| tsup build config for dual CJS/ESM output with monorepo internal deps | Phase 0 | SDK lead | Week 1 | Test tsup with workspace protocol refs |

---

## Appendix: File Index by Package

### `packages/shared/`
- `src/id.ts` -- Nanoid generator (Phase 0)
- `src/types.ts` -- Shared types: RunInput, RunOutput, ApiError, PaginatedResponse (Phase 0)
- `src/constants.ts` -- Default values, capability classes, model registry (Phase 0)
- `src/events.ts` -- SSE event types (Phase 3)
- `src/storage.ts` -- S3-compatible client wrapper (Phase 0)
- `src/chunking.ts` -- Text splitter for documents (Phase 5)
- `src/pricing.ts` -- Per-model pricing table for cost estimation (Phase 2)
- `src/tracing.ts` -- OTel SDK initialization (Phase 2+)

### `packages/db/`
- `src/schema/*.ts` -- All 25 table definitions (Phase 0)
- `src/schema/run-artifacts.ts` -- `run_artifacts` table (Phase 11.5)
- `src/schema/agent-repos.ts` -- `agent_repos` table (Phase 11)
- `src/schema/evolution-sessions.ts` -- `evolution_sessions` table (Phase 12)
- `src/schema/evolution-mutations.ts` -- `evolution_mutations` table (Phase 12)
- `src/schema/enums-evolution.ts` -- Evolution enums (Phase 12)
- `src/seeds/connector-catalog.ts` -- Seed 15 starter connectors (Phase 6b)
- `src/client.ts` -- DB client factory (Phase 0)
- `src/seed.ts` -- Development seed script (Phase 0+)
- `src/rls.sql` -- RLS policies (Phase 0)
- `src/triggers.sql` -- Update and tsvector triggers (Phase 0)
- `drizzle.config.ts` -- Drizzle Kit config (Phase 0)

### `packages/sdk/`
- `src/agentsy.ts` -- `defineAgent`, `defineTool`, `defineProject` (Phase 2)
- `src/types.ts` -- AgentConfig, ToolDefinition, etc. (Phase 2)
- `src/validation.ts` -- Zod schemas (Phase 2)
- `src/serialization.ts` -- Config to API JSON (Phase 2)
- `src/evolution.ts` -- `defineEvolution()` function and types (Phase 12)

### `packages/client/`
- `src/client.ts` -- `AgentsyClient` class (Phase 3)
- `src/streaming.ts` -- SSE parser (Phase 3)
- `src/types.ts` -- Client types (Phase 3)

### `packages/connector-sdk/`
- `src/framework.ts` -- Base connector class (Phase 6b)
- `src/types.ts` -- ConnectorDefinition, ConnectorTool, OAuthConfig (Phase 6b)
- `src/oauth.ts` -- OAuth 2.0 flow (Phase 6b)

### `packages/connectors/`
- `gmail/` -- Gmail connector MCP server (Phase 6b)
- `slack/` -- Slack connector (Phase 6b)
- `google-drive/` -- Google Drive connector (Phase 6b)
- `google-calendar/` -- Google Calendar connector (Phase 6b)
- `notion/` -- Notion connector (Phase 6b)
- `linear/` -- Linear connector (Phase 6b)
- `github/` -- GitHub connector (Phase 6b)
- `jira/` -- Jira connector (Phase 6b)
- `hubspot/` -- HubSpot connector (Phase 6b)
- `salesforce/` -- Salesforce connector (Phase 6b)
- `intercom/` -- Intercom connector (Phase 6b)
- `figma/` -- Figma connector (Phase 6b)
- `asana/` -- Asana connector (Phase 6b)
- `stripe/` -- Stripe connector (Phase 6b)
- `postgresql/` -- PostgreSQL connector (Phase 6b)

### `packages/eval/`
- `src/types.ts` -- EvalCase, GraderConfig, ExperimentConfig (Phase 4)
- `src/dataset.ts` -- Dataset definition and loading (Phase 4)
- `src/experiment.ts` -- Experiment runner (Phase 4)
- `src/graders/*.ts` -- 10 grader implementations (Phase 4)

### `packages/cli/`
- `src/index.ts` -- Commander.js entry point (Phase 9)
- `src/commands/init.ts` -- `agentsy init` (Phase 2)
- `src/commands/dev.ts` -- `agentsy dev` (Phase 2)
- `src/commands/deploy.ts` -- `agentsy deploy` (Phase 7)
- `src/commands/rollback.ts` -- `agentsy rollback` (Phase 7)
- `src/commands/login.ts` -- `agentsy login` (Phase 7)
- `src/commands/logout.ts` -- `agentsy logout` (Phase 7)
- `src/commands/secrets.ts` -- `agentsy secrets` (Phase 7)
- `src/commands/eval-run.ts` -- `agentsy eval run` (Phase 4)
- `src/commands/eval-compare.ts` -- `agentsy eval compare` (Phase 4)
- `src/commands/logs.ts` -- `agentsy logs` (Phase 9)
- `src/commands/kb-create.ts` -- `agentsy kb create` (Phase 5)
- `src/commands/kb-upload.ts` -- `agentsy kb upload` (Phase 5)
- `src/commands/connectors.ts` -- `agentsy connectors list|connect|disconnect|status` (Phase 6b)
- `src/commands/push.ts` -- `agentsy push` (Phase 11)
- `src/commands/pull.ts` -- `agentsy pull` (Phase 11)
- `src/commands/evolve.ts` -- `agentsy evolve`, history, compare, promote (Phase 12)
- `src/dev/local-runner.ts` -- In-process agentic loop (Phase 2)
- `src/dev/local-server.ts` -- Local Fastify server (Phase 2)
- `src/dev/playground.ts` -- Local playground UI (Phase 2)
- `src/dev/terminal-repl.ts` -- Interactive terminal chat REPL (Phase 2)
- `src/dev/mcp-stdio-client.ts` -- Minimal MCP stdio client for local dev (Phase 2)
- `src/templates/` -- Project templates (Phase 2, 9)
- `src/auth/token-store.ts` -- CLI credential storage (Phase 7)
- `src/formatters/eval-report.ts` -- Terminal and markdown formatters (Phase 4)

### `apps/api/`
- `src/index.ts` -- Fastify bootstrap (Phase 1)
- `src/plugins/*.ts` -- Error handler, CORS, request logger (Phase 1)
- `src/middleware/*.ts` -- Auth, tenant context, rate limiter (Phase 1)
- `src/lib/redis.ts` -- Redis client (Phase 1)
- `src/lib/encryption.ts` -- AES-256-GCM (Phase 1)
- `src/middleware/concurrent-run-limiter.ts` -- Concurrent run INCR/DECR (Phase 1)
- `src/middleware/idempotency.ts` -- Idempotency key middleware (Phase 1)
- `src/routes/logs.ts` -- Log streaming SSE endpoint (Phase 9)
- `src/auth/*.ts` -- Better Auth config, org hooks (Phase 1)
- `src/routes/health.ts` -- Health check (Phase 1)
- `src/routes/agents.ts` -- Agent CRUD (Phase 2)
- `src/routes/agent-versions.ts` -- Version management (Phase 2)
- `src/routes/runs.ts` -- Run endpoints (Phase 2)
- `src/routes/runs-stream.ts` -- SSE streaming (Phase 3)
- `src/routes/eval-cases-from-run.ts` -- Run to eval case conversion per spec-api.md 7.17 (Phase 4)
- `src/routes/run-approval.ts` -- Approve/deny (Phase 6)
- `src/routes/sessions.ts` -- Session CRUD (Phase 3)
- `src/routes/openai-compat.ts` -- OpenAI compat (Phase 3)
- `src/routes/eval-datasets.ts` -- Dataset CRUD (Phase 4)
- `src/routes/eval-cases.ts` -- Case CRUD (Phase 4)
- `src/routes/eval-experiments.ts` -- Experiment endpoints (Phase 4)
- `src/routes/eval-baselines.ts` -- Baseline endpoints (Phase 4)
- `src/routes/knowledge-bases.ts` -- KB CRUD (Phase 5)
- `src/routes/knowledge-upload.ts` -- File upload (Phase 5)
- `src/routes/secrets.ts` -- Secrets CRUD (Phase 1, moved from Phase 6)
- `src/routes/tools.ts` -- Tool management endpoints (Phase 6)
- `src/routes/usage.ts` -- Usage summary and daily breakdown (Phase 8)
- `src/routes/status.ts` -- Subsystem health/status endpoint (Phase 7)
- `src/routes/environments.ts` -- Environment settings (Phase 7)
- `src/routes/deployments.ts` -- Deployment management (Phase 7)
- `src/routes/rollback.ts` -- Rollback (Phase 7)
- `src/routes/version-diff.ts` -- Version comparison (Phase 7)
- `src/routes/api-keys.ts` -- API key management (Phase 1)
- `src/routes/organizations.ts` -- Org settings (Phase 1)
- `src/routes/members.ts` -- Member management (Phase 1)
- `src/routes/alerts.ts` -- Alert rules (Phase 8)
- `src/routes/notifications.ts` -- Notifications (Phase 8)
- `src/routes/webhooks.ts` -- Webhook CRUD (Phase 10)
- `src/routes/connectors.ts` -- Connector catalog and connection management (Phase 6b)
- `src/routes/run-artifacts.ts` -- Run artifact list/download (Phase 11.5)
- `src/routes/run-files.ts` -- Run file upload (Phase 11.5)
- `src/routes/agent-repos.ts` -- Agent repo metadata, commits, diff (Phase 11)
- `src/routes/git-transport.ts` -- Git smart HTTP transport (Phase 11)
- `src/routes/pipelines.ts` -- CI pipeline run list/detail (Phase 11)
- `src/routes/evolution.ts` -- Evolution session CRUD, stream, promote (Phase 12)
- `src/services/git-repo.ts` -- Git repo initialization and management (Phase 11)
- `src/services/push-hook.ts` -- Server-side post-receive hook logic (Phase 11)
- `src/services/config-parser.ts` -- Parse agentsy.config.ts from repo (Phase 11)
- `src/middleware/git-auth.ts` -- API key auth for Git transport (Phase 11)
- `src/lib/oauth-client.ts` -- OAuth 2.0 client (Phase 6b)
- `src/streaming/sse-handler.ts` -- SSE handler (Phase 3)

### `apps/worker/`
- `src/client.ts` -- Temporal client (Phase 0)
- `src/worker.ts` -- Worker bootstrap (Phase 0)
- `src/workflows/agent-run.ts` -- AgentRunWorkflow (Phase 2)
- `src/workflows/eval-experiment.ts` -- EvalExperimentWorkflow (Phase 4)
- `src/workflows/approval-gate.ts` -- Approval signal handling (Phase 6)
- `src/activities/llm-call.ts` -- LLM call activity (Phase 2)
- `src/activities/tool-execution.ts` -- Tool execution activity (Phase 2)
- `src/activities/persist-run.ts` -- Run persistence (Phase 2)
- `src/activities/session-history.ts` -- Session history loading (Phase 3, enhanced Phase 5)
- `src/activities/persist-messages.ts` -- Message persistence (Phase 3)
- `src/activities/grading.ts` -- Grader activity (Phase 4)
- `src/activities/tool-mocking.ts` -- Tool mocking for evals (Phase 4)
- `src/activities/document-processing.ts` -- Document extraction and chunking (Phase 5)
- `src/activities/embedding-generation.ts` -- Embedding API calls (Phase 5)
- `src/activities/retrieval-query.ts` -- Hybrid search activity (Phase 5)
- `src/providers/model-registry.ts` -- Capability class mapping (Phase 2)
- `src/providers/provider-factory.ts` -- Vercel AI SDK providers (Phase 2)
- `src/providers/model-resolver.ts` -- Model resolution (Phase 2)
- `src/providers/fallback-handler.ts` -- Retry and fallback (Phase 2)
- `src/tools/risk-policy.ts` -- Risk level evaluation (Phase 2)
- `src/tools/mcp-client.ts` -- MCP Streamable HTTP client (Phase 6)
- `src/tools/mcp-stdio.ts` -- MCP stdio client (Phase 6)
- `src/tools/tool-registry.ts` -- Unified tool registry (Phase 6)
- `src/tools/secret-resolver.ts` -- Secret decryption (Phase 6)
- `src/tools/tool-context.ts` -- ToolContext factory (Phase 6)
- `src/guardrails/guardrail-checker.ts` -- Guardrail enforcement (Phase 2)
- `src/guardrails/output-validators.ts` -- PII detection and content policy validators (Phase 2)
- `src/guardrails/pii-patterns.ts` -- Regex patterns for PII detection (Phase 2)
- `src/streaming/event-emitter.ts` -- Redis pub/sub events (Phase 3)
- `src/jobs/usage-aggregation.ts` -- Daily usage aggregation (Phase 8)
- `src/jobs/data-retention.ts` -- Daily cleanup of expired runs/steps/messages (Phase 8)
- `src/jobs/alert-checker.ts` -- Alert condition evaluation (Phase 8)
- `src/jobs/notification-sender.ts` -- Email/webhook notification delivery (Phase 8)
- `src/jobs/webhook-delivery.ts` -- Webhook event delivery (Phase 10)
- `src/jobs/token-refresh.ts` -- OAuth token auto-refresh (Phase 6b)
- `src/tools/connector-executor.ts` -- Connector tool execution proxy (Phase 6b)
- `src/sandbox/provider.ts` -- SandboxProvider interface (Phase 11.5)
- `src/sandbox/e2b-provider.ts` -- E2B sandbox implementation (Phase 11.5)
- `src/sandbox/types.ts` -- Sandbox types (Phase 11.5)
- `src/sandbox/pool-manager.ts` -- Warm sandbox pool (Phase 11.5)
- `src/sandbox/execute-code-tool.ts` -- Built-in execute_code tool (Phase 11.5)
- `src/sandbox/file-handler.ts` -- File I/O for sandboxes (Phase 11.5)
- `src/activities/code-execution-activity.ts` -- Code execution Temporal activity (Phase 11.5)
- `src/workflows/ci-pipeline.ts` -- CI pipeline workflow (Phase 11)
- `src/activities/ci-activities.ts` -- CI pipeline activities (Phase 11)
- `src/workflows/evolution-session.ts` -- Evolution session workflow (Phase 12)
- `src/activities/evolution-activities.ts` -- Evolution activities (Phase 12)
- `src/evolution/meta-agent.ts` -- Meta-agent for mutation proposals (Phase 12)
- `src/evolution/mutation-types.ts` -- Mutation type definitions (Phase 12)
- `src/evolution/mutation-applier.ts` -- Apply mutation diffs to agent config (Phase 12)
- `src/evolution/scoring.ts` -- Composite scoring, regression detection (Phase 12)
- `src/evolution/ledger.ts` -- Evolution ledger writer (Phase 12)
- `src/evolution/scheduler.ts` -- Cron schedule for evolution sessions (Phase 12)

### `apps/web/`
- `src/app/layout.tsx` -- Root layout with sidebar (Phase 1)
- `src/app/page.tsx` -- Dashboard home (Phase 1)
- `src/app/signup/page.tsx` -- Signup (Phase 1)
- `src/app/login/page.tsx` -- Login (Phase 1)
- `src/app/agents/page.tsx` -- Agent list (Phase 8)
- `src/app/agents/create/page.tsx` -- Create Agent form (Phase 8)
- `src/app/agents/[id]/page.tsx` -- Agent overview with sparklines (Phase 8)
- `src/app/agents/[id]/runs/page.tsx` -- Agent runs (Phase 8)
- `src/app/agents/[id]/config/page.tsx` -- Agent config editor (Phase 8)
- `src/app/agents/[id]/tools/page.tsx` -- MCP server connections (Phase 8)
- `src/app/agents/[id]/deployments/page.tsx` -- Version history with diffs (Phase 8)
- `src/app/agents/[id]/eval-history/page.tsx` -- Eval experiments for agent (Phase 8)
- `src/app/agents/[id]/knowledge-base/page.tsx` -- KB upload and management (Phase 8)
- `src/app/agents/[id]/traces/page.tsx` -- Searchable traces (Phase 8)
- `src/app/runs/page.tsx` -- All runs (Phase 8)
- `src/app/runs/[id]/page.tsx` -- Run detail + trace viewer (Phase 8)
- `src/app/evals/page.tsx` -- Eval hub landing (Phase 8)
- `src/app/evals/datasets/page.tsx` -- Dataset list (Phase 8)
- `src/app/evals/datasets/[id]/page.tsx` -- Dataset detail with cases (Phase 8)
- `src/app/evals/experiments/page.tsx` -- Experiments list (Phase 8)
- `src/app/evals/experiments/[id]/page.tsx` -- Experiment detail (Phase 8)
- `src/app/evals/graders/page.tsx` -- Grader registry (Phase 8)
- `src/app/evals/baselines/page.tsx` -- Active baselines (Phase 8)
- `src/app/usage/page.tsx` -- Usage dashboard (Phase 8)
- `src/app/settings/page.tsx` -- Settings (Phase 1)
- `src/app/settings/general/page.tsx` -- Org general settings (Phase 8)
- `src/app/settings/api-keys/page.tsx` -- API keys (Phase 1)
- `src/app/settings/secrets/page.tsx` -- Secrets management (Phase 1)
- `src/app/settings/members/page.tsx` -- Team management (Phase 1)
- `src/app/settings/environments/page.tsx` -- Environment management (Phase 8)
- `src/app/settings/billing/page.tsx` -- Billing/plan page (Phase 8)
- `src/app/settings/alerts/page.tsx` -- Alert configuration (Phase 8)
- `src/app/settings/webhooks/page.tsx` -- Webhook management (Phase 10)
- `src/components/code-execution-step.tsx` -- Code execution trace viewer component (Phase 11.5)
- `src/components/artifact-preview.tsx` -- File preview and download component (Phase 11.5)
- `src/app/agents/[id]/ci-cd/page.tsx` -- CI/CD pipeline history (Phase 11)
- `src/app/agents/[id]/repo/page.tsx` -- Repository browser (Phase 11)
- `src/app/agents/[id]/evolution/page.tsx` -- Evolution dashboard tab (Phase 12)
- `src/app/connectors/page.tsx` -- Connector catalog browser (Phase 6b)
- `src/app/connectors/callback/page.tsx` -- OAuth callback page (Phase 6b)
- `src/components/*.tsx` -- Shared UI components (Phases 1-10)
- `src/lib/api.ts` -- Internal API client (Phase 1)
- `tailwind.config.ts` -- Tailwind + design tokens (Phase 8)

---

## Summary Checklist

Before declaring the platform ready for private beta (end of Milestone 4, week 16):

- [ ] Phase 0: Monorepo builds, infra deployed, CI passes, all 25 tables in schema
- [ ] Phase 1: Signup, org creation, API keys, RLS, rate limiting, concurrent run enforcement, idempotency
- [ ] Phase 2: defineAgent + defineTool work (string + capability class model syntax), agent runs with tools, guardrails enforced (including output validators), MCP stdio in local dev
- [ ] Phase 3: SSE streaming, client SDK, sessions, OpenAI compat endpoint
- [ ] Phase 4: 10 graders, eval experiments, baselines, CLI eval commands, CI integration
- [ ] Phase 5: Knowledge bases, document upload, embeddings, hybrid retrieval, RAG
- [ ] Phase 6: MCP client, encrypted secrets, tool policies, approval gates
- [ ] Phase 6b: Connector catalog with 15 managed connectors, OAuth flows, dashboard browser
- [ ] Phase 7: Environments, deploy, rollback, version diff, CLI auth + secrets
- [ ] Phase 8: Dashboard home (populated), agent list, trace viewer, usage charts, sparklines, alerts (with data model), prompt diff viewer
- [ ] Phase 9: CLI polished, hot reload, logs tail (with backend SSE endpoint), CI/CD docs
- [ ] Phase 10: Webhooks with signature verification and retry
- [ ] Phase 11: Agent Git repos, Git transport, push hooks, CI pipeline workflow, PR eval comparison, pipeline dashboard
- [ ] Phase 11.5: Code execution via E2B sandbox, execute_code built-in tool, sandbox pool, file I/O, run artifacts, cost tracking, trace viewer integration
- [ ] Phase 12: Evolution data model, meta-agent (with code execution), evolution loop workflow, scoring/regression, ledger, scheduled evolution, safety gates, evolution dashboard, CLI commands
- [ ] All 20 user journeys verified end-to-end
- [ ] Load test: 10 concurrent agent runs per org sustains without degradation
- [ ] Security: cross-tenant isolation verified, secrets never logged, API keys hashed
- [ ] Documentation: API docs, SDK docs, getting started guide published
