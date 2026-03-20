# Agentsy Eval Engine Blueprint

Date: March 19, 2026

## 1. Why evals must be a first-class subsystem

For agents, eval is not just grading text.

It is grading:

- whether the task was completed
- whether the right tools were chosen
- whether the arguments were correct
- whether the trajectory made sense
- whether memory helped or polluted the run
- whether approvals fired when they should
- whether the agent stayed safe, cheap, and reliable

That means Agentsy should not treat evals as a dashboard feature. It should treat evals as a product subsystem with its own control plane, runtime, datasets, graders, human review loop, and release gates.

Core product thesis:

> If Agentsy is the operating system for agents, the eval engine is the operating system for trust.

## 2. What the March 2026 sources say

Primary-source takeaways:

- OpenAI explicitly recommends eval-driven development, logging everything, calibrating automated scoring with humans, and continuously evaluating as systems grow from single-turn to workflow, single-agent, and multi-agent architectures.
- OpenAI's agent guidance breaks agent evals into instruction following, functional correctness, tool selection, tool argument precision, and multi-agent handoff accuracy.
- OpenAI's graders now cover string checks, text similarity, score-model grading, Python execution, and multi-graders, with explicit support for grading tool-call outputs.
- Google Vertex AI now exposes agent-specific evaluation concepts directly: final response evaluation plus trajectory evaluation with exact match, in-order match, any-order match, precision, recall, single-tool-use, latency, and failure.
- Google also recommends adaptive rubrics, static rubrics, computation-based metrics, custom Python evaluators, production-log sampling, and synthetic data generation.
- Anthropic's evaluation tooling emphasizes prompt versions, test-case generation, side-by-side comparisons, and human quality grading on repeatable variable-driven scenarios.
- LangSmith shows a useful generic pattern for trace-linked evaluation: bind traces to dataset examples, attach evaluator results to those traces, and compare experiment sessions.
- OpenTelemetry now has semantic conventions for MCP spans, which means tool-level traces can be normalized instead of vendor-specific.

Inference from the sources:

- the eval engine should be trace-native
- the eval engine should support both final-answer and trajectory scoring
- the eval engine should blend deterministic metrics, LLM judges, and human review
- production traces should continuously feed new eval cases

## 3. What Agentsy must evaluate

Agentsy should evaluate seven layers.

### 3.1 Final outcome

Did the agent accomplish the user or business goal?

Examples:

- task success
- answer correctness
- groundedness
- reference match
- user-satisfaction proxy
- policy-compliant completion

### 3.2 Trajectory

Did the agent take a reasonable path?

Examples:

- exact trajectory match
- in-order match
- any-order match
- tool precision
- tool recall
- unnecessary step count
- loop rate
- dead-end rate
- retry count

### 3.3 Tool behavior

Did the agent choose and use tools correctly?

Examples:

- correct tool selected
- correct tool arguments
- argument normalization quality
- unnecessary write actions
- side-effect correctness
- tool timeout or error recovery quality

### 3.4 Retrieval and memory

Did the agent fetch the right information, and remember the right things?

Examples:

- context precision
- context recall
- citation support
- stale-memory rate
- memory pollution rate
- memory write quality
- memory scope violations

### 3.5 Multi-agent coordination

Did the system delegate well?

Examples:

- handoff accuracy
- handoff boundary correctness
- circular handoff rate
- sub-agent utilization quality
- redundant delegation rate
- manager-agent overhead

### 3.6 Safety and governance

Did the agent remain within policy?

Examples:

- jailbreak resistance
- prompt-injection resistance
- PII leak rate
- unsafe tool-call rate
- approval-trigger precision
- approval-trigger recall
- policy override attempts

### 3.7 Reliability, latency, and cost

Did the agent operate well enough for production?

Examples:

- latency
- failure rate
- timeout rate
- resume success rate
- token usage
- cost per successful task
- cache hit ratio
- tool spend per run

## 4. Design principles for the eval engine

### 4.1 Grade systems, not just responses

A final answer can look fine even when the system took an unsafe or wasteful path. Agentsy should always support both outcome grading and trace grading.

### 4.2 Observation comes before scoring

If traces are incomplete, evals will be weak. First normalize spans, tool calls, memory reads and writes, approvals, and outputs. Then score.

### 4.3 Human calibration is required

Automated graders are necessary but not sufficient. Every important evaluator should be calibrated against human annotations and checked for drift.

### 4.4 Datasets are products

Datasets should be versioned, stratified, and continuously improved. Production failures should turn into new eval cases quickly.

### 4.5 Reproducibility matters

Every experiment should pin:

