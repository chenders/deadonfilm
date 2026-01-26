/**
 * Admin page for viewing detailed information about a single enrichment run.
 */

import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import {
  useEnrichmentRunDetails,
  useEnrichmentRunActors,
  useRunSourcePerformanceStats,
  useEnrichmentRunProgress,
  useStopEnrichmentRun,
} from "../../hooks/admin/useEnrichmentRuns"

export default function EnrichmentRunDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const runId = parseInt(id || "0", 10)
  const [actorsPage, setActorsPage] = useState(1)
  const actorsPageSize = 50

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
      alert("Failed to stop enrichment run. Please try again.")
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
                <table className="min-w-[600px] text-sm md:min-w-full">
                  <thead className="border-b border-admin-border">
                    <tr>
                      <th className="px-3 py-2 text-left text-admin-text-secondary">Actor</th>
                      <th className="px-3 py-2 text-center text-admin-text-secondary">Enriched</th>
                      <th className="px-3 py-2 text-left text-admin-text-secondary">Source</th>
                      <th className="px-3 py-2 text-right text-admin-text-secondary">Cost</th>
                      <th className="px-3 py-2 text-right text-admin-text-secondary">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border">
                    {actors.items.map((actor) => (
                      <tr key={actor.actor_id} className="hover:bg-admin-interactive-secondary">
                        <td className="px-3 py-2 text-admin-text-primary">{actor.actor_name}</td>
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
      </div>
    </AdminLayout>
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
