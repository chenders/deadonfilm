/**
 * Dead Letter Queue Page
 *
 * Shows permanently failed jobs that need manual review.
 * Allows marking jobs as reviewed and retrying them.
 */

import { useState } from "react"
import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { Card, Skeleton } from "../../components/admin/ui"
import {
  useDeadLetterQueue,
  useReviewDeadLetterJob,
  useRetryJob,
  type DeadLetterJob,
} from "../../hooks/useJobQueue"

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

function DeadLetterJobCard({
  job,
  onReview,
  onRetry,
  isReviewing,
  isRetrying,
}: {
  job: DeadLetterJob
  onReview: (notes?: string) => void
  onRetry: () => void
  isReviewing: boolean
  isRetrying: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewNotes, setReviewNotes] = useState("")

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded bg-admin-surface-inset px-2 py-0.5 font-mono text-xs text-admin-text-secondary">
              {jobTypeLabels[job.job_type] || job.job_type}
            </span>
            <span className="text-xs text-admin-text-muted">{job.queue_name}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-admin-text-muted" title={job.job_id}>
            {job.job_id.length > 30 ? `${job.job_id.slice(0, 30)}...` : job.job_id}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-admin-text-muted" title={new Date(job.failed_at).toLocaleString()}>
            {formatRelativeTime(job.failed_at)}
          </div>
          <div className="text-xs text-admin-danger">{job.attempts} attempts</div>
        </div>
      </div>

      {/* Error message */}
      <div className="mt-3 rounded-md bg-admin-danger/10 p-3">
        <div className="text-sm text-admin-danger">{job.final_error}</div>
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-3 flex w-full items-center justify-between text-sm text-admin-text-muted hover:text-admin-text-primary"
      >
        <span>Payload & Details</span>
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-admin-text-muted">Payload</div>
            <pre className="max-h-40 overflow-auto rounded-md bg-admin-surface-inset p-2 font-mono text-xs text-admin-text-secondary">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Review notes (if reviewed) */}
      {job.reviewed && job.review_notes && (
        <div className="mt-3 rounded-md bg-admin-info-bg p-3">
          <div className="text-xs font-medium text-admin-interactive">Review Notes</div>
          <div className="mt-1 text-sm text-admin-text-primary">{job.review_notes}</div>
          <div className="mt-1 text-xs text-admin-text-muted">
            Reviewed by {job.reviewed_by} on {new Date(job.reviewed_at!).toLocaleString()}
          </div>
        </div>
      )}

      {/* Review form */}
      {showReviewForm && (
        <div className="mt-3 space-y-3">
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Add review notes (optional)..."
            className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                onReview(reviewNotes || undefined)
                setShowReviewForm(false)
                setReviewNotes("")
              }}
              disabled={isReviewing}
              className="rounded-md bg-admin-interactive px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReviewing ? "Marking..." : "Mark Reviewed"}
            </button>
            <button
              onClick={() => {
                setShowReviewForm(false)
                setReviewNotes("")
              }}
              className="rounded-md px-3 py-1.5 text-sm text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showReviewForm && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="rounded-md bg-admin-interactive px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
          {!job.reviewed && (
            <button
              onClick={() => setShowReviewForm(true)}
              className="rounded-md border border-admin-border px-3 py-1.5 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-surface-overlay"
            >
              Review
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function DeadLetterQueuePage() {
  const [page, setPage] = useState(1)
  const [showReviewed, setShowReviewed] = useState(false)
  const pageSize = 20

  const { data, isLoading, error } = useDeadLetterQueue(page, pageSize, showReviewed)
  const reviewJob = useReviewDeadLetterJob()
  const retryJob = useRetryJob()

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton.Card key={i} />
            ))}
          </div>
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
          <p className="mt-4 text-admin-danger">Failed to load dead letter queue</p>
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
              <Link to="/admin/jobs" className="text-admin-text-muted hover:text-admin-text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-admin-text-primary">Dead Letter Queue</h1>
            </div>
            <p className="mt-1 text-admin-text-muted">
              {data?.pagination.total || 0} {showReviewed ? "reviewed" : "unreviewed"} jobs
            </p>
          </div>
        </div>

        {/* Info banner */}
        <Card>
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-admin-info"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm text-admin-text-secondary">
              Jobs end up here after exhausting all retry attempts. Review them to understand why
              they failed, then either retry them or mark them as reviewed to dismiss.
            </div>
          </div>
        </Card>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-admin-text-primary">
            <input
              type="checkbox"
              checked={showReviewed}
              onChange={(e) => {
                setShowReviewed(e.target.checked)
                setPage(1)
              }}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-admin-interactive"
            />
            Show reviewed jobs
          </label>
        </div>

        {/* Job list */}
        {data?.jobs.length === 0 ? (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-admin-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-4 text-sm text-admin-text-muted">
              {showReviewed ? "No reviewed jobs" : "No failed jobs requiring attention"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.jobs.map((job) => (
              <DeadLetterJobCard
                key={job.id}
                job={job}
                onReview={(notes) => reviewJob.mutate({ id: job.id, notes })}
                onRetry={() => retryJob.mutate(job.id)}
                isReviewing={reviewJob.isPending}
                isRetrying={retryJob.isPending}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between rounded-lg border border-admin-border bg-admin-surface-elevated px-4 py-3">
            <div className="text-sm text-admin-text-muted">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="rounded p-1.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.pagination.totalPages}
                className="rounded p-1.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
