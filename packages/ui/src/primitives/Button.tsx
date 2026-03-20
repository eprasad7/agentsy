import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "rounded-md font-medium",
    "transition-colors duration-[var(--transition-fast)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "select-none whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-primary-500 text-foreground-inverse",
          "hover:bg-primary-600",
          "active:bg-primary-700",
        ].join(" "),
        secondary: [
          "border border-border bg-surface-card text-foreground",
          "hover:bg-surface-hover",
          "active:bg-neutral-200",
        ].join(" "),
        ghost: [
          "text-foreground",
          "hover:bg-surface-hover",
          "active:bg-neutral-200",
        ].join(" "),
        danger: [
          "bg-error-500 text-foreground-inverse",
          "hover:bg-error-600",
          "active:bg-error-700",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-sm min-h-[32px] min-w-[32px]",
        md: "h-10 px-4 text-base min-h-[44px] min-w-[44px]",
        lg: "h-12 px-6 text-md min-h-[48px] min-w-[48px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Show a loading spinner and disable the button. */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Button component with multiple variants and sizes.
 *
 * Supports a `loading` prop that shows a spinner and disables interaction.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={save}>
 *   Save Changes
 * </Button>
 * <Button variant="danger" loading>
 *   Deleting...
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoadingSpinner />}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

export { buttonVariants };
