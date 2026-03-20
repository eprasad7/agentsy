/**
 * Agentsy semantic color tokens using OKLch color space.
 *
 * The palette follows the Statsig-inspired design system: restrained use of
 * color where color equals signal.  Each semantic group provides a base shade
 * plus lighter/darker variants for backgrounds, borders, and text.
 *
 * Light and dark mode values are defined separately and surfaced as CSS custom
 * properties via `globals.css`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorScale {
  /** Lightest background tint */
  50: string;
  /** Subtle background */
  100: string;
  /** Light background / hover */
  200: string;
  /** Border / divider */
  300: string;
  /** Muted foreground */
  400: string;
  /** Base */
  500: string;
  /** Slightly darker */
  600: string;
  /** Dark foreground */
  700: string;
  /** Darker foreground */
  800: string;
  /** Darkest foreground */
  900: string;
  /** Near-black foreground */
  950: string;
}

export interface SemanticColors {
  primary: ColorScale;
  neutral: ColorScale;
  success: ColorScale;
  warning: ColorScale;
  error: ColorScale;
  info: ColorScale;
}

export interface SurfaceColors {
  page: string;
  card: string;
  hover: string;
  overlay: string;
}

export interface TextColors {
  primary: string;
  secondary: string;
  tertiary: string;
  inverse: string;
}

export interface BorderColors {
  default: string;
  strong: string;
  focus: string;
}

// ---------------------------------------------------------------------------
// Light mode palette
// ---------------------------------------------------------------------------

export const primaryLight: ColorScale = {
  50: "oklch(0.97 0.02 250)",
  100: "oklch(0.93 0.04 250)",
  200: "oklch(0.87 0.08 250)",
  300: "oklch(0.78 0.12 250)",
  400: "oklch(0.70 0.14 250)",
  500: "oklch(0.65 0.15 250)",
  600: "oklch(0.57 0.15 250)",
  700: "oklch(0.49 0.14 250)",
  800: "oklch(0.41 0.12 250)",
  900: "oklch(0.35 0.10 250)",
  950: "oklch(0.25 0.07 250)",
};

export const neutralLight: ColorScale = {
  50: "oklch(0.98 0.003 260)",
  100: "oklch(0.96 0.005 260)",
  200: "oklch(0.92 0.005 260)",
  300: "oklch(0.87 0.005 260)",
  400: "oklch(0.70 0.01 260)",
  500: "oklch(0.55 0.01 260)",
  600: "oklch(0.45 0.01 260)",
  700: "oklch(0.37 0.01 260)",
  800: "oklch(0.30 0.01 260)",
  900: "oklch(0.22 0.01 260)",
  950: "oklch(0.15 0.01 260)",
};

export const successLight: ColorScale = {
  50: "oklch(0.97 0.02 155)",
  100: "oklch(0.93 0.05 155)",
  200: "oklch(0.87 0.10 155)",
  300: "oklch(0.80 0.13 155)",
  400: "oklch(0.76 0.14 155)",
  500: "oklch(0.72 0.15 155)",
  600: "oklch(0.62 0.14 155)",
  700: "oklch(0.52 0.12 155)",
  800: "oklch(0.43 0.10 155)",
  900: "oklch(0.35 0.08 155)",
  950: "oklch(0.25 0.06 155)",
};

export const warningLight: ColorScale = {
  50: "oklch(0.97 0.02 65)",
  100: "oklch(0.93 0.05 65)",
  200: "oklch(0.88 0.10 65)",
  300: "oklch(0.82 0.13 65)",
  400: "oklch(0.78 0.14 65)",
  500: "oklch(0.75 0.15 65)",
  600: "oklch(0.65 0.14 65)",
  700: "oklch(0.55 0.12 65)",
  800: "oklch(0.45 0.10 65)",
  900: "oklch(0.37 0.08 65)",
  950: "oklch(0.27 0.06 65)",
};

