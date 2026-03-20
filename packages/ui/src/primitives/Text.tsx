import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const textVariants = cva("", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      md: "text-md",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    color: {
      primary: "text-foreground",
      secondary: "text-foreground-secondary",
      tertiary: "text-foreground-tertiary",
      inverse: "text-foreground-inverse",
      success: "text-success-500",
      warning: "text-warning-500",
      error: "text-error-500",
      info: "text-info-500",
      inherit: "text-inherit",
    },
    truncate: {
      true: "truncate",
      false: "",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
    mono: {
      true: "font-mono",
      false: "",
    },
  },
  defaultVariants: {
    size: "base",
    weight: "normal",
    color: "primary",
    truncate: false,
    align: "left",
    mono: false,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TextElement = "p" | "span" | "div" | "label" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof textVariants> {
  /** The HTML element to render. Defaults to `"p"`. */
  as?: TextElement;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Typography component for rendering text with consistent styling.
 *
 * Uses the design system type scale and supports semantic color tokens.
 * The `as` prop controls the rendered HTML element (defaults to `<p>`).
 *
 * @example
 * ```tsx
 * <Text as="h1" size="xl" weight="bold">Dashboard</Text>
 * <Text size="sm" color="secondary">Last updated 5 minutes ago</Text>
 * ```
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Component = "p", className, size, weight, color, truncate, align, mono, ...props }, ref) => (
    <Component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(textVariants({ size, weight, color, truncate, align, mono }), className)}
      {...props}
    />
  ),
);

Text.displayName = "Text";
