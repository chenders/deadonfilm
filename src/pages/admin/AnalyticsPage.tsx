/**
 * Admin analytics page.
 *
 * Provides comprehensive tracking and analysis:
 * - Cost analytics (death source API queries, AI operations, enrichment runs)
 * - Page visit analytics (internal navigation, popular pages, traffic sources)
 */

import { useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import DateRangePicker from "../../components/admin/analytics/DateRangePicker"
import CostBySourceSection from "../../components/admin/analytics/CostBySourceSection"
import InternalReferralsChart from "../../components/admin/analytics/InternalReferralsChart"
import TopNavigationPathsTable from "../../components/admin/analytics/TopNavigationPathsTable"
import PopularPagesTable from "../../components/admin/analytics/PopularPagesTable"
import HourlyPatternsChart from "../../components/admin/analytics/HourlyPatternsChart"
import ActorUrlMigrationSection from "../../components/admin/analytics/ActorUrlMigrationSection"
import StatCard from "../../components/admin/analytics/StatCard"
import { usePageVisitStats } from "../../hooks/admin/useAnalytics"
import { formatLocalDate } from "../../utils/formatDate"

// Calculate default date range (last 30 days)
const getDefaultDateRange = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  }
}

export default function AnalyticsPage() {
  const defaultRange = getDefaultDateRange()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)

  const handleDateRangeChange = (newStartDate: string, newEndDate: string) => {
    setStartDate(newStartDate)
    setEndDate(newEndDate)
  }

  const { data: pageVisitStats } = usePageVisitStats(startDate, endDate)

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics Dashboard</h1>
          <p className="mt-2 text-gray-400">
            Track costs, page visits, and user navigation patterns
          </p>
        </div>

        {/* Date Range Picker */}
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateRangeChange} />

        {/* Cost Analytics Section */}
        <div>
          <h2 className="mb-4 text-2xl font-semibold text-white">Cost Analytics</h2>
          <CostBySourceSection startDate={startDate} endDate={endDate} />
        </div>

        {/* Page Visit Analytics Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Page Visit Analytics</h2>

          {/* Page Visit Summary Stats */}
          {pageVisitStats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total Visits" value={pageVisitStats.total_visits.toLocaleString()} />
              <StatCard
                label="Internal Referrals"
                value={pageVisitStats.internal_referrals.toLocaleString()}
              />
              <StatCard
                label="External Referrals"
                value={pageVisitStats.external_referrals.toLocaleString()}
              />
              <StatCard
                label="Direct Visits"
                value={pageVisitStats.direct_visits.toLocaleString()}
              />
              <StatCard
                label="Unique Sessions"
                value={pageVisitStats.unique_sessions.toLocaleString()}
              />
              <StatCard
                label="Pages/Session"
                value={pageVisitStats.avg_pages_per_session.toFixed(2)}
              />
            </div>
          )}

          {/* Internal Referrals Over Time */}
          <InternalReferralsChart startDate={startDate} endDate={endDate} />

          {/* Hourly Patterns */}
          <HourlyPatternsChart startDate={startDate} endDate={endDate} />

          {/* Top Navigation Paths */}
          <TopNavigationPathsTable startDate={startDate} endDate={endDate} />

          {/* Popular Pages */}
          <PopularPagesTable startDate={startDate} endDate={endDate} />
        </div>

        {/* Actor URL Migration Section */}
        <div>
          <h2 className="mb-4 text-2xl font-semibold text-white">Actor URL Migration</h2>
          <ActorUrlMigrationSection startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </AdminLayout>
  )
}
