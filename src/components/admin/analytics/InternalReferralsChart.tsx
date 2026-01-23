/**
 * Internal referrals over time chart.
 * Shows a time series of internal navigation events.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useInternalReferralsOverTime } from "../../../hooks/admin/useAnalytics"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"

interface InternalReferralsChartProps {
  startDate?: string
  endDate?: string
  granularity?: "hour" | "day" | "week"
}

export default function InternalReferralsChart({
  startDate,
  endDate,
  granularity = "day",
}: InternalReferralsChartProps) {
  const { data, isLoading, error } = useInternalReferralsOverTime(startDate, endDate, granularity)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Internal Referrals Over Time</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Internal Referrals Over Time</h2>
        <ErrorMessage message="Failed to load internal referrals data" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Internal Referrals Over Time</h2>
        <p className="text-gray-400">No data available for the selected time period</p>
      </div>
    )
  }

  // Format data for the chart
  const chartData = data.map((item) => ({
    date: new Date(item.timestamp).toLocaleDateString(),
    count: item.count,
  }))

  const totalReferrals = data.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Internal Referrals Over Time</h2>
        <div className="text-sm text-gray-400">
          Total: <span className="font-semibold text-white">{totalReferrals.toLocaleString()}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorReferrals" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
              color: "#F9FAFB",
            }}
            formatter={(value: number) => [value.toLocaleString(), "Internal Referrals"]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#3B82F6"
            fillOpacity={1}
            fill="url(#colorReferrals)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
