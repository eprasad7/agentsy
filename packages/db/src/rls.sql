-- Row-Level Security Policies for Agentsy
-- Applied after initial migration

-- Create application roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agentsy_app') THEN
    CREATE ROLE agentsy_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agentsy_service') THEN
    CREATE ROLE agentsy_service NOLOGIN;
  END IF;
END $$;

-- Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_dataset_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_experiment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Note: connectors table has NO RLS (platform-wide catalog)

-- Organizations (soft delete)
CREATE POLICY organizations_tenant_policy ON organizations
  USING (id = current_setting('app.org_id', true) AND deleted_at IS NULL);

-- Standard org_id policies
CREATE POLICY org_members_tenant_policy ON organization_members
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY api_keys_tenant_policy ON api_keys
  USING (org_id = current_setting('app.org_id', true));

-- Agents (soft delete)
CREATE POLICY agents_tenant_policy ON agents
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);

CREATE POLICY agent_versions_tenant_policy ON agent_versions
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY environments_tenant_policy ON environments
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY deployments_tenant_policy ON deployments
  USING (org_id = current_setting('app.org_id', true));

-- Sessions (soft delete)
CREATE POLICY sessions_tenant_policy ON sessions
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);

CREATE POLICY runs_tenant_policy ON runs
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY run_steps_tenant_policy ON run_steps
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY messages_tenant_policy ON messages
  USING (org_id = current_setting('app.org_id', true));

-- Eval datasets (soft delete)
CREATE POLICY eval_datasets_tenant_policy ON eval_datasets
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);

CREATE POLICY eval_dataset_cases_tenant_policy ON eval_dataset_cases
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY eval_experiments_tenant_policy ON eval_experiments
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY eval_experiment_results_tenant_policy ON eval_experiment_results
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY eval_baselines_tenant_policy ON eval_baselines
  USING (org_id = current_setting('app.org_id', true));

-- Knowledge bases (soft delete)
CREATE POLICY knowledge_bases_tenant_policy ON knowledge_bases
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);

CREATE POLICY knowledge_chunks_tenant_policy ON knowledge_chunks
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY tenant_secrets_tenant_policy ON tenant_secrets
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY webhooks_tenant_policy ON webhooks
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY usage_daily_tenant_policy ON usage_daily
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY connector_connections_tenant_policy ON connector_connections
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY alert_rules_tenant_policy ON alert_rules
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY notifications_tenant_policy ON notifications
  USING (org_id = current_setting('app.org_id', true));

-- Service role bypasses RLS (for worker, migrations)
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
-- Grant service role bypass
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO agentsy_service;
-- ALTER ROLE agentsy_service SET row_security TO off;
