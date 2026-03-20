# Phase 4.5: Agent Response Contract — Implementation Brief

**Goal**: Agent versions declare a **versioned output contract** (`text` vs `json`), optional **JSON Schema**, **strict** validation policy, and **documented streaming semantics** so production runs, SDKs, evals, and API consumers agree on the shape of the assistant message.
**Duration**: 3–5 days (thin slice; see Out of Scope for deferrals)
**Dependencies**: Phase 2 complete (agent runtime, deploy produces `agent_versions`), Phase 3 complete (run + stream surfaces, client SDK)
**Journeys**: J3 (local dev parity), J4 (eval cases can target structured output), J7 (API/SDK integration)

---

## Why This Phase Exists

Phase 4 ships trace-native evals and graders including `json_schema` for **expected** outputs. Without a **first-class response contract** on the agent itself, “structured output” is implicit (prompt-only), streaming behavior for JSON is undefined, and evals/CI cannot reliably assert the same contract the runtime promises.

Phase 4.5 makes **`output` / `responseFormat`** part of **immutable `agent_versions`** (and SDK `defineAgent`), aligns **worker** behavior and **persisted run steps**, and gives **client SDK + API** typed `RunOutput` metadata (`outputMode`, validation errors, raw vs parsed).

---

## What Gets Built (Thin Slice)

By the end of Phase 4.5:

1. **Agent config**: `defineAgent({ output: ResponseOutputConfig })` (exact export names follow `spec-sdk.md` / code — may be `responseFormat` alias for API snake_case).
2. **Persistence**: `agent_versions` (or nested JSONB already present) stores `output_config` with:
   - `mode`: `"text" | "json"`
   - `json_schema?: JSONSchema7` (subset or full per tech decision)
   - `strict: boolean` — when `true`, invalid JSON or schema violation **fails the step** (or whole run per policy table below)
3. **Runtime (worker)**:
   - For `mode: "json"`: request model output suitable for JSON (provider params as needed: e.g. Anthropic structured output / JSON mode where available; fall back to prompt contract + parse).
   - **Parse** final assistant text → `unknown`; validate against schema when provided.
   - Emit **structured validation** result on the final message step (success | error with path/message).
4. **SSE / API**: Document and implement **streaming rules** for JSON mode (see Streaming Semantics); non-streaming path returns parsed object in run result when successful.
5. **SDK**: `RunResult` / stream events expose `outputMode`, optional `parsedOutput`, optional `outputValidationError` (typed).
6. **Eval**: Eval cases can omit explicit expected JSON when agent version defines schema; **`json_schema` grader** can default to **version schema** when case doesn’t override. Document in Phase 4 brief cross-link.

---

## ResponseOutputConfig (Contract)

| Field | Type | Description |
|--------|------|-------------|
| `mode` | `"text" \| "json"` | Default `text`. |
| `json_schema` | JSON Schema (object) | Optional; if `mode === "json"` and omitted, only “valid JSON” is required. |
| `strict` If `true`, failed parse or schema validation → **terminal failure** for the run (or last step only — pick one in spec; **recommend: fail run** for predictability in CI). If `false`, persist raw text + validation error; status `completed` with `output_valid: false` **or** `degraded` — **must be enumerated in API spec**. |
| `schema_version` | optional string | For forward compatibility; default `"1"`. |

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

- **`agent_versions`**: Add `output_config jsonb` (or extend existing blob) with Zod validation at API boundary.
- **`runs` / `run_steps`**: Ensure final assistant step stores `content` (raw), optional `parsed_output jsonb`, `output_validation jsonb` (`{ ok: boolean, errors?: ... }`).
- **Migrations**: One Drizzle migration + RLS unchanged (same `org_id`).

---

## Architecture

```
SDK defineAgent.output  →  deploy  →  agent_versions.output_config
                                           ↓
Run request (stream/non-stream)  →  AgentRunWorkflow
                                           ↓
Final LLM message  →  parse JSON (if json mode)  →  validate schema
                                           ↓
run_steps + runs metadata  →  SSE events  →  @agentsy/client RunResult
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
- **Integration**: `strict: true` invalid output → HTTP/status and run `status` per spec.
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
