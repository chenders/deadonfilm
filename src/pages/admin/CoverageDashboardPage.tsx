import { useState } from "react"
import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useCoverageStats, useCoverageTrends } from "../../hooks/admin/useCoverage"
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
        <div className="py-12 text-center text-red-500">
          {error instanceof Error ? error.message : "Failed to load coverage data"}
        </div>
      </AdminLayout>
    )
  }

  if (!stats) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-gray-400">No coverage data available</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Death Detail Coverage</h1>
          <p className="mt-2 text-gray-400">Track death page coverage and enrichment progress</p>
        </div>

        {/* Coverage Stats Cards */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-white">
              {stats.total_deceased_actors.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Total Deceased</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-green-500">
              {stats.actors_with_death_pages.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">With Death Pages</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-yellow-500">
              {stats.actors_without_death_pages.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Without Death Pages</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-blue-500">{stats.coverage_percentage}%</div>
            <div className="text-sm text-gray-400">Coverage Percentage</div>
          </div>
        </div>

        {/* Enrichment Candidates */}
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-white">
              {stats.enrichment_candidates_count.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Enrichment Candidates</div>
            <p className="mt-2 text-xs text-gray-500">
              Deceased actors without death pages, not recently enriched
            </p>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-orange-500">
              {stats.high_priority_count.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">High Priority</div>
            <p className="mt-2 text-xs text-gray-500">Popular actors (popularity ≥ 10)</p>
          </div>
        </div>

        {/* Coverage Trends Chart */}
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Coverage Trends (Last 30 Days)</h2>
            <div className="flex space-x-2">
              {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`rounded px-3 py-1 text-sm ${
                    granularity === g
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
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
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="captured_at"
                  stroke="#9CA3AF"
                  tickFormatter={(value: string) => new Date(value).toLocaleDateString()}
                />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F2937",
                    border: "1px solid #374151",
                    borderRadius: "0.5rem",
                  }}
                  labelStyle={{ color: "#F3F4F6" }}
                  itemStyle={{ color: "#D1D5DB" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="coverage_percentage"
                  stroke="#3B82F6"
                  name="Coverage %"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actors_with_death_pages"
                  stroke="#10B981"
                  name="With Pages"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actors_without_death_pages"
                  stroke="#EAB308"
                  name="Without Pages"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-gray-400">
              No trend data available yet. Data is captured daily.
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Link
            to="/admin/actors?hasDeathPage=false"
            className="block rounded-lg bg-gray-800 p-6 transition-colors hover:bg-gray-700"
          >
            <h3 className="text-lg font-semibold text-white">Manage Actors Without Pages</h3>
            <p className="mt-2 text-sm text-gray-400">
              Filter, search, and select actors for enrichment
            </p>
          </Link>

          <Link
            to="/admin/actors?hasDeathPage=true"
            className="block rounded-lg bg-gray-800 p-6 transition-colors hover:bg-gray-700"
          >
            <h3 className="text-lg font-semibold text-white">View All Death Pages</h3>
            <p className="mt-2 text-sm text-gray-400">
              Browse actors with detailed death information
            </p>
          </Link>

          <Link
            to="/admin/enrichment/start"
            className="block rounded-lg bg-blue-600 p-6 transition-colors hover:bg-blue-700"
          >
            <h3 className="text-lg font-semibold text-white">Start Enrichment</h3>
            <p className="mt-2 text-sm text-gray-200">
              Run death detail enrichment for selected actors
            </p>
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}
