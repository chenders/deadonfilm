/**
 * Admin page for starting a new biography enrichment run.
 *
 * Pattern: src/pages/admin/StartEnrichmentPage.tsx
 */

import { useState, useEffect, useMemo } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
import { useStartBioEnrichmentRun } from "../../hooks/admin/useBioEnrichmentRuns"
import { useActorSearch } from "../../hooks/admin/useActorSearch"

interface ActorInfo {
  id: number
  name: string
  popularity?: number | null
}

export default function StartBioEnrichmentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const startEnrichment = useStartBioEnrichmentRun()

  // Get pre-selected actor IDs from navigation state
  const preSelectedActorIds = (location.state?.selectedActorIds as number[]) || []

  // Batch settings
  const [limit, setLimit] = useState<number>(50)
  const [minPopularity, setMinPopularity] = useState<number>(0)

  // Quality settings
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.6)

  // Cost limits
  const [maxCostPerActor, setMaxCostPerActor] = useState<number>(0.5)
  const [maxTotalCost, setMaxTotalCost] = useState<number>(25)

  // Source category toggles
  const [free, setFree] = useState(true)
  const [reference, setReference] = useState(true)
  const [books, setBooks] = useState(true)
  const [webSearch, setWebSearch] = useState(true)
  const [news, setNews] = useState(true)
  const [obituary, setObituary] = useState(true)
  const [archives, setArchives] = useState(true)

  // Other options
  const [allowRegeneration, setAllowRegeneration] = useState(false)

  // Actor selection mode
  const [selectionMode, setSelectionMode] = useState<"batch" | "specific">(
    preSelectedActorIds.length > 0 ? "specific" : "batch"
  )
  const [selectedActors, setSelectedActors] = useState<Map<number, ActorInfo>>(new Map())
  const [actorIdInput, setActorIdInput] = useState("")
  const [actorSearchQuery, setActorSearchQuery] = useState("")

  // Debounced search
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(actorSearchQuery), 300)
    return () => clearTimeout(timer)
  }, [actorSearchQuery])

  const { data: searchResults, isLoading: isSearching } = useActorSearch(debouncedSearchQuery)

  // Fetch pre-selected actor details
  const { data: preSelectedActorDetails } = useQuery({
    queryKey: ["admin", "actors", "details", preSelectedActorIds],
    queryFn: async () => {
      if (preSelectedActorIds.length === 0) return []
      const params = new URLSearchParams()
      preSelectedActorIds.forEach((id) => params.append("ids", id.toString()))
      const response = await fetch(`/admin/api/coverage/actors/by-ids?${params.toString()}`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error("Failed to fetch actor details")
      return response.json() as Promise<ActorInfo[]>
    },
    enabled: preSelectedActorIds.length > 0,
  })

  useEffect(() => {
    if (preSelectedActorDetails && preSelectedActorDetails.length > 0) {
      const newMap = new Map<number, ActorInfo>()
      preSelectedActorDetails.forEach((actor) => newMap.set(actor.id, actor))
      setSelectedActors(newMap)
    }
  }, [preSelectedActorDetails])

  const selectedActorIds = useMemo(() => Array.from(selectedActors.keys()), [selectedActors])

  const handleAddActorIds = () => {
    const ids = actorIdInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)

    if (ids.length > 0) {
      const newMap = new Map(selectedActors)
      ids.forEach((id) => {
        if (!newMap.has(id)) newMap.set(id, { id, name: `Actor #${id}` })
      })
      setSelectedActors(newMap)
      setActorIdInput("")
    }
  }

  const handleSelectSearchResult = (actor: ActorInfo) => {
    const newMap = new Map(selectedActors)
    newMap.set(actor.id, actor)
    setSelectedActors(newMap)
    setActorSearchQuery("")
  }

  const handleRemoveActor = (id: number) => {
    const newMap = new Map(selectedActors)
    newMap.delete(id)
    setSelectedActors(newMap)
  }

  const handleClearActors = () => {
    setSelectedActors(new Map())
    setSelectionMode("batch")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectionMode === "specific" && selectedActorIds.length === 0) {
      return
    }

    try {
      const result = await startEnrichment.mutateAsync({
        ...(selectionMode === "specific" && selectedActorIds.length > 0
          ? { actorIds: selectedActorIds }
          : { limit, minPopularity }),
        confidenceThreshold,
        maxCostPerActor,
        maxTotalCost,
        allowRegeneration,
        sourceCategories: { free, reference, books, webSearch, news, obituary, archives },
      })

      navigate(`/admin/bio-enrichment/runs/${result.runId}`)
    } catch (error) {
      console.error("Failed to start bio enrichment:", error)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/bio-enrichment/runs"
            className="mb-2 inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            &larr; Back to Runs
          </Link>
          <h1 className="text-xl font-bold text-admin-text-primary md:text-2xl">
            Start Bio Enrichment Run
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Configure and start a multi-source biography enrichment run
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pre-selected actors banner */}
          {selectionMode === "specific" && selectedActorIds.length > 0 && (
            <div className="rounded-lg border-2 border-blue-500 bg-blue-900/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-blue-200">
                  Enriching {selectedActorIds.length} Selected Actor
                  {selectedActorIds.length > 1 ? "s" : ""}
                </h2>
                <button
                  type="button"
                  onClick={handleClearActors}
                  className="text-sm text-blue-300 hover:text-blue-100 hover:underline"
                >
                  Clear and use batch mode
                </button>
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {Array.from(selectedActors.values()).map((actor) => (
                  <li key={actor.id} className="flex items-center justify-between text-blue-100">
                    <span>
                      {actor.name} (ID: {actor.id}
                      {actor.popularity != null ? `, pop: ${actor.popularity.toFixed(1)}` : ""})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveActor(actor.id)}
                      className="ml-2 text-blue-300 hover:text-red-400"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actor Selection */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Actor Selection</h2>

            <div className="mb-4 space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="selectionMode"
                  checked={selectionMode === "batch"}
                  onChange={() => setSelectionMode("batch")}
                  className="mr-2 h-4 w-4 border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <span className="text-sm text-admin-text-secondary">
                  Batch (process multiple actors by filters)
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="selectionMode"
                  checked={selectionMode === "specific"}
                  onChange={() => setSelectionMode("specific")}
                  className="mr-2 h-4 w-4 border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <span className="text-sm text-admin-text-secondary">
                  Specific Actors (select individual actors)
                </span>
              </label>
            </div>

            {selectionMode === "batch" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="limit"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Number of Actors
                    <span className="ml-1 text-admin-text-muted">(1-500)</span>
                  </label>
                  <input
                    id="limit"
                    type="number"
                    min="1"
                    max="500"
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                </div>
                <div>
                  <label
                    htmlFor="minPopularity"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Minimum Popularity
                  </label>
                  <input
                    id="minPopularity"
                    type="number"
                    min="0"
                    step="0.1"
                    value={minPopularity}
                    onChange={(e) => setMinPopularity(parseFloat(e.target.value) || 0)}
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                  <p className="mt-1 text-xs text-admin-text-muted">
                    Only process actors with dof_popularity above this threshold
                  </p>
                </div>
              </div>
            )}

            {selectionMode === "specific" && (
              <div className="space-y-4">
                {/* Search by name */}
                <div className="relative">
                  <label
                    htmlFor="actorSearchQuery"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Search by Name
                  </label>
                  <input
                    id="actorSearchQuery"
                    type="text"
                    value={actorSearchQuery}
                    onChange={(e) => setActorSearchQuery(e.target.value)}
                    placeholder="Type actor name..."
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-9">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}
                  {searchResults && searchResults.length > 0 && actorSearchQuery.length >= 2 && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-admin-border bg-admin-surface-elevated shadow-lg">
                      {searchResults.map((actor) => (
                        <button
                          key={actor.id}
                          type="button"
                          onClick={() =>
                            handleSelectSearchResult({
                              id: actor.id,
                              name: actor.name,
                              popularity: actor.popularity,
                            })
                          }
                          className="block w-full px-3 py-2 text-left text-sm text-admin-text-primary hover:bg-admin-interactive-secondary"
                        >
                          {actor.name}
                          {actor.popularity != null && (
                            <span className="ml-2 text-admin-text-muted">
                              pop: {actor.popularity.toFixed(1)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add by ID */}
                <div>
                  <label
                    htmlFor="actorIdInput"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Add by Actor ID
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="actorIdInput"
                      type="text"
                      value={actorIdInput}
                      onChange={(e) => setActorIdInput(e.target.value)}
                      placeholder="e.g. 123, 456"
                      className="block flex-1 rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddActorIds()
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddActorIds}
                      className="rounded-md bg-admin-interactive px-3 py-2 text-sm text-admin-text-primary hover:bg-admin-interactive-hover"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Source Categories */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">
              Source Categories
            </h2>
            <p className="mb-4 text-sm text-admin-text-muted">
              Control which types of data sources are used. Disabling categories reduces cost but
              may lower quality.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                {
                  label: "Free (Wikidata, Wikipedia)",
                  checked: free,
                  onChange: setFree,
                },
                {
                  label: "Reference (Britannica, Bio.com)",
                  checked: reference,
                  onChange: setReference,
                },
                {
                  label: "Books (Google Books, Open Library)",
                  checked: books,
                  onChange: setBooks,
                },
                {
                  label: "Web Search (Google, Bing, etc.)",
                  checked: webSearch,
                  onChange: setWebSearch,
                },
                {
                  label: "News (Guardian, NYT, etc.)",
                  checked: news,
                  onChange: setNews,
                },
                {
                  label: "Obituary (Legacy, FindAGrave)",
                  checked: obituary,
                  onChange: setObituary,
                },
                {
                  label: "Archives (Internet Archive, etc.)",
                  checked: archives,
                  onChange: setArchives,
                },
              ].map(({ label, checked, onChange }) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <span className="text-sm text-admin-text-secondary">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Quality & Cost Settings */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">
              Quality & Cost Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label
                  htmlFor="confidence"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Confidence Threshold
                  <span className="ml-1 text-admin-text-muted">({confidenceThreshold})</span>
                </label>
                <input
                  id="confidence"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="mt-2 w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-admin-text-muted">
                  <span>Low (0.1)</span>
                  <span>High (1.0)</span>
                </div>
              </div>
              <div>
                <label
                  htmlFor="maxCostPerActor"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Cost Per Actor ($)
                </label>
                <input
                  id="maxCostPerActor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxCostPerActor}
                  onChange={(e) => setMaxCostPerActor(parseFloat(e.target.value) || 0.5)}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
              </div>
              <div>
                <label
                  htmlFor="maxTotalCost"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Total Cost ($)
                </label>
                <input
                  id="maxTotalCost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxTotalCost}
                  onChange={(e) => setMaxTotalCost(parseFloat(e.target.value) || 25)}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowRegeneration}
                  onChange={(e) => setAllowRegeneration(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <span className="text-sm text-admin-text-secondary">
                  Allow Regeneration
                  <span className="ml-1 text-admin-text-muted">
                    (re-enrich actors that already have biographies)
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={
                startEnrichment.isPending ||
                (selectionMode === "specific" && selectedActorIds.length === 0)
              }
              className="rounded-lg bg-admin-danger px-6 py-3 font-semibold text-admin-text-primary transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startEnrichment.isPending ? "Starting..." : "Start Bio Enrichment Run"}
            </button>
            {startEnrichment.isError && (
              <span className="text-sm text-red-400">
                {startEnrichment.error instanceof Error
                  ? startEnrichment.error.message
                  : "Failed to start"}
              </span>
            )}
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <svg
      className={`animate-spin ${size === "sm" ? "h-4 w-4" : "h-6 w-6"} text-admin-text-muted`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
