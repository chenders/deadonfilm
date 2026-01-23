/**
 * Top navigation paths table.
 * Shows the most common referrer → destination page transitions.
 */

import { useNavigationPaths } from "../../../hooks/admin/useAnalytics"
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

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Top Navigation Paths</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Top Navigation Paths</h2>
        <ErrorMessage message="Failed to load navigation paths" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Top Navigation Paths</h2>
        <p className="text-gray-400">No data available for the selected time period</p>
      </div>
    )
  }

  const maxCount = Math.max(...data.map((item) => item.count))

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <h2 className="mb-6 text-xl font-semibold text-white">Top Navigation Paths</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">From</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">To</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Count</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">%</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.map((path, index) => (
              <tr
                key={`${path.referrer_path}-${path.visited_path}-${index}`}
                className="border-b border-gray-700"
              >
                <td className="px-4 py-3 text-sm text-gray-300">
                  <code className="rounded bg-gray-900 px-2 py-1 text-xs">
                    {path.referrer_path}
                  </code>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  <code className="rounded bg-gray-900 px-2 py-1 text-xs">{path.visited_path}</code>
                </td>
                <td className="px-4 py-3 text-right text-sm text-white">
                  {path.count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-400">
                  {path.percentage.toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-full rounded-full bg-gray-700">
                    <div
                      className="h-4 rounded-full bg-blue-500"
                      style={{ width: `${(path.count / maxCount) * 100}%` }}
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
