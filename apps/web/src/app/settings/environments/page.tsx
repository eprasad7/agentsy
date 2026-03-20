"use client";

import { useEffect, useState } from "react";
import { apiClient, type Environment, ApiClientError } from "@/lib/api";
import { ChevronDown, ChevronRight, Save, Globe } from "lucide-react";

function EnvironmentCard({
  env,
  onSave,
}: {
  env: Environment;
  onSave: (id: string, data: Partial<Environment>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [allowList, setAllowList] = useState(env.tool_allow_list?.join(", ") ?? "");
  const [denyList, setDenyList] = useState(env.tool_deny_list?.join(", ") ?? "");
  const [requireApproval, setRequireApproval] = useState(env.require_approval_for_write_tools);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const parsedAllow = allowList.trim() ? allowList.split(",").map((s) => s.trim()) : null;
      const parsedDeny = denyList.trim() ? denyList.split(",").map((s) => s.trim()) : null;
      await onSave(env.id, {
        tool_allow_list: parsedAllow,
        tool_deny_list: parsedDeny,
        require_approval_for_write_tools: requireApproval,
      });
    } catch (e: unknown) {
      if (e instanceof ApiClientError) setError(e.message);
      else setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
        style={{ minHeight: 44 }}
      >
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-text-tertiary" />
          <span className="text-sm font-semibold capitalize text-text-primary">{env.name}</span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-primary">
              Tool allow list
            </label>
            <input
              type="text"
              value={allowList}
              onChange={(e) => setAllowList(e.target.value)}
              placeholder="tool1, tool2 (empty = all allowed)"
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
            <p className="text-xs text-text-tertiary">Comma-separated tool names. Leave empty to allow all.</p>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-primary">
              Tool deny list
            </label>
            <input
              type="text"
              value={denyList}
              onChange={(e) => setDenyList(e.target.value)}
              placeholder="tool1, tool2 (empty = none denied)"
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
            <p className="text-xs text-text-tertiary">Comma-separated tool names. Leave empty to deny none.</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`approval-${env.id}`}
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary-600 focus:ring-border-focus"
            />
            <label htmlFor={`approval-${env.id}`} className="text-sm text-text-primary">
              Require approval for write-risk tools
            </label>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
              style={{ minHeight: 44 }}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnvironmentsPage() {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.environments
      .list()
      .then((res) => setEnvs(res.data))
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load environments");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(id: string, data: Partial<Environment>) {
    const updated = await apiClient.environments.update(id, {
      tool_allow_list: data.tool_allow_list,
      tool_deny_list: data.tool_deny_list,
      require_approval_for_write_tools: data.require_approval_for_write_tools,
    });
    setEnvs((prev) => prev.map((e) => (e.id === id ? updated : e)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-text-secondary">
        Configure tool policies for each environment.
      </p>
      {envs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">
            No environments configured yet. They are created automatically during onboarding.
          </p>
        </div>
      ) : (
        envs.map((env) => (
          <EnvironmentCard key={env.id} env={env} onSave={handleSave} />
        ))
      )}
    </div>
  );
}
