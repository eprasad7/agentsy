# Phase 4: Eval Engine — Implementation Brief

**Goal**: Developers can define eval datasets, run experiments against agents, grade results with 10 built-in graders, compare against baselines, and detect regressions in CI/CD.
**Duration**: 5–7 days
**Dependencies**: Phase 2 complete (agent runtime), Phase 3 complete (client SDK, sessions)
**Journeys**: J4 (Write & Run Evals), J11 (LLM-as-Judge Evals), J12 (Add Failing Run to Eval Dataset), J15 (CI/CD Integration)

---

## What Gets Built

By the end of Phase 4, a developer can:
1. Define eval datasets in TypeScript with `agentsyEval.defineDataset()`
2. Upload dataset cases (JSON) via API or CLI
3. Run experiments: agent vs dataset, graded by configurable graders
4. Use 10 built-in graders: 4 deterministic, 3 semantic, 1 LLM-as-judge, 2 trajectory
5. Compare experiments side-by-side with score deltas per case
6. Set baselines and detect regressions automatically
7. Convert production run traces into eval test cases (one-click)
8. Run `agentsy eval run --ci` in GitHub Actions with exit code 1 on regression

---

## Architecture

```
                     Eval Execution Pipeline
                     =======================

agentsy eval run                  POST /v1/eval/experiments
     │                                     │
     ▼                                     ▼
  @agentsy/eval                       Fastify API
  (local or remote)                        │
     │                                     ▼
     ▼                              Temporal Workflow
  AgentRunWorkflow                  (EvalExperimentWorkflow)
  per case (parallelism=5)                 │
     │                              ┌──────┼──────┐
     ▼                              ▼      ▼      ▼
  LLM Call                    Case 1  Case 2  Case N
  (mock/dry-run/live tools)        │      │      │
     │                              ▼      ▼      ▼
     ▼                         AgentRunWorkflow per case
  Graders                     (with tool mocking)
  (deterministic, semantic,        │
   LLM-as-judge, trajectory)       ▼
     │                         Grading Activity
     ▼                         (score each case)
  ExperimentResult                  │
  (summary + per-case scores)      ▼
     │                         Persist to DB
     ▼                         (eval_experiment_results)
  Compare vs Baseline
  (detect regressions)
```

---

## Steps

### 4.1 — Dataset CRUD API

**Ref**: spec-api.md section 7.1–7.10, spec-data-model.md tables eval_datasets + eval_dataset_cases

```
apps/api/src/routes/
  eval-datasets.ts    → POST /v1/eval/datasets (create)
                         GET /v1/eval/datasets (list, paginated)
                         GET /v1/eval/datasets/:dataset_id
                         DELETE /v1/eval/datasets/:dataset_id (soft delete)
  eval-cases.ts       → POST /v1/eval/datasets/:dataset_id/cases (create case)
                         POST /v1/eval/datasets/:dataset_id/cases/bulk (bulk upload JSON array)
                         GET /v1/eval/datasets/:dataset_id/cases (list, paginated)
                         GET /v1/eval/datasets/:dataset_id/cases/:case_id
                         PATCH /v1/eval/datasets/:dataset_id/cases/:case_id
                         DELETE /v1/eval/datasets/:dataset_id/cases/:case_id
```

**Create dataset** flow:
1. Validate: `{ name, description? }` — name unique per org (with version)
2. Create `eval_datasets` row with `newId("eds")`, version=1, case_count=0
3. Return dataset object

**Create case** fields (from spec-data-model.md):
```typescript
{
  input: string | RunInput;                    // Required
  expected_output?: string | RunOutput;        // For exact_match, embedding_similarity
  expected_tool_calls?: ExpectedToolCall[];    // For tool_name_match, tool_args_match
  expected_trajectory?: TrajectoryStep[];      // For tool_sequence, unnecessary_steps
  expected_approval_behavior?: ApprovalExpectation;
  mocked_tool_results?: MockedToolResult[];    // Mock tools for deterministic evals
  session_history?: Array<{ role: string; content: string }>;  // Multi-turn context
  metadata?: Record<string, unknown>;
  tags?: string[];
}
```

