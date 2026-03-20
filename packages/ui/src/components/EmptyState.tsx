import * as React from "react";

import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon element to display above the title. */
  icon?: React.ReactNode;
  /** Heading text. */
  title: string;
  /** Descriptive text below the heading. */
  description?: string;
  /** Action element (typically a Button) rendered below the description. */
  action?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Empty state component for first-use or zero-result views.
 *
 * Displays a centered icon, title, description, and optional action button.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<BoxIcon />}
 *   title="No agents yet"
 *   description="Create your first agent to get started."
 *   action={<Button>+ Create Agent</Button>}
 * />
 * ```
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 text-foreground-tertiary [&>svg]:h-12 [&>svg]:w-12">
          {icon}
        </div>
      )}
      <h3 className="text-md font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-foreground-secondary max-w-sm mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  ),
);

EmptyState.displayName = "EmptyState";
