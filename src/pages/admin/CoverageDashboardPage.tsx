import { useState } from "react"
import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useCoverageStats, useCoverageTrends } from "../../hooks/admin/useCoverage"
import { useChartTheme, useChartTooltipStyle } from "../../hooks/admin/useChartTheme"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

type Granularity = "daily" | "weekly" | "monthly"

// Calculate default date range (last 30 days)
const getDefaultDateRange = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }
}

export default function CoverageDashboardPage() {
  const [granularity, setGranularity] = useState<Granularity>("daily")

  // Use state to manage date range - stable across renders but allows future enhancements
  const defaultRange = getDefaultDateRange()
  const [startDate] = useState(defaultRange.startDate)
  const [endDate] = useState(defaultRange.endDate)

  const { data: stats, isLoading: statsLoading, error: statsError } = useCoverageStats()
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useCoverageTrends(startDate, endDate, granularity)

  const isLoading = statsLoading || trendsLoading
  const error = statsError || trendsError

  const chartTheme = useChartTheme()
  const tooltipStyle = useChartTooltipStyle()

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-admin-danger">
          {error instanceof Error ? error.message : "Failed to load coverage data"}
        </div>
      </AdminLayout>
    )
  }

  if (!stats) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-admin-text-muted">No coverage data available</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            Death Detail Coverage
          </h1>
          <p className="mt-2 text-admin-text-muted">
            Track death page coverage and enrichment progress
          </p>
        </div>

        {/* Coverage Stats Cards */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {stats.total_deceased_actors.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Total Deceased</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-success md:text-3xl">
              {stats.actors_with_death_pages.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">With Death Pages</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-warning md:text-3xl">
              {stats.actors_without_death_pages.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Without Death Pages</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-info md:text-3xl">
              {stats.coverage_percentage}%
            </div>
            <div className="text-sm text-admin-text-muted">Coverage Percentage</div>
          </div>
        </div>

        {/* Enrichment Candidates */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {stats.enrichment_candidates_count.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Enrichment Candidates</div>
            <p className="mt-2 text-xs text-admin-text-muted">
              Deceased actors without death pages, not recently enriched
            </p>
          </div>

          <Link
            to="/admin/enrichment/high-priority"
            className="hover:bg-admin-surface-hover block rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm transition-colors md:p-6"
          >
            <div className="text-2xl font-bold text-orange-500 transition-colors hover:text-orange-400 md:text-3xl">
              {stats.high_priority_count.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">High Priority</div>
            <p className="mt-2 text-xs text-admin-text-muted">Popular actors (popularity ≥ 10)</p>
          </Link>
        </div>

        {/* Coverage Trends Chart */}
        <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-admin-text-primary md:text-xl">
              Coverage Trends (Last 30 Days)
            </h2>
            <div className="flex space-x-2">
              {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`rounded px-3 py-1 text-sm ${
                    granularity === g
                      ? "bg-admin-accent text-white"
                      : "hover:bg-admin-surface-hover bg-admin-surface-base text-admin-text-secondary"
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis
                  dataKey="captured_at"
                  stroke={chartTheme.axis}
                  tickFormatter={(value: string) => new Date(value).toLocaleDateString()}
                />
                <YAxis stroke={chartTheme.axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: chartTheme.legend }} />
                <Line
                  type="monotone"
                  dataKey="coverage_percentage"
                  stroke={chartTheme.series[0]}
                  name="Coverage %"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actors_with_death_pages"
                  stroke={chartTheme.series[1]}
                  name="With Pages"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actors_without_death_pages"
                  stroke={chartTheme.series[3]}
                  name="Without Pages"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-admin-text-muted">
              No trend data available yet. Data is captured daily.
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          <Link
            to="/admin/actors?hasDeathPage=false"
            className="hover:bg-admin-surface-hover block rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm transition-colors md:p-6"
          >
            <h3 className="text-lg font-semibold text-admin-text-primary">
              Manage Actors Without Pages
            </h3>
            <p className="mt-2 text-sm text-admin-text-muted">
              Filter, search, and select actors for enrichment
            </p>
          </Link>

          <Link
            to="/admin/actors?hasDeathPage=true"
            className="hover:bg-admin-surface-hover block rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm transition-colors md:p-6"
          >
            <h3 className="text-lg font-semibold text-admin-text-primary">View All Death Pages</h3>
            <p className="mt-2 text-sm text-admin-text-muted">
              Browse actors with detailed death information
            </p>
          </Link>

          <Link
            to="/admin/enrichment/start"
            className="bg-admin-accent hover:bg-admin-accent-hover block rounded-lg p-4 shadow-admin-sm transition-colors md:p-6"
          >
            <h3 className="text-lg font-semibold text-white">Start Enrichment</h3>
            <p className="mt-2 text-sm text-blue-100">
              Run death detail enrichment for selected actors
            </p>
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}