**Bulk upload**: Accept JSON array of cases in a single request. Atomically create all cases, increment `case_count`.

**Done when**: Create dataset → upload 10 cases → list cases → get individual case → update case → delete case. Bulk upload works.

---

### 4.2 — `@agentsy/eval` SDK

**Ref**: spec-sdk.md section 8

```
packages/eval/src/
  types.ts            → DatasetDefinition, DatasetCase, ExperimentDefinition,
                         ExperimentResult, CaseResult, ScoreResult, GraderDefinition,
                         GraderFn, GraderContext, ToolMode, ComparisonResult
  dataset.ts          → defineDataset(), loadDataset() from JSON file
  experiment.ts       → defineExperiment(), runExperiment() orchestration
  comparison.ts       → compareExperiments() with score deltas
  index.ts            → Barrel export with agentsyEval namespace
```

**Core API**:
```typescript
const agentsyEval = {
  defineDataset(def: DatasetDefinition): Readonly<DatasetDefinition>;
  defineExperiment(def: ExperimentDefinition): Readonly<ExperimentDefinition>;
  run(experiment: ExperimentDefinition): Promise<ExperimentResult>;
  compare(baseline: ExperimentResult, candidate: ExperimentResult): ComparisonResult;
};
```

**ExperimentDefinition**:
```typescript
interface ExperimentDefinition {
  name?: string;
  agent: AgentConfig;                      // from @agentsy/sdk
  dataset: DatasetDefinition | string;     // inline or name reference
  graders: GraderDefinition[];             // at least 1
  toolMode?: "mock" | "dry-run" | "live";  // default: "mock"
  parallelism?: number;                    // default: 5
  judgeModel?: ModelIdentifier;            // for llm_judge grader
}
```

**Done when**: `agentsyEval.defineDataset()` validates and returns frozen config. `agentsyEval.run()` executes experiment and returns results.

---

### 4.3 — Deterministic Graders (4 graders)

Zero-cost, pure-function graders.

```
packages/eval/src/graders/
  exact-match.ts        → String comparison (case-sensitive, trim, normalize options)
  json-schema.ts        → Validate output against JSON Schema
  regex.ts              → Match output against regex pattern
  numeric-threshold.ts  → Extract number from output, compare with operator + threshold
  index.ts              → Grader registry
```

**Factory functions**:
```typescript
exactMatch(opts?: { caseSensitive?: boolean; trim?: boolean }): GraderDefinition
jsonSchemaGrader(schema: Record<string, unknown>): GraderDefinition
regex(pattern: string | RegExp): GraderDefinition
numericThreshold(opts: { operator: ">" | ">=" | "<" | "<=" | "=="; value: number; extractPattern?: string }): GraderDefinition
```

Each returns `ScoreResult` with `score` (0.0 or 1.0 for binary, or continuous), `name`, `graderType`.

**Done when**: All 4 graders pass unit tests with edge cases.

---

### 4.4 — Semantic Graders (3 graders)

Cost: 2 embedding API calls per case for similarity; zero for tool matchers.

```
packages/eval/src/graders/
  embedding-similarity.ts → Cosine similarity between output and expected (OpenAI text-embedding-3-small)
  tool-name-match.ts      → Check agent called expected tools (set comparison)
  tool-args-match.ts      → Check tool arguments match expected (partial match)
```

**Embedding similarity**: Call OpenAI embeddings API for actual output + expected output, compute cosine similarity. Score = similarity value. Configurable threshold (default: 0.8) — above = 1.0, below = similarity/threshold.

**Tool name match**: Compare actual tool call names against `expectedToolCalls[].name`. Score = intersection / expected count. Strict mode requires exact set match.

