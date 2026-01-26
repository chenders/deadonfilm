/**
 * Date range picker component for analytics filtering.
 */

import { useMemo } from "react"
import { formatLocalDate } from "../../../utils/formatDate"
import DateInput from "../common/DateInput"

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
  showQuickFilters?: boolean
  startLabel?: string
  endLabel?: string
  className?: string
  idPrefix?: string
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  showQuickFilters = true,
  startLabel = "Start Date",
  endLabel = "End Date",
  className = "",
  idPrefix = "date-range",
}: DateRangePickerProps) {
  const handleQuickFilter = (days: number | "all") => {
    const endDateObj = new Date()
    const end = formatLocalDate(endDateObj)
    if (days === "all") {
      onChange("", end)
    } else {
      const start = new Date()
      start.setDate(start.getDate() - days)
      onChange(formatLocalDate(start), end)
    }
  }

  const handleClearDates = () => {
    onChange("", "")
  }

  // Validate date range
  const validationError = useMemo(() => {
    if (startDate && endDate && startDate > endDate) {
      return "Start date cannot be after end date"
    }
    return undefined
  }, [startDate, endDate])

  return (
    <div
      className={`rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm ${className}`}
    >
      {showQuickFilters && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleQuickFilter(7)}
            className="rounded-md bg-admin-surface-overlay px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-admin-surface-elevated"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => handleQuickFilter(30)}
            className="rounded-md bg-admin-surface-overlay px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-admin-surface-elevated"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => handleQuickFilter(90)}
            className="rounded-md bg-admin-surface-overlay px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-admin-surface-elevated"
          >
            Last 90 Days
          </button>
          <button
            type="button"
            onClick={() => handleQuickFilter("all")}
            className="rounded-md bg-admin-surface-overlay px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-admin-surface-elevated"
          >
            All Time
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <DateInput
          id={`${idPrefix}-start`}
          label={startLabel}
          value={startDate}
          onChange={(value) => onChange(value, endDate)}
          error={validationError}
          className="flex-1"
        />

        <DateInput
          id={`${idPrefix}-end`}
          label={endLabel}
          value={endDate}
          onChange={(value) => onChange(startDate, value)}
          className="flex-1"
        />
      </div>

      {(startDate || endDate) && (
        <button
          type="button"
          onClick={handleClearDates}
          className="mt-4 text-sm text-admin-text-muted transition-colors hover:text-admin-text-primary"
        >
          Clear Dates
        </button>
      )}
    </div>
  )
}
