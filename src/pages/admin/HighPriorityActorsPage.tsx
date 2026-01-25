/**
 * High Priority Actors Page
 *
 * Displays high-priority actors (popularity ≥ 10) without death pages.
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
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold">High Priority Actors</h1>
            <p className="mt-2 text-gray-400">
              Deceased actors with popularity ≥ {MIN_POPULARITY} needing enrichment
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
            <div className="rounded-lg bg-red-900/50 p-4 text-red-200">
              Failed to load high-priority actors. Please try again.
            </div>
          )}

          {/* Enrichment Error State */}
          {enrichmentError && (
            <div className="rounded-lg bg-red-900/50 p-4 text-red-200">{enrichmentError}</div>
          )}

          {/* Empty State */}
          {!isLoading && !error && actors && actors.length === 0 && (
            <div className="rounded-lg bg-gray-800 p-8 text-center">
              <p className="text-gray-400">No high-priority actors found needing enrichment.</p>
              <p className="mt-2 text-sm text-gray-500">
                All actors with popularity ≥ {MIN_POPULARITY} have been enriched.
              </p>
            </div>
          )}

          {/* Actors Table */}
          {!isLoading && !error && actors && actors.length > 0 && (
            <>
              <div className="overflow-hidden rounded-lg bg-gray-800 shadow">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-750">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={actors.length > 0 && selectedActorIds.size === actors.length}
                          onChange={handleSelectAll}
                          aria-label="Select all actors"
                          data-testid="select-all-checkbox"
                          className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                      >
                        Death Date
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                      >
                        Popularity
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                      >
                        Last Enriched
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 bg-gray-800">
                    {actors.map((actor) => (
                      <tr
                        key={actor.id}
                        className={`hover:bg-gray-750 transition-colors ${
                          selectedActorIds.has(actor.id) ? "bg-gray-750" : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedActorIds.has(actor.id)}
                            onChange={() => handleSelectActor(actor.id)}
                            aria-label={`Select ${actor.name}`}
                            data-testid="actor-checkbox"
                            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-white">{actor.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {formatDate(actor.deathday)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {actor.popularity?.toFixed(1) ?? "N/A"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {formatDate(actor.enriched_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Results Summary */}
              <div className="mt-4 text-sm text-gray-400">
                Showing {actors.length} high-priority actors
              </div>
            </>
          )}

          {/* Fixed Action Bar */}
          {selectedActorIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-700 bg-gray-800 p-4 shadow-lg">
              <div className="mx-auto flex max-w-7xl items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {selectedActorIds.size} actor{selectedActorIds.size !== 1 ? "s" : ""} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedActorIds(new Set())}
                    data-testid="clear-selection-button"
                    className="rounded bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
                  >
                    Clear Selection
                  </button>
                  <button
                    onClick={handleEnrichSelected}
                    disabled={startEnrichment.isPending}
                    data-testid="enrich-selected-button"
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {startEnrichment.isPending ? "Starting..." : "Enrich Selected"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add bottom padding when action bar is visible */}
          {selectedActorIds.size > 0 && <div className="h-20" />}
        </div>
      </div>
    </AdminLayout>
  )
}
