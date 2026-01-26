/**
 * Top navigation paths table.
 * Shows the most common referrer -> destination page transitions.
 */

import { useNavigationPaths } from "../../../hooks/admin/useAnalytics"
import { useChartTheme } from "../../../hooks/admin/useChartTheme"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"

interface TopNavigationPathsTableProps {
  startDate?: string
  endDate?: string
  limit?: number
}

export default function TopNavigationPathsTable({
  startDate,
  endDate,
  limit = 20,
}: TopNavigationPathsTableProps) {
  const { data, isLoading, error } = useNavigationPaths(startDate, endDate, limit)
  const chartTheme = useChartTheme()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Top Navigation Paths</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Top Navigation Paths</h2>
        <ErrorMessage message="Failed to load navigation paths" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Top Navigation Paths</h2>
        <p className="text-admin-text-muted">No data available for the selected time period</p>
      </div>
    )
  }

  const maxCount = Math.max(...data.map((item) => item.count))

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
      <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Top Navigation Paths</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-border">
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">
                From
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">To</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Count
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">%</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((path, index) => (
              <tr
                key={`${path.referrer_path}-${path.visited_path}-${index}`}
                className="border-b border-admin-border"
              >
                <td className="px-4 py-3 text-sm text-admin-text-secondary">
                  <code className="rounded bg-admin-surface-overlay px-2 py-1 text-xs">
                    {path.referrer_path}
                  </code>
                </td>
                <td className="px-4 py-3 text-sm text-admin-text-secondary">
                  <code className="rounded bg-admin-surface-overlay px-2 py-1 text-xs">
                    {path.visited_path}
                  </code>
                </td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                  {path.count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm text-admin-text-muted">
                  {path.percentage.toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-full rounded-full bg-admin-surface-overlay">
                    <div
                      className="h-4 rounded-full"
                      style={{
                        width: `${(path.count / maxCount) * 100}%`,
                        backgroundColor: chartTheme.series[0],
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
