"use client";

import { Building2, Globe, Key, Lock, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "General", href: "/settings", icon: Building2 },
  { label: "Environments", href: "/settings/environments", icon: Globe },
  { label: "API Keys", href: "/settings/api-keys", icon: Key },
  { label: "Secrets", href: "/settings/secrets", icon: Lock },
  { label: "Members", href: "/settings/members", icon: Users },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your organization, keys, secrets, and team.
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
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
