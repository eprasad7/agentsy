"use client";

import { BarChart3 } from "lucide-react";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Usage</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Monitor your platform usage, costs, and quotas.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h2 className="text-md font-semibold text-text-primary">Coming in Phase 8</h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          Usage analytics including total runs, token consumption, cost breakdowns,
          and rate limit status will appear here.
        </p>
      </div>
    </div>
  );
}
