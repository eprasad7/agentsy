import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const stackVariants = cva("flex", {
  variants: {
    direction: {
      row: "flex-row",
      column: "flex-col",
      rowReverse: "flex-row-reverse",
      columnReverse: "flex-col-reverse",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    },
    wrap: {
      true: "flex-wrap",
      false: "flex-nowrap",
    },
    gap: {
      0: "gap-0",
      1: "gap-1",
      2: "gap-2",
      3: "gap-3",
      4: "gap-4",
      5: "gap-5",
      6: "gap-6",
      8: "gap-8",
      10: "gap-10",
      12: "gap-12",
    },
  },
  defaultVariants: {
    direction: "column",
    align: "stretch",
    justify: "start",
    wrap: false,
    gap: 4,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Flex-based layout component for arranging children in a row or column.
 *
 * Provides convenient props for direction, alignment, justification, gap, and
 * wrapping — all mapped to Tailwind flex utilities.
 *
 * @example
 * ```tsx
 * <Stack direction="row" gap={4} align="center">
 *   <Text>Left</Text>
 *   <Text>Right</Text>
 * </Stack>
 * ```
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, direction, align, justify, wrap, gap, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(stackVariants({ direction, align, justify, wrap, gap }), className)}
      {...props}
    />
  ),
);

Stack.displayName = "Stack";
