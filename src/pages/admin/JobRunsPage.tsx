/**
 * Job Runs History Page
 *
 * Displays paginated job run history with filters for status, type, and queue.
 * Allows retrying failed jobs and viewing detailed job information.
 */

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { Skeleton, type Column } from "../../components/admin/ui"
import { useJobRuns, useRetryJob, type JobRun, type JobRunFilters } from "../../hooks/useJobQueue"

// Job type display names
const jobTypeLabels: Record<string, string> = {
  "fetch-omdb-ratings": "OMDb Ratings",
  "fetch-trakt-ratings": "Trakt Ratings",
  "fetch-thetvdb-scores": "TheTVDB Scores",
  "enrich-death-details": "Death Details",
  "enrich-cause-of-death": "Cause of Death",
  "warm-actor-cache": "Actor Cache",
  "warm-content-cache": "Content Cache",
  "process-actor-image": "Actor Image",
  "process-poster-image": "Poster Image",
  "generate-sitemap": "Sitemap",
  "cleanup-old-jobs": "Cleanup Jobs",
  "sync-tmdb-changes": "TMDB Sync",
}

// Status badge styles
const statusStyles: Record<string, string> = {
  pending: "bg-admin-info-bg text-admin-interactive",
  active: "bg-admin-success/20 text-admin-success",
  completed: "bg-admin-text-muted/20 text-admin-text-secondary",
  failed: "bg-admin-danger/20 text-admin-danger",
  delayed: "bg-admin-warning/20 text-admin-warning",
  cancelled: "bg-admin-text-muted/20 text-admin-text-muted",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[status] || statusStyles.pending}`}
    >
      {status}
    </span>
  )
}

function JobTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block rounded bg-admin-surface-inset px-2 py-0.5 font-mono text-xs text-admin-text-secondary">
      {jobTypeLabels[type] || type}
    </span>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  return `${diffDay}d ago`
}

export default function JobRunsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse filters from URL
  const filters: JobRunFilters = {
    page: parseInt(searchParams.get("page") || "1"),
    pageSize: parseInt(searchParams.get("pageSize") || "20"),
    status: searchParams.get("status") || undefined,
    jobType: searchParams.get("jobType") || undefined,
    queueName: searchParams.get("queueName") || undefined,
  }

  const { data, isLoading, error } = useJobRuns(filters)
  const retryJob = useRetryJob()

  // State for expanded error rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Update URL params
  const updateFilters = (newFilters: Partial<JobRunFilters>) => {
    const params = new URLSearchParams()
    const merged = { ...filters, ...newFilters }

    if (merged.page && merged.page > 1) params.set("page", String(merged.page))
    if (merged.pageSize && merged.pageSize !== 20) params.set("pageSize", String(merged.pageSize))
    if (merged.status) params.set("status", merged.status)
    if (merged.jobType) params.set("jobType", merged.jobType)
    if (merged.queueName) params.set("queueName", merged.queueName)

    setSearchParams(params)
  }

  // Table columns
  const columns: Column<JobRun>[] = [
    {
      key: "job_id",
      label: "Job ID",
      width: "180px",
      render: (row) => (
        <Link
          to={`/admin/jobs/runs/${row.id}`}
          className="font-mono text-xs text-admin-interactive hover:underline"
          title={row.job_id}
        >
          {row.job_id.length > 20 ? `${row.job_id.slice(0, 20)}...` : row.job_id}
        </Link>
      ),
    },
    {
      key: "job_type",
      label: "Type",
      render: (row) => <JobTypeBadge type={row.job_type} />,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "attempts",
      label: "Attempts",
      align: "center",
      render: (row) => (
        <span className="text-sm text-admin-text-secondary">
          {row.attempts}/{row.max_attempts}
        </span>
      ),
    },
    {
      key: "duration_ms",
      label: "Duration",
      align: "right",
      render: (row) => (
        <span className="text-sm text-admin-text-secondary">{formatDuration(row.duration_ms)}</span>
      ),
    },
    {
      key: "queued_at",
      label: "Queued",
      render: (row) => (
        <span className="text-sm text-admin-text-muted" title={row.queued_at}>
          {formatRelativeTime(row.queued_at)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {row.error_message && (
            <button
              onClick={() => toggleExpanded(row.id)}
              className="rounded p-1 text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
              title="Toggle error details"
            >
              <svg
                className={`h-4 w-4 transition-transform ${expandedRows.has(row.id) ? "rotate-180" : ""}`}
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
            </button>
          )}
          {row.status === "failed" && (
            <button
              onClick={() => retryJob.mutate(row.id)}
              disabled={retryJob.isPending}
              className="rounded px-2 py-1 text-xs font-medium text-admin-interactive hover:bg-admin-info-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Retry
            </button>
          )}
          <Link
            to={`/admin/jobs/runs/${row.id}`}
            className="rounded px-2 py-1 text-xs font-medium text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
          >
            View
          </Link>
        </div>
      ),
    },
  ]

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-5 w-64" />
          </div>
          <Skeleton.Table rows={10} columns={7} />
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="py-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-admin-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="mt-4 text-admin-danger">Failed to load job runs</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover"
          >
            Retry
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/jobs"
                className="text-admin-text-muted hover:text-admin-text-primary"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-admin-text-primary">Job History</h1>
            </div>
            <p className="mt-1 text-admin-text-muted">
              {data?.pagination.total.toLocaleString()} total jobs
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
          <div>
            <label
              htmlFor="filter-status"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status || ""}
              onChange={(e) => updateFilters({ status: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="delayed">Delayed</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-job-type"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Job Type
            </label>
            <select
              id="filter-job-type"
              value={filters.jobType || ""}
              onChange={(e) => updateFilters({ jobType: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            >
              <option value="">All Types</option>
              {Object.entries(jobTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-queue"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Queue
            </label>
            <select
              id="filter-queue"
              value={filters.queueName || ""}
              onChange={(e) => updateFilters({ queueName: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            >
              <option value="">All Queues</option>
              <option value="ratings">Ratings</option>
              <option value="enrichment">Enrichment</option>
              <option value="cache">Cache</option>
              <option value="images">Images</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {(filters.status || filters.jobType || filters.queueName) && (
            <div className="flex items-end">
              <button
                onClick={() =>
                  updateFilters({
                    status: undefined,
                    jobType: undefined,
                    queueName: undefined,
                    page: 1,
                  })
                }
                className="rounded-md px-3 py-1.5 text-sm text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-admin-border bg-admin-surface-inset">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-admin-text-muted ${
                        col.align === "center"
                          ? "text-center"
                          : col.align === "right"
                            ? "text-right"
                            : "text-left"
                      }`}
                      style={{ width: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border-subtle">
                {data?.runs.map((row) => (
                  <>
                    <tr key={row.id} className="hover:bg-admin-surface-overlay">
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-4 py-3 ${
                            col.align === "center"
                              ? "text-center"
                              : col.align === "right"
                                ? "text-right"
                                : "text-left"
                          }`}
                        >
                          {col.render
                            ? col.render(row, 0)
                            : String((row as unknown as Record<string, unknown>)[col.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                    {/* Expanded error row */}
                    {expandedRows.has(row.id) && row.error_message && (
                      <tr key={`${row.id}-error`} className="bg-admin-danger/5">
                        <td colSpan={columns.length} className="px-4 py-3">
                          <div className="text-sm">
                            <div className="font-medium text-admin-danger">Error:</div>
                            <div className="mt-1 font-mono text-xs text-admin-text-secondary">
                              {row.error_message}
                            </div>
                            {row.error_stack && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-admin-text-muted hover:text-admin-text-secondary">
                                  Stack trace
                                </summary>
                                <pre className="mt-1 max-h-40 overflow-auto rounded bg-admin-surface-inset p-2 font-mono text-xs text-admin-text-muted">
                                  {row.error_stack}
                                </pre>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.total > 0 && (
            <div className="flex items-center justify-between border-t border-admin-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-admin-text-muted">
                <span>
                  Showing{" "}
                  {Math.min(
                    (data.pagination.page - 1) * data.pagination.pageSize + 1,
                    data.pagination.total
                  )}{" "}
                  to{" "}
                  {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}{" "}
                  of {data.pagination.total}
                </span>
                <select
                  value={filters.pageSize || 20}
                  onChange={(e) => updateFilters({ pageSize: Number(e.target.value), page: 1 })}
                  className="rounded border border-admin-border bg-admin-surface-overlay px-2 py-1 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}/page
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateFilters({ page: data.pagination.page - 1 })}
                  disabled={data.pagination.page <= 1}
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
                <span className="px-3 text-sm text-admin-text-secondary">
                  Page {data.pagination.page} of {data.pagination.totalPages}
                </span>
                <button
                  onClick={() => updateFilters({ page: data.pagination.page + 1 })}
                  disabled={data.pagination.page >= data.pagination.totalPages}
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

          {/* Empty state */}
          {data?.runs.length === 0 && (
            <div className="py-12 text-center">
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="mt-4 text-sm text-admin-text-muted">No job runs found</p>
              {(filters.status || filters.jobType || filters.queueName) && (
                <button
                  onClick={() =>
                    updateFilters({
                      status: undefined,
                      jobType: undefined,
                      queueName: undefined,
                      page: 1,
                    })
                  }
                  className="mt-2 text-sm text-admin-interactive hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
