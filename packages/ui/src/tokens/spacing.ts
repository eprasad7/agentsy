/**
 * Agentsy spacing tokens on an 8pt grid.
 *
 * The scale provides consistent spacing values for padding, margin, and gap
 * throughout the UI.  Each step is a multiple of 4px (half of the base 8px
 * unit) to allow for tighter internal padding where needed.
 */

// ---------------------------------------------------------------------------
// Spacing scale
// ---------------------------------------------------------------------------

export const spacing = {
  0: "0px",
  1: "4px",   // tight internal padding
  2: "8px",   // icon margins, small gaps
  3: "12px",  // compact padding
  4: "16px",  // standard padding, card internal
  5: "20px",  // section gaps
  6: "24px",  // card padding, column gaps
  8: "32px",  // section separators
  10: "40px", // page margins
  12: "48px", // major section breaks
  16: "64px", // large layout gaps
  20: "80px", // extra-large spacing
  24: "96px", // maximum spacing
} as const;

export type SpacingKey = keyof typeof spacing;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const radius = {
  none: "0px",
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const shadow = {
  none: "none",
  sm: "0 1px 2px 0 oklch(0.20 0.01 260 / 0.05)",
  md: "0 4px 6px -1px oklch(0.20 0.01 260 / 0.07), 0 2px 4px -2px oklch(0.20 0.01 260 / 0.05)",
  lg: "0 10px 15px -3px oklch(0.20 0.01 260 / 0.08), 0 4px 6px -4px oklch(0.20 0.01 260 / 0.05)",
  xl: "0 20px 25px -5px oklch(0.20 0.01 260 / 0.10), 0 8px 10px -6px oklch(0.20 0.01 260 / 0.05)",
} as const;

// ---------------------------------------------------------------------------
// Z-index
// ---------------------------------------------------------------------------

export const zIndex = {
  base: "0",
  dropdown: "10",
  sticky: "20",
  overlay: "30",
  modal: "40",
  popover: "50",
  toast: "60",
} as const;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export const transition = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  normal: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

// ---------------------------------------------------------------------------
// CSS custom property map
// ---------------------------------------------------------------------------

export function getSpacingCSSProperties(): Record<string, string> {
  const props: Record<string, string> = {};

  for (const [key, value] of Object.entries(spacing)) {
    props[`--space-${key}`] = value;
  }

  for (const [key, value] of Object.entries(radius)) {
    props[`--radius-${key}`] = value;
  }

  for (const [key, value] of Object.entries(shadow)) {
    props[`--shadow-${key}`] = value;
  }

  return props;
}
