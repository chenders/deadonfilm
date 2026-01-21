import { useEffect, useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"

interface DashboardStats {
  systemHealth: {
    database: boolean
    redis: boolean
  }
  actorStats: {
    totalActors: number
    deceasedActors: number
    enrichedActors: number
  }
  enrichmentStats: {
    totalRuns: number
    recentRunsCount: number
  }
  costStats: {
    totalCost: number
    lastMonthCost: number
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/admin/api/dashboard/stats", {
          credentials: "include",
        })

        if (!response.ok) {
          throw new Error("Failed to fetch dashboard stats")
        }

        const data = await response.json()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (error || !stats) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-red-500">{error || "Failed to load dashboard"}</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          <p className="mt-2 text-gray-400">System overview and quick stats</p>
        </div>

        {/* System Health */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">System Health</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  stats.systemHealth.database ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-gray-300">Database</span>
            </div>
            <div className="flex items-center space-x-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  stats.systemHealth.redis ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              <span className="text-gray-300">Redis (Cache)</span>
            </div>
          </div>
        </div>

        {/* Actor Statistics */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Actor Statistics</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">
                {stats.actorStats.totalActors.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Total Actors</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">
                {stats.actorStats.deceasedActors.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Deceased Actors</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">
                {stats.actorStats.enrichedActors.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Enriched with Death Info</div>
            </div>
          </div>
        </div>

        {/* Enrichment Statistics */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Enrichment Runs</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">{stats.enrichmentStats.totalRuns}</div>
              <div className="text-sm text-gray-400">Total Runs (All Time)</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">
                {stats.enrichmentStats.recentRunsCount}
              </div>
              <div className="text-sm text-gray-400">Recent Runs (Last 7 Days)</div>
            </div>
          </div>
        </div>

        {/* Cost Statistics */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Cost Overview</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">
                ${stats.costStats.totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Total Spent (All Time)</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">
                ${stats.costStats.lastMonthCost.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Last 30 Days</div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
