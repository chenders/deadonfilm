/**
 * Popular pages table.
 * Shows pages sorted by internal referrals with traffic source breakdown.
 */

import { usePopularPages } from "../../../hooks/admin/useAnalytics"
import LoadingSpinner from "../../common/LoadingSpinner"
import ErrorMessage from "../../common/ErrorMessage"

interface PopularPagesTableProps {
  startDate?: string
  endDate?: string
  limit?: number
}

export default function PopularPagesTable({
  startDate,
  endDate,
  limit = 20,
}: PopularPagesTableProps) {
  const { data, isLoading, error } = usePopularPages(startDate, endDate, limit)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Most Popular Pages</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Most Popular Pages</h2>
        <ErrorMessage message="Failed to load popular pages" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">Most Popular Pages</h2>
        <p className="text-gray-400">No data available for the selected time period</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <h2 className="mb-6 text-xl font-semibold text-white">Most Popular Pages</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Page</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Internal</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">External</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Direct</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Total</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((page, index) => {
              const internalPct = (page.internal_referrals / page.total_visits) * 100
              const externalPct = (page.external_referrals / page.total_visits) * 100
              const directPct = (page.direct_visits / page.total_visits) * 100

              return (
                <tr key={`${page.path}-${index}`} className="border-b border-gray-700">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <code className="rounded bg-gray-900 px-2 py-1 text-xs">{page.path}</code>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-white">
                    {page.internal_referrals.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-white">
                    {page.external_referrals.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-white">
                    {page.direct_visits.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-white">
                    {page.total_visits.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex h-4 w-full overflow-hidden rounded-full">
                      {page.internal_referrals > 0 && (
                        <div
                          className="bg-blue-500"
                          style={{ width: `${internalPct}%` }}
                          title={`Internal: ${internalPct.toFixed(1)}%`}
                        />
                      )}
                      {page.external_referrals > 0 && (
                        <div
                          className="bg-green-500"
                          style={{ width: `${externalPct}%` }}
                          title={`External: ${externalPct.toFixed(1)}%`}
                        />
                      )}
                      {page.direct_visits > 0 && (
                        <div
                          className="bg-gray-500"
                          style={{ width: `${directPct}%` }}
                          title={`Direct: ${directPct.toFixed(1)}%`}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-gray-400">Internal</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-gray-400">External</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-gray-500" />
          <span className="text-gray-400">Direct</span>
        </div>
      </div>
    </div>
  )
}
