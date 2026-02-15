import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { adminApi } from "@/services/api"

interface CacheStats {
  lastWarmed: string | null
  actorsWarmed: number
  hitRate24h: number
  missRate24h: number
  totalKeys: number
}

interface CacheWarmResult {
  cached: number
  skipped: number
  errors: number
  duration: number
}

interface InvalidateDeathResult {
  invalidated: number
  rebuilt: boolean
  duration: number
}

interface RebuildDeathResult {
  success: boolean
  duration: number
}

export default function CacheTab() {
  const [warmLimit, setWarmLimit] = useState("1000")
  const [deceasedOnly, setDeceasedOnly] = useState(false)
  const [dryRun, setDryRun] = useState(false)

  // Invalidate death caches state
  const [invalidateActorIds, setInvalidateActorIds] = useState("")
  const [invalidateAll, setInvalidateAll] = useState(false)
  const [alsoRebuild, setAlsoRebuild] = useState(true)

  // Fetch cache stats
  const {
    data: stats,
    isLoading,
    refetch,
  } = useQuery<CacheStats>({
    queryKey: ["cache-stats"],
    queryFn: async () => {
      const response = await fetch(adminApi("/cache/stats"))
      if (!response.ok) throw new Error("Failed to fetch cache stats")
      return response.json()
    },
  })

  // Warm cache mutation
  const warmMutation = useMutation({
    mutationFn: async (params: { limit: number; deceasedOnly: boolean; dryRun: boolean }) => {
      const response = await fetch(adminApi("/cache/warm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!response.ok) throw new Error("Failed to warm cache")
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Invalidate death caches mutation
  const invalidateMutation = useMutation({
    mutationFn: async (params: { actorIds?: number[]; all?: boolean; rebuild?: boolean }) => {
      const response = await fetch(adminApi("/cache/invalidate-death"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!response.ok) throw new Error("Failed to invalidate death caches")
      return response.json() as Promise<InvalidateDeathResult>
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Rebuild death caches mutation
  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(adminApi("/cache/rebuild-death"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) throw new Error("Failed to rebuild death caches")
      return response.json() as Promise<RebuildDeathResult>
    },
    onSuccess: () => {
      refetch()
    },
  })

  const [validationError, setValidationError] = useState<string | null>(null)

  const handleWarmCache = (preview: boolean = false) => {
    const limit = parseInt(warmLimit, 10)
    if (isNaN(limit) || limit < 1) {
      setValidationError("Please enter a valid number of actors")
      return
    }

    setValidationError(null)
    warmMutation.mutate({
      limit,
      deceasedOnly,
      dryRun: preview || dryRun,
    })
  }

  const handleInvalidateDeathCaches = () => {
    let actorIds: number[] | undefined
    if (!invalidateAll && invalidateActorIds.trim()) {
      actorIds = invalidateActorIds
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id) && id > 0)

      if (actorIds.length === 0) {
        setValidationError("Please enter valid actor IDs (comma-separated numbers)")
        return
      }
    }

    setValidationError(null)
    invalidateMutation.mutate({
      actorIds,
      all: invalidateAll || !actorIds || actorIds.length === 0,
      rebuild: alsoRebuild,
    })
  }

  const handleRebuildDeathCaches = () => {
    rebuildMutation.mutate()
  }

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    const d = new Date(date)
    const now = Date.now()
    const diff = now - d.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60))
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`
    } else if (hours < 24) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`
    } else {
      const days = Math.floor(hours / 24)
      return `${days} day${days !== 1 ? "s" : ""} ago`
    }
  }

  return (
    <div className="space-y-8">
      {/* Cache Stats */}
      {!isLoading && stats && (
        <div
          className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
          data-testid="cache-stats-card"
        >
          <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Cache Statistics</h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-medium text-admin-text-muted">Last Warmed</dt>
              <dd className="mt-1 text-lg text-admin-text-primary">
                {formatDate(stats.lastWarmed)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-admin-text-muted">Actors Warmed</dt>
              <dd className="mt-1 text-lg font-bold text-admin-text-primary">
                {stats.actorsWarmed.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-admin-text-muted">Hit Rate (24h)</dt>
              <dd
                className={`mt-1 text-lg font-bold ${stats.hitRate24h > 0.9 ? "text-admin-success" : stats.hitRate24h > 0.7 ? "text-admin-warning" : "text-admin-danger"}`}
              >
                {(stats.hitRate24h * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-admin-text-muted">Total Keys</dt>
              <dd className="mt-1 text-lg text-admin-text-primary">
                {stats.totalKeys.toLocaleString()}
              </dd>
            </div>
          </dl>

          {/* Hit Rate Interpretation */}
          <div className="mt-4 rounded-md bg-admin-surface-overlay p-3 text-sm text-admin-text-secondary">
            {stats.hitRate24h > 0.9 ? (
              <span className="text-admin-success">✓ Excellent cache performance</span>
            ) : stats.hitRate24h > 0.7 ? (
              <span className="text-admin-warning">
                ⚠ Consider warming more actors to improve hit rate
              </span>
            ) : (
              <span className="text-admin-danger">
                ⚠ Low cache hit rate - warm cache to improve performance
              </span>
            )}
          </div>
        </div>
      )}

      {/* Warm Cache Form */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Warm Cache</h3>

        <div className="space-y-4">
          {/* Number of actors */}
          <div>
            <label
              htmlFor="warmLimit"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Number of actors to warm
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setWarmLimit("500")}
                className={`rounded-md px-3 py-1 text-sm ${
                  warmLimit === "500"
                    ? "bg-admin-interactive text-admin-text-primary"
                    : "bg-admin-surface-overlay text-admin-text-secondary hover:bg-admin-interactive-secondary"
                }`}
              >
                Top 500
              </button>
              <button
                onClick={() => setWarmLimit("1000")}
                className={`rounded-md px-3 py-1 text-sm ${
                  warmLimit === "1000"
                    ? "bg-admin-interactive text-admin-text-primary"
                    : "bg-admin-surface-overlay text-admin-text-secondary hover:bg-admin-interactive-secondary"
                }`}
              >
                Top 1000
              </button>
              <button
                onClick={() => setWarmLimit("5000")}
                className={`rounded-md px-3 py-1 text-sm ${
                  warmLimit === "5000"
                    ? "bg-admin-interactive text-admin-text-primary"
                    : "bg-admin-surface-overlay text-admin-text-secondary hover:bg-admin-interactive-secondary"
                }`}
              >
                Top 5000
              </button>
              <input
                type="number"
                id="warmLimit"
                value={warmLimit}
                onChange={(e) => setWarmLimit(e.target.value)}
                className="w-32 rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
                placeholder="Custom"
                min="1"
              />
            </div>
          </div>

          {/* Deceased only checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="deceasedOnly"
              checked={deceasedOnly}
              onChange={(e) => setDeceasedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
            />
            <label htmlFor="deceasedOnly" className="ml-2 text-sm text-admin-text-secondary">
              Deceased actors only
            </label>
          </div>

          {/* Dry run checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
            />
            <label htmlFor="dryRun" className="ml-2 text-sm text-admin-text-secondary">
              Dry run (preview without caching)
            </label>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="border-admin-danger/50 bg-admin-danger/20 rounded-md border p-3 text-admin-danger">
              {validationError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleWarmCache(true)}
              disabled={warmMutation.isPending}
              className="rounded-md bg-admin-interactive-secondary px-4 py-2 font-semibold text-admin-text-primary hover:bg-admin-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preview
            </button>
            <button
              onClick={() => handleWarmCache(false)}
              disabled={warmMutation.isPending}
              className="rounded-md bg-admin-interactive px-4 py-2 font-semibold text-admin-text-primary hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {warmMutation.isPending ? "Warming Cache..." : "Warm Cache"}
            </button>
          </div>
        </div>

        {/* Results */}
        {warmMutation.isError && (
          <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
            Error warming cache. Please try again.
          </div>
        )}

        {warmMutation.isSuccess && warmMutation.data && (
          <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-4">
            <h4 className="font-semibold text-admin-success">
              {dryRun ? "Preview Complete" : "Cache Warmed Successfully"}
            </h4>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-admin-success/80 text-sm">Cached</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {(warmMutation.data as CacheWarmResult).cached}
                </dd>
              </div>
              <div>
                <dt className="text-admin-success/80 text-sm">Already Cached (Skipped)</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {(warmMutation.data as CacheWarmResult).skipped}
                </dd>
              </div>
              <div>
                <dt className="text-admin-success/80 text-sm">Duration</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {((warmMutation.data as CacheWarmResult).duration / 1000).toFixed(1)}s
                </dd>
              </div>
            </dl>
            {(warmMutation.data as CacheWarmResult).errors > 0 && (
              <div className="mt-3 text-sm text-admin-warning">
                ⚠ {(warmMutation.data as CacheWarmResult).errors} errors occurred
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invalidate Death Caches */}
      <div
        className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
        data-testid="invalidate-death-form"
      >
        <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">
          Invalidate Death Caches
        </h3>
        <p className="mb-4 text-sm text-admin-text-muted">
          Invalidate cached death data. Use this when death information has been updated.
        </p>

        <div className="space-y-4">
          {/* Actor IDs input */}
          <div>
            <label
              htmlFor="invalidateActorIds"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Actor IDs (comma-separated, optional)
            </label>
            <input
              type="text"
              id="invalidateActorIds"
              value={invalidateActorIds}
              onChange={(e) => setInvalidateActorIds(e.target.value)}
              disabled={invalidateAll}
              placeholder="e.g., 123, 456, 789"
              className="mt-2 w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary placeholder:text-admin-text-muted focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="invalidate-actor-ids-input"
            />
          </div>

          {/* All checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="invalidateAll"
              checked={invalidateAll}
              onChange={(e) => setInvalidateAll(e.target.checked)}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              data-testid="invalidate-all-checkbox"
            />
            <label htmlFor="invalidateAll" className="ml-2 text-sm text-admin-text-secondary">
              Invalidate all death caches (ignores actor IDs)
            </label>
          </div>

          {/* Also rebuild checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="alsoRebuild"
              checked={alsoRebuild}
              onChange={(e) => setAlsoRebuild(e.target.checked)}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              data-testid="invalidate-rebuild-checkbox"
            />
            <label htmlFor="alsoRebuild" className="ml-2 text-sm text-admin-text-secondary">
              Also rebuild caches after invalidation (recommended)
            </label>
          </div>

          {/* Action button */}
          <div className="pt-2">
            <button
              onClick={handleInvalidateDeathCaches}
              disabled={invalidateMutation.isPending}
              className="hover:bg-admin-warning/90 rounded-md bg-admin-warning px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="invalidate-submit-button"
            >
              {invalidateMutation.isPending ? "Invalidating..." : "Invalidate Death Caches"}
            </button>
          </div>
        </div>

        {/* Results */}
        {invalidateMutation.isError && (
          <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
            Error invalidating caches. Please try again.
          </div>
        )}

        {invalidateMutation.isSuccess && invalidateMutation.data && (
          <div
            className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-4"
            data-testid="cache-action-result"
          >
            <h4 className="font-semibold text-admin-success">Caches Invalidated</h4>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-admin-success/80 text-sm">Actors Invalidated</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {invalidateMutation.data.invalidated === -1
                    ? "All"
                    : invalidateMutation.data.invalidated}
                </dd>
              </div>
              <div>
                <dt className="text-admin-success/80 text-sm">Rebuilt</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {invalidateMutation.data.rebuilt ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-admin-success/80 text-sm">Duration</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {(invalidateMutation.data.duration / 1000).toFixed(1)}s
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Rebuild Death Caches */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Rebuild Death Caches</h3>
        <p className="mb-4 text-sm text-admin-text-muted">
          Fully rebuild all death-related caches. Use after batch processing or major data changes.
        </p>

        <div className="pt-2">
          <button
            onClick={handleRebuildDeathCaches}
            disabled={rebuildMutation.isPending}
            className="rounded-md bg-admin-interactive px-4 py-2 font-semibold text-admin-text-primary hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="rebuild-death-button"
          >
            {rebuildMutation.isPending ? "Rebuilding..." : "Rebuild Death Caches"}
          </button>
        </div>

        {/* Results */}
        {rebuildMutation.isError && (
          <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
            Error rebuilding caches. Please try again.
          </div>
        )}

        {rebuildMutation.isSuccess && rebuildMutation.data && (
          <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-4">
            <h4 className="font-semibold text-admin-success">Caches Rebuilt Successfully</h4>
            <dl className="mt-3">
              <div>
                <dt className="text-admin-success/80 text-sm">Duration</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {(rebuildMutation.data.duration / 1000).toFixed(1)}s
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Usage Guide */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">When to Warm Cache</h3>
        <ul className="space-y-2 text-sm text-admin-text-secondary">
          <li>* After deployment when Redis cache is cleared</li>
          <li>* After Redis restart or maintenance</li>
          <li>* When adding many new deceased actors</li>
          <li>* When hit rate drops below 70%</li>
        </ul>

        <h3 className="mb-4 mt-6 text-xl font-semibold text-admin-text-primary">
          Performance Impact
        </h3>
        <ul className="space-y-2 text-sm text-admin-text-secondary">
          <li>
            * <strong>500 actors:</strong> ~30-60 seconds, covers ~80% of traffic
          </li>
          <li>
            * <strong>1000 actors:</strong> ~2-3 minutes, covers ~95% of traffic (recommended)
          </li>
          <li>
            * <strong>5000 actors:</strong> ~10-15 minutes, covers ~99% of traffic
          </li>
        </ul>
      </div>
    </div>
  )
}
