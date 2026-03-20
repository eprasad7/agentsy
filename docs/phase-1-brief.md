# Phase 1: Auth & Multi-Tenancy — Implementation Brief

**Goal**: Working Fastify API with Better Auth, RLS tenant isolation, org/member management, API keys, secrets encryption, and rate limiting.
**Duration**: 3–4 days
**Dependencies**: Phase 0 complete (monorepo, schema, infra configs)
**Journeys**: J1 (Signup & Onboarding), J8 (Team Collaboration)

---

## What Gets Built

By the end of Phase 1, a developer can:
1. Sign up via email/password or Google/GitHub OAuth
2. Create an organization
3. Invite team members with admin/member roles
4. Create API keys for programmatic access
5. Store encrypted secrets (LLM provider keys)
6. Hit any API endpoint with an API key and get RLS-scoped data
7. Get rate-limited when exceeding plan limits

---

## Architecture Decisions

| Decision | Choice |
|----------|--------|
| Auth library | Better Auth (embedded in API, backed by Postgres) — NOT Clerk/Auth0 |
| Tenant isolation | PostgreSQL RLS with `SET LOCAL app.org_id` per transaction |
| API key format | `sk-agentsy-{org_slug_prefix}-{random}`, SHA-256 hashed, never stored plaintext |
| Secrets | AES-256-GCM encrypted columns in Postgres, master key from env var |
| Rate limiting | Redis sliding window: requests/min + tokens/day + concurrent runs |
| Redis degradation | If Redis is down, rate limits fall back to permissive (don't block requests) |

---

## Middleware Execution Order

Every API request flows through this chain:

```
Request
  → 1. CORS
  → 2. Request Logger (structured JSON)
  → 3. Auth (Better Auth session OR API key → resolves org_id)
  → 4. RLS Context (SET LOCAL app.org_id = '<org_id>')
  → 5. Rate Limiter (Redis sliding window, sets X-RateLimit-* headers)
  → 6. Route Handler
  → 7. Error Handler (RFC 7807 format)
  → 8. Transaction Commit/Rollback
```

---

## Steps

### 1.1 — Fastify Server Bootstrap

Set up the API server with plugins, error handling, and structured logging.

**Ref**: spec-api.md section 1 (API Conventions)

```
apps/api/src/
  index.ts                → Fastify app: register plugins, routes, start server on PORT (default 3001)
  plugins/
    error-handler.ts      → RFC 7807 error formatting, maps Zod errors to 422
    cors.ts               → CORS: allow app.agentsy.com, localhost:3000
    request-logger.ts     → Structured JSON logs (method, url, status, duration_ms, org_id)
  routes/
    health.ts             → GET /health → { status: "ok", db: bool, redis: bool }
```

**Error response format** (RFC 7807):
```typescript
{
  type: "https://api.agentsy.com/errors/{error-code}",
  title: "Human-readable title",
  status: 422,
  detail: "Specific error message",
  errors?: [{ field: "name", message: "Required", code: "required" }]
}
```

**Done when**: `GET /health` returns 200 with structured JSON. Invalid routes return 404 in RFC 7807 format.

---

### 1.2 — Better Auth Integration

Configure Better Auth as the auth library, backed by the existing Postgres tables.

**Ref**: technology-decisions.md D-9.1, spec-api.md auth section

```
apps/api/src/
  lib/
    auth.ts               → Better Auth instance config:
                             - Email/password provider
                             - Google OAuth provider (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
                             - GitHub OAuth provider (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
                             - Session storage in Postgres
                             - On signup: auto-create organization + 3 default environments
```

Better Auth handles its own routes (`/api/auth/*`). The Fastify server mounts these.

**On new user signup** (post-auth hook):
1. Create organization record with user-provided name/slug
2. Create `organization_members` row (role: `admin`)
3. Create 3 default environments (development, staging, production)

**Done when**: Email signup creates user + org + environments. Google/GitHub OAuth redirects work.

---

### 1.3 — API Key Authentication

Implement API key generation, hashing, lookup, and revocation.

**Ref**: spec-api.md section 11, spec-data-model.md table 3.3

```
apps/api/src/
  middleware/
    auth.ts               → Unified auth middleware:
                             1. Check Authorization header
                             2. If "Bearer sk-agentsy-*" → API key auth
                             3. If session cookie → Better Auth session auth
                             4. Extract org_id, user_id, role
                             5. Attach to request context
  services/
    api-keys.ts           → API key service:
                             - generate(): creates key, returns plaintext once
                             - verify(key): SHA-256 hash → lookup → check revoked/expired
                             - revoke(keyId): sets revoked_at
```

**Key format**: `sk-agentsy-{org_slug_first_8}-{32_random_chars}`
**Storage**: Only `SHA-256(full_key)` stored in `api_keys.key_hash`
**Lookup**: Hash the incoming key, query by `key_hash` (unique index)

**Done when**: Create key → use in Authorization header → get authenticated response. Revoke → get 403.

---

### 1.4 — RLS Context Middleware

Set PostgreSQL RLS context per request so all queries are automatically tenant-scoped.

**Ref**: spec-data-model.md section 5, technology-decisions.md D-9.2

```
apps/api/src/
  middleware/
    rls.ts                → Per-request middleware:
                             1. Begin transaction
                             2. SET LOCAL app.org_id = req.orgId
                             3. On response: commit
                             4. On error: rollback
```

**Implementation pattern**:
```typescript
// Fastify onRequest hook
fastify.addHook('onRequest', async (request, reply) => {
  const orgId = request.orgId; // set by auth middleware
  if (!orgId) return; // public routes skip RLS

  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.org_id = $1`, [orgId]);
  request.dbClient = client;

  reply.raw.on('finish', async () => {
    try { await client.query('COMMIT'); } finally { client.release(); }
  });
});
```

**Done when**: Org A's API key cannot see org B's data (integration test proves cross-tenant isolation).

---

### 1.5 — Rate Limiting

Redis-based sliding window rate limiter with graceful degradation.

**Ref**: technology-decisions.md D-9.4, spec-api.md section 1

```
apps/api/src/
  lib/
    redis.ts              → Redis client (ioredis), connection config, health check
    rate-limiter.ts       → Sliding window implementation:
                             - Per-org limits (from org.metadata or plan defaults)
                             - Three dimensions: requests/min, tokens/day, concurrent runs
                             - Returns { allowed: bool, headers: Record<string, string> }
  middleware/
    rate-limit.ts         → Fastify hook: check limits, set X-RateLimit-* headers, 429 if exceeded
