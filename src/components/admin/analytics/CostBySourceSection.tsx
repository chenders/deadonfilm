/**
 * Cost by source analytics section with bar chart and summary stats.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useCostBySource } from "../../../hooks/admin/useAnalytics"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"
import StatCard from "./StatCard"

interface CostBySourceSectionProps {
  startDate?: string
  endDate?: string
}

export default function CostBySourceSection({ startDate, endDate }: CostBySourceSectionProps) {
  const { data, isLoading, error } = useCostBySource(startDate, endDate)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Cost by Source</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Cost by Source</h2>
        <ErrorMessage message="Failed to load cost analytics" />
      </div>
    )
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Cost by Source</h2>
        <p className="text-gray-400">No data available for the selected time period</p>
      </div>
    )
  }

  // Format data for the chart
  const chartData = data.sources.map((item) => ({
    source: item.source,
    cost: item.total_cost,
  }))

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <h2 className="mb-6 text-xl font-semibold text-white">Cost by Source</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Chart */}
        <div className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="source" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                  color: "#F9FAFB",
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
              />
              <Bar dataKey="cost" fill="#EF4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Stats */}
        <div className="space-y-4">
          <StatCard label="Total Cost" value={`$${data.totalCost.toFixed(2)}`} />
          <StatCard label="Total Queries" value={data.totalQueries.toLocaleString()} />
          <StatCard
            label="Avg Cost/Query"
            value={`$${(data.totalCost / data.totalQueries).toFixed(4)}`}
          />
        </div>
      </div>

      {/* Detailed table */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Source</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Total Cost</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Queries</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">
                Avg Cost/Query
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((source) => (
              <tr key={source.source} className="border-b border-gray-700">
                <td className="px-4 py-3 text-sm text-white">{source.source}</td>
                <td className="px-4 py-3 text-right text-sm text-white">
                  ${source.total_cost.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-white">
                  {source.queries_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm text-white">
                  ${source.avg_cost_per_query.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-400">
                  {source.last_used ? new Date(source.last_used).toLocaleDateString() : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
