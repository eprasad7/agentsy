# Phase 4.5: Agent Response Contract — Implementation Brief

**Goal**: Agent versions declare a **versioned output contract** (`text` vs `json`), optional **JSON Schema**, **strict** validation policy, and **documented streaming semantics** so production runs, SDKs, evals, and API consumers agree on the shape of the assistant message.
**Duration**: **5–8 days** (thin product slice; worker JSON path + provider differences often dominate — see Risks)
**Dependencies**: **Hard**: Phase 2 (runtime + `agent_versions` on deploy), Phase 3 (runs, SSE, client SDK). **Soft**: Phase 4 (eval `json_schema` grader defaulting to version schema is ergonomic; per-case schemas already work without 4.5).
**Journeys**: J3 (local dev parity), J4 (eval cases can target structured output), J7 (API/SDK integration)

---

## Why “Phase 4.5” (vs 5.5 or later)

Numbering is **plan ergonomics**, not a hard dependency: the **runtime contract** depends on Phase **2 + 3**, not on Phase 4. We keep **4.5** next to Phase 4 in the implementation plan because it **closes the loop** with evals (version-level schema + `json_schema` grader defaults) and avoids shipping “evals without a declared agent output contract” as the long-term story. If KB/RAG (Phase 5) is scheduled first, **this phase can be implemented after Phase 5** without spec changes — only the plan order changes.

---

## Risks (schedule honestly)

| Risk | Mitigation |
|------|------------|
| **Worker JSON mode** — Anthropic (tool-use / structured output) vs OpenAI (`response_format` JSON) differ; Vercel AI SDK may not unify everything. | **Time-box a spike (0.5–1 day)** on the two P0 providers + current SDK wrappers; define a **single internal `completeJsonAssistantMessage(...)`** (or equivalent) that hides provider quirks; document fallbacks (prompt-only JSON + parse) when a provider flag is unavailable. |
| **Cross-cutting scope** — schema, SDK, worker, API, SSE, client, eval. | Ship **vertical slice** per milestone: types + DB + worker parse/validate + API field → then SDK → then eval default schema. |

---

## Why This Phase Exists

Phase 4 ships trace-native evals and graders including `json_schema` for **expected** outputs. Without a **first-class response contract** on the agent itself, “structured output” is implicit (prompt-only), streaming behavior for JSON is undefined, and evals/CI cannot reliably assert the same contract the runtime promises.

Phase 4.5 makes **`output` / `responseFormat`** part of **immutable `agent_versions`** (and SDK `defineAgent`), aligns **worker** behavior and **persisted run steps**, and gives **client SDK + API** typed `RunOutput` metadata (`outputMode`, validation errors, raw vs parsed).

---

## What Gets Built (Thin Slice)

By the end of Phase 4.5:

1. **Agent config**: `defineAgent({ output: ResponseOutputConfig })` (exact export names follow `spec-sdk.md` / code — may be `responseFormat` alias for API snake_case).
2. **Persistence**: `agent_versions` stores `output_config` (see **ResponseOutputConfig** + **Strict policy**).
3. **Runtime (worker)**:
   - For `mode: "json"`: request model output suitable for JSON (provider params as needed: e.g. Anthropic structured output / JSON mode where available; fall back to prompt contract + parse). **Spike first** — see Risks.
   - **Parse** final assistant text → `unknown`; validate against schema when provided.
   - Emit **structured validation** on the final message step and on **`runs`** (`output_valid`, `output_validation`) per **Strict policy**.
4. **SSE / API**: Document and implement **streaming rules** for JSON mode (see Streaming Semantics); non-streaming path returns parsed object in run result when successful.
5. **SDK**: `RunResult` / stream events expose `outputMode`, optional `parsedOutput`, optional `outputValidationError` (typed).
6. **Eval**: Eval cases can omit explicit expected JSON when agent version defines schema; **`json_schema` grader** can default to **version schema** when case doesn’t override. Document in Phase 4 brief cross-link.