export const errorLight: ColorScale = {
  50: "oklch(0.97 0.02 25)",
  100: "oklch(0.93 0.05 25)",
  200: "oklch(0.87 0.10 25)",
  300: "oklch(0.78 0.15 25)",
  400: "oklch(0.72 0.18 25)",
  500: "oklch(0.65 0.20 25)",
  600: "oklch(0.55 0.19 25)",
  700: "oklch(0.47 0.16 25)",
  800: "oklch(0.40 0.13 25)",
  900: "oklch(0.33 0.10 25)",
  950: "oklch(0.23 0.07 25)",
};

export const infoLight: ColorScale = {
  50: "oklch(0.97 0.02 250)",
  100: "oklch(0.93 0.04 250)",
  200: "oklch(0.87 0.08 250)",
  300: "oklch(0.78 0.12 250)",
  400: "oklch(0.70 0.14 250)",
  500: "oklch(0.65 0.15 250)",
  600: "oklch(0.57 0.15 250)",
  700: "oklch(0.49 0.14 250)",
  800: "oklch(0.41 0.12 250)",
  900: "oklch(0.35 0.10 250)",
  950: "oklch(0.25 0.07 250)",
};

export const lightSemanticColors: SemanticColors = {
  primary: primaryLight,
  neutral: neutralLight,
  success: successLight,
  warning: warningLight,
  error: errorLight,
  info: infoLight,
};

export const lightSurface: SurfaceColors = {
  page: "oklch(0.97 0.005 260)",
  card: "oklch(1.0 0 0)",
  hover: "oklch(0.96 0.005 260)",
  overlay: "oklch(0.20 0.01 260 / 0.5)",
};

export const lightText: TextColors = {
  primary: "oklch(0.20 0.01 260)",
  secondary: "oklch(0.55 0.01 260)",
  tertiary: "oklch(0.70 0.01 260)",
  inverse: "oklch(0.98 0.003 260)",
};

export const lightBorder: BorderColors = {
  default: "oklch(0.90 0.005 260)",
  strong: "oklch(0.80 0.005 260)",
  focus: "oklch(0.65 0.15 250)",
};

// ---------------------------------------------------------------------------
// Dark mode palette
// ---------------------------------------------------------------------------

export const primaryDark: ColorScale = {
  50: "oklch(0.20 0.03 250)",
  100: "oklch(0.25 0.05 250)",
  200: "oklch(0.30 0.08 250)",
  300: "oklch(0.38 0.10 250)",
  400: "oklch(0.50 0.13 250)",
  500: "oklch(0.65 0.15 250)",
  600: "oklch(0.72 0.14 250)",
  700: "oklch(0.78 0.12 250)",
  800: "oklch(0.85 0.08 250)",
  900: "oklch(0.90 0.05 250)",
  950: "oklch(0.95 0.02 250)",
};

export const neutralDark: ColorScale = {
  50: "oklch(0.15 0.005 260)",
  100: "oklch(0.18 0.005 260)",
  200: "oklch(0.22 0.005 260)",
  300: "oklch(0.28 0.005 260)",
  400: "oklch(0.40 0.01 260)",
  500: "oklch(0.55 0.01 260)",
  600: "oklch(0.65 0.01 260)",
  700: "oklch(0.75 0.01 260)",
  800: "oklch(0.85 0.005 260)",
  900: "oklch(0.92 0.003 260)",
  950: "oklch(0.97 0.003 260)",
};

export const successDark: ColorScale = {
  50: "oklch(0.18 0.03 155)",
  100: "oklch(0.22 0.05 155)",
  200: "oklch(0.28 0.08 155)",
  300: "oklch(0.38 0.10 155)",
  400: "oklch(0.52 0.13 155)",
  500: "oklch(0.65 0.15 155)",
  600: "oklch(0.72 0.14 155)",
  700: "oklch(0.80 0.12 155)",
  800: "oklch(0.87 0.08 155)",
  900: "oklch(0.92 0.05 155)",
  950: "oklch(0.96 0.02 155)",
};