```

**Plan defaults**:
```typescript
const PLAN_LIMITS = {
  free:       { requestsPerMin: 20,  tokensPerDay: 100_000,    concurrentRuns: 2  },
  pro:        { requestsPerMin: 60,  tokensPerDay: 1_000_000,  concurrentRuns: 10 },
  team:       { requestsPerMin: 120, tokensPerDay: 5_000_000,  concurrentRuns: 25 },
  enterprise: { requestsPerMin: 300, tokensPerDay: 50_000_000, concurrentRuns: 100 },
};
```

**Response headers** (always set):
```
X-RateLimit-Limit-Requests: 60
X-RateLimit-Remaining-Requests: 42
X-RateLimit-Reset-Requests: 2026-03-19T12:01:00Z
```

**Degradation**: If Redis is unreachable, log a warning and allow the request (fail open).

**Done when**: Rapid-fire requests get 429 after limit. Headers show remaining quota. Redis down → requests pass through.

---

### 1.6 — Secrets Encryption

AES-256-GCM encryption for tenant secrets (LLM API keys, etc.).

**Ref**: technology-decisions.md D-4.3, spec-data-model.md table 3.19

```
apps/api/src/
  lib/
    crypto.ts             → encrypt(plaintext, masterKey) → encryptedValue
                             decrypt(encryptedValue, masterKey) → plaintext
                             Uses AES-256-GCM with random IV per secret
  services/
    secrets.ts            → CRUD: create (encrypt + store), list (names only), delete
                             Never returns plaintext values via API
```

**Encryption format**: `{iv_hex}:{ciphertext_hex}:{auth_tag_hex}`
**Master key**: `SECRETS_MASTER_KEY` env var (32-byte hex, injected via `fly secrets set`)

**Done when**: `POST /v1/secrets` stores encrypted value. `GET /v1/secrets` returns names only, never values. Internal `getSecret(orgId, name)` decrypts for runtime use.

---

### 1.7 — Organization & Member Endpoints

CRUD for organizations, members, invitations.

**Ref**: spec-api.md section 12

```
apps/api/src/
  routes/
    organizations.ts      → GET /v1/organization (current org)
                             PATCH /v1/organization (admin only: name, billing_email)
    members.ts            → GET /v1/organization/members
                             POST /v1/organization/members/invite (admin only)
                             PATCH /v1/organization/members/:id (admin only: role change)
                             DELETE /v1/organization/members/:id (admin only)
```

**Invite flow**:
1. Admin sends invite with email + role
2. System creates pending member record with invite token (expires 7 days)
3. Email sent with link: `app.agentsy.com/invite?token={token}`
4. Recipient clicks → exchanges token for full membership

**Done when**: Admin invites member → member accepts → member appears in list with correct role.

---

### 1.8 — API Key Endpoints

CRUD for API keys.

**Ref**: spec-api.md section 11

```
apps/api/src/
  routes/
    api-keys.ts           → POST /v1/api-keys (create, returns full key ONCE)
                             GET /v1/api-keys (list, prefix only)
                             GET /v1/api-keys/:id (detail, no key value)
                             POST /v1/api-keys/:id/revoke
```

**Done when**: Create returns full key. Subsequent GETs show prefix only. Revoke makes key unusable.

---

### 1.9 — Secrets Endpoints

CRUD for encrypted secrets.

**Ref**: spec-api.md section 10

```
apps/api/src/
  routes/
    secrets.ts            → POST /v1/secrets (create, value encrypted immediately)
                             GET /v1/secrets (list names + metadata, never values)
                             DELETE /v1/secrets/:id