---

## ResponseOutputConfig (Contract)

| Field | Type | Description |
|--------|------|-------------|
| `mode` | `"text" \| "json"` | Default `text`. |
| `json_schema` | JSON Schema (object) | Optional; if `mode === "json"` and omitted, only “valid JSON” is required. |
| `strict` | boolean | See **Strict policy** below (resolved for v1 — not TBD). |
| `schema_version` | optional string | For forward compatibility; default `"1"`. |

### Strict policy (v1 — locked)

| `strict` | Parse / schema failure | `runs.status` | What clients see |
|----------|-------------------------|---------------|------------------|
| **`true`** | Invalid JSON or schema violation | **`failed`** | Typed error + final assistant **raw text** still in trace (`run_steps`) for debugging; optional `parsed_output` null. CI/evals: deterministic failure. |
| **`false`** | Same validation failure | **`completed`** | Orchestration **succeeded**; run is **not** failed. **`runs.output_valid = false`**, **`runs.output_validation`** JSONB = `{ ok: false, errors: [...] }` (and/or mirror on final `run_step`). Raw assistant text preserved. **Do not** add a new `run_status` value such as `degraded` in v1 — avoids enum migrations and keeps “failed” reserved for exceptions / guardrails / strict validation. |

**Dashboard / API**: Expose `output_valid` (nullable: `null` = text mode or legacy rows) + `output_validation` on GET run. **Eval**: `json_schema` (and similar) graders treat **`output_valid === false`** as **score 0** for that criterion unless the eval case explicitly documents different behavior.

**Versioning**: Any breaking change to the shape of `ResponseOutputConfig` or stream event fields bumps **API** version / documented contract patch in `spec-api.md` § agent runs.

---

## Streaming Semantics (Document First)

Minimum bar for Phase 4.5:

| mode | SSE `text_delta` | Final event |
|------|-------------------|-------------|
| `text` | Unchanged from Phase 3 | Final text |
| `json` | **Option A (recommended for v1)**: deltas are **raw model tokens**; client **must not** parse partial JSON as final. Server emits `message_complete` with **full** `parsed` + validation once done. **Option B** (defer): validated incremental JSON / repair stream. |

Document chosen option in `spec-api.md` and `architecture-v1.md` (streaming section).

---

## Data Model Touchpoints

### Migration scope (explicit — not a single table)

Expect **one Drizzle migration file** that may alter **multiple** tables (RLS unchanged):

| Table | Change |
|-------|--------|
| **`agent_versions`** | `output_config` **jsonb** `NOT NULL` with server default **`{"mode":"text"}`** (or equivalent) so new rows are explicit; see backward compat below. |
| **`runs`** | **`output_valid`** **boolean** **nullable** (`NULL` = text mode or pre–Phase 4.5 rows). **`output_validation`** **jsonb** **nullable** (details when `mode === "json"`). **Locked:** store these as **first-class nullable columns** — **not** only inside `runs.metadata`. Rationale: dashboard and alerting need simple filters (e.g. `WHERE output_valid = false`); JSON path queries on metadata are awkward; column cost is trivial. |
| **`run_steps`** | On final assistant / relevant LLM step: **`parsed_output`** jsonb nullable, **`output_validation`** jsonb nullable (mirrors run-level for trace UX). |

**Note**: `runs` already has `output` jsonb — Phase 4.5 **extends the `RunOutput` TypeScript union** for API responses; **`output_valid` / `output_validation` remain the source of truth for validation state** at the row level (summary also reflected in final step for traces).

**Indexes (when implementing)**: Add a **partial or composite index** that supports “recent schema violations” (e.g. `WHERE output_valid = false` scoped by `org_id` / `agent_id`) — cheap and aligns with dashboard Phase 8; exact DDL in `spec-data-model.md` / migration.

### Backward compatibility (existing agent versions)

