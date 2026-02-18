/**
 * Biography Enrichment admin tab.
 * Shows enrichment status, allows single/batch enrichment, and displays golden test results.
 */

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
import { adminApi } from "../../../services/api"

interface EnrichmentActor {
  id: number
  tmdbId: number | null
  name: string
  popularity: number | null
  deathday: string
  hasEnrichment: boolean
  narrativeConfidence: string | null
  narrativeTeaserPreview: string | null
  lifeNotableFactors: string[]
  bioUpdatedAt: string | null
  biographyVersion: number | null
}

interface EnrichmentStats {
  totalDeceased: number
  enriched: number
  needsEnrichment: number
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface EnrichmentResponse {
  actors: EnrichmentActor[]
  pagination: PaginationInfo
  stats: EnrichmentStats
}

interface GoldenTestResult {
  averageScore: number
  summary: string
  results: Array<{
    actorName: string
    score: number
    passed: boolean
    details: string
  }>
}

async function fetchEnrichmentActors(
  page: number,
  pageSize: number,
  minPopularity: number,
  needsEnrichment: boolean,
  searchName: string
): Promise<EnrichmentResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    minPopularity: minPopularity.toString(),
    needsEnrichment: needsEnrichment.toString(),
  })

  if (searchName.trim()) {
    params.set("searchName", searchName.trim())
  }

  const response = await fetch(adminApi(`/biography-enrichment?${params}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch biography enrichment data")
  }

  return response.json()
}

async function enrichSingleActor(actorId: number): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(adminApi("/biography-enrichment/enrich"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ actorId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Enrichment failed")
  }

  return response.json()
}

async function queueBatchEnrichment(params: {
  limit?: number
  minPopularity?: number
}): Promise<{ jobId: string; queued: boolean; message: string }> {
  const response = await fetch(adminApi("/biography-enrichment/enrich-batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      limit: params.limit || 10,
      minPopularity: params.minPopularity,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Batch enrichment failed")
  }

  return response.json()
}

async function runGoldenTests(): Promise<GoldenTestResult> {
  const response = await fetch(adminApi("/biography-enrichment/golden-test"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Golden test failed")
  }

  return response.json()
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
      totalCostUsd: number
    }
  } | null
  error_message: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
}

async function fetchJobRun(jobId: string): Promise<JobRun | null> {
  const response = await fetch(
    adminApi(`/jobs/runs?jobType=enrich-biographies-batch&pageSize=50`),
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
    queryKey: ["bio-enrichment-batch-status", jobId],
    queryFn: () => fetchJobRun(jobId),
    refetchInterval: (query) => {
      const run = query.state.data
      if (!run) return 5000
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled")
        return false
      return 5000
    },
  })

  useEffect(() => {
    if (jobRun?.status === "completed" || jobRun?.status === "cancelled") {
      onComplete()
    }
  }, [jobRun?.status, onComplete])

  const isTerminal =
    jobRun?.status === "completed" || jobRun?.status === "failed" || jobRun?.status === "cancelled"
  const summary = jobRun?.result?.data

  return (
    <div
      className={`mt-4 rounded border p-3 ${
        jobRun?.status === "failed"
          ? "border-admin-error/30 bg-admin-error/10"
          : jobRun?.status === "completed"
            ? "border-admin-success/30 bg-admin-success/10"
            : jobRun?.status === "cancelled"
              ? "border-admin-text-muted/30 bg-admin-text-muted/10"
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
              Batch enrichment in progress...
            </span>
          )}

          {jobRun?.status === "completed" && summary && (
            <span>
              Batch complete: {summary.succeeded} succeeded, {summary.failed} failed
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

          {jobRun?.status === "cancelled" && (
            <span className="text-admin-text-muted">Batch job was cancelled.</span>
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

export default function BiographyEnrichmentTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [minPopularity, setMinPopularity] = useState(0)
  const [needsEnrichment, setNeedsEnrichment] = useState(true)
  const [batchLimit, setBatchLimit] = useState(10)
  const [enrichingActorId, setEnrichingActorId] = useState<number | null>(null)
  const [activeBatchJobId, setActiveBatchJobId] = useState<string | null>(null)
  const pageSize = 50

  // Debounced search input
  const [searchNameInput, setSearchNameInput, searchName] = useDebouncedSearchParam({
    paramName: "searchName",
    debounceMs: 300,
    resetPageOnChange: true,
  })

  // Reset page when search changes
  useEffect(() => {
    setPage(1)
  }, [searchName])

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "admin-biography-enrichment",
      page,
      pageSize,
      minPopularity,
      needsEnrichment,
      searchName,
    ],
    queryFn: () =>
      fetchEnrichmentActors(page, pageSize, minPopularity, needsEnrichment, searchName),
  })

  const enrichMutation = useMutation({
    mutationFn: enrichSingleActor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-biography-enrichment"] })
    },
  })

  const batchMutation = useMutation({
    mutationFn: queueBatchEnrichment,
    onSuccess: (result) => {
      setActiveBatchJobId(result.jobId)
    },
  })

  const goldenTestMutation = useMutation({
    mutationFn: runGoldenTests,
  })

  const handleEnrichSingle = async (actorId: number) => {
    setEnrichingActorId(actorId)
    try {
      await enrichMutation.mutateAsync(actorId)
    } finally {
      setEnrichingActorId(null)
    }
  }

  const handleBatchEnrich = async () => {
    try {
      await batchMutation.mutateAsync({ limit: batchLimit, minPopularity })
    } catch {
      // Error state handled by mutation
    }
  }

  const handleBatchComplete = () => {
    setActiveBatchJobId(null)
    queryClient.invalidateQueries({ queryKey: ["admin-biography-enrichment"] })
  }

  const stats = data?.stats
  const actors = data?.actors || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
            <div className="text-2xl font-bold text-admin-text-primary">
              {stats.totalDeceased.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Total Deceased</div>
          </div>
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
            <div className="text-2xl font-bold text-admin-success">
              {stats.enriched.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Enriched</div>
          </div>
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
            <div className="text-2xl font-bold text-admin-warning">
              {stats.needsEnrichment.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Needs Enrichment</div>
          </div>
        </div>
      )}

      {/* Filters and Batch Actions */}
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Filters & Actions</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Name Search */}
          <div>
            <label htmlFor="bioSearchName" className="mb-1 block text-sm text-admin-text-muted">
              Name Search
            </label>
            <input
              id="bioSearchName"
              type="text"
              value={searchNameInput}
              onChange={(e) => setSearchNameInput(e.target.value)}
              className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
              placeholder="Actor name..."
            />
          </div>

          {/* Min Popularity */}
          <div>
            <label htmlFor="bioMinPopularity" className="mb-1 block text-sm text-admin-text-muted">
              Min Popularity
            </label>
            <input
              id="bioMinPopularity"
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

          {/* Enrichment Status Filter */}
          <div>
            <label
              htmlFor="bioNeedsEnrichment"
              className="mb-1 block text-sm text-admin-text-muted"
            >
              Enrichment Status
            </label>
            <select
              id="bioNeedsEnrichment"
              value={needsEnrichment.toString()}
              onChange={(e) => {
                setNeedsEnrichment(e.target.value === "true")
                setPage(1)
              }}
              className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
            >
              <option value="false">All Actors</option>
              <option value="true">Needs Enrichment Only</option>
            </select>
          </div>

          {/* Batch Limit */}
          <div>
            <label htmlFor="bioBatchLimit" className="mb-1 block text-sm text-admin-text-muted">
              Batch Size
            </label>
            <select
              id="bioBatchLimit"
              value={batchLimit}
              onChange={(e) => setBatchLimit(parseInt(e.target.value, 10))}
              className="w-full rounded border border-admin-border bg-admin-surface-base px-3 py-2 text-admin-text-primary"
            >
              <option value="10">10 actors</option>
              <option value="25">25 actors</option>
              <option value="50">50 actors</option>
              <option value="100">100 actors</option>
            </select>
          </div>

          {/* Batch Enrich Button */}
          <div className="flex items-end">
            <button
              onClick={handleBatchEnrich}
              disabled={batchMutation.isPending || !!activeBatchJobId}
              className="w-full rounded bg-admin-interactive px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchMutation.isPending
                ? "Queueing..."
                : activeBatchJobId
                  ? "Batch Running..."
                  : `Enrich Top ${batchLimit}`}
            </button>
          </div>
        </div>

        {/* Golden Test Button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => goldenTestMutation.mutate()}
            disabled={goldenTestMutation.isPending}
            className="rounded border border-admin-border bg-admin-interactive-secondary px-4 py-2 text-sm text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
          >
            {goldenTestMutation.isPending ? "Running Golden Tests..." : "Run Golden Tests"}
          </button>
          {goldenTestMutation.isError && (
            <span className="text-admin-error text-sm">
              {goldenTestMutation.error instanceof Error
                ? goldenTestMutation.error.message
                : "Test failed"}
            </span>
          )}
        </div>

        {/* Batch Status Panel */}
        {activeBatchJobId && (
          <BatchStatusPanel
            jobId={activeBatchJobId}
            onDismiss={() => setActiveBatchJobId(null)}
            onComplete={handleBatchComplete}
          />
        )}

        {batchMutation.isError && (
          <div className="border-admin-error/30 bg-admin-error/10 mt-4 rounded border p-3">
            <p className="text-admin-error text-sm">
              Error:{" "}
              {batchMutation.error instanceof Error ? batchMutation.error.message : "Unknown error"}
            </p>
          </div>
        )}
      </div>

      {/* Golden Test Results */}
      {goldenTestMutation.isSuccess && goldenTestMutation.data && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 md:p-6">
          <h3 className="mb-3 text-lg font-semibold text-admin-text-primary">
            Golden Test Results
          </h3>
          <div className="mb-3 text-sm text-admin-text-primary">
            Average Score:{" "}
            <span
              className={`font-bold ${
                goldenTestMutation.data.averageScore >= 80
                  ? "text-admin-success"
                  : goldenTestMutation.data.averageScore >= 60
                    ? "text-admin-warning"
                    : "text-admin-error"
              }`}
            >
              {goldenTestMutation.data.averageScore}/100
            </span>
          </div>
          {goldenTestMutation.data.results && goldenTestMutation.data.results.length > 0 && (
            <div className="space-y-2">
              {goldenTestMutation.data.results.map((result, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded border border-admin-border p-2 text-sm"
                >
                  <span className="text-admin-text-primary">{result.actorName}</span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono ${
                        result.passed ? "text-admin-success" : "text-admin-error"
                      }`}
                    >
                      {result.score}/100
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        result.passed
                          ? "bg-admin-success/10 text-admin-success"
                          : "bg-admin-error/10 text-admin-error"
                      }`}
                    >
                      {result.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {goldenTestMutation.data.summary && (
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-admin-surface-base p-3 text-xs text-admin-text-muted">
              {goldenTestMutation.data.summary}
            </pre>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Error State */}
      {error && <ErrorMessage message="Failed to load enrichment data. Please try again later." />}

      {/* Data Table */}
      {data && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-admin-text-muted">
              {pagination ? pagination.total.toLocaleString() : 0} actors
            </p>
          </div>

          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {actors.length === 0 ? (
              <p className="py-8 text-center text-admin-text-muted">
                No actors match the current filters
              </p>
            ) : (
              actors.map((actor) => (
                <MobileCard
                  key={actor.id}
                  data-testid={`bio-enrichment-card-${actor.id}`}
                  title={actor.name}
                  subtitle={`Popularity: ${actor.popularity?.toFixed(1) ?? "---"}`}
                  fields={[
                    {
                      label: "Status",
                      value: actor.hasEnrichment ? (
                        <span className="text-admin-success">Enriched</span>
                      ) : (
                        <span className="text-admin-text-muted">Pending</span>
                      ),
                    },
                    {
                      label: "Confidence",
                      value: actor.narrativeConfidence || "---",
                    },
                    {
                      label: "Factors",
                      value:
                        actor.lifeNotableFactors.length > 0
                          ? `${actor.lifeNotableFactors.length} factors`
                          : "---",
                    },
                    {
                      label: "Updated",
                      value: formatRelativeTime(actor.bioUpdatedAt),
                    },
                  ]}
                  actions={
                    <>
                      <button
                        onClick={() => handleEnrichSingle(actor.id)}
                        disabled={enrichingActorId === actor.id || enrichMutation.isPending}
                        className="rounded bg-admin-interactive-secondary px-3 py-1.5 text-xs text-admin-text-primary hover:bg-admin-surface-overlay disabled:opacity-50"
                      >
                        {enrichingActorId === actor.id ? "..." : "Enrich"}
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Name
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                    Popularity
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                    Factors
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Teaser Preview
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-admin-text-secondary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {actors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-admin-text-muted">
                      No actors match the current filters
                    </td>
                  </tr>
                ) : (
                  actors.map((actor) => (
                    <tr
                      key={actor.id}
                      className="transition-colors hover:bg-admin-interactive-secondary"
                    >
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
                        {actor.popularity?.toFixed(1) ?? "---"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {actor.hasEnrichment ? (
                          <span className="text-admin-success">Enriched</span>
                        ) : (
                          <span className="text-admin-text-muted">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {actor.narrativeConfidence ? (
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              actor.narrativeConfidence === "high"
                                ? "bg-admin-success/10 text-admin-success"
                                : actor.narrativeConfidence === "medium"
                                  ? "bg-admin-warning/10 text-admin-warning"
                                  : "bg-admin-error/10 text-admin-error"
                            }`}
                          >
                            {actor.narrativeConfidence}
                          </span>
                        ) : (
                          <span className="text-admin-text-muted">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {actor.lifeNotableFactors.length > 0 ? (
                          <span
                            className="text-xs text-admin-text-muted"
                            title={actor.lifeNotableFactors.join(", ")}
                          >
                            {actor.lifeNotableFactors.length} factors
                          </span>
                        ) : (
                          <span className="text-admin-text-muted">---</span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-sm text-admin-text-muted">
                        {actor.narrativeTeaserPreview || "---"}
                      </td>
                      <td className="px-4 py-3 text-sm text-admin-text-muted">
                        {formatRelativeTime(actor.bioUpdatedAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEnrichSingle(actor.id)}
                            disabled={enrichingActorId === actor.id || enrichMutation.isPending}
                            className="rounded bg-admin-interactive-secondary px-2 py-1 text-xs text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
                            title="Enrich biography"
                          >
                            {enrichingActorId === actor.id ? "..." : "Enrich"}
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
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-admin-text-muted">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                className="rounded bg-admin-interactive-secondary px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