**Tool args match**: For each expected tool call, find matching actual call by name, then deep-compare arguments. Partial match: expected keys must be present, extra keys ignored.

**Done when**: Embedding similarity scores high for semantically similar outputs. Tool matchers correctly identify present/missing tool calls.

---

### 4.5 — LLM-as-Judge Grader

Cost: 1 LLM call per case (configurable model, default claude-sonnet-4).

```
packages/eval/src/graders/
  llm-judge.ts          → Pointwise scoring with configurable rubric
```

**Factory**:
```typescript
llmJudge(opts: {
  rubric: string;                          // Scoring criteria
  scale?: string;                          // e.g., "0.0 = wrong, 1.0 = perfect"
  includeInput?: boolean;                  // default: true
  includeExpectedOutput?: boolean;         // default: true
  promptTemplate?: string;                 // custom template with {{input}}, {{output}}, {{rubric}}
}): GraderDefinition
```

**Default prompt template**:
```
You are an expert evaluator. Score the following agent response on a scale of 0.0 to 1.0.

Rubric: {{rubric}}
Scale: {{scale}}

Input: {{input}}
{{#if expected_output}}Expected output: {{expected_output}}{{/if}}
Agent output: {{output}}

Respond with ONLY a JSON object: { "score": <number>, "reasoning": "<explanation>" }
```

Parse JSON from LLM response. Extract score + reasoning.

**Done when**: LLM judge assigns reasonable scores with justification. Custom rubrics produce different scoring patterns.

---

### 4.6 — Trajectory Graders (2 graders)

Zero-cost, analyze run step traces.

```
packages/eval/src/graders/
  tool-sequence.ts       → Compare actual tool call order against expected_trajectory
  unnecessary-steps.ts   → Flag steps not in expected_trajectory
```

**Tool sequence**: Compare ordered list of actual tool calls against `expectedTrajectory`. Score = longest common subsequence length / expected length. `allowExtraCalls` option (default true) ignores extra calls between expected ones.

**Unnecessary steps**: Count steps that don't appear in `expectedTrajectory`. Score = 1.0 - (unnecessary / total). A score of 1.0 means the agent took only necessary steps.

**Done when**: Trajectory graders correctly score ordered and unordered tool sequences.

---

### 4.7 — EvalExperimentWorkflow (Temporal)

**Ref**: architecture-v1.md section 3.5

```
apps/worker/src/
  workflows/
    eval-experiment.ts    → Parent workflow: fan-out cases, grade, aggregate
  activities/
    grading.ts            → Run all configured graders for one case result
    tool-mocking.ts       → Intercept tool calls with mocked results from dataset case
```

**EvalExperimentWorkflow** pseudocode:
```
input: { experimentId, datasetId, agentId, versionId, config }

1. Mark experiment as "running"
2. Load all cases from dataset
3. For each case (parallelism controlled):
     a. Build run input from case.input + case.session_history
     b. If toolMode == "mock": inject mocked_tool_results into tool execution
     c. Start child AgentRunWorkflow with case input
     d. When run completes: extract output + steps
     e. Run grading activity: apply all graders, get ScoreResult[]
     f. Persist eval_experiment_result row
4. Aggregate: compute summary_scores (avg per grader), passed/failed counts
5. Mark experiment as "completed" with summary
```

**Tool mocking** (`tool-mocking.ts`):
- Activity that wraps tool execution
- If `mockedToolResults` contains a match for the tool call (by name + optional args), return the mocked result instead of executing
- If no mock found: behavior depends on `toolMode`:
  - `"mock"`: return `{ error: "No mock configured for tool: {name}" }`
  - `"dry-run"`: return `{ skipped: true, tool: name, args: ... }`
  - `"live"`: execute the real tool

**Done when**: Experiment workflow runs 5 cases in parallel, grades each, produces summary with per-grader averages.

---

### 4.8 — Experiment Comparison & Baseline Tracking

**Ref**: spec-api.md section 7.13–7.16

