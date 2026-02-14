/**
 * Cost by source analytics section with bar chart and summary stats.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useCostBySource } from "../../../hooks/admin/useAnalytics"
import { useChartTheme, useChartTooltipStyle } from "../../../hooks/admin/useChartTheme"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"
import StatCard from "./StatCard"
import MobileCard from "../ui/MobileCard"

interface CostBySourceSectionProps {
  startDate?: string
  endDate?: string
}

export default function CostBySourceSection({ startDate, endDate }: CostBySourceSectionProps) {
  const { data, isLoading, error } = useCostBySource(startDate, endDate)
  const chartTheme = useChartTheme()
  const tooltipStyle = useChartTooltipStyle()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Cost by Source</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Cost by Source</h2>
        <ErrorMessage message="Failed to load cost analytics" />
      </div>
    )
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Cost by Source</h2>
        <p className="text-admin-text-muted">No data available for the selected time period</p>
      </div>
    )
  }

  // Format data for the chart
  const chartData = data.sources.map((item) => ({
    source: item.source,
    cost: item.total_cost,
  }))

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
      <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Cost by Source</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Chart */}
        <div className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="source" stroke={chartTheme.axis} />
              <YAxis stroke={chartTheme.axis} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | undefined) =>
                  value !== undefined ? [`$${value.toFixed(2)}`, "Cost"] : ["$0.00", "Cost"]
                }
              />
              <Bar dataKey="cost" fill={chartTheme.series[2]} />
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

      {/* Mobile cards */}
      <div className="mt-6 space-y-3 md:hidden">
        {data.sources.map((source) => (
          <MobileCard
            key={source.source}
            title={source.source}
            fields={[
              { label: "Total Cost", value: `$${source.total_cost.toFixed(2)}` },
              { label: "Queries", value: source.queries_count.toLocaleString() },
              { label: "Avg Cost/Query", value: `$${source.avg_cost_per_query.toFixed(4)}` },
              {
                label: "Last Used",
                value: source.last_used ? new Date(source.last_used).toLocaleDateString() : "Never",
              },
            ]}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-border">
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">
                Source
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Total Cost
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Queries
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Avg Cost/Query
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Last Used
              </th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((source) => (
              <tr key={source.source} className="border-b border-admin-border">
                <td className="px-4 py-3 text-sm text-admin-text-primary">{source.source}</td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                  ${source.total_cost.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                  {source.queries_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                  ${source.avg_cost_per_query.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-muted">
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