```

**Done when**: Store ANTHROPIC_API_KEY → list shows name only → delete removes it.

---

### 1.10 — Environment Endpoints

Read and update environment settings.

**Ref**: spec-api.md section 9

```
apps/api/src/
  routes/
    environments.ts       → GET /v1/environments (list all 3)
                             PATCH /v1/environments/:id (tool allow/deny lists, approval config)
```

Environments are pre-seeded on org creation (step 1.2). No create/delete — always exactly 3.

**Done when**: List returns 3 environments. Patch updates tool policies.

---

### 1.11 — Concurrent Run Limiter

Redis-based concurrent run counter (INCR/DECR pattern).

**Ref**: spec-api.md section 3 (Run Agent), implementation-plan.md Amendment A4

```
apps/api/src/
  middleware/
    concurrent-run-limiter.ts → On run start: INCR org:{org_id}:concurrent_runs
                                  If > limit: reject with 429
                                  On run complete: DECR
                                  TTL safety net: key expires after max run duration
```

**Done when**: Org at concurrent limit → new run returns 429. Run completes → slot freed.

---

### 1.12 — Idempotency Middleware

Prevent duplicate operations from retries.

**Ref**: implementation-plan.md Amendment A4

```
apps/api/src/
  middleware/
    idempotency.ts        → If Idempotency-Key header present:
                             1. Check Redis for key → if exists, return cached response
                             2. Process request normally
                             3. Cache response in Redis with 24h TTL
                             Only applies to POST/PATCH endpoints
```

**Done when**: Same Idempotency-Key on POST /v1/api-keys returns identical response without creating duplicate.

---

### 1.13 — Dashboard Auth Pages (Minimal)

Minimal Next.js pages for signup/login flow.

```
apps/web/src/app/
  signup/page.tsx         → Email/password signup form + OAuth buttons
  login/page.tsx          → Login form + OAuth buttons
  layout.tsx              → Update root layout with navigation shell
  settings/
    page.tsx              → Settings landing (redirects to api-keys)
    api-keys/page.tsx     → API key management page
    secrets/page.tsx      → Secrets management page
    members/page.tsx      → Team member management page
```

**Note**: These are functional but minimal. Dashboard polish happens in Phase 8. Focus on working auth flow, not design.

**Done when**: User can sign up, log in, create API key, add a secret, invite a team member — all from the browser.

---

## Tests

| Type | File | What |
|------|------|------|
| Unit | `apps/api/src/__tests__/crypto.test.ts` | AES-256-GCM encrypt/decrypt roundtrip, invalid master key, tampered ciphertext |
| Unit | `apps/api/src/__tests__/api-key-service.test.ts` | Key generation format, SHA-256 hash verification, prefix extraction |
| Unit | `apps/api/src/__tests__/rate-limiter.test.ts` | Sliding window logic, Redis degradation fallback |
| Integration | `apps/api/src/__tests__/auth-middleware.test.ts` | API key auth, session auth, invalid key → 401, revoked → 403 |
| Integration | `apps/api/src/__tests__/rls.test.ts` | Cross-tenant isolation: org A key cannot read org B data |
| Integration | `apps/api/src/__tests__/org-endpoints.test.ts` | Org CRUD, member invite/accept/remove, role changes |
| Integration | `apps/api/src/__tests__/api-keys-endpoints.test.ts` | Create → use → revoke lifecycle |
| Integration | `apps/api/src/__tests__/secrets-endpoints.test.ts` | Create → list (no values) → delete |
| E2E | `apps/api/src/__tests__/e2e-signup.test.ts` | Full signup → create org → environments seeded → API key works |

---

## Acceptance Criteria

| Check | Evidence |
|-------|----------|
| Signup works | Email signup creates user + org + 3 environments |
| OAuth works | Google/GitHub redirect → callback → user created |
| API key auth | `Authorization: Bearer sk-agentsy-...` authenticates correctly |
| Key is write-once | Full key returned only on creation, never on GET |
| Revocation works | Revoked key → 403 immediately |
| RLS isolation | Org A key → only org A data (integration test) |
| Secrets encrypted | Stored as AES-256-GCM, `GET /v1/secrets` never returns values |
| Rate limiting | Exceeding limit → 429 with X-RateLimit headers |
| Redis degradation | Redis down → requests still pass (logged warning) |
| Concurrent limiter | At max concurrent runs → 429, run completes → slot freed |
| Idempotency | Duplicate POST with same key → identical response, no duplicate created |
| Member management | Invite → accept → appears in member list with correct role |
| Error format | All errors match RFC 7807 structure |
| CI passes | `turbo build && turbo lint && turbo typecheck && turbo test` |

---

## What NOT To Do in Phase 1

- Do not implement agent CRUD or agent runs (Phase 2)
- Do not implement SSE streaming (Phase 3)
- Do not implement eval endpoints (Phase 4)
- Do not polish dashboard UI beyond functional auth (Phase 8)
- Do not set up OTel tracing (Phase 2+)
- Do not implement webhook delivery (Phase 10)
