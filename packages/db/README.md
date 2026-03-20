# `@agentsy/db`

Drizzle schema, PostgreSQL migrations, RLS + trigger SQL (via migrations), SQLite subset for local dev.

## Postgres migrations

1. Ensure `DATABASE_URL` points at PostgreSQL 16+ (e.g. Fly Managed Postgres).
2. Baseline migration `0000` creates enums + tables ; it begins with `CREATE EXTENSION` for `vector` and `pg_trgm` so fresh databases succeed.
3. `0001_extensions_rls_triggers.sql` applies `set_updated_at` triggers, `knowledge_chunks` tsvector trigger, roles, RLS enable, and policies.

```bash
# From repo root
export DATABASE_URL='postgresql://user:pass@host:5432/agentsy'
pnpm --filter @agentsy/db db:migrate
```

Generate a new migration after schema edits:

```bash
pnpm --filter @agentsy/db db:generate
```

Custom SQL only (RLS tweaks, indexes, etc.):

```bash
pnpm --filter @agentsy/db exec drizzle-kit generate --custom --name your_change
```

**Rule:** Never edit a migration that has already run in production; add a new one.

## RLS / triggers source files

`src/rls.sql` and `src/triggers.sql` are pointers. The canonical SQL lives under `drizzle/0001_extensions_rls_triggers.sql` (until superseded by newer migrations).

## Seed

```bash
DATABASE_URL=... pnpm --filter @agentsy/db db:seed
```

## SQLite (local)

Used by `createSqliteClient` — no RLS, no vector. Tests cover the SQLite subset.
