# Agentsy: Fly.io Deployment & Operations Runbook

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft

---

## 1. Deployment Topology

### Fly Apps

Three separate Fly apps, each independently scalable. Start single-region (iad). Add regions when latency demands it. Multiple Machines per app for resilience (Fly recommends 2+ for availability).

| App | Tech | Fly Region | Machines | Purpose |
|-----|------|-----------|----------|---------|
| `agentsy-web` | Next.js 15 | iad | 2 | Dashboard, playground, agent config UI |
| `agentsy-api` | Fastify | iad | 2+ | REST API, SSE streaming, health checks |
| `agentsy-worker` | Node.js | iad | 2+ | Temporal workflow/activity workers |

### Data Services (on Fly)

Self-managed PostgreSQL and Redis running on Fly Machines with persistent volumes. Same private network as app Machines — sub-1ms latency, no cross-provider hops.

| App | Tech | Fly Region | Machines | Volume | Purpose |
|-----|------|-----------|----------|--------|---------|
| `agentsy-db` | PostgreSQL 16 + pgvector | iad | 1 primary + 1 replica | 20GB each | Primary database, vector store |
| `agentsy-redis` | Redis 7 | iad | 1 | 1GB | Rate limiting, caching, pub/sub |

### Object Storage (on Fly)

| Service | Tech | Purpose |
|---------|------|---------|
| Tigris | Fly-native S3-compatible | Knowledge base files, artifacts, database backups |

Provision with `fly storage create`. S3-compatible API — use any S3 SDK. Globally caching: objects are stored in a primary region and cached at edge locations near your apps (not eagerly replicated to every region).

### Auth & Secrets (in agentsy-api)

| Concern | Implementation | Storage |
|---------|---------------|---------|
| Authentication | Better Auth (library) | `users`, `sessions`, `accounts`, `organizations` tables in Postgres |
| Tool credentials | AES-256-GCM encrypted columns | `tenant_secrets` table in Postgres |

No separate services. Auth runs inside the API process. Secrets are encrypted at the application layer with a master key from `fly secrets set`.

### External Service (one)

| Service | Provider | Purpose | Region |
|---------|----------|---------|--------|
| Durable execution | Temporal Cloud | Workflow orchestration | us-east-1 |

---

## 2. Fly App Configuration

### 2.1 agentsy-api fly.toml

```toml
app = "agentsy-api"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_start_machines = true
  auto_stop_machines = "suspend"
  min_machines_running = 2
  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

[[vm]]
  size = "shared-cpu-2x"
  memory = "1gb"
```

**Notes**:
- SSE connections for agent streaming are long-lived. Use `auto_stop_machines = "suspend"` (not `"stop"`) to preserve active connections.
- Fly's proxy handles connection draining on deploys automatically.
- Scale up to `performance-2x` for production load when concurrent agent runs increase.
- Concurrency limits are per-machine. At 2 machines with soft limit 200, the app handles ~400 concurrent requests before Fly starts queuing.

### 2.2 agentsy-web fly.toml

```toml
app = "agentsy-web"
primary_region = "iad"

[build]
  dockerfile = "apps/web/Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_start_machines = true
  auto_stop_machines = "suspend"
  min_machines_running = 2

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

**Notes**:
- Next.js serves both SSR pages and static assets. Consider putting static assets behind a CDN in production.
- 512MB is sufficient for the dashboard. Next.js App Router with React Server Components keeps memory usage low.

### 2.3 agentsy-worker fly.toml

```toml
app = "agentsy-worker"
primary_region = "iad"

[build]
  dockerfile = "apps/worker/Dockerfile"

[env]
  NODE_ENV = "production"
  TEMPORAL_TASK_QUEUE = "agentsy-agent-runs"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

**Notes**:
- Workers do NOT expose HTTP. They connect outbound to Temporal Cloud for task polling.
- Do NOT set `auto_stop_machines` for workers. They must stay running to poll the Temporal task queue.
- Workers are CPU/memory-bound during LLM response processing and tool execution. 2GB gives headroom for concurrent agent runs per machine.
- If you need health checks without an HTTP service, use Fly's process groups with a custom check command.

