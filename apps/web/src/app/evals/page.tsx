"use client";

import { Database, FlaskConical } from "lucide-react";
import Link from "next/link";

export default function EvalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Evals</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Evaluate and benchmark your agents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/evals/datasets"
          className="group rounded-xl border border-border bg-surface-card p-6 transition-colors hover:bg-surface-hover"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
            <Database className="h-5 w-5" />
          </div>
          <h2 className="text-md font-semibold text-text-primary group-hover:text-primary-600">
            Datasets
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Manage test datasets with cases for evaluating agent behavior.
          </p>
        </Link>

        <Link
          href="/evals/experiments"
          className="group rounded-xl border border-border bg-surface-card p-6 transition-colors hover:bg-surface-hover"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
            <FlaskConical className="h-5 w-5" />
          </div>
          <h2 className="text-md font-semibold text-text-primary group-hover:text-primary-600">
            Experiments
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            View experiment results, scores, and per-case details.
          </p>
        </Link>
      </div>
    </div>
  );
}
