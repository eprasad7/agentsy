import * as React from "react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label displayed above the input. */
  label?: string;
  /** Helper text displayed below the input. */
  description?: string;
  /** Error message — when present, the input is styled in the error state. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Text input with optional label, description, and error state.
 *
 * Renders a label above and a description or error message below the input
 * field.  Error state applies red border and text styling.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Agent Name"
 *   placeholder="my-agent"
 *   description="A unique identifier for your agent."
 * />
 * <Input label="API Key" error="Required" />
 * ```
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, description, error, id, ...props }, ref) => {
    const inputId = id || React.useId();
    const descriptionId = description ? `${inputId}-desc` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground min-h-0 min-w-0"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-10 w-full rounded-md border bg-surface-card px-3 py-2",
            "text-base text-foreground placeholder:text-foreground-tertiary",
            "transition-colors duration-[var(--transition-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-error-500 focus-visible:ring-error-500"
              : "border-border hover:border-border-strong",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [descriptionId, errorId].filter(Boolean).join(" ") || undefined
          }
          {...props}
        />
        {description && !error && (
          <p id={descriptionId} className="text-xs text-foreground-tertiary min-h-0 min-w-0">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-error-500 min-h-0 min-w-0" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
