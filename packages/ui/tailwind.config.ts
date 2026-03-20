import type { Config } from "tailwindcss";
import { fontSize, fontWeight, lineHeight, fontFamily, letterSpacing } from "./src/tokens/typography";
import { spacing, radius, shadow } from "./src/tokens/spacing";

/**
 * Tailwind CSS configuration for the Agentsy design system.
 *
 * Extends Tailwind with design tokens from the token system.
 * Dark mode uses the `class` strategy (`.dark` on a parent element).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    // Allow consuming apps to configure their own content paths
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: fontFamily.sans.split(", "),
        mono: fontFamily.mono.split(", "),
      },
      fontSize: {
        xs: [fontSize.xs, { lineHeight: lineHeight.normal }],
        sm: [fontSize.sm, { lineHeight: lineHeight.normal }],
        base: [fontSize.base, { lineHeight: lineHeight.normal }],
        md: [fontSize.md, { lineHeight: lineHeight.tight }],
        lg: [fontSize.lg, { lineHeight: lineHeight.tight }],
        xl: [fontSize.xl, { lineHeight: lineHeight.tight }],
        "2xl": [fontSize["2xl"], { lineHeight: lineHeight.tight }],
      },
      fontWeight: {
        normal: fontWeight.normal,
        medium: fontWeight.medium,
        semibold: fontWeight.semibold,
        bold: fontWeight.bold,
      },
      lineHeight: {
        tight: lineHeight.tight,
        normal: lineHeight.normal,
        relaxed: lineHeight.relaxed,
      },
      letterSpacing: {
        tight: letterSpacing.tight,
        normal: letterSpacing.normal,
        wide: letterSpacing.wide,
        wider: letterSpacing.wider,
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, value])
      ),
      borderRadius: {
        none: radius.none,
        sm: radius.sm,
        DEFAULT: radius.md,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        "2xl": radius["2xl"],
        full: radius.full,
      },
      boxShadow: {
        none: shadow.none,
        sm: shadow.sm,
        DEFAULT: shadow.md,
        md: shadow.md,
        lg: shadow.lg,
        xl: shadow.xl,
      },
      colors: {
        // Semantic colors referencing CSS custom properties
        primary: {
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          200: "var(--color-primary-200)",
          300: "var(--color-primary-300)",
          400: "var(--color-primary-400)",
          500: "var(--color-primary-500)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
          800: "var(--color-primary-800)",
          900: "var(--color-primary-900)",
          950: "var(--color-primary-950)",
        },
        neutral: {
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)",
          950: "var(--color-neutral-950)",
        },
        success: {
          50: "var(--color-success-50)",
          100: "var(--color-success-100)",
          200: "var(--color-success-200)",
          300: "var(--color-success-300)",
          400: "var(--color-success-400)",
          500: "var(--color-success-500)",
          600: "var(--color-success-600)",
          700: "var(--color-success-700)",
          800: "var(--color-success-800)",
          900: "var(--color-success-900)",
          950: "var(--color-success-950)",
        },
        warning: {
          50: "var(--color-warning-50)",
          100: "var(--color-warning-100)",
          200: "var(--color-warning-200)",
          300: "var(--color-warning-300)",
          400: "var(--color-warning-400)",
          500: "var(--color-warning-500)",
          600: "var(--color-warning-600)",
          700: "var(--color-warning-700)",
          800: "var(--color-warning-800)",
          900: "var(--color-warning-900)",
          950: "var(--color-warning-950)",
        },
        error: {
          50: "var(--color-error-50)",
          100: "var(--color-error-100)",
          200: "var(--color-error-200)",
          300: "var(--color-error-300)",
          400: "var(--color-error-400)",
          500: "var(--color-error-500)",
          600: "var(--color-error-600)",
          700: "var(--color-error-700)",
          800: "var(--color-error-800)",
          900: "var(--color-error-900)",
          950: "var(--color-error-950)",
        },
        info: {
          50: "var(--color-info-50)",
          100: "var(--color-info-100)",
          200: "var(--color-info-200)",
          300: "var(--color-info-300)",
          400: "var(--color-info-400)",
          500: "var(--color-info-500)",
          600: "var(--color-info-600)",
          700: "var(--color-info-700)",
          800: "var(--color-info-800)",
          900: "var(--color-info-900)",
          950: "var(--color-info-950)",
        },
        // Surface colors
        surface: {
          page: "var(--color-bg-page)",
          card: "var(--color-bg-card)",
          hover: "var(--color-bg-hover)",
          overlay: "var(--color-bg-overlay)",
        },
        // Text colors
        foreground: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          inverse: "var(--color-text-inverse)",
        },
        // Border colors
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          focus: "var(--color-border-focus)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
