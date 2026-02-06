import { useState } from "react"
import {
  usePopularityStats,
  useTopActors,
  useLowConfidenceActors,
  useMissingPopularityActors,
  usePopularityLastRun,
} from "@/hooks/admin/usePopularity"

type SubTab = "overview" | "top-actors" | "low-confidence" | "missing"

export default function PopularityTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("overview")
  const [topActorsLimit, setTopActorsLimit] = useState(100)
  const [minConfidence, setMinConfidence] = useState(0.5)

  const stats = usePopularityStats()
  const topActors = useTopActors(topActorsLimit, minConfidence)
  const lowConfidence = useLowConfidenceActors(100, 0.3)
  const missing = useMissingPopularityActors(100)
  const lastRun = usePopularityLastRun()

  const subTabs: { id: SubTab; label: string; testId: string }[] = [
    { id: "overview", label: "Overview", testId: "popularity-overview-tab" },
    { id: "top-actors", label: "Top Actors", testId: "popularity-top-actors-tab" },
    { id: "low-confidence", label: "Low Confidence", testId: "popularity-low-confidence-tab" },
    { id: "missing", label: "Missing Scores", testId: "popularity-missing-tab" },
  ]

  const formatPercent = (value: number, total: number) => {
    if (total === 0) return "0%"
    return `${((value / total) * 100).toFixed(1)}%`
  }

  return (
    <div className="space-y-8">
      {/* Sub-Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="border-b border-admin-border">
          <nav className="-mb-px flex min-w-max space-x-4 md:space-x-8">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                data-testid={tab.testId}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                  activeSubTab === tab.id
                    ? "border-admin-interactive text-admin-interactive"
                    : "border-transparent text-admin-text-muted hover:border-admin-border hover:text-admin-text-secondary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          {stats.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading popularity statistics...</div>
            </div>
          )}

          {stats.data && (
            <>
              {/* Entity Stats Cards */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Actors Card */}
                <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                  <h3 className="text-sm font-medium text-admin-text-muted">Deceased Actors</h3>
                  <p className="mt-2 text-3xl font-bold text-admin-text-primary">
                    {stats.data.actors.withScore.toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm text-admin-text-muted">
                    of {stats.data.actors.total.toLocaleString()} with scores (
                    {formatPercent(stats.data.actors.withScore, stats.data.actors.total)})
                  </p>
                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Score:</span>
                      <span className="font-medium text-admin-text-primary">
                        {stats.data.actors.avgScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Confidence:</span>
                      <span className="font-medium text-admin-text-primary">
                        {(stats.data.actors.avgConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">High Confidence:</span>
                      <span className="font-medium text-admin-success">
                        {stats.data.actors.highConfidence.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Low Confidence:</span>
                      <span className="font-medium text-admin-warning">
                        {stats.data.actors.lowConfidence.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Movies Card */}
                <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                  <h3 className="text-sm font-medium text-admin-text-muted">Movies</h3>
                  <p className="mt-2 text-3xl font-bold text-admin-text-primary">
                    {stats.data.movies.withScore.toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm text-admin-text-muted">
                    of {stats.data.movies.total.toLocaleString()} with scores (
                    {formatPercent(stats.data.movies.withScore, stats.data.movies.total)})
                  </p>
                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Popularity:</span>
                      <span className="font-medium text-admin-text-primary">
                        {stats.data.movies.avgScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Weight:</span>
                      <span className="font-medium text-admin-text-primary">
                        {stats.data.movies.avgWeight.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Shows Card */}
                <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                  <h3 className="text-sm font-medium text-admin-text-muted">TV Shows</h3>
                  <p className="mt-2 text-3xl font-bold text-admin-text-primary">
                    {stats.data.shows.withScore.toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm text-admin-text-muted">
                    of {stats.data.shows.total.toLocaleString()} with scores (
                    {formatPercent(stats.data.shows.withScore, stats.data.shows.total)})
                  </p>
                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Popularity:</span>
                      <span className="font-medium text-admin-text-primary">
                        {stats.data.shows.avgScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-text-muted">Avg Weight:</span>
                      <span className="font-medium text-admin-text-primary">
                        {stats.data.shows.avgWeight.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Distribution */}
              <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                <h3 className="text-lg font-semibold text-admin-text-primary">
                  Actor Score Distribution
                </h3>
                <p className="mt-1 text-sm text-admin-text-muted">
                  Distribution of DOF popularity scores for deceased actors
                </p>
                <div className="mt-6 space-y-3">
                  {stats.data.distribution.map((bucket) => {
                    const maxCount = Math.max(...stats.data!.distribution.map((b) => b.count))
                    const widthPercent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
                    return (
                      <div key={bucket.bucket} className="flex items-center gap-4">
                        <div className="w-32 text-sm text-admin-text-secondary">
                          {bucket.bucket}
                        </div>
                        <div className="flex-1">
                          <div className="h-6 rounded bg-admin-surface-overlay">
                            <div
                              className="h-6 rounded bg-admin-interactive"
                              style={{ width: `${widthPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-20 text-right text-sm font-medium text-admin-text-primary">
                          {bucket.count.toLocaleString()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Last Run Status */}
              {lastRun.data?.lastRun && (
                <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm">
                  <h4 className="font-semibold text-admin-text-primary">Last Recalculation</h4>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                    <div>
                      <span className="text-admin-text-muted">Status:</span>
                      <span
                        className={`ml-2 inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          lastRun.data.lastRun.status === "success"
                            ? "bg-admin-success/20 text-admin-success"
                            : lastRun.data.lastRun.status === "running"
                              ? "bg-admin-interactive/20 text-admin-interactive"
                              : "bg-admin-danger/20 text-admin-danger"
                        }`}
                      >
                        {lastRun.data.lastRun.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-admin-text-muted">Started:</span>
                      <span className="ml-2 text-admin-text-primary">
                        {new Date(lastRun.data.lastRun.started_at).toLocaleString()}
                      </span>
                    </div>
                    {lastRun.data.lastRun.duration_ms && (
                      <div>
                        <span className="text-admin-text-muted">Duration:</span>
                        <span className="ml-2 text-admin-text-primary">
                          {(lastRun.data.lastRun.duration_ms / 1000).toFixed(1)}s
                        </span>
                      </div>
                    )}
                    {lastRun.data.lastRun.error_message && (
                      <div className="col-span-2 md:col-span-4">
                        <span className="text-admin-danger">
                          Error: {lastRun.data.lastRun.error_message}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recalculation Info */}
              <div className="rounded-lg bg-admin-surface-overlay p-4 text-sm text-admin-text-secondary">
                <h4 className="font-semibold text-admin-text-primary">Recalculation Scripts</h4>
                <p className="mt-1 text-xs text-admin-text-muted">
                  Run these commands on the server to recalculate popularity scores:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                  <li>
                    <strong>All entities:</strong> npm run update:popularity
                  </li>
                  <li>
                    <strong>Movies only:</strong> npm run update:popularity -- --movies
                  </li>
                  <li>
                    <strong>Shows only:</strong> npm run update:popularity -- --shows
                  </li>
                  <li>
                    <strong>Actors only:</strong> npm run update:popularity -- --actors
                  </li>
                </ul>
                <p className="mt-3 text-xs text-admin-text-muted">
                  Scheduled to run weekly on Sunday at 3 AM. Add to cron:
                </p>
                <code className="mt-1 block rounded bg-admin-surface-base p-2 font-mono text-xs">
                  0 3 * * 0 cd /app && npm run update:popularity
                </code>
              </div>
            </>
          )}
        </div>
      )}

      {/* Top Actors Tab */}
      {activeSubTab === "top-actors" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="minConfidence" className="text-sm text-admin-text-secondary">
                Min Confidence:
              </label>
              <select
                id="minConfidence"
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
              >
                <option value={0.3}>30%</option>
                <option value={0.5}>50%</option>
                <option value={0.7}>70%</option>
                <option value={0.9}>90%</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="topActorsLimit" className="text-sm text-admin-text-secondary">
                Show:
              </label>
              <select
                id="topActorsLimit"
                value={topActorsLimit}
                onChange={(e) => setTopActorsLimit(parseInt(e.target.value, 10))}
                className="rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          {topActors.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading top actors...</div>
            </div>
          )}

          {topActors.data && (
            <div
              className="rounded-lg bg-admin-surface-elevated shadow-admin-sm"
              data-testid="top-actors-table"
            >
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[700px] divide-y divide-admin-border">
                  <thead className="bg-admin-surface-overlay">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Rank
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        DOF Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        TMDB Pop
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Death Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                    {topActors.data.actors.map((actor, index) => (
                      <tr key={actor.id}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-muted">
                          {index + 1}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-admin-text-primary">{actor.name}</div>
                          <div className="text-sm text-admin-text-muted">
                            ID: {actor.id}
                            {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="font-semibold text-admin-interactive">
                            {actor.dofPopularity.toFixed(2)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              actor.confidence >= 0.7
                                ? "bg-admin-success/20 text-admin-success"
                                : actor.confidence >= 0.5
                                  ? "bg-admin-warning/20 text-admin-warning"
                                  : "bg-admin-danger/20 text-admin-danger"
                            }`}
                          >
                            {(actor.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.tmdbPopularity?.toFixed(1) ?? "N/A"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.deathday ?? "N/A"}
                        </td>
                      </tr>
                    ))}
                    {topActors.data.actors.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-admin-text-muted">
                          No actors found with the selected criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Low Confidence Tab */}
      {activeSubTab === "low-confidence" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="text-xl font-semibold text-admin-text-primary">Low Confidence Actors</h3>
            <p className="mt-1 text-sm text-admin-text-muted">
              Actors with popularity scores but low confidence (may need additional data)
            </p>
          </div>

          {lowConfidence.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading...</div>
            </div>
          )}

          {lowConfidence.data && (
            <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[600px] divide-y divide-admin-border">
                  <thead className="bg-admin-surface-overlay">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        DOF Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Movies
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Shows
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                    {lowConfidence.data.actors.map((actor) => (
                      <tr key={actor.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-admin-text-primary">{actor.name}</div>
                          <div className="text-sm text-admin-text-muted">
                            ID: {actor.id}
                            {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="font-semibold text-admin-text-primary">
                            {actor.dofPopularity.toFixed(2)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="bg-admin-warning/20 inline-flex rounded-full px-2 text-xs font-semibold leading-5 text-admin-warning">
                            {(actor.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.movieCount}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.showCount}
                        </td>
                      </tr>
                    ))}
                    {lowConfidence.data.actors.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-admin-text-muted">
                          No low confidence actors found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Missing Scores Tab */}
      {activeSubTab === "missing" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="text-xl font-semibold text-admin-text-primary">
              Actors Missing DOF Scores
            </h3>
            <p className="mt-1 text-sm text-admin-text-muted">
              Deceased actors without calculated popularity scores (sorted by TMDB popularity)
            </p>
            {missing.data && (
              <p className="mt-2 text-sm font-medium text-admin-warning">
                {missing.data.totalMissing.toLocaleString()} actors need scores calculated
              </p>
            )}
          </div>

          {missing.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading...</div>
            </div>
          )}

          {missing.data && (
            <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[500px] divide-y divide-admin-border">
                  <thead className="bg-admin-surface-overlay">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        TMDB Popularity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Movies
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Shows
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                    {missing.data.actors.map((actor) => (
                      <tr key={actor.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-admin-text-primary">{actor.name}</div>
                          <div className="text-sm text-admin-text-muted">
                            ID: {actor.id}
                            {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.tmdbPopularity?.toFixed(1) ?? "N/A"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.movieCount}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.showCount}
                        </td>
                      </tr>
                    ))}
                    {missing.data.actors.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-admin-text-muted">
                          All deceased actors have DOF popularity scores
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
