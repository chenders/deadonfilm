import { useState, useEffect } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import DateRangePicker from "../../components/admin/analytics/DateRangePicker"
import {
  useActorsForCoverage,
  useCausesOfDeath,
  type ActorCoverageFilters,
} from "../../hooks/admin/useCoverage"
import AdminHoverCard from "../../components/admin/ui/AdminHoverCard"
import ActorPreviewCard from "../../components/admin/ActorPreviewCard"
import { useDebouncedSearchParam } from "../../hooks/useDebouncedSearchParam"
import { createActorSlug } from "../../utils/slugify"

/**
 * Format a date as relative time (e.g., "2 days ago", "3 months ago")
 */
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? "s" : ""} ago`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} year${years > 1 ? "s" : ""} ago`
}

export default function ActorManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [selectedActorIds, setSelectedActorIds] = useState<Set<number>>(new Set())
  const [causeSearchInput, setCauseSearchInput] = useState("")
  const [showCauseDropdown, setShowCauseDropdown] = useState(false)
  const [regeneratingBiography, setRegeneratingBiography] = useState<number | null>(null)
  const pageSize = 50

  // Debounced search input - provides immediate input feedback with 300ms debounced URL updates
  const [searchNameInput, setSearchNameInput] = useDebouncedSearchParam({
    paramName: "searchName",
    debounceMs: 300,
    resetPageOnChange: true,
  })

  // Parse filters from URL
  const filters: ActorCoverageFilters = {
    hasDeathPage:
      searchParams.get("hasDeathPage") !== null
        ? searchParams.get("hasDeathPage") === "true"
        : undefined,
    minPopularity: searchParams.get("minPopularity")
      ? parseFloat(searchParams.get("minPopularity")!)
      : undefined,
    maxPopularity: searchParams.get("maxPopularity")
      ? parseFloat(searchParams.get("maxPopularity")!)
      : undefined,
    deathDateStart: searchParams.get("deathDateStart") || undefined,
    deathDateEnd: searchParams.get("deathDateEnd") || undefined,
    searchName: searchParams.get("searchName") || undefined,
    causeOfDeath: searchParams.get("causeOfDeath") || undefined,
    orderBy: (searchParams.get("orderBy") as ActorCoverageFilters["orderBy"]) || "popularity",
    orderDirection: (searchParams.get("orderDirection") as "asc" | "desc") || "desc",
  }

  const { data, isLoading, error } = useActorsForCoverage(page, pageSize, filters)
  const { data: causesData } = useCausesOfDeath()

  // Filter causes based on search input
  const filteredCauses =
    causesData?.filter((c) => c.label.toLowerCase().includes(causeSearchInput.toLowerCase())) ?? []

  // Reset page and clear selection when search changes
  // The debounced hook updates the URL directly, so we mirror the behavior of handleFilterChange here.
  useEffect(() => {
    setPage(1)
    setSelectedActorIds(new Set())
  }, [filters.searchName])

  const handleFilterChange = (newFilters: Partial<ActorCoverageFilters>) => {
    const updatedFilters = { ...filters, ...newFilters }
    const params = new URLSearchParams()

    if (updatedFilters.hasDeathPage !== undefined) {
      params.set("hasDeathPage", updatedFilters.hasDeathPage.toString())
    }
    if (updatedFilters.minPopularity !== undefined) {
      params.set("minPopularity", updatedFilters.minPopularity.toString())
    }
    if (updatedFilters.maxPopularity !== undefined) {
      params.set("maxPopularity", updatedFilters.maxPopularity.toString())
    }
    if (updatedFilters.deathDateStart) {
      params.set("deathDateStart", updatedFilters.deathDateStart)
    }
    if (updatedFilters.deathDateEnd) {
      params.set("deathDateEnd", updatedFilters.deathDateEnd)
    }
    if (updatedFilters.searchName) {
      params.set("searchName", updatedFilters.searchName)
    }
    if (updatedFilters.causeOfDeath) {
      params.set("causeOfDeath", updatedFilters.causeOfDeath)
    }
    if (updatedFilters.orderBy) {
      params.set("orderBy", updatedFilters.orderBy)
    }
    if (updatedFilters.orderDirection) {
      params.set("orderDirection", updatedFilters.orderDirection)
    }

    setSearchParams(params)
    setPage(1)
    setSelectedActorIds(new Set())
  }

  const handleSelectActor = (actorId: number) => {
    const newSelection = new Set(selectedActorIds)
    if (newSelection.has(actorId)) {
      newSelection.delete(actorId)
    } else {
      newSelection.add(actorId)
    }
    setSelectedActorIds(newSelection)
  }

  const handleSelectAll = () => {
    if (!data) return

    if (selectedActorIds.size === data.items.length) {
      setSelectedActorIds(new Set())
    } else {
      setSelectedActorIds(new Set(data.items.map((a) => a.id)))
    }
  }

  const handleEnrichSelected = () => {
    if (selectedActorIds.size === 0) return

    const actorIds = Array.from(selectedActorIds)
    navigate("/admin/enrichment/start", { state: { selectedActorIds: actorIds } })
  }

  const handleRegenerateBiography = async (actorId: number) => {
    if (regeneratingBiography !== null) return

    setRegeneratingBiography(actorId)
    try {
      const response = await fetch("/admin/api/biographies/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || "Failed to regenerate biography")
      }

      const result = await response.json()
      if (result.success) {
        // Show brief success indication - the UI will update on next data fetch
        alert(
          result.result.biography
            ? "Biography regenerated successfully"
            : "No substantial biography content available from TMDB"
        )
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to regenerate biography")
    } finally {
      setRegeneratingBiography(null)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            Actor Management
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Filter, search, and manage actor death page coverage
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <DateRangePicker
            startDate={filters.deathDateStart || ""}
            endDate={filters.deathDateEnd || ""}
            onChange={(startDate, endDate) =>
              handleFilterChange({
                deathDateStart: startDate || undefined,
                deathDateEnd: endDate || undefined,
              })
            }
            showQuickFilters={false}
            startLabel="Death Date From"
            endLabel="Death Date To"
          />

          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Filters</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Death Page Status */}
              <div>
                <label htmlFor="hasDeathPage" className="mb-1 block text-sm text-admin-text-muted">
                  Death Page Status
                </label>
                <select
                  id="hasDeathPage"
                  value={filters.hasDeathPage === undefined ? "" : filters.hasDeathPage.toString()}
                  onChange={(e) =>
                    handleFilterChange({
                      hasDeathPage: e.target.value === "" ? undefined : e.target.value === "true",
                    })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                >
                  <option value="">All</option>
                  <option value="true">With Death Pages</option>
                  <option value="false">Without Death Pages</option>
                </select>
              </div>

              {/* Popularity Range */}
              <div>
                <label htmlFor="minPopularity" className="mb-1 block text-sm text-admin-text-muted">
                  Min Popularity
                </label>
                <input
                  id="minPopularity"
                  type="number"
                  min="0"
                  max="100"
                  value={filters.minPopularity || ""}
                  onChange={(e) =>
                    handleFilterChange({
                      minPopularity: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor="maxPopularity" className="mb-1 block text-sm text-admin-text-muted">
                  Max Popularity
                </label>
                <input
                  id="maxPopularity"
                  type="number"
                  min="0"
                  max="100"
                  value={filters.maxPopularity || ""}
                  onChange={(e) =>
                    handleFilterChange({
                      maxPopularity: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                  placeholder="100"
                />
              </div>

              {/* Name Search */}
              <div>
                <label htmlFor="searchName" className="mb-1 block text-sm text-admin-text-muted">
                  Name Search
                </label>
                <input
                  id="searchName"
                  type="text"
                  value={searchNameInput}
                  onChange={(e) => setSearchNameInput(e.target.value)}
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                  placeholder="Actor name..."
                />
              </div>

              {/* Cause of Death */}
              <div className="relative">
                <label htmlFor="causeOfDeath" className="mb-1 block text-sm text-admin-text-muted">
                  Cause of Death
                </label>
                <div className="relative">
                  <input
                    id="causeOfDeath"
                    type="text"
                    value={causeSearchInput}
                    onChange={(e) => {
                      setCauseSearchInput(e.target.value)
                      setShowCauseDropdown(true)
                      // Clear the filter when user starts typing to allow refinement
                      if (filters.causeOfDeath) {
                        handleFilterChange({ causeOfDeath: undefined })
                      }
                    }}
                    onFocus={() => setShowCauseDropdown(true)}
                    onBlur={() => {
                      // Delay to allow click on dropdown item
                      setTimeout(() => setShowCauseDropdown(false), 200)
                    }}
                    className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 pr-8 text-admin-text-primary focus:ring-admin-interactive"
                    placeholder="Search causes..."
                  />
                  {filters.causeOfDeath && (
                    <button
                      onClick={() => {
                        setCauseSearchInput("")
                        handleFilterChange({ causeOfDeath: undefined })
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-admin-text-muted hover:text-admin-text-primary"
                      aria-label="Clear cause filter"
                    >
                      ×
                    </button>
                  )}
                </div>
                {showCauseDropdown && filteredCauses.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-admin-border bg-admin-surface-elevated shadow-lg">
                    {filteredCauses.slice(0, 20).map((cause) => (
                      <li key={cause.value}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-admin-text-primary hover:bg-admin-interactive-secondary"
                          onMouseDown={() => {
                            handleFilterChange({ causeOfDeath: cause.value })
                            setCauseSearchInput(cause.label)
                            setShowCauseDropdown(false)
                          }}
                        >
                          <span>{cause.label}</span>
                          <span className="ml-2 text-admin-text-muted">({cause.count})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sort By */}
              <div>
                <label htmlFor="orderBy" className="mb-1 block text-sm text-admin-text-muted">
                  Sort By
                </label>
                <select
                  id="orderBy"
                  value={filters.orderBy || "popularity"}
                  onChange={(e) =>
                    handleFilterChange({
                      orderBy: e.target.value as ActorCoverageFilters["orderBy"],
                    })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                >
                  <option value="popularity">Popularity</option>
                  <option value="death_date">Death Date</option>
                  <option value="name">Name</option>
                  <option value="enriched_at">Last Enriched</option>
                </select>
              </div>

              {/* Sort Direction */}
              <div>
                <label
                  htmlFor="orderDirection"
                  className="mb-1 block text-sm text-admin-text-muted"
                >
                  Direction
                </label>
                <select
                  id="orderDirection"
                  value={filters.orderDirection || "desc"}
                  onChange={(e) =>
                    handleFilterChange({ orderDirection: e.target.value as "asc" | "desc" })
                  }
                  className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary focus:ring-admin-interactive"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                setSearchParams(new URLSearchParams())
                setPage(1)
                setSelectedActorIds(new Set())
              }}
              className="mt-4 text-sm text-admin-text-muted transition-colors hover:text-admin-text-primary"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && <ErrorMessage message="Failed to load actors. Please try again later." />}

        {/* Data Table */}
        {data && (
          <div className={selectedActorIds.size > 0 ? "pb-24" : ""}>
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-admin-text-muted">
                  {data.total.toLocaleString()} actors found
                </p>
              </div>

              <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <table className="w-full min-w-[600px] md:min-w-full">
                  <thead className="border-b border-admin-border bg-admin-surface-base">
                    <tr>
                      <th className="px-2 py-3 text-left md:px-4">
                        <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={
                              data.items.length > 0 && selectedActorIds.size === data.items.length
                            }
                            onChange={handleSelectAll}
                            aria-label="Select all actors"
                            className="h-4 w-4 rounded border-admin-border bg-admin-surface-elevated text-admin-interactive"
                          />
                          <span className="sr-only">Select all actors</span>
                        </label>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Death Date
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Age
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Popularity
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        Death Page
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Cause of Death
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Enriched
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-admin-text-muted">
                          No actors match the current filters
                        </td>
                      </tr>
                    ) : (
                      data.items.map((actor) => (
                        <tr
                          key={actor.id}
                          className={`transition-colors hover:bg-admin-interactive-secondary ${
                            selectedActorIds.has(actor.id) ? "bg-admin-interactive-secondary" : ""
                          }`}
                        >
                          <td className="px-2 py-1 md:px-4 md:py-3">
                            <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedActorIds.has(actor.id)}
                                onChange={() => handleSelectActor(actor.id)}
                                aria-label={`Select ${actor.name}`}
                                className="h-4 w-4 rounded border-admin-border bg-admin-surface-elevated text-admin-interactive"
                              />
                              <span className="sr-only">Select {actor.name}</span>
                            </label>
                          </td>
                          <td className="px-4 py-3 text-admin-text-primary">
                            <AdminHoverCard content={<ActorPreviewCard actorId={actor.id} />}>
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-left text-inherit hover:underline"
                              >
                                {actor.name}
                              </button>
                            </AdminHoverCard>
                          </td>
                          <td className="px-4 py-3 text-admin-text-muted">
                            {actor.deathday
                              ? new Date(actor.deathday).toLocaleDateString()
                              : "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-right text-admin-text-muted">
                            {actor.age_at_death ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-admin-text-muted">
                            {actor.popularity?.toFixed(1) ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {actor.has_detailed_death_info ? (
                              <span className="text-admin-success">✓</span>
                            ) : (
                              <span className="text-admin-text-muted">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-admin-text-muted">
                            {actor.cause_of_death || "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-admin-text-muted">
                            {formatRelativeTime(actor.enriched_at)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Link
                                to={`/admin/actors/${actor.id}`}
                                className="inline-flex items-center justify-center rounded p-1 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
                                title="Edit actor"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </Link>
                              <button
                                onClick={() => handleRegenerateBiography(actor.id)}
                                disabled={regeneratingBiography !== null}
                                className="inline-flex items-center justify-center rounded p-1 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                title="Regenerate biography"
                              >
                                {regeneratingBiography === actor.id ? (
                                  <svg
                                    className="h-4 w-4 animate-spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                )}
                              </button>
                              <a
                                href={`/actor/${createActorSlug(actor.name, actor.id)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded p-1 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
                                title="View public actor page"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-admin-text-muted">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.totalPages}
                    className="rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bulk Actions Bar (Fixed Bottom) */}
        {selectedActorIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-admin-border bg-admin-surface-base p-4 shadow-lg">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-center text-admin-text-primary sm:text-left">
                {selectedActorIds.size} actor{selectedActorIds.size !== 1 ? "s" : ""} selected
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <button
                  onClick={() => setSelectedActorIds(new Set())}
                  className="min-h-[44px] rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleEnrichSelected}
                  className="min-h-[44px] rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover"
                >
                  Enrich Selected
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
