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
        <div className="py-12 text-center text-admin-danger">
          {error || "Failed to load dashboard"}
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6 md:space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-admin-text-muted">System overview and quick stats</p>
        </div>

        {/* System Health */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary md:text-xl">
            System Health
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center space-x-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  stats.systemHealth.database ? "bg-admin-success" : "bg-admin-danger"
                }`}
              />
              <span className="text-admin-text-secondary">Database</span>
            </div>
            <div className="flex items-center space-x-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  stats.systemHealth.redis ? "bg-admin-success" : "bg-admin-warning"
                }`}
              />
              <span className="text-admin-text-secondary">Redis (Cache)</span>
            </div>
          </div>
        </div>

        {/* Actor Statistics */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary md:text-xl">
            Actor Statistics
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {stats.actorStats.totalActors.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">Total Actors</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {stats.actorStats.deceasedActors.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">Deceased Actors</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {stats.actorStats.enrichedActors.toLocaleString()}
              </div>
              <div className="text-sm text-admin-text-muted">Enriched with Death Info</div>
            </div>
          </div>
        </div>

        {/* Enrichment Statistics */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary md:text-xl">
            Enrichment Runs
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {stats.enrichmentStats.totalRuns}
              </div>
              <div className="text-sm text-admin-text-muted">Total Runs (All Time)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {stats.enrichmentStats.recentRunsCount}
              </div>
              <div className="text-sm text-admin-text-muted">Recent Runs (Last 7 Days)</div>
            </div>
          </div>
        </div>

        {/* Cost Statistics */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary md:text-xl">
            Cost Overview
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                ${stats.costStats.totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-admin-text-muted">Total Spent (All Time)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                ${stats.costStats.lastMonthCost.toFixed(2)}
              </div>
              <div className="text-sm text-admin-text-muted">Last 30 Days</div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
