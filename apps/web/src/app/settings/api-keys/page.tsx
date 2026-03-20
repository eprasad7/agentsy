"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient, type ApiKey, ApiClientError } from "@/lib/api";
import { Plus, Copy, Trash2, Key, AlertTriangle, Check, X } from "lucide-react";

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const key = await apiClient.apiKeys.create({ name });
      setCreatedKey(key);
      onCreated(key);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (createdKey?.key) {
      navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-card p-6 shadow-xl">
        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning-500" />
              <h2 className="text-md font-semibold text-text-primary">
                Save your API key
              </h2>
            </div>
            <p className="text-sm text-text-secondary">
              This is the only time you will see the full key. Copy it now and store it securely.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-hover px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs text-text-primary">
                {createdKey.key}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md p-2 text-text-secondary hover:text-text-primary"
                style={{ minWidth: 44, minHeight: 44 }}
                aria-label="Copy key"
              >
                {copied ? <Check className="h-4 w-4 text-success-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
                style={{ minHeight: 44 }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-md font-semibold text-text-primary">Create API Key</h2>
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
              <label htmlFor="key-name" className="block text-sm font-medium text-text-primary">
                Key name
              </label>
              <input
                id="key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production, CI/CD"
                required
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
                disabled={creating || !name.trim()}
                className="rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
                style={{ minHeight: 44 }}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadKeys = useCallback(() => {
    setLoading(true);
    apiClient.apiKeys
      .list()
      .then((res) => setKeys(res.data))
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load API keys");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleRevoke(keyId: string) {
    try {
      await apiClient.apiKeys.revoke(keyId);
      loadKeys();
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

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          API keys are used for programmatic access to the Agentsy API.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" />
          Create key
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Key className="h-6 w-6" />
          </div>
          <p className="text-sm text-text-secondary">
            No API keys yet. Create one to get started.
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
                  Prefix
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Last used
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {k.prefix}...
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-error-600 transition-colors hover:bg-error-50"
                      style={{ minHeight: 44 }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {revokedKeys.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0 opacity-50">
                  <td className="px-4 py-3 font-medium text-text-primary line-through">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {k.prefix}...
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-error-500">Revoked</td>
                  <td className="px-4 py-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={() => loadKeys()}
        />
      )}
    </div>
  );
}
