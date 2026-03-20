# Phase 0 Implementation Review

**Date**: March 20, 2026  
**Status**: **Code complete** — infra provisioning (Fly Postgres, Redis, Temporal, Tigris) remains manual per `docs/deployment-flyio.md`.

---

## Summary

Phase 0 deliverables from `docs/phase-0-brief.md` are implemented in-repo:

| Area | Status |
|------|--------|
| Monorepo (turbo, pnpm, tsconfig, eslint, prettier) | Done |
| 10 packages / apps stubs | Done |
| `@agentsy/shared` (ids, types, constants, pricing, storage + S3) | Done |
| `@agentsy/db` (25 tables, enums, **RLS + triggers in Drizzle `0001`**, seed, SQLite subset) | Done |
| `agentsy-api` health route | Done |
| `agentsy-web` Next placeholder | Done |
| `agentsy-worker` Temporal bootstrap + workflow bundle build | Done |
| CI (`ci.yml`) / deploy stub | Done |

---

## Worker (0.7)

- **Dependencies**: `@temporalio/worker`, `@temporalio/workflow`
- **Build**: `tsup` → `dist/index.js`, then `node scripts/bundle-workflows.mjs` → `dist/workflow-bundle.cjs`
- **Runtime**: Uses `workflowBundle.codePath` when bundle exists; otherwise `workflowsPath` → `src/workflows/index.ts` (local dev)
- **TLS**: `TEMPORAL_CLIENT_CERT` / `TEMPORAL_CLIENT_KEY` (PEM strings), with fallbacks `TEMPORAL_TLS_CERT` / `TEMPORAL_TLS_KEY`
- **Placeholder workflow**: `phase0NoopWorkflow` (Phase 2 replaces with real workflows)

---

## Tigris / S3 (0.8)

- `@agentsy/shared`: `createStorageClient`, `putStorageObject`, `getStorageObjectBytes` using `@aws-sdk/client-s3` (path-style, Tigris-compatible)

---

## Verify locally

```bash
pnpm install
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

## Postgres migrations

`0000` — extensions (`vector`, `pg_trgm`) + schema.  
`0001` — triggers + RLS (see `packages/db/README.md`).

```bash
DATABASE_URL=... pnpm --filter @agentsy/db db:migrate
```

## Infra (not in repo)

Complete Phase 0 **acceptance** on Fly / Temporal only after:

- Managed Postgres + extensions + migrations + RLS
- Redis reachable from API
- Temporal namespace + worker polling
- Tigris bucket + put/get smoke test against real endpoint

---

## What stays out of Phase 0 (per brief)

- Auth middleware, agent runtime, API beyond `/health`, post-beta tables, full observability, auto-deploy
