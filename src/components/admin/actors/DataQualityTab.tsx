import { useState } from "react"
import {
  useDataQualityOverview,
  useFutureDeaths,
  useCleanupFutureDeaths,
  useUncertainDeaths,
  useResetEnrichment,
} from "../../../hooks/admin/useDataQuality"
import MobileCard from "../ui/MobileCard"

type SubTab = "overview" | "future-deaths" | "uncertain-deaths" | "reset-enrichment"

export default function DataQualityTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("overview")
  const [futureDeathsPage, setFutureDeathsPage] = useState(1)
  const [uncertainDeathsPage, setUncertainDeathsPage] = useState(1)

  // Reset enrichment form state
  const [resetActorId, setResetActorId] = useState("")
  const [resetTmdbId, setResetTmdbId] = useState("")
  const [resetDryRun, setResetDryRun] = useState(false)

  const overview = useDataQualityOverview()
  const futureDeaths = useFutureDeaths(futureDeathsPage, 50)
  const uncertainDeaths = useUncertainDeaths(uncertainDeathsPage, 50)

  const cleanupMutation = useCleanupFutureDeaths()
  const resetMutation = useResetEnrichment()

  const handleCleanupFutureDeaths = (dryRun: boolean) => {
    cleanupMutation.mutate({ dryRun })
  }

  const handleResetEnrichment = () => {
    const actorIdNum = resetActorId ? parseInt(resetActorId, 10) : undefined
    const tmdbIdNum = resetTmdbId ? parseInt(resetTmdbId, 10) : undefined

    if (!actorIdNum && !tmdbIdNum) {
      return
    }

    resetMutation.mutate({
      actorId: actorIdNum && !isNaN(actorIdNum) ? actorIdNum : undefined,
      tmdbId: tmdbIdNum && !isNaN(tmdbIdNum) ? tmdbIdNum : undefined,
      dryRun: resetDryRun,
    })
  }

  const subTabs: { id: SubTab; label: string; testId: string }[] = [
    { id: "overview", label: "Overview", testId: "data-quality-overview-tab" },
    { id: "future-deaths", label: "Future Deaths", testId: "data-quality-future-deaths-tab" },
    { id: "uncertain-deaths", label: "Uncertain Deaths", testId: "data-quality-uncertain-tab" },
    { id: "reset-enrichment", label: "Reset Enrichment", testId: "data-quality-reset-tab" },
  ]

  return (
    <div className="space-y-8">
      {/* Sub-Tabs */}
      <div className="border-b border-admin-border">
        <nav className="-mb-px flex flex-wrap gap-x-4 md:gap-x-8">
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

      {/* Overview Sub-Tab */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          {overview.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading data quality overview...</div>
            </div>
          )}

          {overview.data && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Future Deaths Card */}
              <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                <h3 className="text-sm font-medium text-admin-text-muted">
                  Future/Invalid Death Dates
                </h3>
                <p className="mt-2 text-3xl font-bold text-admin-danger">
                  {overview.data.futureDeathsCount}
                </p>
                <p className="mt-1 text-sm text-admin-text-muted">
                  Actors with death dates in the future or before birth
                </p>
                <button
                  onClick={() => setActiveSubTab("future-deaths")}
                  className="mt-4 text-sm font-medium text-admin-interactive hover:underline"
                >
                  View details
                </button>
              </div>

              {/* Uncertain Deaths Card */}
              <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                <h3 className="text-sm font-medium text-admin-text-muted">
                  Uncertain Death Records
                </h3>
                <p className="mt-2 text-3xl font-bold text-admin-warning">
                  {overview.data.uncertainDeathsCount}
                </p>
                <p className="mt-1 text-sm text-admin-text-muted">
                  Records with uncertainty markers from AI enrichment
                </p>
                <button
                  onClick={() => setActiveSubTab("uncertain-deaths")}
                  className="mt-4 text-sm font-medium text-admin-interactive hover:underline"
                >
                  View details
                </button>
              </div>

              {/* Pending Reset Card */}
              <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
                <h3 className="text-sm font-medium text-admin-text-muted">
                  Actors With Enrichment History
                </h3>
                <p className="mt-2 text-3xl font-bold text-admin-text-primary">
                  {overview.data.pendingResetCount}
                </p>
                <p className="mt-1 text-sm text-admin-text-muted">
                  Can be reset to re-run enrichment with newer models
                </p>
                <button
                  onClick={() => setActiveSubTab("reset-enrichment")}
                  className="mt-4 text-sm font-medium text-admin-interactive hover:underline"
                >
                  Reset enrichment
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Future Deaths Sub-Tab */}
      {activeSubTab === "future-deaths" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-admin-text-primary">
                  Future/Invalid Death Dates
                </h3>
                <p className="mt-1 text-sm text-admin-text-muted">
                  These actors have death dates that are impossible or suspicious
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  onClick={() => handleCleanupFutureDeaths(true)}
                  disabled={cleanupMutation.isPending}
                  className="min-h-[44px] rounded-md bg-admin-interactive-secondary px-4 py-2 text-sm font-semibold text-admin-text-primary hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Preview Cleanup
                </button>
                <button
                  onClick={() => handleCleanupFutureDeaths(false)}
                  disabled={cleanupMutation.isPending}
                  data-testid="cleanup-future-deaths-button"
                  className="hover:bg-admin-danger/90 min-h-[44px] rounded-md bg-admin-danger px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cleanupMutation.isPending ? "Cleaning..." : "Cleanup All"}
                </button>
              </div>
            </div>

            {cleanupMutation.isSuccess && cleanupMutation.data && (
              <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-4">
                <h4 className="font-semibold text-admin-success">
                  {cleanupMutation.data.dryRun ? "Preview Complete" : "Cleanup Complete"}
                </h4>
                <p className="mt-1 text-sm text-admin-text-primary">
                  {cleanupMutation.data.dryRun
                    ? `Would clean ${cleanupMutation.data.wouldClean} actors`
                    : `Cleaned ${cleanupMutation.data.cleaned} actors`}
                </p>
              </div>
            )}

            {cleanupMutation.isError && (
              <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
                Error cleaning up data. Please try again.
              </div>
            )}
          </div>

          {/* Future Deaths Table */}
          {futureDeaths.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading...</div>
            </div>
          )}

          {futureDeaths.data && (
            <div
              className="rounded-lg bg-admin-surface-elevated shadow-admin-sm"
              data-testid="future-deaths-table"
            >
              {/* Mobile cards */}
              <div className="space-y-3 p-4 md:hidden">
                {futureDeaths.data.actors.length === 0 ? (
                  <p className="py-8 text-center text-admin-text-muted">
                    No actors with future or invalid death dates
                  </p>
                ) : (
                  futureDeaths.data.actors.map((actor) => (
                    <MobileCard
                      key={actor.id}
                      title={actor.name}
                      subtitle={
                        <span className="text-admin-text-muted">
                          ID: {actor.id}
                          {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                        </span>
                      }
                      fields={[
                        { label: "Death Date", value: actor.deathDate },
                        { label: "Birth Date", value: actor.birthDate || "Unknown" },
                        {
                          label: "Issue",
                          value: (
                            <span
                              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                actor.issueType === "future_date"
                                  ? "bg-admin-danger/20 text-admin-danger"
                                  : "bg-admin-warning/20 text-admin-warning"
                              }`}
                            >
                              {actor.issueType === "future_date"
                                ? "Future Date"
                                : "Death Before Birth"}
                            </span>
                          ),
                        },
                        { label: "Popularity", value: actor.popularity?.toFixed(1) ?? "N/A" },
                      ]}
                    />
                  ))
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] divide-y divide-admin-border">
                  <thead className="bg-admin-surface-overlay">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Death Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Birth Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Issue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Popularity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                    {futureDeaths.data.actors.map((actor) => (
                      <tr key={actor.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-admin-text-primary">{actor.name}</div>
                          <div className="text-sm text-admin-text-muted">
                            ID: {actor.id}
                            {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.deathDate}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.birthDate || "Unknown"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              actor.issueType === "future_date"
                                ? "bg-admin-danger/20 text-admin-danger"
                                : "bg-admin-warning/20 text-admin-warning"
                            }`}
                          >
                            {actor.issueType === "future_date"
                              ? "Future Date"
                              : "Death Before Birth"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.popularity?.toFixed(1) ?? "N/A"}
                        </td>
                      </tr>
                    ))}
                    {futureDeaths.data.actors.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-admin-text-muted">
                          No actors with future or invalid death dates
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {futureDeaths.data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-admin-border px-6 py-3">
                  <div className="text-sm text-admin-text-muted">
                    Page {futureDeaths.data.page} of {futureDeaths.data.totalPages} (
                    {futureDeaths.data.total} total)
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFutureDeathsPage((p) => Math.max(1, p - 1))}
                      disabled={futureDeathsPage === 1}
                      className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setFutureDeathsPage((p) =>
                          Math.min(futureDeaths.data?.totalPages || 1, p + 1)
                        )
                      }
                      disabled={futureDeathsPage === futureDeaths.data?.totalPages}
                      className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Uncertain Deaths Sub-Tab */}
      {activeSubTab === "uncertain-deaths" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="text-xl font-semibold text-admin-text-primary">
              Uncertain Death Records
            </h3>
            <p className="mt-1 text-sm text-admin-text-muted">
              These actors have death records where the AI expressed uncertainty about the
              information
            </p>
          </div>

          {/* Uncertain Deaths Table */}
          {uncertainDeaths.isLoading && (
            <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
              <div className="text-admin-text-muted">Loading...</div>
            </div>
          )}

          {uncertainDeaths.data && (
            <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
              {/* Mobile cards */}
              <div className="space-y-3 p-4 md:hidden">
                {uncertainDeaths.data.actors.length === 0 ? (
                  <p className="py-8 text-center text-admin-text-muted">
                    No actors with uncertain death records
                  </p>
                ) : (
                  uncertainDeaths.data.actors.map((actor) => (
                    <MobileCard
                      key={actor.id}
                      title={actor.name}
                      fields={[
                        { label: "Death Date", value: actor.deathDate },
                        { label: "Popularity", value: actor.popularity?.toFixed(1) ?? "N/A" },
                        {
                          label: "Circumstances",
                          value: actor.circumstancesExcerpt || "N/A",
                        },
                      ]}
                    />
                  ))
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] divide-y divide-admin-border">
                  <thead className="bg-admin-surface-overlay">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Death Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Popularity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                        Circumstances (excerpt)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                    {uncertainDeaths.data.actors.map((actor) => (
                      <tr key={actor.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-admin-text-primary">{actor.name}</div>
                          <div className="text-sm text-admin-text-muted">
                            ID: {actor.id}
                            {actor.tmdbId && ` | TMDB: ${actor.tmdbId}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.deathDate}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.popularity?.toFixed(1) ?? "N/A"}
                        </td>
                        <td className="max-w-md truncate px-6 py-4 text-sm text-admin-text-secondary">
                          {actor.circumstancesExcerpt || "N/A"}
                        </td>
                      </tr>
                    ))}
                    {uncertainDeaths.data.actors.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-admin-text-muted">
                          No actors with uncertain death records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {uncertainDeaths.data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-admin-border px-6 py-3">
                  <div className="text-sm text-admin-text-muted">
                    Page {uncertainDeaths.data.page} of {uncertainDeaths.data.totalPages} (
                    {uncertainDeaths.data.total} total)
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUncertainDeathsPage((p) => Math.max(1, p - 1))}
                      disabled={uncertainDeathsPage === 1}
                      className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setUncertainDeathsPage((p) =>
                          Math.min(uncertainDeaths.data?.totalPages || 1, p + 1)
                        )
                      }
                      disabled={uncertainDeathsPage === uncertainDeaths.data?.totalPages}
                      className="rounded-md bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reset Enrichment Sub-Tab */}
      {activeSubTab === "reset-enrichment" && (
        <div className="space-y-6">
          <div
            className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
            data-testid="reset-enrichment-form"
          >
            <h3 className="text-xl font-semibold text-admin-text-primary">Reset Enrichment Data</h3>
            <p className="mt-1 text-sm text-admin-text-muted">
              Clear enrichment data for an actor so they can be re-processed with newer AI models
            </p>

            <div className="mt-6 max-w-md space-y-4">
              {/* Actor ID input */}
              <div>
                <label
                  htmlFor="resetActorId"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Actor ID (internal)
                </label>
                <input
                  type="text"
                  id="resetActorId"
                  value={resetActorId}
                  onChange={(e) => {
                    setResetActorId(e.target.value)
                    if (e.target.value) setResetTmdbId("")
                  }}
                  placeholder="e.g., 12345"
                  className="mt-2 w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary placeholder:text-admin-text-muted focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
                />
              </div>

              <div className="text-center text-sm text-admin-text-muted">or</div>

              {/* TMDB ID input */}
              <div>
                <label
                  htmlFor="resetTmdbId"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  TMDB ID
                </label>
                <input
                  type="text"
                  id="resetTmdbId"
                  value={resetTmdbId}
                  onChange={(e) => {
                    setResetTmdbId(e.target.value)
                    if (e.target.value) setResetActorId("")
                  }}
                  placeholder="e.g., 3026"
                  className="mt-2 w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary placeholder:text-admin-text-muted focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
                />
              </div>

              {/* Dry run checkbox */}
              <div className="flex items-center" data-testid="dry-run-toggle">
                <input
                  type="checkbox"
                  id="resetDryRun"
                  checked={resetDryRun}
                  onChange={(e) => setResetDryRun(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="resetDryRun" className="ml-2 text-sm text-admin-text-secondary">
                  Dry run (preview without changes)
                </label>
              </div>

              {/* Action button */}
              <div className="pt-2">
                <button
                  onClick={handleResetEnrichment}
                  disabled={resetMutation.isPending || (!resetActorId && !resetTmdbId)}
                  className="hover:bg-admin-warning/90 rounded-md bg-admin-warning px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetMutation.isPending ? "Resetting..." : "Reset Enrichment"}
                </button>
              </div>
            </div>

            {/* Results */}
            {resetMutation.isSuccess && resetMutation.data && (
              <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-4">
                <h4 className="font-semibold text-admin-success">
                  {resetMutation.data.dryRun ? "Preview Complete" : "Reset Complete"}
                </h4>
                {resetMutation.data.dryRun && resetMutation.data.actor ? (
                  <div className="mt-2 text-sm text-admin-text-primary">
                    <p>
                      <strong>Actor:</strong> {resetMutation.data.actor.name} (ID:{" "}
                      {resetMutation.data.actor.id})
                    </p>
                    <p>
                      <strong>Would delete:</strong> {resetMutation.data.actor.historyCount} history
                      entries
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-admin-text-primary">
                    <p>
                      <strong>Actor:</strong> {resetMutation.data.name} (ID:{" "}
                      {resetMutation.data.actorId})
                    </p>
                    <p>
                      <strong>Deleted:</strong> {resetMutation.data.historyDeleted} history entries,{" "}
                      {resetMutation.data.circumstancesDeleted} circumstances record
                    </p>
                  </div>
                )}
              </div>
            )}

            {resetMutation.isError && (
              <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
                Error resetting enrichment data:{" "}
                {resetMutation.error instanceof Error
                  ? resetMutation.error.message
                  : "Unknown error"}
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="rounded-lg bg-admin-surface-overlay p-4 text-sm text-admin-text-secondary">
            <h4 className="font-semibold text-admin-text-primary">What gets reset?</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <code className="text-admin-interactive">has_detailed_death_info</code>,{" "}
                <code className="text-admin-interactive">enriched_at</code>,{" "}
                <code className="text-admin-interactive">enrichment_source</code>,{" "}
                <code className="text-admin-interactive">enrichment_version</code> fields
              </li>
              <li>All entries in actor_death_info_history</li>
              <li>Record in actor_death_circumstances</li>
            </ul>
            <p className="mt-3">
              After reset, the actor will appear in enrichment candidates and can be re-processed.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
