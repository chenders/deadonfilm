import { useState } from "react"
import { useRejectedFactors } from "../../../hooks/admin/useRejectedFactors"
import MobileCard from "../ui/MobileCard"
import { formatDate } from "../../../utils/formatDate"

type FilterType = "all" | "life" | "death"

export default function RejectedFactorsTab() {
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState<FilterType>("all")

  const typeParam = filterType === "all" ? undefined : filterType
  const { data, isLoading, isError } = useRejectedFactors(page, 50, typeParam)

  return (
    <div className="space-y-6">
      {/* Header + Filter */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-admin-text-primary">
              Rejected Notable Factors
            </h3>
            <p className="mt-1 text-sm text-admin-text-muted">
              Tags suggested by Claude during enrichment that aren't in the valid factor sets
            </p>
          </div>
          <div className="shrink-0">
            <label htmlFor="factor-type-filter" className="sr-only">
              Filter by type
            </label>
            <select
              id="factor-type-filter"
              data-testid="factor-type-filter"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as FilterType)
                setPage(1)
              }}
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
            >
              <option value="all">All Types</option>
              <option value="life">Life Factors</option>
              <option value="death">Death Factors</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
          <div className="text-admin-text-muted">Loading rejected factors...</div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="border-admin-danger/50 bg-admin-danger/20 rounded-md border p-4 text-admin-danger">
          Failed to load rejected factors. Please try again.
        </div>
      )}

      {/* Data */}
      {data && (
        <div
          className="rounded-lg bg-admin-surface-elevated shadow-admin-sm"
          data-testid="rejected-factors-table"
        >
          {/* Mobile cards */}
          <div className="space-y-3 p-4 md:hidden">
            {data.items.length === 0 ? (
              <p className="py-8 text-center text-admin-text-muted">No rejected factors found</p>
            ) : (
              data.items.map((item) => (
                <MobileCard
                  key={`${item.factorName}-${item.factorType}`}
                  title={<span className="font-mono text-sm">{item.factorName}</span>}
                  subtitle={
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        item.factorType === "life"
                          ? "bg-[var(--life-factor-bg)] text-[var(--life-factor-text)]"
                          : "bg-[var(--deceased-bg)] text-[var(--deceased-badge-text)]"
                      }`}
                    >
                      {item.factorType}
                    </span>
                  }
                  fields={[
                    {
                      label: "Occurrences",
                      value: item.occurrenceCount.toString(),
                    },
                    {
                      label: "Last Seen",
                      value: formatDate(item.lastSeen),
                    },
                    {
                      label: "Recent Actors",
                      value:
                        item.recentActors.length > 0
                          ? item.recentActors.map((a) => a.name).join(", ")
                          : "N/A",
                    },
                  ]}
                />
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] divide-y divide-admin-border">
              <thead className="bg-admin-surface-overlay">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Factor Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Occurrences
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Recent Actors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                {data.items.map((item) => (
                  <tr key={`${item.factorName}-${item.factorType}`}>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-mono text-sm text-admin-text-primary">
                        {item.factorName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          item.factorType === "life"
                            ? "bg-[var(--life-factor-bg)] text-[var(--life-factor-text)]"
                            : "bg-[var(--deceased-bg)] text-[var(--deceased-badge-text)]"
                        }`}
                      >
                        {item.factorType}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                      {item.occurrenceCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                      {formatDate(item.lastSeen)}
                    </td>
                    <td className="max-w-xs truncate px-6 py-4 text-sm text-admin-text-secondary">
                      {item.recentActors.length > 0
                        ? item.recentActors.map((a) => a.name).join(", ")
                        : "N/A"}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-admin-text-muted">
                      No rejected factors found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-admin-border px-4 py-3 md:px-6">
              <div className="text-sm text-admin-text-muted">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data?.totalPages || 1, p + 1))}
                  disabled={page === data?.totalPages}
                  className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
