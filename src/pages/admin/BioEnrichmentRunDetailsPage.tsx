/**
 * Admin page for viewing bio enrichment run details.
 *
 * Shows summary stats, progress bar, source performance, per-actor results,
 * and full log entries (not just errors).
 * Pattern: src/pages/admin/EnrichmentRunDetailsPage.tsx
 */

import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import {
  useBioEnrichmentRunDetails,
  useBioEnrichmentRunActors,
  useBioRunSourcePerformanceStats,
  useBioEnrichmentRunProgress,
  useStopBioEnrichmentRun,
  type BioEnrichmentRunActor,
} from "../../hooks/admin/useBioEnrichmentRuns"

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

export default function BioEnrichmentRunDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const runId = id ? parseInt(id, 10) : undefined

  const { data: run, isLoading, error } = useBioEnrichmentRunDetails(runId)
  const isRunning = run?.status === "running" || run?.status === "pending"

  const [actorsPage, setActorsPage] = useState(1)
  const actorsPageSize = 20
  const { data: actorsData } = useBioEnrichmentRunActors(runId, actorsPage, actorsPageSize, isRunning)
  const { data: sourceStats } = useBioRunSourcePerformanceStats(runId, isRunning)
  const { data: progress } = useBioEnrichmentRunProgress(runId, isRunning)

  const stopMutation = useStopBioEnrichmentRun()
  const [expandedActor, setExpandedActor] = useState<number | null>(null)

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (error || !run) {
    return (
      <AdminLayout>
        <ErrorMessage message="Failed to load bio enrichment run details." />
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/bio-enrichment/runs"
                className="text-admin-text-muted hover:text-admin-text-primary"
              >
                Bio Enrichment Runs
              </Link>
              <span className="text-admin-text-muted">/</span>
              <h1 className="text-2xl font-bold text-admin-text-primary">Run #{run.id}</h1>
            </div>
            <p className="mt-1 text-admin-text-muted">
              Started {new Date(run.started_at).toLocaleString()}
            </p>
          </div>
          {isRunning && (
            <button
              onClick={() => runId && stopMutation.mutate(runId)}
              disabled={stopMutation.isPending}
              className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {stopMutation.isPending ? "Stopping..." : "Stop Run"}
            </button>
          )}
        </div>

        {/* Progress Bar (if running) */}
        {isRunning && progress && (
          <div className="rounded-lg border border-blue-700 bg-blue-900/30 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-blue-200">
                Processing: {progress.currentActorName || "Starting..."}
              </span>
              <span className="text-blue-200">
                {progress.actorsProcessed} / {progress.actorsQueried} actors ({progress.progressPercentage}%)
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-blue-950">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${progress.progressPercentage}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-blue-300">
              <span>Elapsed: {formatDuration(progress.elapsedMs)}</span>
              <span>Cost: ${progress.totalCostUsd.toFixed(4)}</span>
              {progress.estimatedTimeRemainingMs && (
                <span>ETA: {formatDuration(progress.estimatedTimeRemainingMs)}</span>
              )}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Status" value={run.status} />
          <StatCard
            label="Duration"
            value={run.duration_ms ? formatDuration(run.duration_ms) : isRunning ? "Running" : "-"}
          />
          <StatCard label="Actors Processed" value={String(run.actors_processed)} />
          <StatCard label="Actors Enriched" value={String(run.actors_enriched)} />
          <StatCard label="Fill Rate" value={run.fill_rate ? `${run.fill_rate}%` : "-"} />
          <StatCard label="Total Cost" value={`$${parseFloat(run.total_cost_usd).toFixed(4)}`} />
          <StatCard label="Source Cost" value={`$${parseFloat(run.source_cost_usd).toFixed(4)}`} />
          <StatCard label="Synthesis Cost" value={`$${parseFloat(run.synthesis_cost_usd).toFixed(4)}`} />
        </div>

        {/* Source Performance Table */}
        {sourceStats && sourceStats.length > 0 && (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated shadow-admin-sm">
            <div className="border-b border-admin-border px-4 py-3">
              <h2 className="text-lg font-semibold text-admin-text-primary">Source Performance</h2>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="min-w-[500px] md:min-w-full">
                <thead className="border-b border-admin-border bg-admin-surface-base">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-admin-text-secondary">
                      Source
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Attempts
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Successes
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Rate
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border">
                  {sourceStats.map((stat) => (
                    <tr key={stat.source}>
                      <td className="px-4 py-2 text-sm text-admin-text-primary">{stat.source}</td>
                      <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
                        {stat.total_attempts}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
                        {stat.successful_attempts}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
                        {stat.success_rate}%
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
                        ${Number(stat.total_cost_usd).toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-Actor Results */}
        {actorsData && (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated shadow-admin-sm">
            <div className="border-b border-admin-border px-4 py-3">
              <h2 className="text-lg font-semibold text-admin-text-primary">
                Actor Results ({actorsData.total})
              </h2>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="min-w-[700px] md:min-w-full">
                <thead className="border-b border-admin-border bg-admin-surface-base">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-admin-text-secondary">
                      Actor
                    </th>
                    <th className="px-4 py-2 text-center text-sm font-semibold text-admin-text-secondary">
                      Enriched
                    </th>
                    <th className="px-4 py-2 text-center text-sm font-semibold text-admin-text-secondary">
                      Confidence
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Sources
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Cost
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-admin-text-secondary">
                      Time
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-admin-text-secondary">
                      Logs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border">
                  {actorsData.items.map((actor) => (
                    <ActorRow
                      key={actor.actor_id}
                      actor={actor}
                      isExpanded={expandedActor === actor.actor_id}
                      onToggle={() =>
                        setExpandedActor(
                          expandedActor === actor.actor_id ? null : actor.actor_id
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {actorsData.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-admin-border px-4 py-3">
                <p className="text-sm text-admin-text-muted">
                  Page {actorsPage} of {actorsData.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActorsPage((p) => Math.max(1, p - 1))}
                    disabled={actorsPage === 1}
                    className="rounded border border-admin-border px-3 py-1 text-sm text-admin-text-primary disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setActorsPage((p) => Math.min(actorsData.totalPages, p + 1))}
                    disabled={actorsPage === actorsData.totalPages}
                    className="rounded border border-admin-border px-3 py-1 text-sm text-admin-text-primary disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Errors */}
        {run.errors && run.errors.length > 0 && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
            <h2 className="mb-2 text-lg font-semibold text-red-200">Errors ({run.error_count})</h2>
            <div className="space-y-2">
              {run.errors.map((err, i) => (
                <div key={i} className="text-sm text-red-300">
                  <span className="font-medium">{err.actorName}</span>: {err.error}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Config */}
        {run.config && Object.keys(run.config).length > 0 && (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm">
            <h2 className="mb-2 text-lg font-semibold text-admin-text-primary">Configuration</h2>
            <pre className="overflow-x-auto rounded bg-admin-surface-base p-3 text-xs text-admin-text-secondary">
              {JSON.stringify(run.config, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm">
      <p className="text-xs text-admin-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-admin-text-primary">{value}</p>
    </div>
  )
}

function ActorRow({
  actor,
  isExpanded,
  onToggle,
}: {
  actor: BioEnrichmentRunActor
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-admin-interactive-secondary"
        onClick={onToggle}
      >
        <td className="px-4 py-2 text-sm text-admin-text-primary">{actor.actor_name}</td>
        <td className="px-4 py-2 text-center">
          {actor.was_enriched ? (
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="Enriched" />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" title="Not enriched" />
          )}
        </td>
        <td className="px-4 py-2 text-center">
          {actor.narrative_confidence && (
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                actor.narrative_confidence === "high"
                  ? "bg-green-900 text-green-200"
                  : actor.narrative_confidence === "medium"
                    ? "bg-yellow-900 text-yellow-200"
                    : "bg-red-900 text-red-200"
              }`}
            >
              {actor.narrative_confidence}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
          {actor.sources_succeeded}
        </td>
        <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
          ${parseFloat(actor.cost_usd).toFixed(4)}
        </td>
        <td className="px-4 py-2 text-right text-sm text-admin-text-secondary">
          {actor.processing_time_ms ? formatDuration(actor.processing_time_ms) : "-"}
        </td>
        <td className="px-4 py-2">
          <button className="text-xs text-admin-text-muted hover:text-admin-text-primary">
            {isExpanded ? "Hide" : "Show"} ({actor.log_entries?.length || 0})
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-admin-surface-base px-4 py-3">
            {/* Log entries - ALL logs, not just errors */}
            {actor.log_entries && actor.log_entries.length > 0 && (
              <div className="mb-3">
                <h4 className="mb-1 text-xs font-semibold text-admin-text-muted">Log Entries</h4>
                <div className="max-h-60 space-y-1 overflow-y-auto rounded bg-admin-surface-elevated p-2">
                  {actor.log_entries.map((entry, i) => (
                    <div key={i} className="flex gap-2 text-xs font-mono">
                      <span className="shrink-0 text-admin-text-muted">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`shrink-0 ${
                          entry.level === "error"
                            ? "text-red-400"
                            : entry.level === "warn"
                              ? "text-yellow-400"
                              : "text-admin-text-secondary"
                        }`}
                      >
                        [{entry.level}]
                      </span>
                      <span className="text-admin-text-primary">{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Source details */}
            {actor.sources_attempted && actor.sources_attempted.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-admin-text-muted">
                  Sources Attempted
                </h4>
                <div className="flex flex-wrap gap-1">
                  {actor.sources_attempted.map((s, i) => (
                    <span
                      key={i}
                      className={`inline-flex rounded px-2 py-0.5 text-xs ${
                        s.success
                          ? "bg-green-900/50 text-green-300"
                          : "bg-admin-interactive-secondary text-admin-text-muted"
                      }`}
                      title={`Confidence: ${s.confidence.toFixed(2)}, Cost: $${s.costUsd.toFixed(4)}`}
                    >
                      {s.source}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {actor.error && (
              <div className="mt-2 text-xs text-red-400">Error: {actor.error}</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
