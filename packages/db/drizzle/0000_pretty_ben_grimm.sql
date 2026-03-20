CREATE TYPE "public"."alert_condition_type" AS ENUM('error_rate', 'latency_p95', 'cost_per_run', 'run_failure_count');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('active', 'superseded', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."environment_type" AS ENUM('development', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."eval_experiment_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('alert_triggered', 'approval_requested', 'deploy_completed', 'eval_completed');--> statement-breakpoint
CREATE TYPE "public"."org_member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."org_plan" AS ENUM('free', 'pro', 'team', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('llm_call', 'tool_call', 'retrieval', 'guardrail', 'approval_request');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(63) NOT NULL,
	"external_auth_id" varchar(255) NOT NULL,
	"plan" "org_plan" DEFAULT 'free' NOT NULL,
	"billing_email" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"role" "org_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(63) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"model_spec" jsonb,
	"fallback_model" varchar(100),
	"tools_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guardrails_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_params" jsonb DEFAULT '{}'::jsonb,
	"description" text,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"name" "environment_type" NOT NULL,
	"tool_allow_list" jsonb,
	"tool_deny_list" jsonb,
	"require_approval_for_write_tools" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"version_id" varchar(30) NOT NULL,
	"environment_id" varchar(30) NOT NULL,
	"status" "deployment_status" DEFAULT 'active' NOT NULL,
	"deployed_by" varchar(255),
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"version_id" varchar(30),
	"session_id" varchar(30),
	"parent_run_id" varchar(30),
	"environment_id" varchar(30) NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"total_tokens_in" integer DEFAULT 0 NOT NULL,
	"total_tokens_out" integer DEFAULT 0 NOT NULL,
	"total_cost_usd" double precision DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"model" varchar(100),
	"temporal_workflow_id" varchar(255),
	"trace_id" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"run_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"step_order" integer NOT NULL,
	"type" "step_type" NOT NULL,
	"model" varchar(100),
	"tool_name" varchar(255),
	"input" text,
	"output" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"output_truncated" boolean DEFAULT false NOT NULL,
	"approval_status" "approval_status",
	"approval_resolved_by" varchar(255),
	"approval_resolved_at" timestamp with time zone,
	"approval_wait_started_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"session_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"run_id" varchar(30),
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_call_id" varchar(255),
	"tool_name" varchar(255),
	"message_order" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_datasets" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"case_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eval_dataset_cases" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"dataset_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"expected_tool_calls" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mocked_tool_results" jsonb DEFAULT '[]'::jsonb,
	"session_history" jsonb DEFAULT '[]'::jsonb,
	"expected_trajectory" jsonb DEFAULT '[]'::jsonb,
	"expected_approval_behavior" jsonb,
	"expected_citations" jsonb DEFAULT '[]'::jsonb,
	"expected_memory_writes" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"case_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_experiments" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"dataset_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"version_id" varchar(30) NOT NULL,
	"name" varchar(255),
	"status" "eval_experiment_status" DEFAULT 'queued' NOT NULL,
	"summary_scores" jsonb DEFAULT '{}'::jsonb,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"passed_cases" integer DEFAULT 0 NOT NULL,
	"failed_cases" integer DEFAULT 0 NOT NULL,
	"total_cost_usd" double precision DEFAULT 0 NOT NULL,
	"total_duration_ms" integer,
	"config" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"commit_sha" varchar(40),
	"pr_number" integer,
	"ci_run_url" varchar(500),
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_experiment_results" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"experiment_id" varchar(30) NOT NULL,
	"case_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"run_id" varchar(30),
	"output" text,
	"scores" jsonb DEFAULT '{}'::jsonb,
	"passed" boolean,
	"duration_ms" integer,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_baselines" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"dataset_id" varchar(30) NOT NULL,
	"experiment_id" varchar(30) NOT NULL,
	"version_id" varchar(30) NOT NULL,
	"summary_scores" jsonb NOT NULL,
	"per_case_scores" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"set_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"embedding_model" varchar(100) DEFAULT 'text-embedding-3-small' NOT NULL,
	"embedding_dimensions" integer DEFAULT 1536 NOT NULL,
	"chunk_size" integer DEFAULT 512 NOT NULL,
	"chunk_overlap" integer DEFAULT 64 NOT NULL,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"total_documents" integer DEFAULT 0 NOT NULL,
	"total_size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"knowledge_base_id" varchar(30) NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"document_name" varchar(1024) NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"tsv" "tsvector",
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding_model" varchar(100),
	"embedded_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_secrets" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"key" varchar(255) NOT NULL,
	"encrypted_value" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"environment" "environment_type" NOT NULL,
	"description" text,
	"last_rotated_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"events" jsonb NOT NULL,
	"secret_hash" varchar(64) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"completed_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"total_tokens_in" bigint DEFAULT 0 NOT NULL,
	"total_tokens_out" bigint DEFAULT 0 NOT NULL,
	"total_cost_usd" double precision DEFAULT 0 NOT NULL,
	"total_duration_ms" bigint DEFAULT 0 NOT NULL,
	"runs_by_model" jsonb DEFAULT '{}'::jsonb,
	"cost_by_model" jsonb DEFAULT '{}'::jsonb,
	"runs_by_agent" jsonb DEFAULT '{}'::jsonb,
	"cost_by_agent" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"icon_url" text,
	"category" text NOT NULL,
	"auth_type" text NOT NULL,
	"oauth_config" jsonb,
	"tools_manifest" jsonb NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"deprecated_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connectors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "connector_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"connector_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"org_id" text NOT NULL,
	"environment" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"account_label" text,
	"encrypted_access_token" text,
	"iv" text,
	"encrypted_refresh_token" text,
	"refresh_iv" text,
	"token_expires_at" timestamp,
	"last_used_at" timestamp,
	"last_refresh_at" timestamp,
	"refresh_failure_count" integer DEFAULT 0 NOT NULL,
	"disconnected_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"agent_id" varchar(30),
	"name" varchar(255) NOT NULL,
	"condition_type" "alert_condition_type" NOT NULL,
	"threshold" double precision NOT NULL,
	"window_minutes" integer DEFAULT 5 NOT NULL,
	"comparison_op" varchar(10) DEFAULT 'gt' NOT NULL,
	"notification_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"org_id" varchar(30) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"alert_rule_id" varchar(30),
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"resource_type" varchar(50),
	"resource_id" varchar(30),
	"channel" varchar(20) DEFAULT 'in_app' NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_version_id_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_version_id_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_dataset_cases" ADD CONSTRAINT "eval_dataset_cases_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_dataset_cases" ADD CONSTRAINT "eval_dataset_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiments" ADD CONSTRAINT "eval_experiments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiments" ADD CONSTRAINT "eval_experiments_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiments" ADD CONSTRAINT "eval_experiments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiments" ADD CONSTRAINT "eval_experiments_version_id_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiment_results" ADD CONSTRAINT "eval_experiment_results_experiment_id_eval_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."eval_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiment_results" ADD CONSTRAINT "eval_experiment_results_case_id_eval_dataset_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_dataset_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiment_results" ADD CONSTRAINT "eval_experiment_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_experiment_results" ADD CONSTRAINT "eval_experiment_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_baselines" ADD CONSTRAINT "eval_baselines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_baselines" ADD CONSTRAINT "eval_baselines_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_baselines" ADD CONSTRAINT "eval_baselines_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_baselines" ADD CONSTRAINT "eval_baselines_experiment_id_eval_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."eval_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_baselines" ADD CONSTRAINT "eval_baselines_version_id_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_external_auth_id_idx" ON "organizations" USING btree ("external_auth_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "organization_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "api_keys_org_id_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_slug_idx" ON "agents" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "agents_org_id_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_idx" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agent_versions_agent_id_idx" ON "agent_versions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_versions_org_id_idx" ON "agent_versions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_org_name_idx" ON "environments" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "deployments_active_lookup_idx" ON "deployments" USING btree ("agent_id","environment_id","status");--> statement-breakpoint
CREATE INDEX "deployments_org_id_idx" ON "deployments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deployments_agent_id_idx" ON "deployments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sessions_org_id_idx" ON "sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sessions_agent_id_idx" ON "sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sessions_created_at_idx" ON "sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_org_id_idx" ON "runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "runs_agent_id_idx" ON "runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "runs_session_id_idx" ON "runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "runs_parent_run_id_idx" ON "runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_trace_id_idx" ON "runs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "runs_agent_status_created_idx" ON "runs" USING btree ("agent_id","status","created_at");--> statement-breakpoint
CREATE INDEX "runs_org_created_idx" ON "runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_org_env_created_idx" ON "runs" USING btree ("org_id","environment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_steps_run_id_order_idx" ON "run_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX "run_steps_org_id_idx" ON "run_steps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "run_steps_type_idx" ON "run_steps" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_session_order_idx" ON "messages" USING btree ("session_id","message_order");--> statement-breakpoint
CREATE INDEX "messages_org_id_idx" ON "messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_run_id_idx" ON "messages" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_datasets_org_name_version_idx" ON "eval_datasets" USING btree ("org_id","name","version");--> statement-breakpoint
CREATE INDEX "eval_datasets_org_id_idx" ON "eval_datasets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "eval_dataset_cases_dataset_id_idx" ON "eval_dataset_cases" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "eval_dataset_cases_org_id_idx" ON "eval_dataset_cases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "eval_experiments_org_id_idx" ON "eval_experiments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "eval_experiments_dataset_id_idx" ON "eval_experiments" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "eval_experiments_agent_id_idx" ON "eval_experiments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "eval_experiments_version_id_idx" ON "eval_experiments" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "eval_experiments_created_at_idx" ON "eval_experiments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "eval_experiments_agent_dataset_created_idx" ON "eval_experiments" USING btree ("agent_id","dataset_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_experiment_results_experiment_id_idx" ON "eval_experiment_results" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "eval_experiment_results_case_id_idx" ON "eval_experiment_results" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "eval_experiment_results_org_id_idx" ON "eval_experiment_results" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_baselines_active_unique_idx" ON "eval_baselines" USING btree ("agent_id","dataset_id") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "eval_baselines_org_id_idx" ON "eval_baselines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_org_id_idx" ON "knowledge_bases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_agent_id_idx" ON "knowledge_bases" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_kb_id_idx" ON "knowledge_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_org_id_idx" ON "knowledge_chunks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_doc_hash_idx" ON "knowledge_chunks" USING btree ("document_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_secrets_org_key_env_idx" ON "tenant_secrets" USING btree ("org_id","key","environment");--> statement-breakpoint
CREATE INDEX "tenant_secrets_org_id_idx" ON "tenant_secrets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhooks_org_id_idx" ON "webhooks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_org_date_idx" ON "usage_daily" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "usage_daily_date_idx" ON "usage_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_conn_agent_connector_idx" ON "connector_connections" USING btree ("agent_id","connector_id","environment");--> statement-breakpoint
CREATE INDEX "connector_conn_org_idx" ON "connector_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "connector_conn_expires_idx" ON "connector_connections" USING btree ("token_expires_at");--> statement-breakpoint
CREATE INDEX "alert_rules_org_idx" ON "alert_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "alert_rules_agent_idx" ON "alert_rules" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "notifications_org_user_idx" ON "notifications" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");