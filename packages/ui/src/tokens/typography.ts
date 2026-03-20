/**
 * Agentsy typography tokens.
 *
 * Based on the Inter typeface with a scale ranging from xs (12px) to 2xl (32px).
 * Values align with the Statsig-inspired design reference.
 */

// ---------------------------------------------------------------------------
// Font family
// ---------------------------------------------------------------------------

export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
} as const;

// ---------------------------------------------------------------------------
// Font size scale
// ---------------------------------------------------------------------------

export const fontSize = {
  xs: "0.75rem",   // 12px — table secondary text, timestamps
  sm: "0.8125rem", // 13px — table body, tags
  base: "0.875rem", // 14px — body text, form labels
  md: "1rem",      // 16px — section headers, card titles
  lg: "1.25rem",   // 20px — page titles
  xl: "1.5rem",    // 24px — dashboard greeting
  "2xl": "2rem",   // 32px — hero numbers (metric values)
} as const;

// ---------------------------------------------------------------------------
// Font weight
// ---------------------------------------------------------------------------

export const fontWeight = {
  normal: "400",
  medium: "500",   // labels, table headers
  semibold: "600", // metric values, emphasis
  bold: "700",     // page titles
} as const;

// ---------------------------------------------------------------------------
// Line height
// ---------------------------------------------------------------------------

export const lineHeight = {
  tight: "1.2",    // headings
  normal: "1.5",   // body text (WCAG)
  relaxed: "1.6",  // paragraphs
} as const;

// ---------------------------------------------------------------------------
// Letter spacing
// ---------------------------------------------------------------------------

export const letterSpacing = {
  tight: "-0.01em",
  normal: "0em",
  wide: "0.025em",
  wider: "0.05em",
} as const;

// ---------------------------------------------------------------------------
// Composed type styles for convenience
// ---------------------------------------------------------------------------

export interface TypeStyle {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  letterSpacing: string;
}

export const typeStyles: Record<string, TypeStyle> = {
  hero: {
    fontSize: fontSize["2xl"],
    lineHeight: lineHeight.tight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.tight,
  },
  h1: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.tight,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  h2: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.tight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.tight,
  },
  h3: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.tight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },
  bodySmall: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },
  caption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.normal,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  label: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  tableHeader: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.normal,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.wider,
  },
} as const;

// ---------------------------------------------------------------------------
// CSS custom property map
// ---------------------------------------------------------------------------

export function getTypographyCSSProperties(): Record<string, string> {
  return {
    "--font-family-sans": fontFamily.sans,
    "--font-family-mono": fontFamily.mono,
    "--font-size-xs": fontSize.xs,
    "--font-size-sm": fontSize.sm,
    "--font-size-base": fontSize.base,
    "--font-size-md": fontSize.md,
    "--font-size-lg": fontSize.lg,
    "--font-size-xl": fontSize.xl,
    "--font-size-2xl": fontSize["2xl"],
    "--font-weight-normal": fontWeight.normal,
    "--font-weight-medium": fontWeight.medium,
    "--font-weight-semibold": fontWeight.semibold,
    "--font-weight-bold": fontWeight.bold,
    "--line-height-tight": lineHeight.tight,
    "--line-height-normal": lineHeight.normal,
    "--line-height-relaxed": lineHeight.relaxed,
    "--letter-spacing-tight": letterSpacing.tight,
    "--letter-spacing-normal": letterSpacing.normal,
    "--letter-spacing-wide": letterSpacing.wide,
    "--letter-spacing-wider": letterSpacing.wider,
  };
}
