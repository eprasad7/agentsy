"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Play,
  FlaskConical,
  Settings,
  BarChart3,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Runs", href: "/runs", icon: Play },
  { label: "Evals", href: "/evals", icon: FlaskConical },
];

const settingsNav: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Usage", href: "/usage", icon: BarChart3 },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 transition-colors ${
        isActive
          ? "bg-surface-hover text-primary-600"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      }`}
      style={{ minHeight: 44 }}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-border bg-surface-card">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-border px-4" style={{ height: 64 }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
          <Bot className="h-4 w-4 text-text-inverse" />
        </div>
        <span className="text-md font-bold text-text-primary">Agentsy</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Main
        </p>
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}

        <div className="py-4">
          <div className="border-t border-border" />
        </div>

        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Settings
        </p>
        {settingsNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-3 space-y-1">
        <ThemeToggle />
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ minHeight: 44 }}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Log out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-4 z-50 flex items-center justify-center rounded-lg bg-surface-card p-2 shadow-md md:hidden"
        aria-label="Open navigation"
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <Menu className="h-5 w-5 text-text-primary" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-surface-overlay md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 flex items-center justify-center rounded-lg p-2 text-text-secondary hover:text-text-primary"
          aria-label="Close navigation"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        {sidebarContent}
      </aside>
    </>
  );
}
