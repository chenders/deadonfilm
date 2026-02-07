/**
 * Jobs & Logs Hub Page
 *
 * Consolidates Background Jobs (queue management) and Error Logs
 * into a single tabbed view.
 */

import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import { useTabParam } from "../../hooks/admin/useTabParam"
import { Card, StatCard, Skeleton } from "../../components/admin/ui"
import {
  useQueueStats,
  usePauseQueue,
  useResumeQueue,
  useJobStats,
  useCleanupJobs,
  useOMDbCoverage,
  useBackfillOMDb,
  type QueueStats,
  type BackfillOMDbConfig,
} from "../../hooks/useJobQueue"
import { useState } from "react"
import ErrorLogsTab from "../../components/admin/jobs/ErrorLogsTab"

const tabs = [
  { id: "queues", label: "Queues", testId: "tab-queues" },
  { id: "logs", label: "Error Logs", testId: "tab-logs" },
]

// Status badge colors
const statusColors = {
  running: "bg-admin-success/20 text-admin-success",
  paused: "bg-admin-warning/20 text-admin-warning",
}

function QueueIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  )
}

function QueueCard({
  queue,
  onPause,
  onResume,
  isPending,
}: {
  queue: QueueStats
  onPause: () => void
  onResume: () => void
  isPending: boolean
}) {
  const totalInQueue = queue.waiting + queue.active + queue.delayed
  const statusClass = queue.isPaused ? statusColors.paused : statusColors.running

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-admin-info-bg text-admin-interactive">
            <QueueIcon />
          </div>
          <div>
            <h3 className="font-semibold capitalize text-admin-text-primary">{queue.name}</h3>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
            >
              {queue.isPaused ? "Paused" : "Running"}
            </span>
          </div>
        </div>
        <button
          onClick={queue.isPaused ? onResume : onPause}
          disabled={isPending}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            queue.isPaused
              ? "bg-admin-success/20 hover:bg-admin-success/30 text-admin-success"
              : "bg-admin-warning/20 hover:bg-admin-warning/30 text-admin-warning"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isPending ? "..." : queue.isPaused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-2xl font-bold text-admin-interactive">{queue.waiting}</div>
          <div className="text-xs text-admin-text-muted">Waiting</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-admin-success">{queue.active}</div>
          <div className="text-xs text-admin-text-muted">Active</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-admin-text-secondary">{queue.completed}</div>
          <div className="text-xs text-admin-text-muted">Completed</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-admin-danger">{queue.failed}</div>
          <div className="text-xs text-admin-text-muted">Failed</div>
        </div>
      </div>

      {queue.delayed > 0 && (
        <div className="mt-3 text-sm text-admin-text-muted">{queue.delayed} delayed jobs</div>
      )}

      {totalInQueue > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-admin-surface-inset">
            {queue.active > 0 && (
              <div
                className="bg-admin-success"
                style={{ width: `${(queue.active / totalInQueue) * 100}%` }}
              />
            )}
            {queue.waiting > 0 && (
              <div
                className="bg-admin-interactive"
                style={{ width: `${(queue.waiting / totalInQueue) * 100}%` }}
              />
            )}
            {queue.delayed > 0 && (
              <div
                className="bg-admin-warning"
                style={{ width: `${(queue.delayed / totalInQueue) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OMDbBackfillCard() {
  const { data: coverage, isLoading: coverageLoading } = useOMDbCoverage()
  const backfill = useBackfillOMDb()

  const [config, setConfig] = useState<BackfillOMDbConfig>({
    limit: 100,
    minPopularity: 0,
    priority: "low",
  })

  const handleSubmit = () => {
    backfill.mutate(config)
  }

  const totalNeedsData = (coverage?.movies.needsData ?? 0) + (coverage?.shows.needsData ?? 0)

  return (
    <Card title="OMDB Ratings Backfill">
      <div className="space-y-4">
        {/* Coverage Stats */}
        <div>
          <h4 className="mb-2 text-sm font-medium text-admin-text-primary">Coverage Stats</h4>
          {coverageLoading ? (
            <div className="text-sm text-admin-text-muted">Loading...</div>
          ) : (
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="font-medium text-admin-interactive">
                  {coverage?.movies.needsData.toLocaleString()}
                </span>{" "}
                <span className="text-admin-text-muted">
                  movies need data (of {coverage?.movies.total.toLocaleString()})
                </span>
              </div>
              <div>
                <span className="font-medium text-admin-interactive">
                  {coverage?.shows.needsData.toLocaleString()}
                </span>{" "}
                <span className="text-admin-text-muted">
                  shows need data (of {coverage?.shows.total.toLocaleString()})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="omdb-content"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Content
            </label>
            <select
              id="omdb-content"
              value={config.moviesOnly ? "movies" : config.showsOnly ? "shows" : "both"}
              onChange={(e) => {
                const value = e.target.value
                setConfig({
                  ...config,
                  moviesOnly: value === "movies",
                  showsOnly: value === "shows",
                })
              }}
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            >
              <option value="both">Movies & Shows</option>
              <option value="movies">Movies Only</option>
              <option value="shows">Shows Only</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="omdb-limit"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Limit
            </label>
            <input
              id="omdb-limit"
              type="number"
              min={1}
              max={1000}
              value={config.limit}
              onChange={(e) => setConfig({ ...config, limit: parseInt(e.target.value) || 100 })}
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="omdb-popularity"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Min Popularity
            </label>
            <input
              id="omdb-popularity"
              type="number"
              min={0}
              step={0.1}
              value={config.minPopularity}
              onChange={(e) =>
                setConfig({ ...config, minPopularity: parseFloat(e.target.value) || 0 })
              }
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="omdb-priority"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Priority
            </label>
            <select
              id="omdb-priority"
              value={config.priority}
              onChange={(e) =>
                setConfig({
                  ...config,
                  priority: e.target.value as BackfillOMDbConfig["priority"],
                })
              }
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={backfill.isPending || totalNeedsData === 0}
            className="rounded-md bg-admin-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {backfill.isPending ? "Queueing..." : "Queue Jobs"}
          </button>

          {backfill.isSuccess && (
            <div className="flex items-center gap-2 text-sm text-admin-success">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Queued {backfill.data.queued} jobs</span>
              <Link
                to="/admin/jobs/runs?jobType=fetch-omdb-ratings"
                className="ml-1 underline hover:text-admin-interactive"
              >
                View in Job History
              </Link>
            </div>
          )}

          {backfill.isError && (
            <p className="text-sm text-admin-danger">
              {backfill.error instanceof Error ? backfill.error.message : "Failed to queue jobs"}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

function QueuesTabContent() {
  const { data: queuesData, isLoading: queuesLoading, error: queuesError } = useQueueStats(3000)
  const { data: statsData, isLoading: statsLoading } = useJobStats()
  const pauseQueue = usePauseQueue()
  const resumeQueue = useResumeQueue()
  const cleanupJobs = useCleanupJobs()
  const [cleanupPeriod, setCleanupPeriod] = useState(24)

  // Calculate totals
  const totals = queuesData?.queues.reduce(
    (acc, q) => ({
      waiting: acc.waiting + q.waiting,
      active: acc.active + q.active,
      completed: acc.completed + q.completed,
      failed: acc.failed + q.failed,
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0 }
  ) ?? { waiting: 0, active: 0, completed: 0, failed: 0 }

  // Dead letter count
  const deadLetterCount = statsData?.deadLetterQueue.reduce((sum, d) => sum + d.count, 0) ?? 0

  if (queuesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton.StatCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton.Card key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (queuesError) {
    return (
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
        <p className="mt-4 text-admin-danger">Failed to load queue stats</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Bull Board Link */}
      <div className="flex justify-end">
        <a
          href="/admin/bull-board"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-admin-interactive-hover"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open Bull Board
        </a>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard
          label="Queued"
          value={totals.waiting.toLocaleString()}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Active"
          value={totals.active.toLocaleString()}
          variant="success"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          }
        />
        <StatCard
          label="Completed"
          value={totals.completed.toLocaleString()}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Failed"
          value={totals.failed.toLocaleString()}
          variant={totals.failed > 0 ? "danger" : "default"}
          href="/admin/jobs/runs?status=failed"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Dead Letter"
          value={deadLetterCount.toLocaleString()}
          variant={deadLetterCount > 0 ? "warning" : "default"}
          href="/admin/jobs/dead-letter"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          }
        />
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/admin/jobs/runs"
          className="inline-flex items-center gap-2 rounded-md border border-admin-border bg-admin-surface-elevated px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-surface-overlay"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          View Job History
        </Link>
        <Link
          to="/admin/jobs/dead-letter"
          className="inline-flex items-center gap-2 rounded-md border border-admin-border bg-admin-surface-elevated px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-surface-overlay"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          Dead Letter Queue
          {deadLetterCount > 0 && (
            <span className="bg-admin-warning/20 rounded-full px-2 py-0.5 text-xs font-medium text-admin-warning">
              {deadLetterCount}
            </span>
          )}
        </Link>
      </div>

      {/* Queue Cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Queues</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {queuesData?.queues.map((queue) => (
            <QueueCard
              key={queue.name}
              queue={queue}
              onPause={() => pauseQueue.mutate(queue.name)}
              onResume={() => resumeQueue.mutate(queue.name)}
              isPending={pauseQueue.isPending || resumeQueue.isPending}
            />
          ))}
        </div>
      </div>

      {/* Job Stats */}
      {!statsLoading && statsData && (
        <Card title="Job Performance (Last 24h)">
          {statsData.successRates.length === 0 ? (
            <p className="text-sm text-admin-text-muted">No jobs processed in the last 24 hours</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-admin-border text-left text-xs font-semibold uppercase tracking-wider text-admin-text-muted">
                    <th className="pb-2">Job Type</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">Completed</th>
                    <th className="pb-2 text-right">Success Rate</th>
                    <th className="pb-2 text-right">Avg Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border-subtle">
                  {statsData.successRates.map((stat) => {
                    const duration = statsData.durations.find((d) => d.job_type === stat.job_type)
                    return (
                      <tr key={stat.job_type}>
                        <td className="py-2 font-mono text-sm text-admin-text-primary">
                          {stat.job_type}
                        </td>
                        <td className="py-2 text-right text-sm text-admin-text-secondary">
                          {stat.total}
                        </td>
                        <td className="py-2 text-right text-sm text-admin-text-secondary">
                          {stat.completed}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`text-sm font-medium ${
                              parseFloat(stat.success_rate) >= 90
                                ? "text-admin-success"
                                : parseFloat(stat.success_rate) >= 70
                                  ? "text-admin-warning"
                                  : "text-admin-danger"
                            }`}
                          >
                            {stat.success_rate}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-sm text-admin-text-secondary">
                          {duration ? `${duration.avg_ms}ms` : "-"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Cleanup Section */}
      <Card title="Maintenance">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="cleanup-period"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Cleanup completed jobs older than
            </label>
            <select
              id="cleanup-period"
              value={cleanupPeriod}
              onChange={(e) => setCleanupPeriod(Number(e.target.value))}
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none sm:w-48"
            >
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <button
            onClick={() => cleanupJobs.mutate(cleanupPeriod)}
            disabled={cleanupJobs.isPending}
            className="rounded-md bg-admin-surface-overlay px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cleanupJobs.isPending ? "Cleaning..." : "Run Cleanup"}
          </button>
        </div>
        {cleanupJobs.isSuccess && (
          <p className="mt-3 text-sm text-admin-success">
            Cleaned {cleanupJobs.data.cleaned} completed jobs
          </p>
        )}
      </Card>

      {/* OMDB Backfill Section */}
      <OMDbBackfillCard />
    </div>
  )
}

export default function JobQueuesPage() {
  const [activeTab, setActiveTab] = useTabParam<string>("queues")

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">Jobs & Logs</h1>
          <p className="mt-2 text-admin-text-muted">
            Monitor background job queues and application error logs
          </p>
        </div>

        <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "queues" && <QueuesTabContent />}
          {activeTab === "logs" && <ErrorLogsTab />}
        </AdminTabs>
      </div>
    </AdminLayout>
  )
}
