import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { Card, StatCard, ProgressRing, ProgressBar, Skeleton } from "../../components/admin/ui"

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

// Quick action link configuration
const quickActions = [
  { label: "Start Enrichment", href: "/admin/enrichment/start", icon: "play" },
  { label: "View Coverage", href: "/admin/coverage", icon: "chart" },
  { label: "Actor Management", href: "/admin/actors", icon: "users" },
  { label: "View Analytics", href: "/admin/analytics", icon: "analytics" },
]

function QuickActionIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "play":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )
    case "chart":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      )
    case "users":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      )
    case "analytics":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
      )
    default:
      return null
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

  // Calculate coverage percentage
  const coveragePercent = stats
    ? Math.round((stats.actorStats.enrichedActors / stats.actorStats.deceasedActors) * 100) || 0
    : 0

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6 md:space-y-8">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-5 w-64" />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton.StatCard key={i} />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !stats) {
    return (
      <AdminLayout>
        <div className="py-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-admin-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="mt-4 text-admin-danger">{error || "Failed to load dashboard"}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover"
          >
            Retry
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-admin-text-muted">System overview and quick stats</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              to={action.href}
              className="hover:border-admin-interactive/30 flex items-center gap-3 rounded-lg border border-admin-border bg-admin-surface-elevated p-3 shadow-admin-sm transition-all hover:-translate-y-0.5 hover:shadow-admin-md md:p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-admin-info-bg text-admin-interactive">
                <QuickActionIcon icon={action.icon} />
              </div>
              <span className="text-sm font-medium text-admin-text-primary">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* System Health */}
        <Card title="System Health">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-4">
              <ProgressRing
                value={stats.systemHealth.database ? 100 : 0}
                size={56}
                strokeWidth={5}
                variant={stats.systemHealth.database ? "success" : "danger"}
                showLabel={false}
              />
              <div>
                <div className="text-sm font-medium text-admin-text-primary">Database</div>
                <div
                  className={`text-xs ${stats.systemHealth.database ? "text-admin-success" : "text-admin-danger"}`}
                >
                  {stats.systemHealth.database ? "Connected" : "Disconnected"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing
                value={stats.systemHealth.redis ? 100 : 0}
                size={56}
                strokeWidth={5}
                variant={stats.systemHealth.redis ? "success" : "warning"}
                showLabel={false}
              />
              <div>
                <div className="text-sm font-medium text-admin-text-primary">Redis (Cache)</div>
                <div
                  className={`text-xs ${stats.systemHealth.redis ? "text-admin-success" : "text-admin-warning"}`}
                >
                  {stats.systemHealth.redis ? "Connected" : "Unavailable"}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Actor Statistics */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Actor Statistics</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Total Actors"
              value={stats.actorStats.totalActors.toLocaleString()}
              href="/admin/actors"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              }
            />
            <StatCard
              label="Deceased Actors"
              value={stats.actorStats.deceasedActors.toLocaleString()}
              href="/admin/coverage"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              }
            />
            <StatCard
              label="Enriched with Death Info"
              value={stats.actorStats.enrichedActors.toLocaleString()}
              href="/admin/enrichment/runs"
              variant="success"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          </div>
        </div>

        {/* Coverage Progress */}
        <Card
          title="Death Info Coverage"
          action={
            <Link to="/admin/coverage" className="text-sm text-admin-interactive hover:underline">
              View Details
            </Link>
          }
        >
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold text-admin-text-primary">{coveragePercent}%</div>
                <div className="text-sm text-admin-text-muted">
                  of deceased actors have enriched death info
                </div>
              </div>
              <div className="text-right text-sm text-admin-text-muted">
                <div>
                  {stats.actorStats.enrichedActors.toLocaleString()} /{" "}
                  {stats.actorStats.deceasedActors.toLocaleString()}
                </div>
              </div>
            </div>
            <ProgressBar
              value={coveragePercent}
              variant={
                coveragePercent >= 75 ? "success" : coveragePercent >= 50 ? "warning" : "default"
              }
              height={12}
              animated
            />
          </div>
        </Card>

        {/* Bottom Row: Enrichment + Cost */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Enrichment Statistics */}
          <Card
            title="Enrichment Runs"
            action={
              <Link
                to="/admin/enrichment/runs"
                className="text-sm text-admin-interactive hover:underline"
              >
                View All
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                  {stats.enrichmentStats.totalRuns.toLocaleString()}
                </div>
                <div className="text-sm text-admin-text-muted">Total Runs</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                  {stats.enrichmentStats.recentRunsCount}
                </div>
                <div className="text-sm text-admin-text-muted">Last 7 Days</div>
              </div>
            </div>
          </Card>

          {/* Cost Statistics */}
          <Card
            title="Cost Overview"
            action={
              <Link
                to="/admin/analytics"
                className="text-sm text-admin-interactive hover:underline"
              >
                View Analytics
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                  ${stats.costStats.totalCost.toFixed(2)}
                </div>
                <div className="text-sm text-admin-text-muted">Total Spent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                  ${stats.costStats.lastMonthCost.toFixed(2)}
                </div>
                <div className="text-sm text-admin-text-muted">Last 30 Days</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  )
}
