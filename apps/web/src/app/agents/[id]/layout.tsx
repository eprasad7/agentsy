"use client";

import { ArrowLeft, Database, FlaskConical, Info, Play, Plug, Rocket, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

interface Tab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  disabledLabel?: string;
}

export default function AgentDetailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const tabs: Tab[] = [
    { label: "Overview", href: `/agents/${id}`, icon: Info },
    { label: "Config", href: `/agents/${id}/config`, icon: Settings },
    { label: "Runs", href: `/runs?agent_id=${id}`, icon: Play },
    { label: "Evals", href: `/agents/${id}/evals`, icon: FlaskConical, disabled: true, disabledLabel: "Phase 4" },
    { label: "Knowledge", href: `/agents/${id}/kb`, icon: Database, disabled: true, disabledLabel: "Phase 5" },
    { label: "Tools", href: `/agents/${id}/tools`, icon: Plug, disabled: true, disabledLabel: "Phase 6" },
    { label: "Deploy", href: `/agents/${id}/deploy`, icon: Rocket, disabled: true, disabledLabel: "Phase 7" },
  ];

  function isActive(href: string): boolean {
    if (href === `/agents/${id}`) return pathname === `/agents/${id}`;
    return pathname.startsWith(href.split("?")[0]!);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          className="flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="Back to agents"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);

          if (tab.disabled) {
            return (
              <span
                key={tab.label}
                className="flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 pb-3 pt-2 text-sm font-medium text-text-tertiary cursor-default"
                title={`Coming in ${tab.disabledLabel}`}
                style={{ minHeight: 44 }}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 pb-3 pt-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary"
              }`}
              style={{ minHeight: 44 }}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
