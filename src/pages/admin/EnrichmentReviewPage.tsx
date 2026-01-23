/**
 * Admin page for reviewing enrichment results.
 *
 * Shows paginated table of pending enrichments with filters and review actions.
 */

import { useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import EnrichmentReviewModal from "../../components/admin/EnrichmentReviewModal"
import CommitEnrichmentsModal from "../../components/admin/CommitEnrichmentsModal"
import {
  usePendingEnrichments,
  type PendingReviewFilters,
} from "../../hooks/admin/useEnrichmentReview"

export default function EnrichmentReviewPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<PendingReviewFilters>({})
  const [reviewModalId, setReviewModalId] = useState<number | null>(null)
  const [showCommitModal, setShowCommitModal] = useState(false)
  const pageSize = 20

  const { data, isLoading, error } = usePendingEnrichments(page, pageSize, filters)

  const handleFilterChange = (newFilters: PendingReviewFilters) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page when filters change
  }

  const stats = data
    ? {
        total: data.total,
        avgConfidence:
          data.items.length > 0
            ? (
                data.items.reduce((sum, item) => sum + item.overall_confidence, 0) /
                data.items.length
              ).toFixed(2)
            : "0.00",
      }
    : null

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Review Enrichments</h1>
            <p className="mt-1 text-gray-400">
              Review and approve enrichment results before committing to production
            </p>
          </div>
          <button
            onClick={() => setShowCommitModal(true)}
            disabled={!data || data.total === 0}
            className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Commit Approved
          </button>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Filters</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="runId" className="mb-1 block text-sm text-gray-400">
                Run ID
              </label>
              <input
                id="runId"
                type="number"
                value={filters.runId || ""}
                onChange={(e) =>
                  handleFilterChange({
                    ...filters,
                    runId: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                placeholder="All runs"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label htmlFor="minConfidence" className="mb-1 block text-sm text-gray-400">
                Min Overall Confidence: {filters.minConfidence?.toFixed(1) || "0.0"}
              </label>
              <input
                id="minConfidence"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.minConfidence || 0}
                onChange={(e) =>
                  handleFilterChange({
                    ...filters,
                    minConfidence: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="causeConfidence" className="mb-1 block text-sm text-gray-400">
                Cause Confidence
              </label>
              <select
                id="causeConfidence"
                value={filters.causeConfidence || ""}
                onChange={(e) =>
                  handleFilterChange({
                    ...filters,
                    causeConfidence: e.target.value
                      ? (e.target.value as "high" | "medium" | "low" | "disputed")
                      : undefined,
                  })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="disputed">Disputed</option>
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

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">Total Pending</p>
              <p className="mt-1 text-2xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">Avg Confidence</p>
              <p className="mt-1 text-2xl font-bold text-white">{stats.avgConfidence}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && (
          <ErrorMessage message="Failed to load pending enrichments. Please try again later." />
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
                        Actor Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Deathday
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Cause of Death
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">
                        Overall Conf.
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">
                        Cause Conf.
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Source
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Cost
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No pending enrichments found
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item) => (
                        <tr
                          key={item.enrichment_run_actor_id}
                          className="transition-colors hover:bg-gray-800"
                        >
                          <td className="px-4 py-3 text-sm text-white">{item.actor_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {item.deathday ? new Date(item.deathday).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {item.cause_of_death || "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ConfidenceBadge confidence={item.overall_confidence} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <CauseConfidenceBadge confidence={item.cause_confidence} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {item.winning_source || "-"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-300">
                            ${parseFloat(item.cost_usd).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setReviewModalId(item.enrichment_run_actor_id)}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700"
                            >
                              Review
                            </button>
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
                  {data.total} enrichments
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

      {/* Review Modal */}
      {reviewModalId && (
        <EnrichmentReviewModal
          enrichmentRunActorId={reviewModalId}
          onClose={() => setReviewModalId(null)}
          onSuccess={() => {
            setReviewModalId(null)
          }}
        />
      )}

      {/* Commit Modal */}
      {showCommitModal && filters.runId && (
        <CommitEnrichmentsModal
          runId={filters.runId}
          onClose={() => setShowCommitModal(false)}
          onSuccess={() => {
            setShowCommitModal(false)
          }}
        />
      )}
    </AdminLayout>
  )
}

/**
 * Confidence badge component for overall confidence scores.
 */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const colorClass =
    confidence >= 0.8
      ? "bg-green-900 text-green-200"
      : confidence >= 0.5
        ? "bg-yellow-900 text-yellow-200"
        : "bg-red-900 text-red-200"

  return (
    <span
      className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {confidence.toFixed(2)}
    </span>
  )
}

/**
 * Cause confidence badge component.
 */
function CauseConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) {
    return (
      <span className="inline-flex items-center rounded bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-300">
        -
      </span>
    )
  }

  const colorClass =
    confidence === "high"
      ? "bg-green-900 text-green-200"
      : confidence === "medium"
        ? "bg-yellow-900 text-yellow-200"
        : confidence === "low"
          ? "bg-orange-900 text-orange-200"
          : "bg-red-900 text-red-200" // disputed

  const label =
    confidence === "high"
      ? "High"
      : confidence === "medium"
        ? "Medium"
        : confidence === "low"
          ? "Low"
          : "Disputed"

  return (
    <span
      className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  )
}
