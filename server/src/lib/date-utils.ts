/**
 * Date utility functions for TMDB sync operations.
 */

export const MAX_QUERY_DAYS = 14 // TMDB API limit

/**
 * Parse a YYYY-MM-DD date string into a Date object at noon UTC.
 * Using noon avoids timezone issues that can shift the date.
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

/**
 * Format a Date object to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function subtractDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr)
  date.setUTCDate(date.getUTCDate() - days)
  return formatDate(date)
}

/**
 * Split a date range into chunks of MAX_QUERY_DAYS or less.
 * TMDB API allows up to 14 days inclusive per query.
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of date ranges, each with start and end in YYYY-MM-DD format
 */
export function getDateRanges(
  startDate: string,
  endDate: string
): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = []
  let current = parseDate(startDate)
  const end = parseDate(endDate)

  // Handle same-day case - still need at least one range
  while (current <= end) {
    const rangeEnd = new Date(current)
    // Add (MAX_QUERY_DAYS - 1) to get exactly 14 days inclusive (day 1 to day 14)
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + MAX_QUERY_DAYS - 1)

    ranges.push({
      start: formatDate(current),
      end: formatDate(rangeEnd > end ? end : rangeEnd),
    })

    // Move to the day after rangeEnd for the next chunk
    current = new Date(rangeEnd)
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return ranges
}