### 2.4 agentsy-db (Fly Managed Postgres + pgvector)

Provision via Fly Managed Postgres (MPG). This is Fly's fully managed Postgres offering — automated backups, managed replication, and no volume management.

```bash
# Provision a Managed Postgres cluster
fly mpg create --name agentsy-db --region iad --plan launch-2

# Attach to your apps (creates DATABASE_URL secret automatically)
fly mpg attach agentsy-db --app agentsy-api
fly mpg attach agentsy-db --app agentsy-worker
```

**Notes**:
- Fly MPG handles backups, failover, and replication automatically.
- Connect from other Fly apps via the `DATABASE_URL` secret injected by `fly mpg attach`.
- Internal DNS: `agentsy-db.flycast:5432` (accessible from Fly private network).
- The `launch-2` plan provides 2 vCPU / 4GB RAM / 40GB storage — sufficient for beta. Scale via `fly mpg update`.
- pgvector is available as an extension — enable it in the post-deploy setup below.

**Post-deploy setup** (connect via `fly mpg connect agentsy-db`):

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configure for agent workloads
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET max_connections = 100;

-- WAL settings for durability
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = 'test ! -f /data/wal_archive/%f && cp %p /data/wal_archive/%f';

SELECT pg_reload_conf();
```

### 2.5 agentsy-redis

```toml
app = "agentsy-redis"
primary_region = "iad"

[build]
  image = "redis:7-alpine"

[env]
  REDIS_ARGS = "--maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes --appendfsync everysec"

[mounts]
  source = "redis_data"
  destination = "/data"

[[services]]
  protocol = "tcp"
  internal_port = 6379
  auto_start_machines = true
  auto_stop_machines = "off"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

**Notes**:
- Redis stores ephemeral data (rate limits, caches). AOF persistence is enabled but data loss on failure is tolerable.
- Connect from other Fly apps: `redis://agentsy-redis.internal:6379`.
- Set a password via `fly secrets set -a agentsy-redis REDIS_PASSWORD="..."` and add `--requirepass` to `REDIS_ARGS`.
- `allkeys-lru` eviction ensures Redis stays within memory bounds. Rate limit keys and cache entries are safe to evict.
- 256MB is sufficient for beta. Monitor with `INFO memory` and scale if `used_memory` consistently exceeds 200MB.

**Redis degradation behavior** (when Redis is unavailable):

| Feature | Degraded behavior | Risk |
|---------|------------------|------|
| Rate limiting | Falls back to in-memory per-Machine counters. Limits are enforced per-Machine, not globally — total throughput may exceed intended limits by Nx (where N = number of API Machines). | Low — beta traffic is small enough that per-Machine limits are sufficient. |
| SSE replay buffer | SSE events are not buffered for reconnection. Clients that disconnect mid-stream must re-subscribe and may miss events. The run trace in Postgres is the durable record. | Low — clients can poll `/v1/runs/:id` as fallback. |
| Cache (prompt, tool results) | Cache misses go directly to Postgres or LLM provider. Slightly higher latency and cost. | Low — cache is a performance optimization, not a correctness requirement. |
| Pub/sub (run events) | Dashboard live-updates stop. Users must refresh to see updated run status. | Low — cosmetic, not functional. |

**Design rule**: Redis is a performance layer, not a correctness layer. Every feature that uses Redis must have a defined fallback that preserves correctness without it.

---

## 3. Secrets Management on Fly

Set secrets per app. Fly injects them as environment variables at runtime. Secrets are encrypted at rest.