- agent version
- prompt version
- model and model settings
- tool versions
- environment image
- dataset version
- grader version

### 4.6 Side effects need special handling

For write-capable agents, eval mode should support:

- mocks
- shadow execution
- dry-run tool mode
- sandbox tenants

## 5. Eval types Agentsy should support

### 5.1 Deterministic evaluators

Use for:

- exact string checks
- schema validation
- numeric thresholds
- regex or policy rules
- JSON field correctness
- tool name correctness
- latency and cost thresholds

Best for:

- cheap regression gates
- high confidence when the task is crisp

### 5.2 Semantic evaluators

Use for:

- semantic similarity
- argument equivalence
- retrieval overlap
- reference-guided answer similarity

Best for:

- open-ended outputs where exact match under-rewards good answers

### 5.3 LLM-as-a-judge evaluators

Use for:

- single-answer grading
- pairwise grading
- reference-guided grading
- rubric scoring
- trace quality grading

Best for:

- nuanced judgments that deterministic logic misses

Guardrails:

- prefer pairwise or pass/fail when possible
- calibrate against human labels
- watch for verbosity bias and position bias

### 5.4 Trace evaluators

Use for:

- tool precision and recall
- trajectory correctness
- handoff accuracy
- loop detection
- approval correctness
- memory read and write quality

This is where agent evals become meaningfully different from prompt evals.

### 5.5 Executable evaluators

Use for:

- SQL execution correctness
- code-task validation
- API side-effect verification in sandbox
- policy simulation

Best for:

- tasks where behavior can be executed and checked

### 5.6 Human evaluators

Use for:

- gold-label creation
- scorecard calibration
- release review on risky changes
- adjudication on grader disagreements

## 6. Dataset strategy

Agentsy should maintain six dataset classes.

### 6.1 Golden datasets

Small, curated, high-confidence examples used for release gating.

### 6.2 Regression datasets

Known failures that must never reappear.

### 6.3 Edge-case datasets

Hard prompts, ambiguous requests, long contexts, partial data, malformed tool outputs, and weird user phrasing.

### 6.4 Adversarial datasets

Prompt injection, jailbreaks, conflicting instructions, policy evasion, and unsafe action attempts.

### 6.5 Production-sampled datasets

Examples pulled from real traffic, ideally stratified by tenant, workflow, model, tool mix, and failure type.

### 6.6 Synthetic expansion datasets

Programmatically generated cases for breadth, not truth. These are useful for stress testing but should not replace human-curated gold sets.

Dataset rules:

- every dataset must be versioned
- examples should carry tags, risk levels, and scenario families
- train, tune, eval, and canary sets should stay separate
- every experiment should declare which dataset versions it used

## 7. Grader system design

Agentsy should expose a grader registry with built-in and custom graders.

### 7.1 Built-in grader families

- `exact_match`
- `json_schema`
- `numeric_threshold`
- `regex_policy`
- `semantic_similarity`
- `tool_name_match`
- `tool_args_match`
- `trajectory_exact_match`
- `trajectory_in_order_match`
- `trajectory_any_order_match`
- `trajectory_precision`
- `trajectory_recall`
- `single_tool_use`
- `latency_threshold`
- `cost_threshold`
- `judge_pointwise`
- `judge_pairwise`
- `judge_reference_guided`
- `python_custom`
- `consensus`

### 7.2 Common grader output contract

Every grader should return:

- normalized score in `0..1`
- optional pass or fail
- explanation
- evidence pointers
- confidence
- grader version

### 7.3 Grader evidence

Scores should link back to evidence, such as:

- final output
- tool call span IDs
- memory item IDs
- approval IDs
- retrieved chunk IDs
- reference example fields

Without evidence, debugging the score is too slow.

### 7.4 Example grader spec

```yaml
name: support-agent-release-gate
target: run
graders:
  - type: tool_name_match
    weight: 0.15
    input: trace.tool_calls[0].name
    reference: expected.first_tool
  - type: tool_args_match
    weight: 0.20
    input: trace.tool_calls[0].arguments
    reference: expected.first_tool_args
    mode: semantic
  - type: judge_reference_guided
    weight: 0.35
    rubric: answer_correctness_v3
    input: output.final_text
    reference: expected.answer
  - type: trajectory_precision
    weight: 0.10
  - type: trajectory_recall
    weight: 0.10
  - type: latency_threshold
    weight: 0.10
    pass_below_ms: 8000
pass_condition:
  min_weighted_score: 0.85
  required_graders:
    - judge_reference_guided
    - tool_args_match
```

## 8. Trace model requirements

The eval engine depends on a normalized trace model.

