"use client";

import { ArrowLeft, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiClientError } from "@/lib/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CreateAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManual(true);
    setSlug(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const agent = await apiClient.agents.create({
        name,
        slug,
        description: description || undefined,
      });
      router.push(`/agents/${agent.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <a
          href="/agents"
          className="flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Back to agents"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <div>
          <h1 className="text-lg font-bold text-text-primary">Create Agent</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Define a new agent for your organization.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
          )}

          <div className="space-y-1">
            <label htmlFor="agent-name" className="block text-sm font-medium text-text-primary">
              Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Customer Support Agent"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="agent-slug" className="block text-sm font-medium text-text-primary">
              Slug
            </label>
            <input
              id="agent-slug"
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="customer-support-agent"
              required
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
            <p className="text-xs text-text-tertiary">
              Lowercase letters, numbers, and hyphens. Must start and end with alphanumeric.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="agent-desc" className="block text-sm font-medium text-text-primary">
              Description (optional)
            </label>
            <textarea
              id="agent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <a
            href="/agents"
            className="inline-flex items-center rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
            style={{ minHeight: 44 }}
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={creating || !name.trim() || !slug.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            <Save className="h-4 w-4" />
            {creating ? "Creating..." : "Create agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
