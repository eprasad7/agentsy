import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        success: "bg-success-100 text-success-700 dark:bg-success-200 dark:text-success-800",
        warning: "bg-warning-100 text-warning-700 dark:bg-warning-200 dark:text-warning-800",
        error: "bg-error-100 text-error-700 dark:bg-error-200 dark:text-error-800",
        info: "bg-info-100 text-info-700 dark:bg-info-200 dark:text-info-800",
        neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-200 dark:text-neutral-700",
      },
      size: {
        sm: "px-2 py-0.5 text-xs min-h-0 min-w-0",
        md: "px-2.5 py-0.5 text-sm min-h-0 min-w-0",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Status badge for displaying categorical state with color-coded variants.
 *
 * Used for run status, deployment status, experiment health, etc.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error" size="md">Failed</Badge>
 * ```
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

Badge.displayName = "Badge";

export { badgeVariants };
