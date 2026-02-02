/**
 * Admin page for starting a new enrichment run.
 */

import { useState, useEffect, useMemo } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
import { useStartEnrichmentRun } from "../../hooks/admin/useEnrichmentRuns"
import { useActorSearch } from "../../hooks/admin/useActorSearch"

interface ActorInfo {
  id: number
  name: string
  popularity?: number | null
}

export default function StartEnrichmentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const startEnrichment = useStartEnrichmentRun()

  // Get pre-selected actor IDs from navigation state
  const preSelectedActorIds = (location.state?.selectedActorIds as number[]) || []

  const [limit, setLimit] = useState<number>(100)
  const [maxTotalCost, setMaxTotalCost] = useState<number>(10)
  const [maxCostPerActor, setMaxCostPerActor] = useState<number | undefined>(undefined)
  const [minPopularity, setMinPopularity] = useState<number>(0)
  const [confidence, setConfidence] = useState<number>(0.5)
  const [recentOnly, setRecentOnly] = useState<boolean>(false)
  const [usActorsOnly, setUsActorsOnly] = useState<boolean>(false)

  // Source selection flags - defaults match CLI script (enabled by default)
  const [free, setFree] = useState<boolean>(true)
  const [paid, setPaid] = useState<boolean>(true)
  const [ai, setAi] = useState<boolean>(true) // Admin enrichment uses all available sources for comprehensive data
  const [gatherAllSources, setGatherAllSources] = useState<boolean>(true)

  // Advanced options - defaults match CLI script (enabled by default)
  const [claudeCleanup, setClaudeCleanup] = useState<boolean>(true)
  const [followLinks, setFollowLinks] = useState<boolean>(true)
  const [aiLinkSelection, setAiLinkSelection] = useState<boolean>(true)
  const [aiContentExtraction, setAiContentExtraction] = useState<boolean>(true)

  // Wikipedia-specific options - enabled by default like other advanced options
  const [wikipediaUseAISectionSelection, setWikipediaUseAISectionSelection] =
    useState<boolean>(true)
  const [wikipediaFollowLinkedArticles, setWikipediaFollowLinkedArticles] = useState<boolean>(true)
  const [wikipediaMaxLinkedArticles, setWikipediaMaxLinkedArticles] = useState<number>(2)
  const [wikipediaMaxSections, setWikipediaMaxSections] = useState<number>(10)

  // Actor selection mode and state
  const [selectionMode, setSelectionMode] = useState<"batch" | "specific">(
    preSelectedActorIds.length > 0 ? "specific" : "batch"
  )
  const [selectedActors, setSelectedActors] = useState<Map<number, ActorInfo>>(new Map())
  const [actorIdInput, setActorIdInput] = useState<string>("")
  const [actorSearchQuery, setActorSearchQuery] = useState<string>("")

  // Debounced search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("")
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(actorSearchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [actorSearchQuery])

  // Actor search hook
  const { data: searchResults, isLoading: isSearching } = useActorSearch(debouncedSearchQuery)

  // Fetch details for pre-selected actors
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

  // Initialize selected actors from pre-selected IDs
  useEffect(() => {
    if (preSelectedActorDetails && preSelectedActorDetails.length > 0) {
      const newMap = new Map<number, ActorInfo>()
      preSelectedActorDetails.forEach((actor) => {
        newMap.set(actor.id, actor)
      })
      setSelectedActors(newMap)
    }
  }, [preSelectedActorDetails])

  // Get actor IDs from selection
  const selectedActorIds = useMemo(() => Array.from(selectedActors.keys()), [selectedActors])

  // Add actors by ID
  const handleAddActorIds = () => {
    const ids = actorIdInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)

    if (ids.length > 0) {
      const newMap = new Map(selectedActors)
      ids.forEach((id) => {
        if (!newMap.has(id)) {
          newMap.set(id, { id, name: `Actor #${id}` })
        }
      })
      setSelectedActors(newMap)
      setActorIdInput("")
    }
  }

  // Add actor from search result
  const handleSelectSearchResult = (actor: ActorInfo) => {
    const newMap = new Map(selectedActors)
    newMap.set(actor.id, actor)
    setSelectedActors(newMap)
    setActorSearchQuery("")
  }

  // Remove actor from selection
  const handleRemoveActor = (id: number) => {
    const newMap = new Map(selectedActors)
    newMap.delete(id)
    setSelectedActors(newMap)
  }

  // Clear all selected actors
  const handleClearActors = () => {
    setSelectedActors(new Map())
    setSelectionMode("batch")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const result = await startEnrichment.mutateAsync({
        // If specific actors selected, use those; otherwise use batch selection
        ...(selectionMode === "specific" && selectedActorIds.length > 0
          ? { actorIds: selectedActorIds }
          : { limit, minPopularity, recentOnly, usActorsOnly }),
        maxTotalCost,
        maxCostPerActor,
        confidence,
        free,
        paid,
        ai,
        gatherAllSources,
        claudeCleanup,
        followLinks,
        aiLinkSelection,
        aiContentExtraction,
        // Wikipedia-specific options
        wikipedia: {
          useAISectionSelection: wikipediaUseAISectionSelection,
          followLinkedArticles: wikipediaFollowLinkedArticles,
          maxLinkedArticles: wikipediaMaxLinkedArticles,
          maxSections: wikipediaMaxSections,
        },
      })

      // Navigate to the run details page
      navigate(`/admin/enrichment/runs/${result.id}`)
    } catch (error) {
      console.error("Failed to start enrichment:", error)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/enrichment/runs"
            className="mb-2 inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            &larr; Back to Runs
          </Link>
          <h1 className="text-xl font-bold text-admin-text-primary md:text-2xl">
            Start Enrichment Run
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Configure and start a new death information enrichment run
          </p>
        </div>

        {/* Form */}
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
                      {actor.popularity !== undefined && actor.popularity !== null
                        ? `, pop: ${actor.popularity.toFixed(1)}`
                        : ""}
                      )
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

          {/* Actor Selection Mode */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Actor Selection</h2>

            {/* Mode Toggle */}
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

            {/* Batch Mode Options */}
            {selectionMode === "batch" && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="limit"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Number of Actors
                    <span className="ml-1 text-admin-text-muted">(1-1000)</span>
                  </label>
                  <input
                    id="limit"
                    type="number"
                    min="1"
                    max="1000"
                    value={limit}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      setLimit(isNaN(value) ? 1 : value)
                    }}
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                    required={selectionMode === "batch"}
                  />
                  <p className="mt-1 text-sm text-admin-text-muted">
                    Maximum number of actors to process in this run
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="minPopularity"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Minimum Popularity
                    <span className="ml-1 text-admin-text-muted">(0-100)</span>
                  </label>
                  <input
                    id="minPopularity"
                    type="number"
                    min="0"
                    max="100"
                    value={minPopularity}
                    onChange={(e) => {
                      const rawValue = e.target.value
                      if (rawValue === "") {
                        setMinPopularity(0)
                        return
                      }
                      const parsed = parseInt(rawValue, 10)
                      setMinPopularity(Number.isNaN(parsed) ? 0 : parsed)
                    }}
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                  <p className="mt-1 text-sm text-admin-text-muted">
                    Only process actors with popularity score above this threshold
                  </p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="recentOnly"
                    checked={recentOnly}
                    onChange={(e) => setRecentOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <label
                    htmlFor="recentOnly"
                    className="ml-2 block text-sm text-admin-text-secondary"
                  >
                    Recent deaths only (last 2 years)
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="usActorsOnly"
                    checked={usActorsOnly}
                    onChange={(e) => setUsActorsOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <label
                    htmlFor="usActorsOnly"
                    className="ml-2 block text-sm text-admin-text-secondary"
                  >
                    US actors only
                  </label>
                </div>
              </div>
            )}

            {/* Specific Actor Selection */}
            {selectionMode === "specific" && (
              <div className="space-y-4">
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
                      placeholder="e.g., 123, 456, 789"
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
                      className="rounded-md bg-admin-interactive px-4 py-2 text-sm font-medium text-admin-text-primary hover:bg-admin-interactive-hover"
                    >
                      Add
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-admin-text-muted">Comma-separated actor IDs</p>
                </div>

                {/* Search by Name */}
                <div>
                  <label
                    htmlFor="actorSearch"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Search by Name
                  </label>
                  <input
                    id="actorSearch"
                    type="text"
                    value={actorSearchQuery}
                    onChange={(e) => setActorSearchQuery(e.target.value)}
                    placeholder="Type actor name..."
                    className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                  {isSearching && (
                    <p className="mt-2 text-sm text-admin-text-muted">Searching...</p>
                  )}
                  {searchResults && searchResults.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-admin-border bg-admin-surface-overlay">
                      {searchResults.map((actor) => (
                        <li key={actor.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectSearchResult(actor)}
                            disabled={selectedActors.has(actor.id)}
                            className="w-full px-3 py-2 text-left text-sm text-admin-text-secondary hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {actor.name} (ID: {actor.id}
                            {actor.popularity !== undefined && actor.popularity !== null
                              ? `, pop: ${actor.popularity.toFixed(1)}`
                              : ""}
                            )
                            {selectedActors.has(actor.id) && (
                              <span className="ml-2 text-green-400">(selected)</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Selected Actors List */}
                {selectedActorIds.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-admin-text-secondary">
                      Selected Actors ({selectedActorIds.length})
                    </label>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-admin-border bg-admin-surface-overlay p-2">
                      {Array.from(selectedActors.values()).map((actor) => (
                        <li
                          key={actor.id}
                          className="flex items-center justify-between rounded px-2 py-1 text-sm text-admin-text-secondary hover:bg-admin-surface-base"
                        >
                          <span>
                            {actor.name} (ID: {actor.id})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveActor(actor.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedActorIds.length === 0 && (
                  <p className="text-sm text-admin-text-muted">
                    No actors selected. Add actors by ID or search by name above.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Source Selection */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Source Selection</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="free"
                  checked={free}
                  onChange={(e) => setFree(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="free" className="ml-2 block text-sm text-admin-text-secondary">
                  Use free sources only
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="paid"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="paid" className="ml-2 block text-sm text-admin-text-secondary">
                  Use paid sources
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ai"
                  checked={ai}
                  onChange={(e) => setAi(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="ai" className="ml-2 block text-sm text-admin-text-secondary">
                  Use AI sources
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="gatherAllSources"
                  checked={gatherAllSources}
                  onChange={(e) => setGatherAllSources(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="gatherAllSources"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Gather data from all sources
                </label>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Advanced Options</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="claudeCleanup"
                  checked={claudeCleanup}
                  onChange={(e) => setClaudeCleanup(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="claudeCleanup"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use Claude for data cleanup
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="followLinks"
                  checked={followLinks}
                  onChange={(e) => setFollowLinks(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="followLinks"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Follow external links
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="aiLinkSelection"
                  checked={aiLinkSelection}
                  onChange={(e) => setAiLinkSelection(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="aiLinkSelection"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use AI for link selection
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="aiContentExtraction"
                  checked={aiContentExtraction}
                  onChange={(e) => setAiContentExtraction(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="aiContentExtraction"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use AI for content extraction
                </label>
              </div>
            </div>

            {/* Wikipedia-specific options */}
            <div className="mt-6 border-t border-admin-border pt-4">
              <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">
                Wikipedia Options
              </h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="wikipediaUseAISectionSelection"
                    data-testid="wikipedia-use-ai-section-selection"
                    checked={wikipediaUseAISectionSelection}
                    onChange={(e) => setWikipediaUseAISectionSelection(e.target.checked)}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <label
                    htmlFor="wikipediaUseAISectionSelection"
                    className="ml-2 block text-sm text-admin-text-secondary"
                  >
                    Use AI for section selection
                    <span className="ml-1 text-admin-text-muted">(Gemini Flash)</span>
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="wikipediaFollowLinkedArticles"
                    data-testid="wikipedia-follow-linked-articles"
                    checked={wikipediaFollowLinkedArticles}
                    onChange={(e) => setWikipediaFollowLinkedArticles(e.target.checked)}
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <label
                    htmlFor="wikipediaFollowLinkedArticles"
                    className="ml-2 block text-sm text-admin-text-secondary"
                  >
                    Follow linked Wikipedia articles
                  </label>
                </div>

                {wikipediaFollowLinkedArticles && (
                  <div className="ml-6">
                    <label
                      htmlFor="wikipediaMaxLinkedArticles"
                      className="block text-sm font-medium text-admin-text-secondary"
                    >
                      Max linked articles
                      <span className="ml-1 text-admin-text-muted">(1-10)</span>
                    </label>
                    <input
                      id="wikipediaMaxLinkedArticles"
                      data-testid="wikipedia-max-linked-articles"
                      type="number"
                      min="1"
                      max="10"
                      value={wikipediaMaxLinkedArticles}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10)
                        setWikipediaMaxLinkedArticles(
                          isNaN(value) ? 2 : Math.min(10, Math.max(1, value))
                        )
                      }}
                      className="mt-1 block w-32 rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="wikipediaMaxSections"
                    className="block text-sm font-medium text-admin-text-secondary"
                  >
                    Max sections to fetch
                    <span className="ml-1 text-admin-text-muted">(1-20)</span>
                  </label>
                  <input
                    id="wikipediaMaxSections"
                    data-testid="wikipedia-max-sections"
                    type="number"
                    min="1"
                    max="20"
                    value={wikipediaMaxSections}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      setWikipediaMaxSections(isNaN(value) ? 10 : Math.min(20, Math.max(1, value)))
                    }}
                    className="mt-1 block w-32 rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cost Limits */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Cost Limits</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="maxTotalCost"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Total Cost (USD)
                </label>
                <input
                  id="maxTotalCost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxTotalCost}
                  onChange={(e) => {
                    const value = e.target.value
                    const parsed = parseFloat(value)
                    setMaxTotalCost((prev) =>
                      value === "" || Number.isNaN(parsed) ? prev : parsed
                    )
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  required
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Maximum total cost for the entire enrichment run
                </p>
              </div>

              <div>
                <label
                  htmlFor="maxCostPerActor"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Cost Per Actor (USD)
                  <span className="ml-1 text-admin-text-muted">(optional)</span>
                </label>
                <input
                  id="maxCostPerActor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxCostPerActor || ""}
                  onChange={(e) =>
                    setMaxCostPerActor(e.target.value ? parseFloat(e.target.value) : undefined)
                  }
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  placeholder="Unlimited"
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Maximum cost per individual actor (leave empty for no limit)
                </p>
              </div>
            </div>
          </div>

          {/* Quality Settings */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Quality Settings</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="confidence"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Confidence Threshold
                  <span className="ml-1 text-admin-text-muted">(0.0-1.0)</span>
                </label>
                <input
                  id="confidence"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={confidence}
                  onChange={(e) => {
                    const rawValue = e.target.value
                    const parsed = parseFloat(rawValue)
                    if (Number.isNaN(parsed)) {
                      // Fallback to default confidence if input is empty or invalid
                      setConfidence(0.5)
                    } else {
                      // Clamp to allowed range just in case
                      const clamped = Math.min(1, Math.max(0, parsed))
                      setConfidence(clamped)
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Minimum confidence score required to accept enrichment results
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={startEnrichment.isPending}
              className="rounded-md bg-admin-interactive px-6 py-2 text-sm font-semibold text-admin-text-primary shadow-sm hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startEnrichment.isPending ? "Starting..." : "Start Enrichment Run"}
            </button>
            <Link
              to="/admin/enrichment/runs"
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-6 py-2 text-sm font-semibold text-admin-text-primary shadow-sm hover:bg-admin-interactive-secondary"
            >
              Cancel
            </Link>
          </div>

          {/* Error Display */}
          {startEnrichment.isError && (
            <div className="rounded-md border border-red-700 bg-red-900 p-4 shadow-admin-sm">
              <p className="text-sm text-red-200">
                {startEnrichment.error instanceof Error
                  ? startEnrichment.error.message
                  : "Failed to start enrichment run"}
              </p>
            </div>
          )}
        </form>

        {/* CLI Reference */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">CLI Reference</h2>
          <p className="mb-4 text-admin-text-secondary">
            Equivalent CLI command for this configuration:
          </p>
          <pre className="whitespace-pre-wrap break-words rounded bg-admin-surface-base p-4 font-mono text-sm text-admin-text-secondary">
            cd server && npm run enrich:death-details --{" "}
            {selectionMode === "specific" && selectedActorIds.length > 0
              ? `--actor-id ${selectedActorIds.join(",")}`
              : `--limit ${limit}`}{" "}
            --max-total-cost {maxTotalCost}
            {maxCostPerActor ? ` --max-cost-per-actor ${maxCostPerActor}` : ""}
            {selectionMode === "batch" && minPopularity > 0
              ? ` --min-popularity ${minPopularity}`
              : ""}
            {selectionMode === "batch" && recentOnly ? " --recent-only" : ""}
            {selectionMode === "batch" && usActorsOnly ? " --us-actors-only" : ""}
            {free ? "" : " --disable-free"}
            {paid ? "" : " --disable-paid"}
            {ai ? " --ai" : ""}
            {gatherAllSources ? "" : " --disable-gather-all-sources"}
            {claudeCleanup ? "" : " --disable-claude-cleanup"}
            {followLinks ? "" : " --disable-follow-links"}
            {aiLinkSelection ? "" : " --disable-ai-link-selection"}
            {aiContentExtraction ? "" : " --disable-ai-content-extraction"}
            {confidence !== 0.5 ? ` --confidence ${confidence}` : ""}
          </pre>
        </div>
      </div>
    </AdminLayout>
  )
}
