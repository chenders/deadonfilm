/**
 * Popular pages table.
 * Shows pages sorted by internal referrals with traffic source breakdown.
 */

import { usePopularPages } from "../../../hooks/admin/useAnalytics"
import { useChartTheme } from "../../../hooks/admin/useChartTheme"
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
  const chartTheme = useChartTheme()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Most Popular Pages</h2>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Most Popular Pages</h2>
        <ErrorMessage message="Failed to load popular pages" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
        <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Most Popular Pages</h2>
        <p className="text-admin-text-muted">No data available for the selected time period</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
      <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">Most Popular Pages</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-border">
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">
                Page
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Internal
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                External
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Direct
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-admin-text-muted">
                Total
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-admin-text-muted">
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
                <tr key={`${page.path}-${index}`} className="border-b border-admin-border">
                  <td className="px-4 py-3 text-sm text-admin-text-secondary">
                    <code className="rounded bg-admin-surface-overlay px-2 py-1 text-xs">
                      {page.path}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                    {page.internal_referrals.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                    {page.external_referrals.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-admin-text-primary">
                    {page.direct_visits.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-admin-text-primary">
                    {page.total_visits.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex h-4 w-full overflow-hidden rounded-full">
                      {page.internal_referrals > 0 && (
                        <div
                          style={{
                            width: `${internalPct}%`,
                            backgroundColor: chartTheme.series[0],
                          }}
                          title={`Internal: ${internalPct.toFixed(1)}%`}
                        />
                      )}
                      {page.external_referrals > 0 && (
                        <div
                          style={{
                            width: `${externalPct}%`,
                            backgroundColor: chartTheme.series[1],
                          }}
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
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: chartTheme.series[0] }} />
          <span className="text-admin-text-muted">Internal</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: chartTheme.series[1] }} />
          <span className="text-admin-text-muted">External</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-gray-500" />
          <span className="text-admin-text-muted">Direct</span>
        </div>
      </div>
    </div>
  )
}
