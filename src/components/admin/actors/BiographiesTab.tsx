import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"
import AdminHoverCard from "../ui/AdminHoverCard"
import MobileCard from "../ui/MobileCard"
import ActorPreviewCard from "../ActorPreviewCard"
import { createActorSlug } from "../../../utils/slugify"
import { useDebouncedSearchParam } from "../../../hooks/useDebouncedSearchParam"
import { formatRelativeTime } from "./shared"

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

interface BatchQueueResult {
  jobId: string
  queued: boolean
  message: string
}

interface JobRun {
  id: number
  job_id: string
  job_type: string
  status: string
  result: {
    success?: boolean
    data?: {
      total: number
      succeeded: number
      failed: number
      skippedNoContent: number
      totalCostUsd: number
      anthropicBatchId: string | null
    }
  } | null
  error_message: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
}

async function fetchBiographies(
  page: number,
  pageSize: number,
  minPopularity: number,
  needsGeneration: boolean,
  searchName: string
): Promise<BiographyResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    minPopularity: minPopularity.toString(),
    needsGeneration: needsGeneration.toString(),
  })

  if (searchName.trim()) {
    params.set("searchName", searchName.trim())
  }

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

async function queueBatchGeneration(params: {
  actorIds?: number[]
  limit?: number
  minPopularity?: number
  allowRegeneration?: boolean
}): Promise<BatchQueueResult> {
  const response = await fetch("/admin/api/biographies/generate-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to queue batch generation")
  }

  return response.json()
}

async function fetchJobRun(jobId: string): Promise<JobRun | null> {
  const response = await fetch(
    `/admin/api/jobs/runs?jobType=generate-biographies-batch&pageSize=10`,
    { credentials: "include" }
  )

  if (!response.ok) return null

  const data = await response.json()
  const run = data.runs?.find((r: JobRun) => r.job_id === jobId)
  return run || null
}

