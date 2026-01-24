import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
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

export default function CacheManagementPage() {
  const [warmLimit, setWarmLimit] = useState("1000")
  const [deceasedOnly, setDeceasedOnly] = useState(false)
  const [dryRun, setDryRun] = useState(false)

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

  const handleWarmCache = (preview: boolean = false) => {
    const limit = parseInt(warmLimit, 10)
    if (isNaN(limit) || limit < 1) {
      alert("Please enter a valid number of actors")
      return
    }

    warmMutation.mutate({
      limit,
      deceasedOnly,
      dryRun: preview || dryRun,
    })
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
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Cache Management</h1>
          <p className="mt-2 text-gray-400">
            Pre-warm Redis cache for popular actors to improve performance
          </p>
        </div>

        {/* Cache Stats */}
        {!isLoading && stats && (
          <div className="rounded-lg bg-gray-800 p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Cache Statistics</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm font-medium text-gray-400">Last Warmed</dt>
                <dd className="mt-1 text-lg text-white">{formatDate(stats.lastWarmed)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-400">Actors Warmed</dt>
                <dd className="mt-1 text-lg font-bold text-white">
                  {stats.actorsWarmed.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-400">Hit Rate (24h)</dt>
                <dd
                  className={`mt-1 text-lg font-bold ${stats.hitRate24h > 0.9 ? "text-green-400" : stats.hitRate24h > 0.7 ? "text-yellow-400" : "text-red-400"}`}
                >
                  {(stats.hitRate24h * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-400">Total Keys</dt>
                <dd className="mt-1 text-lg text-white">{stats.totalKeys.toLocaleString()}</dd>
              </div>
            </dl>

            {/* Hit Rate Interpretation */}
            <div className="mt-4 rounded-md bg-gray-700 p-3 text-sm text-gray-300">
              {stats.hitRate24h > 0.9 ? (
                <span className="text-green-400">✓ Excellent cache performance</span>
              ) : stats.hitRate24h > 0.7 ? (
                <span className="text-yellow-400">
                  ⚠ Consider warming more actors to improve hit rate
                </span>
              ) : (
                <span className="text-red-400">
                  ⚠ Low cache hit rate - warm cache to improve performance
                </span>
              )}
            </div>
          </div>
        )}

        {/* Warm Cache Form */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-xl font-semibold text-white">Warm Cache</h3>

          <div className="space-y-4">
            {/* Number of actors */}
            <div>
              <label htmlFor="warmLimit" className="block text-sm font-medium text-gray-300">
                Number of actors to warm
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setWarmLimit("500")}
                  className={`rounded-md px-3 py-1 text-sm ${
                    warmLimit === "500"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Top 500
                </button>
                <button
                  onClick={() => setWarmLimit("1000")}
                  className={`rounded-md px-3 py-1 text-sm ${
                    warmLimit === "1000"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Top 1000
                </button>
                <button
                  onClick={() => setWarmLimit("5000")}
                  className={`rounded-md px-3 py-1 text-sm ${
                    warmLimit === "5000"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Top 5000
                </button>
                <input
                  type="number"
                  id="warmLimit"
                  value={warmLimit}
                  onChange={(e) => setWarmLimit(e.target.value)}
                  className="w-32 rounded-md border border-gray-600 bg-gray-700 px-3 py-1 text-sm text-white"
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
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="deceasedOnly" className="ml-2 text-sm text-gray-300">
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
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="dryRun" className="ml-2 text-sm text-gray-300">
                Dry run (preview without caching)
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleWarmCache(true)}
                disabled={warmMutation.isPending}
                className="rounded-md bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Preview
              </button>
              <button
                onClick={() => handleWarmCache(false)}
                disabled={warmMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {warmMutation.isPending ? "Warming Cache..." : "Warm Cache"}
              </button>
            </div>
          </div>

          {/* Results */}
          {warmMutation.isError && (
            <div className="mt-4 rounded-md border border-red-700 bg-red-900/20 p-3 text-red-400">
              Error warming cache. Please try again.
            </div>
          )}

          {warmMutation.isSuccess && warmMutation.data && (
            <div className="mt-4 rounded-md border border-green-700 bg-green-900/20 p-4">
              <h4 className="font-semibold text-green-400">
                {dryRun ? "Preview Complete" : "Cache Warmed Successfully"}
              </h4>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-green-300">Cached</dt>
                  <dd className="mt-1 text-2xl font-bold text-white">
                    {(warmMutation.data as CacheWarmResult).cached}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-green-300">Already Cached (Skipped)</dt>
                  <dd className="mt-1 text-2xl font-bold text-white">
                    {(warmMutation.data as CacheWarmResult).skipped}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-green-300">Duration</dt>
                  <dd className="mt-1 text-2xl font-bold text-white">
                    {((warmMutation.data as CacheWarmResult).duration / 1000).toFixed(1)}s
                  </dd>
                </div>
              </dl>
              {(warmMutation.data as CacheWarmResult).errors > 0 && (
                <div className="mt-3 text-sm text-yellow-400">
                  ⚠ {(warmMutation.data as CacheWarmResult).errors} errors occurred
                </div>
              )}
            </div>
          )}
        </div>

        {/* Usage Guide */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-xl font-semibold text-white">When to Warm Cache</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• After deployment when Redis cache is cleared</li>
            <li>• After Redis restart or maintenance</li>
            <li>• When adding many new deceased actors</li>
            <li>• When hit rate drops below 70%</li>
          </ul>

          <h3 className="mb-4 mt-6 text-xl font-semibold text-white">Performance Impact</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>
              • <strong>500 actors:</strong> ~30-60 seconds, covers ~80% of traffic
            </li>
            <li>
              • <strong>1000 actors:</strong> ~2-3 minutes, covers ~95% of traffic (recommended)
            </li>
            <li>
              • <strong>5000 actors:</strong> ~10-15 minutes, covers ~99% of traffic
            </li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  )
}
