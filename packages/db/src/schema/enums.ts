import { pgEnum } from 'drizzle-orm/pg-core';

export const orgPlanEnum = pgEnum('org_plan', ['free', 'pro', 'team', 'enterprise']);

export const orgMemberRoleEnum = pgEnum('org_member_role', ['admin', 'member']);

export const environmentTypeEnum = pgEnum('environment_type', [
  'development',
  'staging',
  'production',
]);

export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

export const stepTypeEnum = pgEnum('step_type', [
  'llm_call',
  'tool_call',
  'retrieval',
  'guardrail',
  'approval_request',
]);

export const messageRoleEnum = pgEnum('message_role', ['system', 'user', 'assistant', 'tool']);

export const evalExperimentStatusEnum = pgEnum('eval_experiment_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'active',
  'superseded',
  'rolled_back',
]);

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'denied']);

export const alertConditionTypeEnum = pgEnum('alert_condition_type', [
  'error_rate',
  'latency_p95',
  'cost_per_run',
  'run_failure_count',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'alert_triggered',
  'approval_requested',
  'deploy_completed',
  'eval_completed',
]);
