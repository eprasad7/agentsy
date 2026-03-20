import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const cardVariants = cva(
  "rounded-lg border border-border bg-surface-card shadow-sm",
  {
    variants: {
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: {
      padding: "md",
    },
  },
);

const cardBodyPadding = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Optional header content rendered above the card body with a border separator. */
  header?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Container card with optional header and configurable padding.
 *
 * The `header` prop renders content in a separate top section with a bottom
 * border divider. Use `padding` to control internal spacing.
 *
 * @example
 * ```tsx
 * <Card header={<Text weight="semibold">Metrics</Text>}>
 *   <MetricCard ... />
 * </Card>
 * ```
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = "md", header, children, ...props }, ref) => {
    if (header) {
      return (
        <div
          ref={ref}
          className={cn(
            "rounded-lg border border-border bg-surface-card shadow-sm",
            className,
          )}
          {...props}
        >
          <div className="border-b border-border px-4 py-3">{header}</div>
          <div className={cn(cardBodyPadding[padding ?? "md"])}>{children}</div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(cardVariants({ padding }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export { cardVariants };
