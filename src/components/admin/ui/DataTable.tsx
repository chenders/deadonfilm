/**
 * Enhanced data table with sorting, filtering, pagination, and export.
 */

import { useState, useMemo, useCallback, ReactNode } from "react"
import Skeleton from "./Skeleton"

// Column definition
export interface Column<T> {
  /** Unique key for the column (should match a key in T) */
  key: string
  /** Display label for the column header */
  label: string
  /** Whether the column is sortable */
  sortable?: boolean
  /** Whether the column is filterable (shows search input) */
  filterable?: boolean
  /** Custom render function for the cell */
  render?: (row: T, index: number) => ReactNode
  /** Width of the column (CSS value) */
  width?: string
  /** Alignment */
  align?: "left" | "center" | "right"
}

// Pagination config
export interface PaginationConfig {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

// Sort state
export interface SortState {
  key: string
  direction: "asc" | "desc"
}

interface DataTableProps<T> {
  /** Data rows to display */
  data: T[]
  /** Column definitions */
  columns: Column<T>[]
  /** Pagination configuration */
  pagination?: PaginationConfig
  /** Whether to enable row selection */
  selectable?: boolean
  /** Callback when selection changes */
  onSelectionChange?: (selectedRows: T[]) => void
  /** Callback to export data */
  onExport?: (format: "csv" | "json") => void
  /** Loading state */
  isLoading?: boolean
  /** Custom empty state message */
  emptyMessage?: string
  /** Row key extractor */
  getRowKey: (row: T) => string | number
  /** Initial sort state */
  initialSort?: SortState
  /** Callback when sort changes (for server-side sorting) */
  onSortChange?: (sort: SortState | null) => void
  /** Optional additional className */
  className?: string
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export default function DataTable<T>({
  data,
  columns,
  pagination,
  selectable = false,
  onSelectionChange,
  onExport,
  isLoading = false,
  emptyMessage = "No data available",
  getRowKey,
  initialSort,
  onSortChange,
  className = "",
}: DataTableProps<T>) {
  // Sort state
  const [sort, setSort] = useState<SortState | null>(initialSort || null)

  // Filter state (column key -> filter value)
  const [filters, setFilters] = useState<Record<string, string>>({})

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set())

  // Handle sort click
  const handleSort = useCallback(
    (key: string) => {
      const newSort: SortState | null =
        sort?.key === key
          ? sort.direction === "asc"
            ? { key, direction: "desc" }
            : null
          : { key, direction: "asc" }

      setSort(newSort)
      onSortChange?.(newSort)
    },
    [sort, onSortChange]
  )

