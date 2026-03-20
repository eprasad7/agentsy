"use client";

import { Bot, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiClient, type Agent, ApiClientError } from "@/lib/api";

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const loadAgents = useCallback(
    (nextCursor?: string) => {
      setLoading(true);
      apiClient.agents
        .list({ cursor: nextCursor })
        .then((res) => {
          if (nextCursor) {
            setAgents((prev) => [...prev, ...res.data]);
          } else {
            setAgents(res.data);
          }
          setHasMore(res.has_more);
          setCursor(res.next_cursor);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiClientError) setError(e.message);
          else setError("Failed to load agents");
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  if (loading && agents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Agents</h1>
          <p className="mt-1 text-sm text-text-secondary">
            All agents in your organization.
          </p>
        </div>
        <a
          href="/agents/create"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" />
          Create agent
        </a>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="text-md font-semibold text-text-primary">No agents yet</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            Create your first agent to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.id}
                  onClick={() => router.push(`/agents/${agent.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{agent.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {agent.slug}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-text-secondary">
                    {agent.description || "No description"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(agent.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-4 py-3 text-center">
              <button
                onClick={() => cursor && loadAgents(cursor)}
                disabled={loading}
                className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
                style={{ minHeight: 44 }}
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
