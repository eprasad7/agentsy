import * as React from "react";

import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparklineCellProps extends React.SVGAttributes<SVGSVGElement> {
  /** Array of numeric data points to render. */
  data: number[];
  /** Width of the SVG in pixels. Defaults to `64`. */
  width?: number;
  /** Height of the SVG in pixels. Defaults to `20`. */
  height?: number;
  /** Stroke color. Defaults to `"var(--color-primary-500)"`. */
  color?: string;
  /** Stroke width. Defaults to `1.5`. */
  strokeWidth?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inline SVG sparkline for use in table cells and metric cards.
 *
 * Renders a small line chart from an array of numbers. Automatically scales
 * to fit the data range within the given width/height.
 *
 * @example
 * ```tsx
 * <SparklineCell data={[3, 7, 4, 8, 2, 9, 5]} color="var(--color-success-500)" />
 * ```
 */
export const SparklineCell = React.forwardRef<SVGSVGElement, SparklineCellProps>(
  (
    {
      data,
      width = 64,
      height = 20,
      color = "var(--color-primary-500)",
      strokeWidth = 1.5,
      className,
      ...props
    },
    ref,
  ) => {
    if (!data.length) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const padding = strokeWidth;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = data
      .map((value, index) => {
        const x = padding + (index / Math.max(data.length - 1, 1)) * chartWidth;
        const y = padding + chartHeight - ((value - min) / range) * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className={cn("inline-block shrink-0", className)}
        aria-hidden="true"
        {...props}
      >
        <polyline
          points={points}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  },
);

SparklineCell.displayName = "SparklineCell";
