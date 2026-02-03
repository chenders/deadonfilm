import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import ErrorMessage from "../../components/common/ErrorMessage"
import AdminHoverCard from "../../components/admin/ui/AdminHoverCard"
import ActorPreviewCard from "../../components/admin/ActorPreviewCard"
import { createActorSlug } from "../../utils/slugify"

interface BiographyActor {
  id: number
  tmdbId: number | null
  name: string
  popularity: number | null
  hasBiography: boolean
  generatedAt: string | null
  hasWikipedia: boolean
  hasImdb: boolean
}

interface BiographyStats {
  totalActors: number
  withBiography: number
  withoutBiography: number
}

interface BiographyResponse {
  actors: BiographyActor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
  stats: BiographyStats
}

interface GenerateResult {
  success: boolean
  result?: {
    biography: string | null
    hasSubstantiveContent: boolean
    sourceUrl: string | null
    sourceType: string | null
    costUsd?: number
    latencyMs?: number
  }
  message?: string
}

interface BatchGenerateResult {
  results: Array<{
    actorId: number
    name: string
    success: boolean
    biography: string | null
    error?: string
  }>
  summary: {
    total: number
    successful: number
    failed: number
    totalCostUsd: number
  }
}

async function fetchBiographies(
  page: number,
  pageSize: number,
  minPopularity: number,
  needsGeneration: boolean
): Promise<BiographyResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    minPopularity: minPopularity.toString(),
    needsGeneration: needsGeneration.toString(),
  })

  const response = await fetch(`/admin/api/biographies?${params}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch biographies")
  }

  return response.json()
}

async function generateBiography(actorId: number): Promise<GenerateResult> {
  const response = await fetch("/admin/api/biographies/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ actorId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to generate biography")
  }

  return response.json()
}

async function generateBiographiesBatch(
  actorIds: number[],
  limit?: number,
  minPopularity?: number
): Promise<BatchGenerateResult> {
  const response = await fetch("/admin/api/biographies/generate-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ actorIds, limit, minPopularity }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to generate biographies")
  }

  return response.json()
}

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

export default function BiographyManagementPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [minPopularity, setMinPopularity] = useState(0)
  const [needsGeneration, setNeedsGeneration] = useState(true)
  const [selectedActorIds, setSelectedActorIds] = useState<Set<number>>(new Set())
  const [batchLimit, setBatchLimit] = useState(10)
  const [generatingActorId, setGeneratingActorId] = useState<number | null>(null)
  const pageSize = 50

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-biographies", page, pageSize, minPopularity, needsGeneration],
    queryFn: () => fetchBiographies(page, pageSize, minPopularity, needsGeneration),
  })

  const generateMutation = useMutation({
    mutationFn: generateBiography,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-biographies"] })
    },
  })

  const batchGenerateMutation = useMutation({
    mutationFn: (params: { actorIds?: number[]; limit?: number; minPopularity?: number }) =>
      generateBiographiesBatch(params.actorIds || [], params.limit, params.minPopularity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-biographies"] })
      setSelectedActorIds(new Set())
    },
  })

  const handleGenerateSingle = async (actorId: number) => {
    setGeneratingActorId(actorId)
    try {
      await generateMutation.mutateAsync(actorId)
    } finally {
      setGeneratingActorId(null)
    }
  }

  const handleGenerateSelected = async () => {
    if (selectedActorIds.size === 0) return
    await batchGenerateMutation.mutateAsync({ actorIds: Array.from(selectedActorIds) })
  }

  const handleGenerateByPopularity = async () => {
    await batchGenerateMutation.mutateAsync({ limit: batchLimit, minPopularity })
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

    if (selectedActorIds.size === data.actors.length) {
      setSelectedActorIds(new Set())
    } else {
      setSelectedActorIds(new Set(data.actors.map((a) => a.id)))
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            Biography Management
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Generate and manage AI-powered actor biographies
          </p>
        </div>

        {/* Stats Cards */}
        {data && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
              <div className="text-2xl font-bold text-admin-text-primary">
                {data.stats.totalActors.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">Total Actors</div>
            </div>
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
              <div className="text-2xl font-bold text-admin-success">
                {data.stats.withBiography.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">With Biography</div>
            </div>
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
              <div className="text-2xl font-bold text-admin-warning">
                {data.stats.withoutBiography.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">Need Biography</div>
            </div>
          </div>
        )}

        {/* Filters and Batch Actions */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">
            Filters & Batch Actions
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Min Popularity */}
            <div>
              <label htmlFor="minPopularity" className="mb-1 block text-sm text-admin-text-muted">
                Min Popularity
              </label>
              <input
                id="minPopularity"
                type="number"
                min="0"
                step="0.1"
                value={minPopularity}
                onChange={(e) => {
                  setMinPopularity(parseFloat(e.target.value) || 0)
                  setPage(1)
                }}
                className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
                placeholder="0"
              />
            </div>

            {/* Needs Generation Filter */}
            <div>
              <label htmlFor="needsGeneration" className="mb-1 block text-sm text-admin-text-muted">
                Biography Status
              </label>
              <select
                id="needsGeneration"
                value={needsGeneration.toString()}
                onChange={(e) => {
                  setNeedsGeneration(e.target.value === "true")
                  setPage(1)
                }}
                className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
              >
                <option value="true">Needs Generation</option>
                <option value="false">All Actors</option>
              </select>
            </div>

            {/* Batch Limit */}
            <div>
              <label htmlFor="batchLimit" className="mb-1 block text-sm text-admin-text-muted">
                Batch Size
              </label>
              <select
                id="batchLimit"
                value={batchLimit}
                onChange={(e) => setBatchLimit(parseInt(e.target.value, 10))}
                className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
              >
                <option value="5">5 actors</option>
                <option value="10">10 actors</option>
                <option value="25">25 actors</option>
                <option value="50">50 actors</option>
              </select>
            </div>

            {/* Batch Generate Button */}
            <div className="flex items-end">
              <button
                onClick={handleGenerateByPopularity}
                disabled={batchGenerateMutation.isPending}
                className="w-full rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchGenerateMutation.isPending ? "Generating..." : `Generate Top ${batchLimit}`}
              </button>
            </div>
          </div>

          {/* Batch Results */}
          {batchGenerateMutation.isSuccess && batchGenerateMutation.data && (
            <div className="border-admin-success/30 bg-admin-success/10 mt-4 rounded border p-3">
              <p className="text-sm text-admin-text-primary">
                Batch complete: {batchGenerateMutation.data.summary.successful}/
                {batchGenerateMutation.data.summary.total} successful
                {batchGenerateMutation.data.summary.totalCostUsd > 0 && (
                  <span className="ml-2 text-admin-text-muted">
                    (Cost: ${batchGenerateMutation.data.summary.totalCostUsd.toFixed(4)})
                  </span>
                )}
              </p>
            </div>
          )}

          {batchGenerateMutation.isError && (
            <div className="border-admin-error/30 bg-admin-error/10 mt-4 rounded border p-3">
              <p className="text-admin-error text-sm">
                Error:{" "}
                {batchGenerateMutation.error instanceof Error
                  ? batchGenerateMutation.error.message
                  : "Unknown error"}
              </p>
            </div>
          )}
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
                  {data.pagination.totalCount.toLocaleString()} actors
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
                              data.actors.length > 0 && selectedActorIds.size === data.actors.length
                            }
                            onChange={handleSelectAll}
                            aria-label="Select all actors"
                            className="h-4 w-4 rounded border-admin-border"
                          />
                        </label>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Name
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                        Popularity
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        Biography
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        Wikipedia
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        IMDb
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                        Generated
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-border">
                    {data.actors.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-admin-text-muted">
                          No actors match the current filters
                        </td>
                      </tr>
                    ) : (
                      data.actors.map((actor) => (
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
                                className="h-4 w-4 rounded border-admin-border"
                              />
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
                          <td className="px-4 py-3 text-right text-admin-text-muted">
                            {actor.popularity?.toFixed(1) ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {actor.hasBiography ? (
                              <span className="text-admin-success">✓</span>
                            ) : (
                              <span className="text-admin-text-muted">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {actor.hasWikipedia ? (
                              <span className="text-admin-success">✓</span>
                            ) : (
                              <span className="text-admin-text-muted">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {actor.hasImdb ? (
                              <span className="text-admin-success">✓</span>
                            ) : (
                              <span className="text-admin-text-muted">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-admin-text-muted">
                            {formatRelativeTime(actor.generatedAt)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleGenerateSingle(actor.id)}
                                disabled={
                                  generatingActorId === actor.id || generateMutation.isPending
                                }
                                className="rounded bg-admin-interactive-secondary px-2 py-1 text-xs text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                                title="Generate biography"
                              >
                                {generatingActorId === actor.id ? "..." : "Generate"}
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
              {data.pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-admin-text-muted">
                    Page {page} of {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.pagination.totalPages}
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
                  onClick={handleGenerateSelected}
                  disabled={batchGenerateMutation.isPending}
                  className="min-h-[44px] rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchGenerateMutation.isPending ? "Generating..." : "Generate Selected"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
