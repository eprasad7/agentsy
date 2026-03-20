"use client";

import { Bot, Clock, FileText, Hash } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiClient, type Agent, type AgentVersion, ApiClientError } from "@/lib/api";

export default function AgentOverviewPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [latestVersion, setLatestVersion] = useState<AgentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [ag, versions] = await Promise.all([
          apiClient.agents.get(params.id),
          apiClient.agents.versions(params.id, { limit: "1", order: "desc" }),
        ]);
        setAgent(ag);
        if (versions.data.length > 0) {
          setLatestVersion(versions.data[0]!);
        }
      } catch (e: unknown) {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load agent");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
        {error ?? "Agent not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <Bot className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-text-primary">{agent.name}</h1>
          <p className="font-mono text-xs text-text-secondary">{agent.slug}</p>
          {agent.description && (
            <p className="mt-2 text-sm text-text-secondary">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Hash className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Version</span>
          </div>
          <p className="text-2xl font-semibold text-text-primary">
            {latestVersion ? `v${latestVersion.version}` : "None"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Model</span>
          </div>
          <p className="truncate text-sm font-medium text-text-primary">
            {latestVersion?.model ?? "Not configured"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Created</span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {new Date(agent.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Updated</span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {new Date(agent.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* System prompt preview */}
      {latestVersion && (
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-3">
          <h2 className="text-md font-semibold text-text-primary">System Prompt</h2>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-hover p-4 font-mono text-xs text-text-secondary leading-relaxed">
            {latestVersion.system_prompt}
          </pre>
        </div>
      )}

      {!latestVersion && (
        <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">
            No versions yet.{" "}
            <a
              href={`/agents/${agent.id}/config`}
              className="font-medium text-primary-600 hover:text-primary-700"
            >
              Configure this agent
            </a>{" "}
            to create the first version.
          </p>
        </div>
      )}
    </div>
  );
}
