import { ReactNode } from "react"
import DataTable, { Column, PaginationConfig, SortState } from "./DataTable"
import MobileCard, { MobileCardField } from "./MobileCard"

export interface ResponsiveDataViewProps<T> {
  /** Data rows */
  data: T[]
  /** Column definitions for the desktop table */
  columns: Column<T>[]
  /** How to render each row as a mobile card */
  renderMobileCard: (
    row: T,
    index: number
  ) => {
    title: ReactNode
    subtitle?: ReactNode
    fields?: MobileCardField[]
    actions?: ReactNode
  }
  /** Row key extractor */
  getRowKey: (row: T) => string | number
  /** Pagination config */
  pagination?: PaginationConfig
  /** Whether rows are selectable */
  selectable?: boolean
  /** Selected row keys (for mobile card checkboxes) */
  selectedKeys?: Set<string | number>
  /** Callback when a row's selection changes */
  onRowSelectionChange?: (row: T, selected: boolean) => void
  /** Callback when selection changes (DataTable format) */
  onSelectionChange?: (selectedRows: T[]) => void
  /** Export handler */
  onExport?: (format: "csv" | "json") => void
  /** Loading state */
  isLoading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Initial sort state */
  initialSort?: SortState
  /** Sort change callback */
  onSortChange?: (sort: SortState | null) => void
  /** Additional className */
  className?: string
}

export default function ResponsiveDataView<T>({
  data,
  columns,
  renderMobileCard,
  getRowKey,
  pagination,
  selectable,
  selectedKeys,
  onRowSelectionChange,
  onSelectionChange,
  onExport,
  isLoading,
  emptyMessage,
  initialSort,
  onSortChange,
  className,
}: ResponsiveDataViewProps<T>) {
  return (
    <>
      {/* Desktop: DataTable */}
      <div className={`hidden md:block ${className ?? ""}`}>
        <DataTable
          data={data}
          columns={columns}
          getRowKey={getRowKey}
          pagination={pagination}
          selectable={selectable}
          onSelectionChange={onSelectionChange}
          onExport={onExport}
          isLoading={isLoading}
          emptyMessage={emptyMessage}
          initialSort={initialSort}
          onSortChange={onSortChange}
        />
      </div>

      {/* Mobile: Card list */}
      <div className={`md:hidden ${className ?? ""}`}>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg border border-admin-border bg-admin-surface-elevated"
              />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-8 text-center text-sm text-admin-text-muted">
            {emptyMessage ?? "No data available"}
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((row, index) => {
              const key = getRowKey(row)
              const card = renderMobileCard(row, index)
              return (
                <MobileCard
                  key={key}
                  title={card.title}
                  subtitle={card.subtitle}
                  fields={card.fields}
                  actions={card.actions}
                  selectable={selectable}
                  selected={selectedKeys?.has(key)}
                  onSelectionChange={
                    onRowSelectionChange
                      ? (selected) => onRowSelectionChange(row, selected)
                      : undefined
                  }
                  data-testid={`mobile-card-${key}`}
                />
              )
            })}

            {/* Mobile pagination */}
            {pagination &&
              (() => {
                const totalPages = Math.ceil(pagination.total / pagination.pageSize)
                return totalPages > 1 ? (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-admin-text-muted">
                      Page {pagination.page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => pagination.onPageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        aria-label="Previous page"
                        className="min-h-[44px] min-w-[44px] rounded-md bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => pagination.onPageChange(pagination.page + 1)}
                        disabled={pagination.page >= totalPages}
                        aria-label="Next page"
                        className="min-h-[44px] min-w-[44px] rounded-md bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null
              })()}
          </div>
        )}
      </div>
    </>
  )
}
