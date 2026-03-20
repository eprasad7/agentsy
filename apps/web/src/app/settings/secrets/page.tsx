"use client";

import { Lock, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiClient, type Secret, ApiClientError } from "@/lib/api";

function CreateSecretModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [environment, setEnvironment] = useState("development");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiClient.secrets.create({
        name,
        key,
        value,
        environment,
        description: description || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to create secret");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-card p-6 shadow-xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold text-text-primary">Add Secret</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-text-secondary hover:text-text-primary"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
          )}

          <div className="space-y-1">
            <label htmlFor="secret-name" className="block text-sm font-medium text-text-primary">
              Name
            </label>
            <input
              id="secret-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stripe API Key"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-key" className="block text-sm font-medium text-text-primary">
              Key
            </label>
            <input
              id="secret-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. STRIPE_API_KEY"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-value" className="block text-sm font-medium text-text-primary">
              Value
            </label>
            <input
              id="secret-value"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Secret value"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-env" className="block text-sm font-medium text-text-primary">
              Environment
            </label>
            <select
              id="secret-env"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-desc" className="block text-sm font-medium text-text-primary">
              Description (optional)
            </label>
            <input
              id="secret-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this secret used for?"
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              style={{ minHeight: 44 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim() || !key.trim() || !value.trim()}
              className="rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
              style={{ minHeight: 44 }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadSecrets = useCallback(() => {
    setLoading(true);
    apiClient.secrets
      .list()
      .then((res) => setSecrets(res.data))
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load secrets");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  async function handleDelete(id: string) {
    try {
      await apiClient.secrets.delete(id);
      loadSecrets();
    } catch (e: unknown) {
      if (e instanceof ApiClientError) setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Encrypted secrets injected into agent tool execution.
          Values are never shown after creation.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" />
          Add secret
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {secrets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-sm text-text-secondary">No secrets configured yet.</p>
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
                  Key
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Env
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{s.key}</td>
                  <td className="px-4 py-3 text-text-tertiary font-mono text-xs">
                    ••••••••
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-neutral-100 px-2 py-1 text-xs capitalize text-text-secondary">
                      {s.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-error-600 transition-colors hover:bg-error-50"
                      style={{ minHeight: 44 }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateSecretModal
          onClose={() => setShowCreate(false)}
          onCreated={loadSecrets}
        />
      )}
    </div>
  );
}
