import { useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import {
  usePageViewSummary,
  usePageViewTrends,
  useTopViewedPages,
} from "../../hooks/admin/usePageViews"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

type Granularity = 'daily' | 'weekly' | 'monthly'

export default function PageViewsPage() {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [pageTypeFilter, setPageTypeFilter] = useState<string>('all')

  // Calculate date range (last 30 days)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = usePageViewSummary(startDate.toISOString(), endDate.toISOString(), pageTypeFilter)

  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = usePageViewTrends(startDate.toISOString(), endDate.toISOString(), granularity)

  const {
    data: topViewed,
    isLoading: topViewedLoading,
    error: topViewedError,
  } = useTopViewedPages('actor_death', startDate.toISOString(), endDate.toISOString(), 20)

  const isLoading = summaryLoading || trendsLoading || topViewedLoading
  const error = summaryError || trendsError || topViewedError

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
          {error instanceof Error ? error.message : "Failed to load page view data"}
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Page View Analytics</h1>
          <p className="mt-2 text-gray-400">Track content views and user engagement (Last 30 Days)</p>
        </div>

        {/* Summary Stats Cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
            <div className="rounded-lg bg-gray-800 p-6">
              <div className="text-3xl font-bold text-white">
                {summary.total_views.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Total Views</div>
            </div>

            <div className="rounded-lg bg-gray-800 p-6">
              <div className="text-3xl font-bold text-red-500">
                {summary.death_page_views.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Death Pages</div>
            </div>

            <div className="rounded-lg bg-gray-800 p-6">
              <div className="text-3xl font-bold text-blue-500">
                {summary.movie_views.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Movies</div>
            </div>

            <div className="rounded-lg bg-gray-800 p-6">
              <div className="text-3xl font-bold text-green-500">
                {summary.show_views.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Shows</div>
            </div>

            <div className="rounded-lg bg-gray-800 p-6">
              <div className="text-3xl font-bold text-purple-500">
                {summary.episode_views.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Episodes</div>
            </div>
          </div>
        )}

        {/* Views Over Time Chart */}
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Views Over Time</h2>
            <div className="flex space-x-2">
              {(['daily', 'weekly', 'monthly'] as Granularity[]).map((g) => (
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
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
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
                <Area
                  type="monotone"
                  dataKey="actor_death_views"
                  stackId="1"
                  stroke="#EF4444"
                  fill="#EF4444"
                  name="Death Pages"
                />
                <Area
                  type="monotone"
                  dataKey="movie_views"
                  stackId="1"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  name="Movies"
                />
                <Area
                  type="monotone"
                  dataKey="show_views"
                  stackId="1"
                  stroke="#10B981"
                  fill="#10B981"
                  name="Shows"
                />
                <Area
                  type="monotone"
                  dataKey="episode_views"
                  stackId="1"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  name="Episodes"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-gray-400">
              No view data available yet. Data is tracked as users view pages.
            </div>
          )}
        </div>

        {/* Top Viewed Death Pages */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-6 text-xl font-semibold text-white">Top Viewed Death Pages</h2>

          {topViewed && topViewed.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-700 bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                      Actor Name
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      View Count
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                      Last Viewed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {topViewed.map((page, index) => (
                    <tr key={page.entity_id} className="transition-colors hover:bg-gray-750">
                      <td className="px-4 py-3 text-gray-400">#{index + 1}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/actor/${page.entity_id}/death`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          {page.entity_name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right text-white font-semibold">
                        {page.view_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(page.last_viewed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400">
              No death page views recorded yet.
            </div>
          )}
        </div>

        {/* Info Note */}
        <div className="rounded-lg border border-blue-900 bg-blue-950 p-4">
          <p className="text-sm text-blue-200">
            <strong>Note:</strong> Page views are tracked in real-time and filtered to exclude bot
            traffic. Data may take a few minutes to appear after page visits.
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