export const warningDark: ColorScale = {
  50: "oklch(0.18 0.03 65)",
  100: "oklch(0.22 0.05 65)",
  200: "oklch(0.28 0.08 65)",
  300: "oklch(0.38 0.10 65)",
  400: "oklch(0.52 0.13 65)",
  500: "oklch(0.68 0.15 65)",
  600: "oklch(0.75 0.14 65)",
  700: "oklch(0.82 0.12 65)",
  800: "oklch(0.88 0.08 65)",
  900: "oklch(0.93 0.05 65)",
  950: "oklch(0.96 0.02 65)",
};

export const errorDark: ColorScale = {
  50: "oklch(0.18 0.04 25)",
  100: "oklch(0.22 0.06 25)",
  200: "oklch(0.28 0.10 25)",
  300: "oklch(0.38 0.14 25)",
  400: "oklch(0.50 0.17 25)",
  500: "oklch(0.62 0.20 25)",
  600: "oklch(0.70 0.18 25)",
  700: "oklch(0.78 0.14 25)",
  800: "oklch(0.85 0.10 25)",
  900: "oklch(0.92 0.05 25)",
  950: "oklch(0.96 0.02 25)",
};

export const infoDark: ColorScale = {
  50: "oklch(0.20 0.03 250)",
  100: "oklch(0.25 0.05 250)",
  200: "oklch(0.30 0.08 250)",
  300: "oklch(0.38 0.10 250)",
  400: "oklch(0.50 0.13 250)",
  500: "oklch(0.65 0.15 250)",
  600: "oklch(0.72 0.14 250)",
  700: "oklch(0.78 0.12 250)",
  800: "oklch(0.85 0.08 250)",
  900: "oklch(0.90 0.05 250)",
  950: "oklch(0.95 0.02 250)",
};

export const darkSemanticColors: SemanticColors = {
  primary: primaryDark,
  neutral: neutralDark,
  success: successDark,
  warning: warningDark,
  error: errorDark,
  info: infoDark,
};

export const darkSurface: SurfaceColors = {
  page: "oklch(0.15 0.005 260)",
  card: "oklch(0.20 0.005 260)",
  hover: "oklch(0.24 0.005 260)",
  overlay: "oklch(0.10 0.005 260 / 0.7)",
};

export const darkText: TextColors = {
  primary: "oklch(0.95 0.003 260)",
  secondary: "oklch(0.65 0.01 260)",
  tertiary: "oklch(0.45 0.01 260)",
  inverse: "oklch(0.15 0.005 260)",
};

export const darkBorder: BorderColors = {
  default: "oklch(0.28 0.005 260)",
  strong: "oklch(0.38 0.005 260)",
  focus: "oklch(0.65 0.15 250)",
};

// ---------------------------------------------------------------------------
// CSS custom property map (for programmatic generation)
// ---------------------------------------------------------------------------

/** Returns a flat map of CSS custom property name to value for the given mode. */
export function getColorCSSProperties(mode: "light" | "dark"): Record<string, string> {
  const semantic = mode === "light" ? lightSemanticColors : darkSemanticColors;
  const surface = mode === "light" ? lightSurface : darkSurface;
  const text = mode === "light" ? lightText : darkText;
  const border = mode === "light" ? lightBorder : darkBorder;

  const props: Record<string, string> = {};

  for (const [name, scale] of Object.entries(semantic)) {
    for (const [step, value] of Object.entries(scale)) {
      props[`--color-${name}-${step}`] = value as string;
    }
  }

  for (const [name, value] of Object.entries(surface)) {
    props[`--color-bg-${name}`] = value;
  }

  for (const [name, value] of Object.entries(text)) {
    props[`--color-text-${name}`] = value;
  }

  for (const [name, value] of Object.entries(border)) {
    props[`--color-border-${name === "default" ? "" : `-${name}`}`.replace(/-$/, "")] = value;
  }
  // Fix border default key
  props["--color-border"] = border.default;
  props["--color-border-strong"] = border.strong;
  props["--color-border-focus"] = border.focus;

  return props;
}
