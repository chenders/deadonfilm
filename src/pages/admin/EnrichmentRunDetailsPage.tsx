/**
 * Admin page for viewing detailed information about a single enrichment run.
 */

import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { useToast } from "../../contexts/ToastContext"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import {
  useEnrichmentRunDetails,
  useEnrichmentRunActors,
  useRunSourcePerformanceStats,
  useEnrichmentRunProgress,
  useStopEnrichmentRun,
  useEnrichmentRunLogs,
  type EnrichmentRunLog,
} from "../../hooks/admin/useEnrichmentRuns"
import { createActorSlug } from "../../utils/slugify"

export default function EnrichmentRunDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const runId = parseInt(id || "0", 10)
  const [actorsPage, setActorsPage] = useState(1)
  const actorsPageSize = 50
  const [logsPage, setLogsPage] = useState(1)
  const [logLevel, setLogLevel] = useState<string | undefined>(undefined)
  const logsPageSize = 50
  const { toast } = useToast()

  const { data: run, isLoading: runLoading, error: runError } = useEnrichmentRunDetails(runId)
  const {
    data: actors,
    isLoading: actorsLoading,
    error: actorsError,
  } = useEnrichmentRunActors(runId, actorsPage, actorsPageSize)
  const {
    data: sourceStats,
    isLoading: sourceStatsLoading,
    error: sourceStatsError,
  } = useRunSourcePerformanceStats(runId)
  const {
    data: logsData,
    isLoading: logsLoading,
    error: logsError,
  } = useEnrichmentRunLogs(runId, logsPage, logsPageSize, logLevel)

  // Real-time progress tracking for running enrichments
  const isRunning = run?.exit_reason === null && run?.completed_at === null
  const { data: progress } = useEnrichmentRunProgress(runId, isRunning)

  // Stop enrichment mutation
  const stopEnrichment = useStopEnrichmentRun()

  const handleStopEnrichment = async () => {
    if (!confirm("Are you sure you want to stop this enrichment run?")) {
      return
    }

    try {
      await stopEnrichment.mutateAsync(runId)
    } catch (error) {
      console.error("Failed to stop enrichment:", error)
      toast.error("Failed to stop enrichment run. Please try again.")
    }
  }

  if (runLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (runError || !run) {
    return (
      <AdminLayout>
        <ErrorMessage message="Failed to load enrichment run details" />
      </AdminLayout>
    )
  }

  const durationMs = run.duration_ms
  const hasDuration = durationMs != null
  const durationSec = hasDuration ? Math.round(durationMs / 1000) : null
  const avgActorTime =
    run.actors_processed > 0 && hasDuration ? Math.round(durationMs / run.actors_processed) : null

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/enrichment/runs"
            className="mb-2 inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            ← Back to Runs
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                Enrichment Run #{run.id}
              </h1>
              <p className="mt-1 text-admin-text-muted">
                Started {new Date(run.started_at).toLocaleString()}
              </p>
            </div>
            {isRunning && (
              <button
                onClick={handleStopEnrichment}
                disabled={stopEnrichment.isPending}
                className="rounded-md border border-red-700 bg-red-900 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {stopEnrichment.isPending ? "Stopping..." : "Stop Run"}
              </button>
            )}
          </div>
        </div>

        {/* Real-time Progress (for running enrichments) */}
        {isRunning && progress && (
          <div className="rounded-lg border border-blue-700 bg-blue-900 p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-100">Running</h2>
                <p className="text-sm text-blue-200">
                  {progress.currentActorName || "Processing..."}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-100">
                  {progress.progressPercentage.toFixed(1)}%
                </p>
                <p className="text-sm text-blue-200">
                  {progress.actorsProcessed} / {progress.actorsQueried} actors
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-blue-950">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress.progressPercentage}%` }}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-blue-300">Enriched</p>
                <p className="font-semibold text-blue-100">{progress.actorsEnriched}</p>
              </div>
              <div>
                <p className="text-blue-300">Cost</p>
                <p className="font-semibold text-blue-100">${progress.totalCostUsd.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-blue-300">Elapsed</p>
                <p className="font-semibold text-blue-100">
                  {Math.round(progress.elapsedMs / 1000)}s
                </p>
              </div>
              <div>
                <p className="text-blue-300">Remaining</p>
                <p className="font-semibold text-blue-100">
                  {progress.estimatedTimeRemainingMs
                    ? `~${Math.round(progress.estimatedTimeRemainingMs / 1000)}s`
                    : "Calculating..."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="Actors Processed"
            value={run.actors_processed.toLocaleString()}
            subtext={`${run.actors_enriched} enriched`}
          />
          <StatCard
            label="Fill Rate"
            value={run.fill_rate ? `${run.fill_rate}%` : "N/A"}
            subtext={`${run.actors_with_death_page} with death page`}
          />
          <StatCard
            label="Total Cost"
            value={`$${parseFloat(run.total_cost_usd).toFixed(2)}`}
            subtext={`Avg: $${run.actors_processed > 0 ? (parseFloat(run.total_cost_usd) / run.actors_processed).toFixed(3) : "0.000"}/actor`}
          />
          <StatCard
            label="Duration"
            value={durationSec ? `${durationSec}s` : run.completed_at ? "-" : "Running..."}
            subtext={avgActorTime ? `Avg: ${avgActorTime}ms/actor` : "-"}
          />
        </div>

        {/* Configuration & Metadata */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-3 text-lg font-semibold text-admin-text-primary">Configuration</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-admin-text-muted">Exit Reason</dt>
              <dd className="text-admin-text-primary">{run.exit_reason || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Errors</dt>
              <dd className="text-admin-text-primary">{run.error_count}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Links Followed</dt>
              <dd className="text-admin-text-primary">{run.links_followed}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Pages Fetched</dt>
              <dd className="text-admin-text-primary">{run.pages_fetched}</dd>
            </div>
            {run.script_name && (
              <div>
                <dt className="text-admin-text-muted">Script</dt>
                <dd className="text-admin-text-primary">
                  {run.script_name} v{run.script_version}
                </dd>
              </div>
            )}
            {run.hostname && (
              <div>
                <dt className="text-admin-text-muted">Hostname</dt>
                <dd className="text-admin-text-primary">{run.hostname}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Errors Section */}
        {run.errors && run.errors.length > 0 && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-3 text-lg font-semibold text-red-200">Errors ({run.error_count})</h2>
            <ul className="space-y-2 text-sm">
              {run.errors.map((error, i) => (
                <li key={i} className="flex items-start justify-between gap-4">
                  <span className="text-red-300">{error.message}</span>
                  <span className="shrink-0 rounded bg-red-900 px-2 py-0.5 text-xs text-red-200">
                    ×{error.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Run Configuration Details */}
        {run.config && Object.keys(run.config).length > 0 && (
          <details className="rounded-lg border border-admin-border bg-admin-surface-elevated shadow-admin-sm">
            <summary className="cursor-pointer p-4 text-lg font-semibold text-admin-text-primary hover:bg-admin-interactive-secondary md:p-6">
              Run Configuration (JSON)
            </summary>
            <pre className="overflow-x-auto border-t border-admin-border p-4 text-xs text-admin-text-secondary md:p-6">
              {JSON.stringify(run.config, null, 2)}
            </pre>
          </details>
        )}

        {/* Source Performance */}
        {sourceStatsLoading && <LoadingSpinner />}
        {sourceStatsError && <ErrorMessage message="Failed to load source stats" />}
        {sourceStats && sourceStats.length > 0 && (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-3 text-lg font-semibold text-admin-text-primary">
              Source Performance
            </h2>
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="min-w-[600px] text-sm md:min-w-full">
                <thead className="border-b border-admin-border">
                  <tr>
                    <th className="px-3 py-2 text-left text-admin-text-secondary">Source</th>
                    <th className="px-3 py-2 text-right text-admin-text-secondary">Attempts</th>
                    <th className="px-3 py-2 text-right text-admin-text-secondary">Success</th>
                    <th className="px-3 py-2 text-right text-admin-text-secondary">Rate</th>
                    <th className="px-3 py-2 text-right text-admin-text-secondary">Cost</th>
                    <th className="px-3 py-2 text-right text-admin-text-secondary">Avg Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border">
                  {sourceStats.map((stat) => (
                    <tr key={stat.source} className="hover:bg-admin-interactive-secondary">
                      <td className="px-3 py-2 font-medium text-admin-text-primary">
                        {stat.source}
                      </td>
                      <td className="px-3 py-2 text-right text-admin-text-secondary">
                        {stat.total_attempts}
                      </td>
                      <td className="px-3 py-2 text-right text-admin-text-secondary">
                        {stat.successful_attempts}
                      </td>
                      <td className="px-3 py-2 text-right text-admin-text-secondary">
                        {stat.success_rate.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-admin-text-secondary">
                        ${stat.total_cost_usd.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-admin-text-secondary">
                        ${stat.average_cost_usd.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-Actor Results */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-3 text-lg font-semibold text-admin-text-primary">Actor Results</h2>
          {actorsLoading && <LoadingSpinner />}
          {actorsError && <ErrorMessage message="Failed to load actor results" />}
          {actors && (
            <>
              <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <table className="min-w-[700px] text-sm md:min-w-full">
                  <thead className="border-b border-admin-border">
                    <tr>
                      <th className="px-3 py-2 text-left text-admin-text-secondary">Actor</th>
                      <th className="px-3 py-2 text-center text-admin-text-secondary">Enriched</th>
                      <th className="px-3 py-2 text-left text-admin-text-secondary">Source</th>
                      <th className="px-3 py-2 text-right text-admin-text-secondary">Cost</th>
                      <th className="px-3 py-2 text-right text-admin-text-secondary">Time</th>
                      <th className="px-3 py-2 text-left text-admin-text-secondary">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border">
                    {actors.items.map((actor) => (
                      <tr key={actor.actor_id} className="hover:bg-admin-interactive-secondary">
                        <td className="px-3 py-2 text-admin-text-primary">
                          <Link
                            to={`/actor/${createActorSlug(actor.actor_name, actor.actor_id)}/death`}
                            className="text-admin-interactive hover:text-admin-interactive-hover hover:underline"
                          >
                            {actor.actor_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {actor.was_enriched ? (
                            <span className="text-admin-success">✓</span>
                          ) : (
                            <span className="text-admin-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-admin-text-secondary">
                          {actor.winning_source || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-admin-text-secondary">
                          ${parseFloat(actor.cost_usd).toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right text-admin-text-secondary">
                          {actor.processing_time_ms ? `${actor.processing_time_ms}ms` : "—"}
                        </td>
                        <td
                          className="max-w-xs truncate px-3 py-2 text-xs text-red-400"
                          title={actor.error || ""}
                        >
                          {actor.error || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {actors.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-admin-border pt-4">
                  <p className="text-sm text-admin-text-muted">
                    Showing {(actorsPage - 1) * actorsPageSize + 1} to{" "}
                    {Math.min(actorsPage * actorsPageSize, actors.total)} of {actors.total} actors
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActorsPage((p) => Math.max(1, p - 1))}
                      disabled={actorsPage === 1}
                      className="rounded border border-admin-border bg-admin-surface-base px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-admin-text-secondary">
                      Page {actorsPage} of {actors.totalPages}
                    </span>
                    <button
                      onClick={() => setActorsPage((p) => Math.min(actors.totalPages, p + 1))}
                      disabled={actorsPage === actors.totalPages}
                      className="rounded border border-admin-border bg-admin-surface-base px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Run Logs */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-admin-text-primary">Error Logs</h2>
            <select
              value={logLevel || ""}
              onChange={(e) => {
                setLogLevel(e.target.value || undefined)
                setLogsPage(1)
              }}
              className="rounded border border-admin-border bg-admin-surface-base px-3 py-1 text-sm text-admin-text-primary focus:ring-admin-interactive"
            >
              <option value="">All Levels</option>
              <option value="fatal">Fatal</option>
              <option value="error">Error</option>
            </select>
          </div>

          {logsLoading && <LoadingSpinner />}
          {logsError && <ErrorMessage message="Failed to load logs" />}
          {logsData && (
            <>
              {logsData.logs.length === 0 ? (
                <p className="py-8 text-center text-admin-text-muted">
                  No error logs found for this run
                </p>
              ) : (
                <>
                  <div className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
                    {logsData.logs.map((log) => (
                      <LogEntry key={log.id} log={log} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {logsData.pagination.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-admin-border pt-4">
                      <p className="text-sm text-admin-text-muted">
                        Showing {(logsPage - 1) * logsPageSize + 1} to{" "}
                        {Math.min(logsPage * logsPageSize, logsData.pagination.total)} of{" "}
                        {logsData.pagination.total} logs
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                          disabled={logsPage === 1}
                          className="rounded border border-admin-border bg-admin-surface-base px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span className="px-3 py-1 text-admin-text-secondary">
                          Page {logsPage} of {logsData.pagination.totalPages}
                        </span>
                        <button
                          onClick={() =>
                            setLogsPage((p) => Math.min(logsData.pagination.totalPages, p + 1))
                          }
                          disabled={logsPage === logsData.pagination.totalPages}
                          className="rounded border border-admin-border bg-admin-surface-base px-3 py-1 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

/** Static color maps for log entry styling (module-level to avoid re-creation) */
const LOG_LEVEL_COLORS: Record<string, string> = {
  fatal: "bg-red-950 text-red-200 border-red-800",
  error: "bg-red-950/50 text-red-300 border-red-900",
  warn: "bg-yellow-950/50 text-yellow-300 border-yellow-900",
  info: "text-admin-text-secondary",
  debug: "text-admin-text-muted",
  trace: "text-admin-text-muted opacity-70",
}

const LOG_LEVEL_BADGE_COLORS: Record<string, string> = {
  fatal: "bg-red-700 text-red-100",
  error: "bg-red-800 text-red-200",
  warn: "bg-yellow-800 text-yellow-200",
  info: "bg-blue-800 text-blue-200",
  debug: "bg-gray-700 text-gray-200",
  trace: "bg-gray-800 text-gray-300",
}

/**
 * Log entry component with level-based styling.
 */
function LogEntry({ log }: { log: EnrichmentRunLog }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  }

  return (
    <div
      className={`rounded border px-2 py-1 ${LOG_LEVEL_COLORS[log.level] || "text-admin-text-secondary"}`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-admin-text-muted">{formatTime(log.created_at)}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${LOG_LEVEL_BADGE_COLORS[log.level] || "bg-gray-700"}`}
        >
          {log.level}
        </span>
        <span className="break-all">{log.message}</span>
      </div>
      {log.error_stack && (
        <details className="ml-20 mt-1">
          <summary className="cursor-pointer text-admin-text-muted hover:text-admin-text-secondary">
            Stack trace
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-admin-text-muted">
            {log.error_stack}
          </pre>
        </details>
      )}
    </div>
  )
}

/**
 * Stat card component.
 */
function StatCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm">
      <p className="mb-1 text-sm text-admin-text-muted">{label}</p>
      <p className="text-2xl font-bold text-admin-text-primary">{value}</p>
      <p className="mt-1 text-xs text-admin-text-muted">{subtext}</p>
    </div>
  )
}
