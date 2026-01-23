/**
 * Admin cost analytics page.
 *
 * Provides comprehensive cost tracking and analysis across:
 * - Death source API queries
 * - AI helper operations (future)
 * - Enrichment runs (future)
 */

import { useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import DateRangePicker from "../../components/admin/analytics/DateRangePicker"
import CostBySourceSection from "../../components/admin/analytics/CostBySourceSection"

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Cost Analytics</h1>
          <p className="mt-2 text-gray-400">
            Track spending across death sources, AI operations, and enrichment runs
          </p>
        </div>

        {/* Date Range Picker */}
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateRangeChange} />

        {/* Cost by Source Section */}
        <CostBySourceSection startDate={startDate} endDate={endDate} />

        {/* Future sections will go here:
            - AI Operations Breakdown
            - Historical Cost Trends
            - Cost per Enrichment Run
        */}
      </div>
    </AdminLayout>
  )
}
