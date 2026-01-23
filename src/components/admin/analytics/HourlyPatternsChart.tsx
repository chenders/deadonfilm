/**
 * Hourly patterns chart.
 * Shows navigation activity by hour of day (0-23).
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useHourlyPatterns } from "../../../hooks/admin/useAnalytics"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"

interface HourlyPatternsChartProps {
  startDate?: string
  endDate?: string
}

export default function HourlyPatternsChart({ startDate, endDate }: HourlyPatternsChartProps) {
  const { data, isLoading, error } = useHourlyPatterns(startDate, endDate)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Activity by Hour of Day</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Activity by Hour of Day</h2>
        <ErrorMessage message="Failed to load hourly patterns" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Activity by Hour of Day</h2>
        <p className="text-gray-400">No data available for the selected time period</p>
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
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <h2 className="mb-6 text-xl font-semibold text-white">Activity by Hour of Day</h2>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="hour" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
              color: "#F9FAFB",
            }}
            formatter={(value: number | undefined) =>
              value !== undefined
                ? [value.toLocaleString(), "Navigation Events"]
                : ["0", "Navigation Events"]
            }
          />
          <Bar dataKey="count" fill="#10B981" />
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-4 text-sm text-gray-400">
        Shows when users are most active navigating between pages (UTC time)
      </p>
    </div>
  )
}
