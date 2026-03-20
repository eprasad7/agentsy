import * as React from "react";
import { cn } from "../lib/utils";
import { SparklineCell } from "./SparklineCell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeltaDirection = "up" | "down" | "flat";

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Metric label (e.g. "Successful Runs"). */
  label: string;
  /** Current metric value (e.g. "12.4K", "$0.034", "2.3s"). */
  value: string;
  /** Percentage change (e.g. 3.2, -12). */
  delta?: number;
  /** Direction of delta — controls color. Inferred from sign if omitted. */
  deltaDirection?: DeltaDirection;
  /** Array of numbers for the inline sparkline. */
  sparklineData?: number[];
  /** Unit to display after the value (e.g. "yesterday", "avg"). */
  unit?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDeltaDirection(delta: number, override?: DeltaDirection): DeltaDirection {
  if (override) return override;
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function getDeltaColor(direction: DeltaDirection): string {
  switch (direction) {
    case "up":
      return "text-success-600 dark:text-success-500";
    case "down":
      return "text-error-600 dark:text-error-500";
    case "flat":
      return "text-foreground-secondary";
  }
}

function getDeltaArrow(direction: DeltaDirection): string {
  switch (direction) {
    case "up":
      return "\u25B2"; // ▲
    case "down":
      return "\u25BC"; // ▼
    case "flat":
      return "\u2014"; // —
  }
}

function getSparklineColor(direction: DeltaDirection): string {
  switch (direction) {
    case "up":
      return "var(--color-success-500)";
    case "down":
      return "var(--color-error-500)";
    case "flat":
      return "var(--color-neutral-400)";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sparkline metric card per the Statsig dashboard pattern.
 *
 * Displays a label, current value, optional delta percentage (green/red), and
 * an inline SVG sparkline.  Used in the core metrics grid on the dashboard.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="Successful Runs"
 *   value="12.4K"
 *   unit="yesterday"
 *   delta={3.2}
 *   sparklineData={[100, 105, 103, 110, 108, 115, 120]}
 * />
 * ```
 */
export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      label,
      value,
      delta,
      deltaDirection: deltaDirectionOverride,
      sparklineData,
      unit,
      className,
      ...props
    },
    ref,
  ) => {
    const direction =
      delta !== undefined ? getDeltaDirection(delta, deltaDirectionOverride) : "flat";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-surface-card p-4 flex flex-col gap-2",
          className,
        )}
        {...props}
      >
        {/* Label */}
        <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wider">
          {label}
        </span>

        {/* Value + unit */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-foreground leading-tight">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-foreground-tertiary">{unit}</span>
          )}
        </div>

        {/* Delta + sparkline */}
        <div className="flex items-center gap-3">
          {delta !== undefined && (
            <span className={cn("text-xs font-medium", getDeltaColor(direction))}>
              {getDeltaArrow(direction)} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sparklineData && sparklineData.length > 1 && (
            <SparklineCell
              data={sparklineData}
              color={getSparklineColor(direction)}
              width={80}
              height={24}
            />
          )}
        </div>
      </div>
    );
  },
);

MetricCard.displayName = "MetricCard";