  // Handle filter change
  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Handle row selection
  const handleSelectRow = useCallback(
    (row: T) => {
      const key = getRowKey(row)
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    },
    [getRowKey]
  )

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedKeys.size === data.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(data.map(getRowKey)))
    }
  }, [data, getRowKey, selectedKeys.size])

  // Get selected rows for callback
  const selectedRows = useMemo(
    () => data.filter((row) => selectedKeys.has(getRowKey(row))),
    [data, selectedKeys, getRowKey]
  )

  // Notify parent of selection changes
  useMemo(() => {
    onSelectionChange?.(selectedRows)
  }, [selectedRows, onSelectionChange])

  // Apply client-side filtering
  const filteredData = useMemo(() => {
    let result = data
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        result = result.filter((row) => {
          const cellValue = (row as Record<string, unknown>)[key]
          return String(cellValue).toLowerCase().includes(value.toLowerCase())
        })
      }
    })
    return result
  }, [data, filters])

  // Apply client-side sorting (only if no pagination, meaning client-side)
  const sortedData = useMemo(() => {
    if (!sort || pagination) return filteredData
    return [...filteredData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sort.key]
      const bVal = (b as Record<string, unknown>)[sort.key]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      const comparison = aVal < bVal ? -1 : 1
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [filteredData, sort, pagination])

  // Check if any column has filters
  const hasFilters = columns.some((col) => col.filterable)

  // Loading state
  if (isLoading) {
    return <Skeleton.Table rows={5} columns={columns.length} className={className} />
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div
        className={`rounded-lg border border-admin-border bg-admin-surface-elevated p-8 text-center ${className}`}
      >
        <svg
          className="mx-auto h-12 w-12 text-admin-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="mt-4 text-sm text-admin-text-muted">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border border-admin-border bg-admin-surface-elevated ${className}`}>
      {/* Toolbar */}
      {(onExport || (selectable && selectedKeys.size > 0)) && (
        <div className="flex items-center justify-between border-b border-admin-border p-3">
          <div className="flex items-center gap-2">
            {selectable && selectedKeys.size > 0 && (
              <span className="text-sm text-admin-text-secondary">
                {selectedKeys.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onExport && (
              <div className="relative">
                <select
                  className="appearance-none rounded border border-admin-border bg-admin-surface-overlay px-3 py-1.5 pr-8 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
                  onChange={(e) => {
                    if (e.target.value) {
                      onExport(e.target.value as "csv" | "json")
                      e.target.value = ""
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Export
                  </option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {/* Header row */}
            <tr className="border-b border-admin-border bg-admin-surface-inset">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedKeys.size === data.length && data.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-admin-interactive"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-admin-text-muted ${
                    col.align === "center"
                      ? "text-center"
                      : col.align === "right"
                        ? "text-right"
                        : "text-left"
                  }`}
                  style={{ width: col.width }}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-admin-text-primary"
                    >
                      {col.label}
                      <span className="inline-flex flex-col">
                        <svg
                          className={`h-2 w-2 ${sort?.key === col.key && sort.direction === "asc" ? "text-admin-interactive" : ""}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 5l7 7H5z" />
                        </svg>
                        <svg
                          className={`-mt-1 h-2 w-2 ${sort?.key === col.key && sort.direction === "desc" ? "text-admin-interactive" : ""}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 19l-7-7h14z" />
                        </svg>
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
            {/* Filter row */}
            {hasFilters && (
              <tr className="border-b border-admin-border bg-admin-surface-inset">
                {selectable && <th className="px-3 py-2" />}
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2">
                    {col.filterable ? (
                      <input
                        type="text"
                        placeholder={`Filter ${col.label.toLowerCase()}...`}
                        value={filters[col.key] || ""}
                        onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        className="w-full rounded border border-admin-border bg-admin-surface-overlay px-2 py-1 text-sm text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-admin-border-subtle">
            {sortedData.map((row, rowIndex) => {
              const key = getRowKey(row)
              const isSelected = selectedKeys.has(key)
              return (
                <tr
                  key={key}
                  className={`transition-colors ${isSelected ? "bg-admin-info-bg" : "hover:bg-admin-surface-overlay"}`}
                >
                  {selectable && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(row)}
                        className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-admin-interactive"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 text-sm text-admin-text-primary ${
                        col.align === "center"
                          ? "text-center"
                          : col.align === "right"
                            ? "text-right"
                            : "text-left"
                      }`}
                    >
                      {col.render
                        ? col.render(row, rowIndex)
                        : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between border-t border-admin-border px-3 py-3">
          <div className="flex items-center gap-2 text-sm text-admin-text-muted">
            <span>
              Showing {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}{" "}
              to {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
              {pagination.total}
            </span>
            {pagination.onPageSizeChange && (
              <select
                value={pagination.pageSize}
                onChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
                className="rounded border border-admin-border bg-admin-surface-overlay px-2 py-1 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
              >
                {(pagination.pageSizeOptions || PAGE_SIZE_OPTIONS).map((size) => (
                  <option key={size} value={size}>
                    {size}/page
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded p-1.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            {generatePageNumbers(
              pagination.page,
              Math.ceil(pagination.total / pagination.pageSize)
            ).map((pageNum, idx) =>
              pageNum === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-admin-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => pagination.onPageChange(pageNum as number)}
                  className={`min-w-[2rem] rounded px-2 py-1 text-sm transition-colors ${
                    pagination.page === pageNum
                      ? "bg-admin-interactive text-white"
                      : "text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
                  }`}
                >
                  {pageNum}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              className="rounded p-1.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper to generate page numbers with ellipsis
function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | "...")[] = []

  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, "...", total)
  } else if (current >= total - 3) {
    pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", total)
  }

  return pages
}
