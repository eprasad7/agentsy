-- Post-schema: triggers + row-level security (applied after 0000 baseline).
-- Extensions: see 0000 (vector + pg_trgm). PostgreSQL 16+.

-- Shared update trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organization_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON environments FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON eval_datasets FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON eval_experiments FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON knowledge_bases FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_secrets FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usage_daily FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON connectors FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON connector_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint

CREATE OR REPLACE FUNCTION knowledge_chunks_tsv_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tsv := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER knowledge_chunks_tsv_update
  BEFORE INSERT OR UPDATE OF content ON knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION knowledge_chunks_tsv_trigger();--> statement-breakpoint

-- Row-Level Security
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agentsy_app') THEN
    CREATE ROLE agentsy_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agentsy_service') THEN
    CREATE ROLE agentsy_service NOLOGIN;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE run_steps ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eval_datasets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eval_dataset_cases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eval_experiments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eval_experiment_results ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eval_baselines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE connector_connections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY organizations_tenant_policy ON organizations
  USING (id = current_setting('app.org_id', true) AND deleted_at IS NULL);--> statement-breakpoint

CREATE POLICY org_members_tenant_policy ON organization_members
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY api_keys_tenant_policy ON api_keys
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY agents_tenant_policy ON agents
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);--> statement-breakpoint

CREATE POLICY agent_versions_tenant_policy ON agent_versions
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY environments_tenant_policy ON environments
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY deployments_tenant_policy ON deployments
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY sessions_tenant_policy ON sessions
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);--> statement-breakpoint

CREATE POLICY runs_tenant_policy ON runs
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY run_steps_tenant_policy ON run_steps
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY messages_tenant_policy ON messages
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY eval_datasets_tenant_policy ON eval_datasets
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);--> statement-breakpoint

CREATE POLICY eval_dataset_cases_tenant_policy ON eval_dataset_cases
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY eval_experiments_tenant_policy ON eval_experiments
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY eval_experiment_results_tenant_policy ON eval_experiment_results
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY eval_baselines_tenant_policy ON eval_baselines
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY knowledge_bases_tenant_policy ON knowledge_bases
  USING (org_id = current_setting('app.org_id', true) AND deleted_at IS NULL);--> statement-breakpoint

CREATE POLICY knowledge_chunks_tenant_policy ON knowledge_chunks
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY tenant_secrets_tenant_policy ON tenant_secrets
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY webhooks_tenant_policy ON webhooks
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY usage_daily_tenant_policy ON usage_daily
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY connector_connections_tenant_policy ON connector_connections
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY alert_rules_tenant_policy ON alert_rules
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

CREATE POLICY notifications_tenant_policy ON notifications
  USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
