import { compareExperiments } from './comparison.js';
import { defineDataset, loadDataset } from './dataset.js';
import { defineExperiment, runExperiment } from './experiment.js';

// ── Namespace export (per spec-sdk.md §8) ───────────────────────────

export const agentsyEval = {
  defineDataset,
  loadDataset,
  defineExperiment,
  run: runExperiment,
  compare: compareExperiments,
};

// ── Named exports ───────────────────────────────────────────────────

export { defineDataset, loadDataset } from './dataset.js';
export { defineExperiment, runExperiment } from './experiment.js';
export { compareExperiments } from './comparison.js';

// ── Graders ─────────────────────────────────────────────────────────

export {
  exactMatch,
  jsonSchemaGrader,
  regex,
  numericThreshold,
  embeddingSimilarity,
  cosineSimilarity,
  toolNameMatch,
  toolArgsMatch,
  llmJudge,
  toolSequence,
  unnecessarySteps,
} from './graders/index.js';

// ── Types ───────────────────────────────────────────────────────────

export type {
  DatasetDefinition,
  DatasetCase,
  ExperimentDefinition,
  ExperimentResult,
  CaseResult,
  ScoreResult,
  GraderDefinition,
  GraderFn,
  GraderContext,
  GraderType,
  ToolMode,
  ComparisonResult,
  CaseDiff,
  AgentRef,
  ExpectedToolCall,
  MockedToolResult,
  TrajectoryStep,
  ApprovalExpectation,
  MemoryExpectation,
} from './types.js';

export type {
  ExactMatchOptions,
  NumericThresholdOptions,
  EmbeddingSimilarityOptions,
  ToolNameMatchOptions,
  ToolSequenceOptions,
  LlmJudgeOptions,
} from './graders/index.js';
