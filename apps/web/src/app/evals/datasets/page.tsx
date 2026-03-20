"use client";

import { Database } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient, type EvalDataset, ApiClientError } from "@/lib/api";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.evalDatasets
      .list({ limit: "50" })
      .then((res) => setDatasets(res.data))
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load datasets");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Eval Datasets</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage test datasets for evaluating your agents.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      ) : datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Database className="h-6 w-6" />
          </div>
          <h2 className="text-md font-semibold text-text-primary">No datasets yet</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            Create datasets via the API or CLI to start evaluating your agents.
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
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Cases
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => (
                <tr
                  key={ds.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{ds.name}</div>
                    {ds.description && (
                      <div className="mt-0.5 text-xs text-text-secondary">{ds.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    {ds.case_count}
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    v{ds.version}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(ds.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
