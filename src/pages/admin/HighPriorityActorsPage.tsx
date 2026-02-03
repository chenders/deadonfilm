/**
 * High Priority Actors Page
 *
 * Displays high-priority actors (popularity >= 10) without death pages.
 * Allows batch selection and enrichment via clickable interface.
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useEnrichmentCandidates } from "../../hooks/admin/useCoverage"
import { useStartEnrichmentRun } from "../../hooks/admin/useEnrichmentRuns"

const MIN_POPULARITY = 10
const LIMIT = 500

export default function HighPriorityActorsPage() {
  const navigate = useNavigate()
  const [selectedActorIds, setSelectedActorIds] = useState<Set<number>>(new Set())
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null)

  // Fetch high-priority actors
  const { data: actors, isLoading, error } = useEnrichmentCandidates(MIN_POPULARITY, LIMIT)

  // Mutation for starting enrichment
  const startEnrichment = useStartEnrichmentRun()

  // Handle select all/none
  const handleSelectAll = () => {
    if (!actors) return

    if (selectedActorIds.size === actors.length) {
      // Deselect all
      setSelectedActorIds(new Set())
    } else {
      // Select all
      setSelectedActorIds(new Set(actors.map((a) => a.id)))
    }
  }

  // Handle individual selection
  const handleSelectActor = (actorId: number) => {
    const newSelection = new Set(selectedActorIds)
    if (newSelection.has(actorId)) {
      newSelection.delete(actorId)
    } else {
      newSelection.add(actorId)
    }
    setSelectedActorIds(newSelection)
  }

  // Handle enrichment start
  const handleEnrichSelected = async () => {
    if (selectedActorIds.size === 0) return

    try {
      setEnrichmentError(null) // Clear any previous errors
      const result = await startEnrichment.mutateAsync({
        actorIds: Array.from(selectedActorIds),
      })
      // Navigate to enrichment run details page
      navigate(`/admin/enrichment/runs/${result.id}`)
    } catch (err) {
      console.error("Failed to start enrichment:", err)
      setEnrichmentError(
        err instanceof Error ? err.message : "Failed to start enrichment. Please try again."
      )
    }
  }

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A"
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-admin-surface-base text-admin-text-primary">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold md:text-3xl">High Priority Actors</h1>
            <p className="mt-2 text-admin-text-muted">
              Deceased actors with popularity {">="} {MIN_POPULARITY} needing enrichment
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-lg bg-red-900/50 p-4 text-red-200 shadow-admin-sm">
              Failed to load high-priority actors. Please try again.
            </div>
          )}

          {/* Enrichment Error State */}
          {enrichmentError && (
            <div className="rounded-lg bg-red-900/50 p-4 text-red-200 shadow-admin-sm">
              {enrichmentError}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && actors && actors.length === 0 && (
            <div className="rounded-lg bg-admin-surface-elevated p-8 text-center shadow-admin-sm">
              <p className="text-admin-text-muted">
                No high-priority actors found needing enrichment.
              </p>
              <p className="mt-2 text-sm text-admin-text-muted">
                All actors with popularity {">="} {MIN_POPULARITY} have been enriched.
              </p>
            </div>
          )}

          {/* Actors Table */}
          {!isLoading && !error && actors && actors.length > 0 && (
            <div className={selectedActorIds.size > 0 ? "pb-24" : ""}>
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="inline-block min-w-full overflow-hidden rounded-lg bg-admin-surface-elevated shadow-admin-sm">
                  <table className="w-full min-w-[700px] divide-y divide-admin-border">
                    <thead className="bg-admin-surface-overlay">
                      <tr>
                        <th scope="col" className="px-3 py-3 text-left md:px-6">
                          <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={actors.length > 0 && selectedActorIds.size === actors.length}
                              onChange={handleSelectAll}
                              aria-label="Select all actors"
                              data-testid="select-all-checkbox"
                              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                            />
                          </label>
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-secondary"
                        >
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-secondary"
                        >
                          Death Date
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-secondary"
                        >
                          Popularity
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-secondary"
                        >
                          Last Enriched
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                      {actors.map((actor) => (
                        <tr
                          key={actor.id}
                          className={`transition-colors hover:bg-admin-interactive-secondary ${
                            selectedActorIds.has(actor.id) ? "bg-admin-interactive-secondary" : ""
                          }`}
                        >
                          <td className="px-3 py-2 md:px-6 md:py-4">
                            <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedActorIds.has(actor.id)}
                                onChange={() => handleSelectActor(actor.id)}
                                aria-label={`Select ${actor.name}`}
                                data-testid="actor-checkbox"
                                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                              />
                            </label>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-admin-text-primary">
                            {actor.name}
                          </td>
                          <td className="px-6 py-4 text-sm text-admin-text-secondary">
                            {formatDate(actor.deathday)}
                          </td>
                          <td className="px-6 py-4 text-sm text-admin-text-secondary">
                            {actor.popularity?.toFixed(1) ?? "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm text-admin-text-secondary">
                            {formatDate(actor.enriched_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Results Summary */}
              <div className="mt-4 text-sm text-admin-text-muted">
                Showing {actors.length} high-priority actors
              </div>
            </div>
          )}

          {/* Fixed Action Bar */}
          {selectedActorIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-admin-border bg-admin-surface-elevated p-4 shadow-lg">
              <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center text-sm font-medium text-admin-text-primary sm:text-left">
                  {selectedActorIds.size} actor{selectedActorIds.size !== 1 ? "s" : ""} selected
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                  <button
                    onClick={() => setSelectedActorIds(new Set())}
                    data-testid="clear-selection-button"
                    className="min-h-[44px] rounded bg-admin-surface-overlay px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary"
                  >
                    Clear Selection
                  </button>
                  <button
                    onClick={handleEnrichSelected}
                    disabled={startEnrichment.isPending}
                    data-testid="enrich-selected-button"
                    className="min-h-[44px] rounded bg-admin-interactive px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {startEnrichment.isPending ? "Starting..." : "Enrich Selected"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
