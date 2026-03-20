import * as React from "react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** Column definition for the data table. */
export interface ColumnDef<T> {
  /** Unique key identifying the column. */
  id: string;
  /** Column header label. */
  header: string;
  /** Accessor function to extract the cell value from a row. */
  accessor: (row: T) => unknown;
  /** Custom cell renderer. If omitted, the accessor value is coerced to a string. */
  cell?: (value: unknown, row: T) => React.ReactNode;
  /** Whether the column is sortable. Defaults to `false`. */
  sortable?: boolean;
  /** Additional CSS class for the column header and cells. */
  className?: string;
  /** Column width (CSS value). */
  width?: string;
}

export interface DataTableProps<T> extends React.HTMLAttributes<HTMLDivElement> {
  /** Column definitions. */
  columns: ColumnDef<T>[];
  /** Row data. */
  data: T[];
  /** Unique key extractor for each row. */
  rowKey: (row: T, index: number) => string;
  /** Currently active sort column id. */
  sortColumn?: string;
  /** Current sort direction. */
  sortDirection?: SortDirection;
  /** Called when a sortable column header is clicked. */
  onSort?: (columnId: string, direction: SortDirection) => void;
  /** Number of rows per page. Set to `0` to disable pagination. Defaults to `0`. */
  pageSize?: number;
  /** Current page (0-indexed). */
  currentPage?: number;
  /** Total number of rows (for server-side pagination). If omitted, uses `data.length`. */
  totalRows?: number;
  /** Called when the page changes. */
  onPageChange?: (page: number) => void;
  /** Content to show when `data` is empty. */
  emptyContent?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------

function SortIndicator({ direction }: { direction?: SortDirection }) {
  return (
    <span className="ml-1 inline-flex flex-col text-[8px] leading-none" aria-hidden="true">
      <span className={direction === "asc" ? "text-foreground" : "text-foreground-tertiary"}>
        &#9650;
      </span>
      <span className={direction === "desc" ? "text-foreground" : "text-foreground-tertiary"}>
        &#9660;
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, totalRows, pageSize, onPageChange }: PaginationProps) {
  const start = currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-foreground-secondary">
      <span>
        {start}&ndash;{end} of {totalRows}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed min-h-[28px] min-w-[28px]"
          disabled={currentPage === 0}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          &lsaquo; Prev
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed min-h-[28px] min-w-[28px]"
          disabled={currentPage >= totalPages - 1}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          Next &rsaquo;
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sortable, paginated data table with type-safe column definitions.
 *
 * Supports custom cell renderers (for sparklines, badges, etc.), column
 * sorting, and built-in pagination controls.
 *
 * @example
 * ```tsx
 * <DataTable
 *   columns={[
 *     { id: "name", header: "Name", accessor: (r) => r.name, sortable: true },
 *     { id: "status", header: "Status", accessor: (r) => r.status,
 *       cell: (v) => <StatusBadge status={v as RunStatus} /> },
 *   ]}
 *   data={agents}
 *   rowKey={(r) => r.id}
 *   pageSize={10}
 * />
 * ```
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  sortColumn,
  sortDirection,
  onSort,
  pageSize = 0,
  currentPage = 0,
  totalRows,
  onPageChange,
  emptyContent,
  className,
  ...props
}: DataTableProps<T>) {
  const total = totalRows ?? data.length;
  const hasPagination = pageSize > 0;
  const totalPages = hasPagination ? Math.ceil(total / pageSize) : 1;

  // Client-side slice if not doing server-side pagination
  const visibleData =
    hasPagination && totalRows === undefined
      ? data.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      : data;

  function handleHeaderClick(col: ColumnDef<T>) {
    if (!col.sortable || !onSort) return;
    const nextDir: SortDirection =
      sortColumn === col.id && sortDirection === "asc" ? "desc" : "asc";
    onSort(col.id, nextDir);
  }

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-surface-card", className)}
      {...props}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-100">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-4 py-2.5 text-xs font-medium text-foreground-secondary uppercase tracking-wider whitespace-nowrap",
                    col.sortable && "cursor-pointer select-none hover:text-foreground",
                    col.className,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => handleHeaderClick(col)}
                  aria-sort={
                    sortColumn === col.id
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && (
                      <SortIndicator
                        direction={sortColumn === col.id ? sortDirection : undefined}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-foreground-secondary"
                >
                  {emptyContent ?? "No data"}
                </td>
              </tr>
            ) : (
              visibleData.map((row, rowIndex) => (
                <tr
                  key={rowKey(row, rowIndex)}
                  className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors duration-[var(--transition-fast)]"
                >
                  {columns.map((col) => {
                    const raw = col.accessor(row);
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          "px-4 py-2.5 text-sm text-foreground whitespace-nowrap",
                          col.className,
                        )}
                      >
                        {col.cell ? col.cell(raw, row) : String(raw ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasPagination && totalPages > 1 && onPageChange && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRows={total}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
