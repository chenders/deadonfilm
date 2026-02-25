/**
 * Admin page for viewing bio enrichment run history.
 *
 * Shows paginated table of bio enrichment runs with filters and links to details.
 * Pattern: src/pages/admin/EnrichmentRunsPage.tsx
 */

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import {
  useBioEnrichmentRuns,
  type BioEnrichmentRunFilters,
} from "../../hooks/admin/useBioEnrichmentRuns"

export default function BioEnrichmentRunsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<BioEnrichmentRunFilters>({})
  const pageSize = 20
  const navigate = useNavigate()

  const { data, isLoading, error } = useBioEnrichmentRuns(page, pageSize, filters)

  const handleFilterChange = (newFilters: BioEnrichmentRunFilters) => {
    setFilters(newFilters)
    setPage(1)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              Bio Enrichment Runs
            </h1>
            <p className="mt-1 text-admin-text-muted">
              Multi-source biography enrichment run history and performance
            </p>
          </div>
          <Link
            to="/admin/bio-enrichment/start"
            className="rounded bg-admin-danger px-4 py-2 text-admin-text-primary transition-colors hover:bg-red-700"
          >
            Start New Run
          </Link>
        </div>

        {/* Filters */}
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
            <div>
              <label htmlFor="status" className="mb-1 block text-sm text-admin-text-muted">
                Status
              </label>
              <select
                id="status"
                value={filters.status || ""}
                onChange={(e) =>
                  handleFilterChange({ ...filters, status: e.target.value || undefined })
                }
                className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
              >
                <option value="">All</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="stopped">Stopped</option>
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

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <ErrorMessage message="Failed to load bio enrichment runs. Please try again later." />
        )}

        {data && (
          <>
            <div className="overflow-hidden rounded-lg border border-admin-border bg-admin-surface-elevated shadow-admin-sm">
              <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <table className="min-w-[700px] md:min-w-full">
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
                          No bio enrichment runs found
                        </td>
                      </tr>
                    ) : (
                      data.items.map((run) => (
                        <tr
                          key={run.id}
                          onClick={() => navigate(`/admin/bio-enrichment/runs/${run.id}`)}
                          className="cursor-pointer transition-colors hover:bg-admin-interactive-secondary"
                        >
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/bio-enrichment/runs/${run.id}`}
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
                              : run.status === "running"
                                ? "Running..."
                                : "-"}
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
                            <RunStatusBadge status={run.status} exitReason={run.exit_reason} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

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

function RunStatusBadge({ status, exitReason }: { status: string; exitReason: string | null }) {
  switch (status) {
    case "running":
    case "pending":
      return (
        <span className="inline-flex items-center rounded bg-blue-900 px-2.5 py-0.5 text-xs font-medium text-blue-200">
          {status === "pending" ? "Pending" : "Running"}
        </span>
      )
    case "completed":
      if (exitReason === "cost_limit") {
        return (
          <span className="inline-flex items-center rounded bg-yellow-900 px-2.5 py-0.5 text-xs font-medium text-yellow-200">
            Cost Limit
          </span>
        )
      }
      if (exitReason === "no_actors_matched") {
        return (
          <span className="inline-flex items-center rounded bg-yellow-900 px-2.5 py-0.5 text-xs font-medium text-yellow-200">
            No Actors Matched
          </span>
        )
      }
      return (
        <span className="inline-flex items-center rounded bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-200">
          Completed
        </span>
      )
    case "failed":
      return (
        <span className="inline-flex items-center rounded bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-200">
          Failed
        </span>
      )
    case "stopped":
      return (
        <span className="inline-flex items-center rounded bg-admin-interactive-secondary px-2.5 py-0.5 text-xs font-medium text-admin-text-secondary">
          Stopped
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded bg-admin-interactive-secondary px-2.5 py-0.5 text-xs font-medium text-admin-text-secondary">
          {status}
        </span>
      )
  }
}
