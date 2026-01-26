/**
 * Hourly patterns chart.
 * Shows navigation activity by hour of day (0-23).
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useHourlyPatterns } from "../../../hooks/admin/useAnalytics"
import { useChartTheme, useChartTooltipStyle } from "../../../hooks/admin/useChartTheme"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"

interface HourlyPatternsChartProps {
  startDate?: string
  endDate?: string
}

export default function HourlyPatternsChart({ startDate, endDate }: HourlyPatternsChartProps) {
  const { data, isLoading, error } = useHourlyPatterns(startDate, endDate)
  const chartTheme = useChartTheme()
  const tooltipStyle = useChartTooltipStyle()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">
          Activity by Hour of Day
        </h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">
          Activity by Hour of Day
        </h2>
        <ErrorMessage message="Failed to load hourly patterns" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">
          Activity by Hour of Day
        </h2>
        <p className="text-admin-text-muted">No data available for the selected time period</p>
      </div>
    )
  }

  // Fill in missing hours with zero counts
  const chartData = Array.from({ length: 24 }, (_, hour) => {
    const hourData = data.find((item) => item.hour === hour)
    return {
      hour: hour.toString().padStart(2, "0") + ":00",
      count: hourData?.count ?? 0,
    }
  })

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
      <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">
        Activity by Hour of Day
      </h2>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis dataKey="hour" stroke={chartTheme.axis} />
          <YAxis stroke={chartTheme.axis} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number | undefined) =>
              value !== undefined
                ? [value.toLocaleString(), "Navigation Events"]
                : ["0", "Navigation Events"]
            }
          />
          <Bar dataKey="count" fill={chartTheme.series[1]} />
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-4 text-sm text-admin-text-muted">
        Shows when users are most active navigating between pages (UTC time)
      </p>
    </div>
  )
}