```bash
# API secrets
fly secrets set -a agentsy-api \
  DATABASE_URL="postgres://agentsy:PASSWORD@agentsy-db.internal:5432/agentsy" \
  REDIS_URL="redis://:PASSWORD@agentsy-redis.internal:6379" \
  TEMPORAL_ADDRESS="namespace.tmprl.cloud:7233" \
  TEMPORAL_NAMESPACE="agentsy-prod" \
  TEMPORAL_CLIENT_CERT="$(cat temporal-client.pem)" \
  TEMPORAL_CLIENT_KEY="$(cat temporal-client-key.pem)" \
  SECRETS_MASTER_KEY="$(openssl rand -hex 32)" \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  GITHUB_CLIENT_ID="..." \
  GITHUB_CLIENT_SECRET="..." \
  TIGRIS_ACCESS_KEY_ID="..." \
  TIGRIS_SECRET_ACCESS_KEY="..."

# Web secrets
fly secrets set -a agentsy-web \
  NEXT_PUBLIC_API_URL="https://agentsy-api.fly.dev"

# Worker secrets
fly secrets set -a agentsy-worker \
  DATABASE_URL="postgres://agentsy:PASSWORD@agentsy-db.internal:5432/agentsy" \
  REDIS_URL="redis://:PASSWORD@agentsy-redis.internal:6379" \
  TEMPORAL_ADDRESS="namespace.tmprl.cloud:7233" \
  TEMPORAL_NAMESPACE="agentsy-prod" \
  TEMPORAL_CLIENT_CERT="$(cat temporal-client.pem)" \
  TEMPORAL_CLIENT_KEY="$(cat temporal-client-key.pem)" \
  SECRETS_MASTER_KEY="$(openssl rand -hex 32)" \
  TIGRIS_ACCESS_KEY_ID="..." \
  TIGRIS_SECRET_ACCESS_KEY="..."
```

**Notes**:
- Temporal Cloud uses mTLS. Store the client cert and key as secrets, not in the repo.
- `NEXT_PUBLIC_*` vars are baked into the Next.js build. Changing them requires a redeploy, not just a secret update.
- Internal Fly DNS (`.internal`) does not use TLS — traffic stays on Fly's private WireGuard mesh, which is encrypted at the network layer.
- `SECRETS_MASTER_KEY` is the AES-256-GCM key for encrypting tenant tool credentials in Postgres. Use the same key for API and worker so both can encrypt/decrypt.
- `BETTER_AUTH_SECRET` is used for session token signing. Only needed on the API.
- Tigris credentials are provisioned via `fly storage create` and injected automatically, but listed here for clarity.
- Never store LLM provider API keys as Fly secrets. Those are per-tenant, stored encrypted in the `tenant_secrets` Postgres table and decrypted at tool-call time.

---

## 4. Deploy Pipeline (GitHub Actions)

All three apps deploy in parallel on merge to main. Each app has its own Dockerfile in the monorepo.

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm test

  migrate:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: |
          fly machine run -a agentsy-api \
            --env DATABASE_URL="${{ secrets.DATABASE_URL }}" \
            --command "pnpm drizzle-kit migrate"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-api:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy -a agentsy-api --config apps/api/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-web:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy -a agentsy-web --config apps/web/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-worker:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy -a agentsy-worker --config apps/worker/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Future additions**:
- Add an eval gate before `deploy-api`: run `agentsy eval run --dataset golden` in CI, block deploy if regression threshold is breached (P1 feature, see PRD R-4.11).
- Add staging environment deploys on PR merge, production on tag/manual approval.
- Consider per-app change detection (Turborepo `--filter`) to skip unchanged apps.

---

## 5. Database Migrations

Using Drizzle ORM. Migrations run as a one-off Fly Machine before app deploys.

```bash
# Run migrations manually
fly machine run -a agentsy-api \
  --env DATABASE_URL="$DATABASE_URL" \
  --command "pnpm drizzle-kit migrate"
```

**Rules**:
- Migrations run before API and worker deploys (see pipeline above). Web can deploy independently.
- All migrations must be backward-compatible. The old code version runs alongside the new schema during rolling deploys.
- Test migrations against a local SQLite instance or a `pg_dump` restore to a test database first.
- Never run destructive migrations (DROP COLUMN, DROP TABLE) without a two-phase approach: (1) stop reading the column, deploy, (2) drop the column in a later migration.

---

## 6. Monitoring and Health Checks

### Health Check Endpoints

The API exposes a health check that verifies all critical dependencies:

```
GET /health
```

Returns:
```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "temporal": "ok",
  "version": "1.2.3",
  "uptime": 86400
}
```

