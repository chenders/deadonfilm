/**
 * Job Details Page
 *
 * Shows detailed information about a single job run including:
 * - Job metadata (ID, type, queue, status)
 * - Timeline (queued -> started -> completed/failed)
 * - Payload and result data
 * - Error details if failed
 */

import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { Card, Skeleton } from "../../components/admin/ui"
import { useJobRun, useRetryJob } from "../../hooks/useJobQueue"

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
      className={`inline-block rounded-full px-3 py-1 text-sm font-medium capitalize ${statusStyles[status] || statusStyles.pending}`}
    >
      {status}
    </span>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  return date.toLocaleString()
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

function JsonViewer({ data, title }: { data: unknown; title: string }) {
  if (data === null || data === undefined) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-inset p-4">
        <div className="mb-2 text-sm font-medium text-admin-text-muted">{title}</div>
        <div className="text-sm italic text-admin-text-muted">No data</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-inset p-4">
      <div className="mb-2 text-sm font-medium text-admin-text-muted">{title}</div>
      <pre className="overflow-x-auto text-sm text-admin-text-primary">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function TimelineStep({
  label,
  time,
  isCompleted,
  isActive,
  isFailed,
}: {
  label: string
  time: string | null
  isCompleted: boolean
  isActive?: boolean
  isFailed?: boolean
}) {
  const dotClass = isFailed
    ? "bg-admin-danger"
    : isActive
      ? "bg-admin-success animate-pulse"
      : isCompleted
        ? "bg-admin-success"
        : "bg-admin-surface-inset"

  return (
    <div className="flex items-start gap-3">
      <div className="relative flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full ${dotClass}`} />
        <div className="absolute top-3 h-full w-px bg-admin-border" />
      </div>
      <div className="pb-6">
        <div className="text-sm font-medium text-admin-text-primary">{label}</div>
        <div className="text-xs text-admin-text-muted">{formatDate(time)}</div>
      </div>
    </div>
  )
}

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = parseInt(id || "0")

  const { data: job, isLoading, error } = useJobRun(jobId)
  const retryJob = useRetryJob()

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
          <Skeleton.Card />
        </div>
      </AdminLayout>
    )
  }

  if (error || !job) {
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
          <p className="mt-4 text-admin-danger">Job not found</p>
          <Link
            to="/admin/jobs/runs"
            className="mt-4 inline-block rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover"
          >
            Back to Job History
          </Link>
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
                to="/admin/jobs/runs"
                className="text-admin-text-muted hover:text-admin-text-primary"
                aria-label="Back to job history"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-admin-text-primary">Job Details</h1>
            </div>
            <p className="mt-1 font-mono text-sm text-admin-text-muted">{job.job_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            {job.status === "failed" && (
              <button
                onClick={() => retryJob.mutate(job.id)}
                disabled={retryJob.isPending}
                className="rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryJob.isPending ? "Retrying..." : "Retry Job"}
              </button>
            )}
          </div>
        </div>

        {/* Retry success message */}
        {retryJob.isSuccess && (
          <div className="bg-admin-success/10 rounded-lg p-4 text-sm text-admin-success">
            Job retry initiated. New job ID: {retryJob.data.jobId}
          </div>
        )}

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: Metadata */}
          <div className="space-y-6 lg:col-span-2">
            {/* Job Info */}
            <Card title="Job Information">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Job Type
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-admin-text-primary">{job.job_type}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Queue
                  </dt>
                  <dd className="mt-1 text-sm capitalize text-admin-text-primary">
                    {job.queue_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Priority
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">{job.priority}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Attempts
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {job.attempts} / {job.max_attempts}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                    Duration
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {formatDuration(job.duration_ms)}
                  </dd>
                </div>
                {job.worker_id && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Worker ID
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-admin-text-primary">
                      {job.worker_id}
                    </dd>
                  </div>
                )}
                {job.created_by && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Created By
                    </dt>
                    <dd className="mt-1 text-sm text-admin-text-primary">{job.created_by}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* Payload */}
            <Card title="Payload">
              <JsonViewer data={job.payload} title="Input Data" />
            </Card>

            {/* Result (if completed) */}
            {job.result && (
              <Card title="Result">
                <JsonViewer data={job.result} title="Output Data" />
              </Card>
            )}

            {/* Error (if failed) */}
            {job.error_message && (
              <Card title="Error Details">
                <div className="space-y-4">
                  <div className="border-admin-danger/30 bg-admin-danger/10 rounded-lg border p-4">
                    <div className="text-sm font-medium text-admin-danger">Error Message</div>
                    <div className="mt-1 text-sm text-admin-text-primary">{job.error_message}</div>
                  </div>
                  {job.error_stack && (
                    <div>
                      <div className="mb-2 text-sm font-medium text-admin-text-muted">
                        Stack Trace
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-admin-surface-inset p-4 font-mono text-xs text-admin-text-secondary">
                        {job.error_stack}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Right column: Timeline */}
          <div>
            <Card title="Timeline">
              <div className="space-y-1">
                <TimelineStep label="Queued" time={job.queued_at} isCompleted={true} />
                <TimelineStep
                  label="Started"
                  time={job.started_at}
                  isCompleted={!!job.started_at}
                  isActive={job.status === "active"}
                />
                <TimelineStep
                  label={job.status === "failed" ? "Failed" : "Completed"}
                  time={job.completed_at}
                  isCompleted={!!job.completed_at}
                  isFailed={job.status === "failed"}
                />
              </div>
            </Card>

            {/* Quick Stats */}
            <Card title="Quick Stats" className="mt-6">
              <div className="space-y-4">
                {job.started_at && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Wait Time
                    </div>
                    <div className="mt-1 text-lg font-semibold text-admin-text-primary">
                      {formatDuration(
                        new Date(job.started_at).getTime() - new Date(job.queued_at).getTime()
                      )}
                    </div>
                  </div>
                )}
                {job.duration_ms !== null && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Processing Time
                    </div>
                    <div className="mt-1 text-lg font-semibold text-admin-text-primary">
                      {formatDuration(job.duration_ms)}
                    </div>
                  </div>
                )}
                {job.completed_at && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Total Time
                    </div>
                    <div className="mt-1 text-lg font-semibold text-admin-text-primary">
                      {formatDuration(
                        new Date(job.completed_at).getTime() - new Date(job.queued_at).getTime()
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
