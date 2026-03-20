"use client";

import { FlaskConical } from "lucide-react";

export default function EvalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Evals</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Evaluate and benchmark your agents.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <FlaskConical className="h-6 w-6" />
        </div>
        <h2 className="text-md font-semibold text-text-primary">Coming in Phase 4</h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          The eval engine will let you run datasets against your agents, grade
          outputs, and track accuracy over time.
        </p>
      </div>
    </div>
  );
}
