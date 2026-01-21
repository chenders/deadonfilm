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

  const durationSec = run.duration_ms ? Math.round(run.duration_ms / 1000) : null
  const avgActorTime =
    run.actors_processed > 0 && run.duration_ms
      ? Math.round(run.duration_ms / run.actors_processed)
      : null

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/enrichment/runs"
            className="mb-2 inline-block text-sm text-gray-400 hover:text-white"
          >
            ← Back to Runs
          </Link>
          <h1 className="text-2xl font-bold text-white">Enrichment Run #{run.id}</h1>
          <p className="mt-1 text-gray-400">Started {new Date(run.started_at).toLocaleString()}</p>
        </div>

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
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Configuration</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-gray-400">Exit Reason</dt>
              <dd className="text-white">{run.exit_reason || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Errors</dt>
              <dd className="text-white">{run.error_count}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Links Followed</dt>
              <dd className="text-white">{run.links_followed}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Pages Fetched</dt>
              <dd className="text-white">{run.pages_fetched}</dd>
            </div>
            {run.script_name && (
              <div>
                <dt className="text-gray-400">Script</dt>
                <dd className="text-white">
                  {run.script_name} v{run.script_version}
                </dd>
              </div>
            )}
            {run.hostname && (
              <div>
                <dt className="text-gray-400">Hostname</dt>
                <dd className="text-white">{run.hostname}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Source Performance */}
        {sourceStatsLoading && <LoadingSpinner />}
        {sourceStatsError && <ErrorMessage message="Failed to load source stats" />}
        {sourceStats && sourceStats.length > 0 && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h2 className="mb-3 text-lg font-semibold text-white">Source Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-300">Source</th>
                    <th className="px-3 py-2 text-right text-gray-300">Attempts</th>
                    <th className="px-3 py-2 text-right text-gray-300">Success</th>
                    <th className="px-3 py-2 text-right text-gray-300">Rate</th>
                    <th className="px-3 py-2 text-right text-gray-300">Cost</th>
                    <th className="px-3 py-2 text-right text-gray-300">Avg Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {sourceStats.map((stat) => (
                    <tr key={stat.source} className="hover:bg-gray-750">
                      <td className="px-3 py-2 font-medium text-white">{stat.source}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{stat.total_attempts}</td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        {stat.successful_attempts}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        {stat.success_rate.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        ${stat.total_cost_usd.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300">
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
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Actor Results</h2>
          {actorsLoading && <LoadingSpinner />}
          {actorsError && <ErrorMessage message="Failed to load actor results" />}
          {actors && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-300">Actor</th>
                      <th className="px-3 py-2 text-center text-gray-300">Enriched</th>
                      <th className="px-3 py-2 text-left text-gray-300">Source</th>
                      <th className="px-3 py-2 text-right text-gray-300">Cost</th>
                      <th className="px-3 py-2 text-right text-gray-300">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {actors.items.map((actor) => (
                      <tr key={actor.actor_id} className="hover:bg-gray-750">
                        <td className="px-3 py-2 text-white">{actor.actor_name}</td>
                        <td className="px-3 py-2 text-center">
                          {actor.was_enriched ? (
                            <span className="text-green-400">✓</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-300">{actor.winning_source || "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-300">
                          ${parseFloat(actor.cost_usd).toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-300">
                          {actor.processing_time_ms ? `${actor.processing_time_ms}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {actors.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-gray-700 pt-4">
                  <p className="text-sm text-gray-400">
                    Showing {(actorsPage - 1) * actorsPageSize + 1} to{" "}
                    {Math.min(actorsPage * actorsPageSize, actors.total)} of {actors.total} actors
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActorsPage((p) => Math.max(1, p - 1))}
                      disabled={actorsPage === 1}
                      className="rounded border border-gray-700 bg-gray-900 px-3 py-1 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-gray-300">
                      Page {actorsPage} of {actors.totalPages}
                    </span>
                    <button
                      onClick={() => setActorsPage((p) => Math.min(actors.totalPages, p + 1))}
                      disabled={actorsPage === actors.totalPages}
                      className="rounded border border-gray-700 bg-gray-900 px-3 py-1 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <p className="mb-1 text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{subtext}</p>
    </div>
  )
}
