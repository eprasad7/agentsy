import * as React from "react";

import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagPillProps extends React.HTMLAttributes<HTMLButtonElement> {
  /** The tag text label. */
  label: string;
  /** Whether the tag is currently active/selected. */
  active?: boolean;
  /** Called when the tag is clicked (for filtering). */
  onToggle?: (label: string) => void;
  /** If true, show a remove (x) button. */
  removable?: boolean;
  /** Called when the remove button is clicked. */
  onRemove?: (label: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Filterable tag pill component for agent tags, environment labels, and
 * experiment type tags.
 *
 * Supports active/inactive state for filtering and an optional remove button.
 *
 * @example
 * ```tsx
 * <TagPill label="prompt" active onToggle={(l) => toggle(l)} />
 * <TagPill label="A/B" />
 * <TagPill label="staging" removable onRemove={(l) => remove(l)} />
 * ```
 */
export const TagPill = React.forwardRef<HTMLButtonElement, TagPillProps>(
  ({ label, active, onToggle, removable, onRemove, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        "transition-colors duration-[var(--transition-fast)]",
        "min-h-[28px] min-w-0",
        active
          ? "bg-primary-100 text-primary-700 dark:bg-primary-200 dark:text-primary-800"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-200 dark:text-neutral-700 dark:hover:bg-neutral-300",
        className,
      )}
      onClick={() => onToggle?.(label)}
      {...props}
    >
      <span>{label}</span>
      {removable && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${label}`}
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-400"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(label);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onRemove?.(label);
            }
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path
              d="M1 1l6 6M7 1L1 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </button>
  ),
);

TagPill.displayName = "TagPill";
