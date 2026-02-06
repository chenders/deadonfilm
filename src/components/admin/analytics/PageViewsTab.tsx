/**
 * Page Views tab content.
 * Extracted from PageViewsPage for use in the Analytics Hub.
 */

import { useState } from "react"
import LoadingSpinner from "../../common/LoadingSpinner"
import {
  usePageViewSummary,
  usePageViewTrends,
  useTopViewedPages,
} from "../../../hooks/admin/usePageViews"
import { useChartTheme, useChartTooltipStyle } from "../../../hooks/admin/useChartTheme"
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

type Granularity = "daily" | "weekly" | "monthly"

const getDefaultDateRange = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }
}

export default function PageViewsTab() {
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const pageTypeFilter = "all"

  const defaultRange = getDefaultDateRange()
  const [startDate] = useState(defaultRange.startDate)
  const [endDate] = useState(defaultRange.endDate)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = usePageViewSummary(startDate, endDate, pageTypeFilter)

  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = usePageViewTrends(startDate, endDate, granularity)

  const {
    data: topViewed,
    isLoading: topViewedLoading,
    error: topViewedError,
  } = useTopViewedPages("actor_death", startDate, endDate, 20)

  const isLoading = summaryLoading || trendsLoading || topViewedLoading
  const error = summaryError || trendsError || topViewedError

  const chartTheme = useChartTheme()
  const tooltipStyle = useChartTooltipStyle()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center text-admin-danger">
        {error instanceof Error ? error.message : "Failed to load page view data"}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Summary Stats Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-5">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {summary.total_views.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Total Views</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-danger md:text-3xl">
              {summary.death_page_views.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Death Pages</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-info md:text-3xl">
              {summary.movie_views.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Movies</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-success md:text-3xl">
              {summary.show_views.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Shows</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-purple-500 md:text-3xl">
              {summary.episode_views.toLocaleString()}
            </div>
            <div className="text-sm text-admin-text-muted">Episodes</div>
          </div>
        </div>
      )}

      {/* Views Over Time Chart */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-admin-text-primary md:text-xl">
            Views Over Time
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
            <AreaChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="date" stroke={chartTheme.axis} />
              <YAxis stroke={chartTheme.axis} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: chartTheme.legend }} />
              <Area
                type="monotone"
                dataKey="actor_death_views"
                stackId="1"
                stroke={chartTheme.series[2]}
                fill={chartTheme.series[2]}
                name="Death Pages"
              />
              <Area
                type="monotone"
                dataKey="movie_views"
                stackId="1"
                stroke={chartTheme.series[0]}
                fill={chartTheme.series[0]}
                name="Movies"
              />
              <Area
                type="monotone"
                dataKey="show_views"
                stackId="1"
                stroke={chartTheme.series[1]}
                fill={chartTheme.series[1]}
                name="Shows"
              />
              <Area
                type="monotone"
                dataKey="episode_views"
                stackId="1"
                stroke={chartTheme.series[4]}
                fill={chartTheme.series[4]}
                name="Episodes"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-12 text-center text-admin-text-muted">
            No view data available yet. Data is tracked as users view pages.
          </div>
        )}
      </div>

      {/* Top Viewed Death Pages */}
      <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-lg font-semibold text-admin-text-primary md:text-xl">
          Top Viewed Death Pages
        </h2>

        {topViewed && topViewed.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-admin-border bg-admin-surface-base">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Actor Name
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-admin-text-secondary">
                    View Count
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-admin-text-secondary">
                    Last Viewed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {topViewed.map((page, index) => (
                  <tr
                    key={page.entity_id}
                    className="hover:bg-admin-surface-hover transition-colors"
                  >
                    <td className="px-4 py-3 text-admin-text-muted">#{index + 1}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/actor/${page.entity_id}/death`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-admin-accent text-admin-text-primary transition-colors"
                      >
                        {page.entity_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-admin-text-primary">
                      {page.view_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-admin-text-muted">
                      {new Date(page.last_viewed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-admin-text-muted">
            No death page views recorded yet.
          </div>
        )}
      </div>

      {/* Info Note */}
      <div className="border-admin-info/30 bg-admin-info/10 rounded-lg border p-4">
        <p className="text-sm text-admin-info">
          <strong>Note:</strong> Page views are tracked in real-time and filtered to exclude bot
          traffic. Data may take a few minutes to appear after page visits.
        </p>
      </div>
    </div>
  )
}