```
apps/api/src/routes/
  eval-experiments.ts   → POST /v1/eval/experiments (start experiment, returns 202)
                           GET /v1/eval/experiments (list, paginated with filters)
                           GET /v1/eval/experiments/:id
                           GET /v1/eval/experiments/:id/results (per-case results)
                           GET /v1/eval/experiments/compare?experiment_a=...&experiment_b=...
  eval-baselines.ts     → POST /v1/eval/baselines (set baseline from experiment)
                           GET /v1/eval/baselines/active?agent_id=...&dataset_id=...
```

**Comparison logic**:
1. Load both experiments + their per-case results
2. Match cases by `case_id`
3. For each matched case: compute score delta per grader
4. Classify as improved (delta > 0.05), regressed (delta < -0.05), or unchanged
5. Return summary deltas + per-case diffs

**Set baseline**:
1. Accept `{ experiment_id }`
2. Deactivate any existing active baseline for this agent+dataset pair
3. Create new `eval_baselines` row with `is_active: true`
4. Copy summary_scores and per_case_scores from experiment results

**Auto-compare**: When a new experiment completes, if an active baseline exists for the same agent+dataset, auto-compare and include regression count in the experiment metadata.

**Done when**: Compare two experiments → see per-case score deltas. Set baseline → new experiments auto-compared.

---

### 4.9 — Create Eval Case from Run Trace

**Ref**: spec-api.md section 7.17, user-journeys.md J12

```
apps/api/src/routes/
  eval-cases.ts         → POST /v1/eval/datasets/:dataset_id/cases/from-run
```

**Flow**:
1. Accept `{ run_id, expected_output?, expected_tool_calls? }`
2. Load run + run_steps from DB
3. Extract:
   - `input` from `runs.input`
   - `expected_output` from `runs.output` (or override)
   - `expected_tool_calls` from tool_call steps (names + args)
   - `mocked_tool_results` from tool_call steps (name + args + result)
4. Create `eval_dataset_cases` row
5. Increment dataset `case_count`
6. Return the created case

**Done when**: Click bad run → add to eval dataset → case appears with correct input, expected output, and mocked tool results pre-populated.

---

### 4.10 — CLI: `agentsy eval run` and `agentsy eval compare`

**Ref**: spec-sdk.md section 9.5–9.6

```
packages/cli/src/
  commands/
    eval-run.ts           → agentsy eval run [--dataset name] [--ci] [--format table|json|markdown]
    eval-compare.ts       → agentsy eval compare <baseline-id> <candidate-id>
  formatters/
    eval-report.ts        → Terminal table, JSON, and markdown output formatters
```

**`agentsy eval run`**:
1. Load agent config from `agentsy.config.ts`
2. Load dataset (from local JSON file or API)
3. Run experiment locally (in-process) or remotely (`--remote`)
4. Display results in table format
5. If `--ci`: compare against baseline, exit code 1 if regression > threshold
6. If `--format markdown`: output GitHub PR comment format

**Terminal output**:
```
┌─────────────┬────────────┬────────────┬────────────┐
│ Case        │ exact_match│ llm_judge  │ tool_match │
├─────────────┼────────────┼────────────┼────────────┤
│ Case 1      │ ✓ 1.00     │ ✓ 0.95     │ ✓ 1.00     │
│ Case 2      │ ✗ 0.00     │ ✓ 0.80     │ ✓ 1.00     │
│ Case 3      │ ✓ 1.00     │ ✓ 0.90     │ ✗ 0.50     │
├─────────────┼────────────┼────────────┼────────────┤
│ Average     │ 0.67       │ 0.88       │ 0.83       │
└─────────────┴────────────┴────────────┴────────────┘
4/5 cases passed | $0.034 total cost | 12.3s
```

**Done when**: `agentsy eval run --dataset golden` runs locally and prints results. `--ci` exits with code 1 on regression. `--format markdown` outputs PR comment.

---

### 4.11 — Dashboard UI: Eval Pages