- **`output_config`**: For rows created before this column exists, **`NULL` in storage** may appear once before backfill; at **read time** in application code, normalize **`NULL` → `{ mode: "text" }`**. After migration, prefer **`NOT NULL` + default** so new versions never store null.
- **`runs.output_valid`**: **`NULL`** for all historical runs and for **text-mode** runs after Phase 4.5.

---

## Architecture

```
SDK defineAgent.output  →  deploy  →  agent_versions.output_config
                                           ↓
Run request (stream/non-stream)  →  AgentRunWorkflow
                                           ↓
Final LLM message  →  parse JSON (if json mode)  →  validate schema
                                           ↓
run_steps + runs.output_valid / output_validation  →  SSE events  →  @agentsy/client RunResult
```

---

## Implementation Steps (Checklist)

### 4.5.1 Types & spec

- [ ] Add `ResponseOutputConfig` to `packages/sdk` and `packages/shared` as needed; mirror in `spec-sdk.md`.
- [ ] `spec-data-model.md` § `agent_versions`: `output_config` column + TypeScript type.
- [ ] `spec-api.md`: run creation optional override (if allowed) vs version-only; response fields for structured output.

### 4.5.2 Deploy path

- [ ] `defineAgent` validation: `json_schema` only when `mode === "json"`.
- [ ] API deploy/staging: persist `output_config` on new `agent_versions` row.

### 4.5.3 Worker

- [ ] Load `output_config` with agent version in run activity.
- [ ] Configure model call for JSON mode (provider-specific).
- [ ] Parse + validate; populate step metadata; enforce `strict` policy.

### 4.5.4 API + SSE

- [ ] Extend final `/ stream` payloads with `parsed_output`, `output_validation` (when applicable).
- [ ] Error codes for strict validation failure (document in spec-api.md).

### 4.5.5 Client SDK

- [ ] Parse new fields; export types; update examples in README / docs.

### 4.5.6 Eval

- [ ] Worker or grader path: optional “use agent version schema” for `json_schema` grader.
- [ ] Phase 4 docs: one paragraph cross-link “Structured agent output (Phase 4.5)`.

---

## Testing

- **Unit**: JSON parse + schema validate (Ajv or zod-from-schema — align with existing evaluator).
- **Integration**: Deploy agent with `mode: "json"` + schema; run non-stream and stream; assert `parsed_output` and SSE final event.
- **Integration**: `strict: true` invalid output → `runs.status = failed` per spec.
- **Integration**: `strict: false` invalid output → `runs.status = completed`, `output_valid = false`, graders score accordingly.
- **Eval**: Dataset case graded with version default schema.

---

## Definition of Done

- Demo: Deploy agent with `output: { mode: "json", json_schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] }, strict: true }`. Call run from dashboard/SDK; see parsed object. Break the prompt to emit invalid JSON; see documented failure. Run eval with `json_schema` grader without duplicating schema on each case.

---

## Out of Scope (Defer)

- Incremental JSON repair / “best effort” partial object streaming (**Option B**).
- Multi-message structured output (only **final** assistant message in v1 unless spec expands).
- **Human-in-the-loop** retry on validation failure (Phase 8+ / approval flows).
- Automatic **schema migration** across agent versions (docs only: caller/breaking changes).

---

## Common Mistakes

| Mistake | Correct approach |
|---------|------------------|
| Validating partial stream | Validate only on **final** aggregated assistant text for `json` mode (unless Option B). |
| Schema only in eval | Schema lives on **agent version**; eval **inherits** or overrides per case. |
| `any` for parsed output | `unknown` + schema validation; SDK narrows with generic helper if needed. |

---

## References

- `docs/phase-4-brief.md` — Eval engine; graders `json_schema`
- `docs/spec-data-model.md` — `agent_versions`, `run_steps`
- `docs/spec-api.md` — Run + stream events
- `docs/spec-sdk.md` — `defineAgent`
- `docs/technology-decisions.md` — LLM providers, structured output availability