Each run should capture:

- run metadata
- agent version
- model calls
- prompts and settings
- tool calls and outputs
- memory reads and writes
- retrieved documents
- approvals and policy decisions
- artifacts
- retries and errors
- final result

Recommended span hierarchy:

1. Run
2. Agent step
3. Model call
4. Tool call
5. Memory read or write
6. Approval or policy check

Important requirement:

- MCP tool spans should preserve protocol metadata such as method name, session ID, and tool name so trajectory and reliability analysis can work across heterogeneous connectors.

## 9. Core architecture for the eval engine

Agentsy should add the following services or modules.

### 9.1 Eval control plane

Owns:

- datasets
- dataset versions
- rubrics
- graders
- eval suites
- experiments
- baselines
- release gates

### 9.2 Experiment runner

Runs offline evaluations at scale against pinned versions of agents and environments.

Responsibilities:

- shard dataset items
- invoke agents in eval mode
- collect normalized traces
- call graders
- aggregate scores
- store item-level evidence

### 9.3 Eval harness

The harness is the adapter between the run orchestrator and the eval engine.

It should support:

- dry-run tools
- mocked tools
- shadow tools
- sandboxed write tools
- deterministic seeds where possible

### 9.4 Grader runtime

Executes deterministic, model-based, and Python graders in isolated environments.

### 9.5 Annotation queue

Handles human review tasks, disagreement resolution, and rubric calibration.

### 9.6 Online monitor

Consumes production traces and runs:

- sampled online graders
- drift checks
- cost and latency anomaly checks
- safety monitors

### 9.7 Feedback synthesizer

Turns failures into action:

- new regression cases
- rubric updates
- prompt issues
- tool-schema issues
- memory-policy issues

## 10. Proposed data model

At minimum, add these primitives:

- `dataset`
- `dataset_version`
- `dataset_example`
- `rubric`
- `grader`
- `eval_suite`
- `experiment`
- `experiment_run`
- `experiment_item_run`
- `grader_result`
- `baseline`
- `release_gate`
- `annotation_task`
- `annotation_label`
- `online_monitor`
- `online_alert`
- `failure_cluster`

High-value example fields:

- scenario family
- tenant or domain tags
- risk level
- expected tool set
- expected trajectory
- reference answer
- expected citations
- expected memory behavior
- expected approval behavior

## 11. Experiment workflow

Recommended offline eval lifecycle:

1. Select agent version, environment image, and eval suite
2. Resolve dataset versions and grader versions
3. Run each example through the agent in eval mode
4. Capture normalized traces
5. Score final output and trajectory
6. Aggregate by suite, scenario family, risk class, and tenant slice
7. Compare against baseline
8. Mark release gate as pass, soft fail, or hard fail
9. Queue low-confidence or disagreement cases for human review
10. Convert confirmed failures into regression examples

## 12. Online evaluation workflow

Recommended production loop:

1. Sample production traces continuously
2. Attach lightweight online graders
3. Detect metric regressions and drift
4. Cluster failures by cause
5. Send important cases to annotation queue
6. Promote validated cases into dataset versions
7. Re-run offline suites before the next rollout

This loop is what turns evals into a flywheel instead of a report.

## 13. Metrics that should exist on day one

Even the first serious version of Agentsy should expose:

- task success rate
- final answer score
- tool selection accuracy
- tool argument accuracy
- trajectory precision
- trajectory recall
- latency p50, p95, p99
- failure rate
- cost per successful run
- approval trigger precision
- approval trigger recall
- citation support rate
- safety violation rate

## 14. Product incorporation into Agentsy

The eval engine should show up across the product, not as an isolated admin screen.

### 14.1 Agent builder

Each agent should have:

- linked eval suites
- baseline selection
- release gate policy
- canary evaluation policy

### 14.2 Run viewer

Each run should show:

- trace
- grader results
- failed checks
- evidence links
- comparison against expected behavior when applicable

### 14.3 Dataset workspace

Users should be able to:

- create datasets from scratch
- import CSV or JSONL
- pull examples from production traces
- tag, filter, and version examples
- mark examples as gold, regression, edge, or adversarial

### 14.4 Experiment UI

Users should be able to:

- compare agent versions
- compare prompt versions
- compare model providers
- compare tool configurations
- inspect failures at item level

### 14.5 Annotation UI

Users should be able to:

- label outputs
- compare pairwise outputs
- adjudicate grader disagreements
- promote reviewed failures into regression sets

### 14.6 Deployment pipeline

Deployments should support:

- required eval gates before promotion
- canary releases with online monitors
- rollback triggers on quality or safety regressions

