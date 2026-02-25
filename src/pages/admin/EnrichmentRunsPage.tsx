/**
 * Admin page for viewing enrichment run history.
 *
 * Shows paginated table of enrichment runs with filters and links to details.
 */

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import DateRangePicker from "../../components/admin/analytics/DateRangePicker"
import { useEnrichmentRuns, type EnrichmentRunFilters } from "../../hooks/admin/useEnrichmentRuns"

export default function EnrichmentRunsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<EnrichmentRunFilters>({})
  const pageSize = 20
  const navigate = useNavigate()

  const { data, isLoading, error } = useEnrichmentRuns(page, pageSize, filters)

  const handleFilterChange = (newFilters: EnrichmentRunFilters) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page when filters change
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              Enrichment Runs
            </h1>
            <p className="mt-1 text-admin-text-muted">
              View enrichment run history and performance
            </p>
          </div>
          <Link
            to="/admin/enrichment/start"
            className="rounded bg-admin-danger px-4 py-2 text-admin-text-primary transition-colors hover:bg-red-700"
          >
            Start New Run
          </Link>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <DateRangePicker
            startDate={filters.startDate || ""}
            endDate={filters.endDate || ""}
            onChange={(startDate, endDate) =>
              handleFilterChange({
                ...filters,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
              })
            }
            showQuickFilters={false}
          />

          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="exitReason" className="mb-1 block text-sm text-admin-text-muted">
                  Exit Reason
                </label>
                <select
                  id="exitReason"
                  value={filters.exitReason || ""}
                  onChange={(e) =>
                    handleFilterChange({ ...filters, exitReason: e.target.value || undefined })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="cost_limit">Cost Limit</option>
                  <option value="no_actors_matched">No Actors Matched</option>
                  <option value="error">Error</option>
                  <option value="interrupted">Interrupted</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => handleFilterChange({})}
              className="mt-4 text-sm text-admin-text-muted transition-colors hover:text-admin-text-primary"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && (
          <ErrorMessage message="Failed to load enrichment runs. Please try again later." />
        )}

        {/* Data Table */}
        {data && (
          <>
            <div className="overflow-hidden rounded-lg border border-admin-border bg-admin-surface-elevated shadow-admin-sm">
              <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <table className="min-w-[600px] md:min-w-full">
                  <thead className="border-b border-admin-border bg-admin-surface-base">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Started
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Actors
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Enriched
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Fill Rate
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Cost
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-admin-text-muted">
                          No enrichment runs found
                        </td>
                      </tr>
                    ) : (
                      data.items.map((run) => (
                        <tr
                          key={run.id}
                          onClick={() => navigate(`/admin/enrichment/runs/${run.id}`)}
                          className="cursor-pointer transition-colors hover:bg-admin-interactive-secondary"
                        >
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/enrichment/runs/${run.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-admin-danger hover:text-red-300"
                            >
                              #{run.id}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-admin-text-secondary">
                            {new Date(run.started_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-admin-text-secondary">
                            {run.duration_ms
                              ? `${Math.round(run.duration_ms / 1000)}s`
                              : run.completed_at
                                ? "-"
                                : "Running..."}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-admin-text-secondary">
                            {run.actors_processed}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-admin-text-secondary">
                            {run.actors_enriched}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-admin-text-secondary">
                            {run.fill_rate ? `${run.fill_rate}%` : "-"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-admin-text-secondary">
                            ${parseFloat(run.total_cost_usd).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              exitReason={run.exit_reason}
                              hasErrors={run.error_count > 0}
                              isRunning={!run.completed_at}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-admin-text-muted">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of{" "}
                  {data.total} runs
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded border border-admin-border bg-admin-surface-elevated px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-admin-text-secondary">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="rounded border border-admin-border bg-admin-surface-elevated px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

/**
 * Status badge component for enrichment runs.
 */
function StatusBadge({
  exitReason,
  hasErrors,
  isRunning,
}: {
  exitReason: string | null
  hasErrors: boolean
  isRunning: boolean
}) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center rounded bg-blue-900 px-2.5 py-0.5 text-xs font-medium text-blue-200">
        Running
      </span>
    )
  }

  if (hasErrors) {
    return (
      <span className="inline-flex items-center rounded bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-200">
        Errors
      </span>
    )
  }

  switch (exitReason) {
    case "completed":
      return (
        <span className="inline-flex items-center rounded bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-200">
          Completed
        </span>
      )
    case "cost_limit":
      return (
        <span className="inline-flex items-center rounded bg-yellow-900 px-2.5 py-0.5 text-xs font-medium text-yellow-200">
          Cost Limit
        </span>
      )
    case "no_actors_matched":
      return (
        <span className="inline-flex items-center rounded bg-yellow-900 px-2.5 py-0.5 text-xs font-medium text-yellow-200">
          No Actors Matched
        </span>
      )
    case "error":
      return (
        <span className="inline-flex items-center rounded bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-200">
          Error
        </span>
      )
    case "interrupted":
      return (
        <span className="inline-flex items-center rounded bg-admin-interactive-secondary px-2.5 py-0.5 text-xs font-medium text-admin-text-secondary">
          Interrupted
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded bg-admin-interactive-secondary px-2.5 py-0.5 text-xs font-medium text-admin-text-secondary">
          Unknown
        </span>
      )
  }
}
