import * as React from "react";

import { Badge, type BadgeProps } from "../primitives/Badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus =
  | "completed"
  | "failed"
  | "running"
  | "timeout"
  | "cancelled"
  | "queued"
  | "paused";

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  /** The status to display. Automatically maps to the correct badge variant. */
  status: RunStatus;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const statusConfig: Record<RunStatus, { variant: NonNullable<BadgeProps["variant"]>; label: string }> = {
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "error", label: "Failed" },
  running: { variant: "info", label: "Running" },
  timeout: { variant: "warning", label: "Timeout" },
  cancelled: { variant: "neutral", label: "Cancelled" },
  queued: { variant: "neutral", label: "Queued" },
  paused: { variant: "neutral", label: "Paused" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Specialised badge for run/deployment status with consistent color mapping.
 *
 * Maps semantic statuses to the appropriate Badge variant automatically:
 * - completed = success (green)
 * - failed = error (red)
 * - running = info (blue)
 * - timeout = warning (amber)
 * - cancelled / queued / paused = neutral (gray)
 *
 * @example
 * ```tsx
 * <StatusBadge status="completed" />
 * <StatusBadge status="failed" />
 * <StatusBadge status="running" />
 * ```
 */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, children, ...props }, ref) => {
    const config = statusConfig[status];
    return (
      <Badge ref={ref} variant={config.variant} {...props}>
        {children ?? config.label}
      </Badge>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
