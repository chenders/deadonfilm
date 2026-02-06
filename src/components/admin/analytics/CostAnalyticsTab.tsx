/**
 * Cost Analytics tab content.
 * Extracted from AnalyticsPage for use in the Analytics Hub.
 */

import { useState } from "react"
import DateRangePicker from "./DateRangePicker"
import CostBySourceSection from "./CostBySourceSection"
import InternalReferralsChart from "./InternalReferralsChart"
import TopNavigationPathsTable from "./TopNavigationPathsTable"
import PopularPagesTable from "./PopularPagesTable"
import HourlyPatternsChart from "./HourlyPatternsChart"
import ActorUrlMigrationSection from "./ActorUrlMigrationSection"
import StatCard from "./StatCard"
import { usePageVisitStats } from "../../../hooks/admin/useAnalytics"
import { getDefaultDateRangeLocal } from "./shared"

export default function CostAnalyticsTab() {
  const defaultRange = getDefaultDateRangeLocal()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)

  const handleDateRangeChange = (newStartDate: string, newEndDate: string) => {
    setStartDate(newStartDate)
    setEndDate(newEndDate)
  }

  const { data: pageVisitStats } = usePageVisitStats(startDate, endDate)

  return (
    <div className="space-y-8">
      {/* Date Range Picker */}
      <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateRangeChange} />

      {/* Cost Analytics Section */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-admin-text-primary md:text-2xl">
          Cost Analytics
        </h2>
        <CostBySourceSection startDate={startDate} endDate={endDate} />
      </div>

      {/* Page Visit Analytics Section */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-admin-text-primary md:text-2xl">
          Page Visit Analytics
        </h2>

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
            <StatCard label="Direct Visits" value={pageVisitStats.direct_visits.toLocaleString()} />
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
        <h2 className="mb-4 text-xl font-semibold text-admin-text-primary md:text-2xl">
          Actor URL Migration
        </h2>
        <ActorUrlMigrationSection startDate={startDate} endDate={endDate} />
      </div>
    </div>
  )
}