If any dependency is down, returns HTTP 503 with the failing component. Fly uses this to route traffic away from unhealthy machines.

The web app uses Next.js built-in health checks.

### Monitoring Stack

| Layer | Tool | What it covers |
|-------|------|----------------|
| Machine metrics | Fly built-in Grafana | CPU, memory, network, disk per machine |
| Application metrics | Prometheus endpoint on API | Request rate, latency percentiles, error rate, active SSE connections |
| Uptime | BetterStack (or similar) | External synthetic checks on API and web endpoints |
| Workflows | Temporal Cloud dashboard | Workflow health, task queue depth, failure rate |
| Database | pg_stat_statements + Grafana | Query performance, connection count, storage |
| Traces | OTel Collector to Tempo/Axiom | Agent run traces (LLM calls, tool calls, cost) |
| Logs | `fly logs` or Fly log shipping | Structured JSON logs with run_id, tenant_id, trace_id |

### Alerting

Set up alerts for:
- API health check failures (Fly status checks, immediate)
- Error rate > 5% over 5 minutes (Prometheus/Grafana)
- P95 latency > 5s on `/v1/agents/:id/run` (Prometheus/Grafana)
- Temporal task queue backlog > 100 tasks (Temporal Cloud)
- Database connection pool exhaustion (pg_stat_activity)
- Machine memory > 85% (Fly Grafana)

---

## 7. Scaling Strategy

### Beta (20 teams, ~10K runs/day target)

| App | Machines | VM Size | Memory |
|-----|----------|---------|--------|
| agentsy-web | 2 | shared-cpu-1x | 512MB |
| agentsy-api | 2 | shared-cpu-2x | 1GB |
| agentsy-worker | 2 | shared-cpu-2x | 2GB |
| agentsy-db | 1+1 replica | shared-cpu-2x | 2GB |
| agentsy-redis | 1 | shared-cpu-1x | 512MB |

### Growth (100+ teams)

| App | Machines | VM Size | Memory |
|-----|----------|---------|--------|
| agentsy-web | 2 | shared-cpu-2x | 1GB |
| agentsy-api | 4 | performance-2x | 4GB |
| agentsy-worker | 4-8 | performance-2x | 4GB |
| agentsy-db | 1+2 replicas | performance-4x | 8GB |
| agentsy-redis | 1 | shared-cpu-2x | 1GB |

**Scaling workers**: Workers scale based on concurrent agent runs. Each worker machine can handle multiple concurrent Temporal activities. Monitor Temporal task queue latency -- if tasks wait > 2s for a worker, add machines.

```bash
fly scale count 4 -a agentsy-worker
```

**Scaling API**: Scale based on concurrent SSE connections and request rate. Monitor the concurrency soft limit in Fly metrics.

### When to Leave Fly

Fly is right for beta through early growth. Plan migration when:
- You need > 20 machines per app consistently
- Enterprise customers require dedicated VPC or network policy isolation
- Data residency requirements demand multi-cloud (EU region)
- You need sidecar containers (e.g., OTel collector per pod)

**Migration path**: All apps are containerized. Move directly to EKS/GKE with Helm charts. The Dockerfiles, health checks, and env var patterns transfer unchanged.

---

## 8. Cost Estimate (Beta)

| Resource | Provider | Estimate/mo |
|----------|----------|-------------|
| Fly Machines — app (6 total) | Fly.io | ~$50-100 |
| Fly Machines — Postgres (2) | Fly.io | ~$30-40 |
| Fly Volumes — Postgres (2×20GB) | Fly.io | ~$6 |
| Fly Machines — Redis (1) | Fly.io | ~$5-10 |
| Fly Volumes — Redis (1GB) | Fly.io | ~$0.15 |
| Tigris (10GB storage) | Fly.io | ~$1 |
| Temporal Cloud (beta usage) | Temporal | ~$25-50 |
| BetterStack (uptime) | BetterStack | ~$20 |
| **Total** | | **~$135-225/mo** |

**Vendor count**: Fly.io (compute, database, cache, storage, auth, secrets) + Temporal Cloud (durable execution). Two vendors total, plus LLM providers.

