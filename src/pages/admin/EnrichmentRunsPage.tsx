/**
 * Admin page for viewing enrichment run history.
 *
 * Shows paginated table of enrichment runs with filters and links to details.
 */

import { useState } from "react"
import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import DateRangePicker from "../../components/admin/analytics/DateRangePicker"
import { useEnrichmentRuns, type EnrichmentRunFilters } from "../../hooks/admin/useEnrichmentRuns"

export default function EnrichmentRunsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<EnrichmentRunFilters>({})
  const pageSize = 20

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
            <h1 className="text-2xl font-bold text-white">Enrichment Runs</h1>
            <p className="mt-1 text-gray-400">View enrichment run history and performance</p>
          </div>
          <Link
            to="/admin/enrichment/start"
            className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
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

          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="exitReason" className="mb-1 block text-sm text-gray-400">
                  Exit Reason
                </label>
                <select
                  id="exitReason"
                  value={filters.exitReason || ""}
                  onChange={(e) =>
                    handleFilterChange({ ...filters, exitReason: e.target.value || undefined })
                  }
                  className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="cost_limit">Cost Limit</option>
                  <option value="error">Error</option>
                  <option value="interrupted">Interrupted</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => handleFilterChange({})}
              className="mt-4 text-sm text-gray-400 transition-colors hover:text-white"
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
            <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-700 bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Started
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Actors
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Enriched
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Fill Rate
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Cost
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No enrichment runs found
                        </td>
                      </tr>
                    ) : (
                      data.items.map((run) => (
                        <tr key={run.id} className="transition-colors hover:bg-gray-800">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/enrichment/runs/${run.id}`}
                              className="font-medium text-red-400 hover:text-red-300"
                            >
                              #{run.id}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {new Date(run.started_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {run.duration_ms
                              ? `${Math.round(run.duration_ms / 1000)}s`
                              : run.completed_at
                                ? "-"
                                : "Running..."}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-300">
                            {run.actors_processed}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-300">
                            {run.actors_enriched}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-300">
                            {run.fill_rate ? `${run.fill_rate}%` : "-"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-300">
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
                <p className="text-sm text-gray-400">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of{" "}
                  {data.total} runs
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-gray-300">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    case "error":
      return (
        <span className="inline-flex items-center rounded bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-200">
          Error
        </span>
      )
    case "interrupted":
      return (
        <span className="inline-flex items-center rounded bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-200">
          Interrupted
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-300">
          Unknown
        </span>
      )
  }
}