**Ref**: Phase 3.5 pattern (tabs on agent detail page)

```
apps/web/src/app/
  evals/
    page.tsx              → Experiment list (all agents)
  agents/[id]/
    evals/page.tsx        → Agent-scoped experiment list
    evals/[expId]/page.tsx → Experiment detail with per-case results

apps/web/src/components/
  eval-results-table.tsx  → Per-case score grid (cases × graders)
  eval-comparison.tsx     → Side-by-side experiment comparison
  score-badge.tsx         → Color-coded score display (green/yellow/red)
```

**Experiment list**: DataTable with Status, Dataset, Version, Scores summary, Cost, Duration, Created.

**Experiment detail**: Header with summary scores + pass/fail counts. Below: per-case results table with expandable case details (input, expected vs actual output, per-grader scores).

**Comparison view**: Two experiments side-by-side with score deltas highlighted (green = improved, red = regressed).

**Done when**: Enable the "Evals" tab on agent detail. List experiments → click → view per-case results with scores.

---

## Tests

| Type | File | What |
|------|------|------|
| Unit | `packages/eval/src/__tests__/exact-match.test.ts` | Case sensitivity, trim, normalize |
| Unit | `packages/eval/src/__tests__/json-schema.test.ts` | Valid/invalid JSON, schema validation |
| Unit | `packages/eval/src/__tests__/regex.test.ts` | Pattern matching, flags |
| Unit | `packages/eval/src/__tests__/numeric-threshold.test.ts` | All operators, extraction |
| Unit | `packages/eval/src/__tests__/tool-name-match.test.ts` | Set comparison, strict mode |
| Unit | `packages/eval/src/__tests__/tool-sequence.test.ts` | LCS scoring, extra calls |
| Unit | `packages/eval/src/__tests__/unnecessary-steps.test.ts` | Step counting |
| Integration | `apps/api/src/__tests__/eval-datasets.test.ts` | Dataset CRUD, bulk case upload |
| Integration | `apps/api/src/__tests__/eval-experiments.test.ts` | Experiment start, results, comparison, baselines |
| Integration | `apps/api/src/__tests__/eval-from-run.test.ts` | Run trace → eval case conversion |
| Integration | `apps/worker/src/__tests__/eval-experiment-workflow.test.ts` | Full experiment with mocked LLM |

---

## Acceptance Criteria

| Check | Evidence |
|-------|----------|
| Dataset CRUD | Create dataset → upload cases → list → get → update → delete |
| Bulk upload | Upload 10 cases in one request → case_count = 10 |
| Deterministic graders | exact_match, json_schema, regex, numeric_threshold all score correctly |
| Semantic graders | embedding_similarity, tool_name_match, tool_args_match work |
| LLM-as-judge | Custom rubric → score with reasoning |
| Trajectory graders | tool_sequence, unnecessary_steps analyze run traces |
| Run experiment | Start experiment → poll → see completed with per-case scores |
| Tool mocking | Mock mode returns mocked results, no real tool execution |
| Comparison | Compare two experiments → see per-case deltas, regressions flagged |
| Baseline | Set baseline → new experiment auto-compared |
| Run-to-case | Convert run trace to eval case with pre-populated mocks |
| CLI eval run | `agentsy eval run --dataset golden` prints score table |
| CI mode | `agentsy eval run --ci` exits 1 on regression |
| Dashboard | Experiment list + detail + comparison views render |
| CI passes | `turbo build && turbo lint && turbo typecheck && turbo test` |

---

## What NOT To Do in Phase 4

- Do not implement knowledge base / RAG (Phase 5)
- Do not implement MCP streamable-http transport (Phase 6)
- Do not implement connector catalog (Phase 6b)
- Do not implement deployment management (Phase 7)
- Do not implement auto-evolution engine (Phase 12 — post-beta)
- Do not implement custom grader server/plugins (post-beta)
- Do not optimize embedding calls (batch in Phase 5 with KB embeddings)
