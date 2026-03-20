"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="flex items-center justify-center rounded-lg p-2 text-text-secondary"
        aria-label="Toggle theme"
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <span className="h-5 w-5" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