function BatchStatusPanel({
  jobId,
  onDismiss,
  onComplete,
}: {
  jobId: string
  onDismiss: () => void
  onComplete: () => void
}) {
  const { data: jobRun } = useQuery({
    queryKey: ["batch-job-status", jobId],
    queryFn: () => fetchJobRun(jobId),
    refetchInterval: (query) => {
      const run = query.state.data
      if (!run) return 5000
      if (run.status === "completed" || run.status === "failed") return false
      return 5000
    },
  })

  useEffect(() => {
    if (jobRun?.status === "completed") {
      onComplete()
    }
  }, [jobRun?.status, onComplete])

  const isTerminal = jobRun?.status === "completed" || jobRun?.status === "failed"
  const summary = jobRun?.result?.data

  return (
    <div
      className={`mt-4 rounded border p-3 ${
        jobRun?.status === "failed"
          ? "border-admin-error/30 bg-admin-error/10"
          : jobRun?.status === "completed"
            ? "border-admin-success/30 bg-admin-success/10"
            : "border-admin-interactive/30 bg-admin-interactive/10"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="text-sm text-admin-text-primary">
          {!jobRun && <span>Queued batch job {jobId}...</span>}

          {jobRun?.status === "pending" && <span>Batch job queued, waiting to start...</span>}

          {jobRun?.status === "active" && (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
              Batch processing in progress...
            </span>
          )}

          {jobRun?.status === "completed" && summary && (
            <span>
              Batch complete: {summary.succeeded} succeeded, {summary.failed} failed,{" "}
              {summary.skippedNoContent} skipped
              {summary.totalCostUsd > 0 && (
                <span className="ml-2 text-admin-text-muted">
                  (Cost: ${summary.totalCostUsd.toFixed(4)})
                </span>
              )}
            </span>
          )}

          {jobRun?.status === "failed" && (
            <span className="text-admin-error">
              Batch failed: {jobRun.error_message || "Unknown error"}
            </span>
          )}
        </div>

        {isTerminal && (
          <button
            onClick={onDismiss}
            className="ml-2 text-admin-text-muted hover:text-admin-text-primary"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default function BiographiesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [minPopularity, setMinPopularity] = useState(0)
  const [needsGeneration, setNeedsGeneration] = useState(true)
  const [selectedActorIds, setSelectedActorIds] = useState<Set<number>>(new Set())
  const [batchLimit, setBatchLimit] = useState(100)
  const [generatingActorId, setGeneratingActorId] = useState<number | null>(null)
  const [activeBatchJobId, setActiveBatchJobId] = useState<string | null>(null)
  const pageSize = 50

  // Debounced search input - provides immediate input feedback with 300ms debounced URL updates
  const [searchNameInput, setSearchNameInput, searchName] = useDebouncedSearchParam({
    paramName: "searchName",
    debounceMs: 300,
    resetPageOnChange: true,
  })

  // Reset page and clear selection when search changes
  useEffect(() => {
    setPage(1)
    setSelectedActorIds(new Set())
  }, [searchName])

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-biographies", page, pageSize, minPopularity, needsGeneration, searchName],
    queryFn: () => fetchBiographies(page, pageSize, minPopularity, needsGeneration, searchName),
  })

  const generateMutation = useMutation({
    mutationFn: generateBiography,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-biographies"] })
    },
  })

  const batchQueueMutation = useMutation({
    mutationFn: queueBatchGeneration,
    onSuccess: (result) => {
      setActiveBatchJobId(result.jobId)
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
    try {
      await batchQueueMutation.mutateAsync({
        actorIds: Array.from(selectedActorIds),
        allowRegeneration: true,
      })
    } catch {
      // Error state handled by mutation
    }
  }

  const handleGenerateByPopularity = async () => {
    try {
      await batchQueueMutation.mutateAsync({ limit: batchLimit, minPopularity })
    } catch {
      // Error state handled by mutation
    }
  }

  const handleBatchComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-biographies"] })
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
    const pageIds = data.actors.map((a) => a.id)
    const allPageSelected = pageIds.every((id) => selectedActorIds.has(id))
    const newSelection = new Set(selectedActorIds)
    if (allPageSelected) {
      pageIds.forEach((id) => newSelection.delete(id))
    } else {
      pageIds.forEach((id) => newSelection.add(id))
    }
    setSelectedActorIds(newSelection)
  }

  return (
    <div className="space-y-6">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
              placeholder="Actor name..."
            />
          </div>

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

          {/* Biography Status Filter */}
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
                setSelectedActorIds(new Set())
              }}
              className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
            >
              <option value="false">All Actors</option>
              <option value="true">Needs Generation Only</option>
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
              <option value="50">50 actors</option>
              <option value="100">100 actors</option>
              <option value="250">250 actors</option>
              <option value="500">500 actors</option>
            </select>
          </div>

          {/* Batch Generate Button */}
          <div className="flex items-end">
            <button
              onClick={handleGenerateByPopularity}
              disabled={batchQueueMutation.isPending || !!activeBatchJobId}
              className="w-full rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchQueueMutation.isPending
                ? "Queueing..."
                : activeBatchJobId
                  ? "Batch Running..."
                  : `Generate Top ${batchLimit}`}
            </button>
          </div>
        </div>

        {/* Batch Status Panel */}
        {activeBatchJobId && (
          <BatchStatusPanel
            jobId={activeBatchJobId}
            onDismiss={() => setActiveBatchJobId(null)}
            onComplete={handleBatchComplete}
          />
        )}

        {batchQueueMutation.isError && (
          <div className="border-admin-error/30 bg-admin-error/10 mt-4 rounded border p-3">
            <p className="text-admin-error text-sm">
              Error:{" "}
              {batchQueueMutation.error instanceof Error
                ? batchQueueMutation.error.message
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

            {/* Mobile card view */}
            <div className="space-y-3 md:hidden">
              {data.actors.length === 0 ? (
                <p className="py-8 text-center text-admin-text-muted">
                  No actors match the current filters
                </p>
              ) : (
                data.actors.map((actor) => (
                  <MobileCard
                    key={actor.id}
                    data-testid={`biography-card-${actor.id}`}
                    title={actor.name}
                    subtitle={`Popularity: ${actor.popularity?.toFixed(1) ?? "—"}`}
                    selectable
                    selected={selectedActorIds.has(actor.id)}
                    onSelectionChange={(selected) => {
                      setSelectedActorIds((prev) => {
                        const next = new Set(prev)
                        if (selected) {
                          next.add(actor.id)
                        } else {
                          next.delete(actor.id)
                        }
                        return next
                      })
                    }}
                    fields={[
                      {
                        label: "Biography",
                        value: actor.hasBiography ? (
                          <span className="text-admin-success">✓</span>
                        ) : (
                          <span className="text-admin-text-muted">✗</span>
                        ),
                      },
                      {
                        label: "Wikipedia",
                        value: actor.hasWikipedia ? (
                          <span className="text-admin-success">✓</span>
                        ) : (
                          <span className="text-admin-text-muted">✗</span>
                        ),
                      },
                      {
                        label: "IMDb",
                        value: actor.hasImdb ? (
                          <span className="text-admin-success">✓</span>
                        ) : (
                          <span className="text-admin-text-muted">✗</span>
                        ),
                      },
                      {
                        label: "Generated",
                        value: formatRelativeTime(actor.generatedAt),
                      },
                    ]}
                    actions={
                      <>
                        <button
                          onClick={() => handleGenerateSingle(actor.id)}
                          disabled={generatingActorId === actor.id || generateMutation.isPending}
                          className="rounded bg-admin-interactive-secondary px-3 py-1.5 text-xs text-admin-text-primary hover:bg-admin-surface-overlay disabled:opacity-50"
                        >
                          {generatingActorId === actor.id ? "..." : "Generate"}
                        </button>
                        <a
                          href={`/actor/${createActorSlug(actor.name, actor.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-admin-interactive-secondary px-3 py-1.5 text-xs text-admin-text-primary hover:bg-admin-surface-overlay"
                        >
                          View
                        </a>
                      </>
                    }
                  />
                ))
              )}
            </div>

            {/* Desktop table view */}
            <div className="-mx-4 hidden overflow-x-auto px-4 md:mx-0 md:block md:px-0">
              <table className="w-full min-w-[600px] md:min-w-full">
                <thead className="border-b border-admin-border bg-admin-surface-base">
                  <tr>
                    <th className="px-2 py-3 text-left md:px-4">
                      <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={
                            data.actors.length > 0 &&
                            data.actors.every((a) => selectedActorIds.has(a.id))
                          }
                          ref={(el) => {
                            if (el) {
                              const pageIds = data.actors.map((a) => a.id)
                              const selectedCount = pageIds.filter((id) =>
                                selectedActorIds.has(id)
                              ).length
                              el.indeterminate = selectedCount > 0 && selectedCount < pageIds.length
                            }
                          }}
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
                disabled={batchQueueMutation.isPending || !!activeBatchJobId}
                className="min-h-[44px] rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchQueueMutation.isPending ? "Queueing..." : "Generate Selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