## 15. Release gate strategy

Agentsy should support three gate modes.

### 15.1 Hard gate

Block release if critical metrics regress or safety checks fail.

### 15.2 Soft gate

Allow release with warning, but require acknowledgment.

### 15.3 Canary gate

Ship to a small percentage of traffic and continue online evaluation before full promotion.

Example policy:

```yaml
release_gate:
  hard_fail:
    - metric: safety_violation_rate
      op: ">"
      value: 0.01
    - metric: approval_trigger_recall
      op: "<"
      value: 0.98
  regression_budget:
    - metric: task_success_rate
      max_drop: 0.02
    - metric: tool_argument_accuracy
      max_drop: 0.01
  canary:
    traffic_percent: 5
    min_runs: 500
    rollback_if:
      - metric: p95_latency_ms
        op: ">"
        value: 12000
      - metric: failure_rate
        op: ">"
        value: 0.03
```

## 16. Where this fits in the broader Agent OS

The eval engine should connect directly to:

- `control-plane` for versions, policies, and deployments
- `run-orchestrator` for eval-mode execution
- `model-gateway` for provider-normalized scoring and cost data
- `tool-gateway` for tool traces and dry-run modes
- `memory-service` for retrieval and memory-quality grading
- `policy-service` for safety and approval checks
- `artifact-service` for evidence blobs
- `trace-eval-service` or successor service for trace storage and replay

Recommendation:

- keep eval definitions in the control plane
- keep eval execution near the run orchestrator
- keep trace storage and replay tightly integrated with scoring

## 17. Build order I would use

### Milestone A: Foundation

- normalized trace schema
- dataset registry and versioning
- deterministic graders
- experiment runner
- baseline comparison
- run-level report UI

### Milestone B: Agent-native evaluation

- trajectory graders
- tool argument semantic graders
- LLM-judge graders
- annotation queue
- production trace sampling
- release gates

### Milestone C: Production flywheel

- online monitors
- failure clustering
- automated regression-case generation
- tenant and workflow slicing
- canary gating and rollback automation

### Milestone D: Enterprise depth

- cross-tenant policy benchmarking
- private eval environments
- domain-specific evaluator packs
- advanced audit exports

## 18. The most important product decision

Agentsy should evaluate the full agent stack, not only the model's final answer.

If you only grade the answer:

- you miss unsafe tool usage
- you miss wasted latency and cost
- you miss broken handoffs
- you miss memory corruption
- you miss approval failures

That would make the platform look accurate while behaving unsafely underneath.

## 19. Immediate implementation move for this repo

Because the repo is still greenfield, the highest-leverage next step is:

1. Add eval primitives to the core schema
2. Make every run trace-normalized
3. Build an experiment runner on top of the same run orchestrator as production
4. Start with deterministic plus trajectory graders
5. Add human annotation before scaling LLM-judge usage
6. Put release gates in front of deployment promotion

That gives Agentsy an actual quality flywheel from the start.

## 20. Source notes

Primary sources used:

- OpenAI Agent evals: [developers.openai.com/api/docs/guides/agent-evals](https://developers.openai.com/api/docs/guides/agent-evals)
- OpenAI Trace grading: [developers.openai.com/api/docs/guides/trace-grading](https://developers.openai.com/api/docs/guides/trace-grading)
- OpenAI Working with evals: [developers.openai.com/api/docs/guides/evals](https://developers.openai.com/api/docs/guides/evals)
- OpenAI Evaluation best practices: [developers.openai.com/api/docs/guides/evaluation-best-practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- OpenAI Graders: [developers.openai.com/api/docs/guides/graders](https://developers.openai.com/api/docs/guides/graders)
- Anthropic Define success and build evaluations: [platform.claude.com/docs/en/test-and-evaluate/define-success](https://platform.claude.com/docs/en/test-and-evaluate/define-success)
- Anthropic Evaluation Tool: [platform.claude.com/docs/en/test-and-evaluate/eval-tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool)
- Google Vertex AI evaluation overview: [docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview)
- Google Vertex AI agent evaluation: [docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents)
- LangSmith evaluate with OpenTelemetry: [docs.langchain.com/langsmith/evaluate-with-opentelemetry](https://docs.langchain.com/langsmith/evaluate-with-opentelemetry)
- OpenTelemetry semantic conventions for MCP: [opentelemetry.io/docs/specs/semconv/gen-ai/mcp](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp)

Important inferences from the sources:

- final-answer grading alone is insufficient for agents
- trajectory grading should be built in from the start
- production traces should feed dataset growth
- human calibration remains necessary even with strong model judges
