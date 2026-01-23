import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import { useActorsForCoverage, type ActorCoverageFilters } from "../../hooks/admin/useCoverage"

export default function ActorManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [selectedActorIds, setSelectedActorIds] = useState<Set<number>>(new Set())
  const pageSize = 50

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
    orderBy: (searchParams.get("orderBy") as ActorCoverageFilters["orderBy"]) || "popularity",
    orderDirection:
      (searchParams.get("orderDirection") as "asc" | "desc") || "desc",
  }

  const { data, isLoading, error } = useActorsForCoverage(page, pageSize, filters)

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Actor Management</h1>
          <p className="mt-1 text-gray-400">Filter, search, and manage actor death page coverage</p>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Filters</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Death Page Status */}
            <div>
              <label htmlFor="hasDeathPage" className="mb-1 block text-sm text-gray-400">
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
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                <option value="">All</option>
                <option value="true">With Death Pages</option>
                <option value="false">Without Death Pages</option>
              </select>
            </div>

            {/* Popularity Range */}
            <div>
              <label htmlFor="minPopularity" className="mb-1 block text-sm text-gray-400">
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
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                placeholder="0"
              />
            </div>

            <div>
              <label htmlFor="maxPopularity" className="mb-1 block text-sm text-gray-400">
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
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                placeholder="100"
              />
            </div>

            {/* Name Search */}
            <div>
              <label htmlFor="searchName" className="mb-1 block text-sm text-gray-400">
                Name Search
              </label>
              <input
                id="searchName"
                type="text"
                value={filters.searchName || ""}
                onChange={(e) =>
                  handleFilterChange({ searchName: e.target.value || undefined })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                placeholder="Actor name..."
              />
            </div>

            {/* Death Date Range */}
            <div>
              <label htmlFor="deathDateStart" className="mb-1 block text-sm text-gray-400">
                Death Date From
              </label>
              <input
                id="deathDateStart"
                type="date"
                value={filters.deathDateStart || ""}
                onChange={(e) =>
                  handleFilterChange({ deathDateStart: e.target.value || undefined })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
            </div>

            <div>
              <label htmlFor="deathDateEnd" className="mb-1 block text-sm text-gray-400">
                Death Date To
              </label>
              <input
                id="deathDateEnd"
                type="date"
                value={filters.deathDateEnd || ""}
                onChange={(e) =>
                  handleFilterChange({ deathDateEnd: e.target.value || undefined })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
            </div>

            {/* Sort By */}
            <div>
              <label htmlFor="orderBy" className="mb-1 block text-sm text-gray-400">
                Sort By
              </label>
              <select
                id="orderBy"
                value={filters.orderBy || "popularity"}
                onChange={(e) =>
                  handleFilterChange({ orderBy: e.target.value as ActorCoverageFilters["orderBy"] })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                <option value="popularity">Popularity</option>
                <option value="death_date">Death Date</option>
                <option value="name">Name</option>
                <option value="enriched_at">Last Enriched</option>
              </select>
            </div>

            {/* Sort Direction */}
            <div>
              <label htmlFor="orderDirection" className="mb-1 block text-sm text-gray-400">
                Direction
              </label>
              <select
                id="orderDirection"
                value={filters.orderDirection || "desc"}
                onChange={(e) =>
                  handleFilterChange({ orderDirection: e.target.value as "asc" | "desc" })
                }
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
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
            className="mt-4 text-sm text-gray-400 transition-colors hover:text-white"
          >
            Clear Filters
          </button>
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
          <>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  {data.total.toLocaleString()} actors found
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-700 bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            data.items.length > 0 && selectedActorIds.size === data.items.length
                          }
                          onChange={handleSelectAll}
                          className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-blue-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Death Date
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                        Popularity
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">
                        Death Page
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Cause of Death
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          No actors match the current filters
                        </td>
                      </tr>
                    ) : (
                      data.items.map((actor) => (
                        <tr
                          key={actor.id}
                          className={`transition-colors hover:bg-gray-750 ${
                            selectedActorIds.has(actor.id) ? "bg-gray-750" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedActorIds.has(actor.id)}
                              onChange={() => handleSelectActor(actor.id)}
                              className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-blue-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-white">{actor.name}</td>
                          <td className="px-4 py-3 text-gray-400">
                            {actor.deathday
                              ? new Date(actor.deathday).toLocaleDateString()
                              : "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {actor.popularity.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {actor.has_detailed_death_info ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-gray-600">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {actor.cause_of_death || "—"}
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
                    className="rounded bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-gray-400">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.totalPages}
                    className="rounded bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bulk Actions Bar (Fixed Bottom) */}
        {selectedActorIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-700 bg-gray-900 p-4 shadow-lg">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <div className="text-white">
                {selectedActorIds.size} actor{selectedActorIds.size !== 1 ? "s" : ""} selected
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => setSelectedActorIds(new Set())}
                  className="rounded bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleEnrichSelected}
                  className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
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