LLM API costs are not included. Users provide their own API keys in local dev. Platform keys in production are billed to users via credits (see PRD Q4).

---

## 9. Runbook: Common Operations

### Deploy a hotfix

Skip rolling deploy, push immediately to all machines:

```bash
fly deploy -a agentsy-api --strategy immediate
```

### Roll back a deploy

```bash
# List recent releases to find the previous image
fly releases -a agentsy-api

# Deploy the previous image
fly deploy -a agentsy-api --image registry.fly.io/agentsy-api:deployment-XXXXX
```

### SSH into a running machine

```bash
fly ssh console -a agentsy-api
```

### Scale workers up/down

```bash
fly scale count 4 -a agentsy-worker
```

### View logs

```bash
# Tail all logs for an app
fly logs -a agentsy-api

# Tail worker logs
fly logs -a agentsy-worker
```

### Restart all machines

```bash
fly apps restart agentsy-api
```

### Check machine status

```bash
fly status -a agentsy-api
fly status -a agentsy-worker
```

### Run one-off commands

```bash
# Run a one-off migration or script
fly machine run -a agentsy-api \
  --env DATABASE_URL="$DATABASE_URL" \
  --command "node scripts/backfill.js"
```

### Check secrets (list, not values)

```bash
fly secrets list -a agentsy-api
```

### Force a new deploy without code changes

Useful when secrets change (non-NEXT_PUBLIC secrets take effect on restart):

```bash
fly apps restart agentsy-api
```

For NEXT_PUBLIC vars on the web app, a full redeploy is required:

```bash
fly deploy -a agentsy-web --config apps/web/fly.toml
```

---

## 10. SSE and Long-Lived Connections

Agent runs stream responses via SSE. This has implications for Fly's proxy and machine lifecycle.

**Configuration**:
- `auto_stop_machines = "suspend"` keeps machines alive while SSE connections are open. Fly's proxy tracks active connections.
- Fly's default proxy timeout is 60s for idle connections. SSE connections send heartbeat pings to keep them alive.
- On deploy, Fly drains existing connections gracefully. New requests go to new machines; existing SSE streams finish on old machines.

**Client requirements**:
- Clients must handle SSE reconnection (EventSource auto-reconnects by default).
- Include a `Last-Event-ID` header on reconnect so the API can resume the stream from the correct checkpoint (Temporal makes this possible).

---

## 11. Disaster Recovery

### Database (Fly Managed Postgres)

- **Automated backups**: Handled by Fly MPG. Daily automated backups with point-in-time recovery.
- **Replication**: Fly MPG manages primary/replica failover automatically.
- **Recovery procedure**: Use `fly mpg restore` to restore from a backup or point in time.
- **Additional safety**: Run a supplemental `pg_dump` weekly and upload to Tigris for an independent backup copy.
- Critical: the database is the single source of truth for orgs, agents, runs, eval datasets, and versions.

### Temporal Cloud

- Temporal Cloud handles workflow state durability. Workflows survive worker restarts.
- If Temporal Cloud is unreachable, workers cannot poll for tasks. Agent runs queue up and resume when connectivity returns.
- No manual backup needed -- Temporal Cloud manages this.

### Redis (Self-managed on Fly)

- Redis stores ephemeral data (rate limit counters, caches). Loss is tolerable.
- AOF persistence enabled (`appendfsync everysec`) — at most 1 second of data loss on crash.
- Rate limit counters reset on Redis failure — temporarily allows higher throughput. Monitor and alert.
- If the Redis Machine dies, Fly restarts it. AOF on the volume enables recovery of persisted state.

### Fly Machines

- App Machines are stateless. All persistent state is in Postgres (on Fly), Temporal, and Tigris.
- If a machine dies, Fly replaces it automatically (min_machines_running enforces this).
- Deploy artifacts (Docker images) are stored in Fly's registry.

### Tigris (Object Storage)

- Tigris stores knowledge base files, generated artifacts, and database backups.
- Globally caching — objects cached at edge locations near active apps, not eagerly replicated.
- S3-compatible API — migrate to any S3-compatible store if needed.
- Consider explicit region pinning if data residency becomes a requirement.
