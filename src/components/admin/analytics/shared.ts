/**
 * Shared types and utilities for analytics tab components.
 */

import { formatLocalDate } from "../../../utils/formatDate"

export type Granularity = "daily" | "weekly" | "monthly"

/** Returns a date range for the last 30 days as ISO strings. */
export function getDefaultDateRangeISO() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }
}

/** Returns a date range for the last 30 days as YYYY-MM-DD local date strings. */
export function getDefaultDateRangeLocal() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  }
}
