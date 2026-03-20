"use client";

import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Overview of your agents, runs, and platform usage.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <LayoutDashboard className="h-6 w-6" />
        </div>
        <h2 className="text-md font-semibold text-text-primary">Welcome to Agentsy</h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          Your agent dashboard will appear here once you create your first agent and
          start running it. Get started by creating an agent.
        </p>
        <a
          href="/agents/create"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          style={{ minHeight: 44 }}
        >
          Create your first agent
        </a>
      </div>
    </div>
  );
}
