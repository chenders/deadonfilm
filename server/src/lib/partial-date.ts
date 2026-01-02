/**
 * Partial Date Utilities
 *
 * Handles dates with varying precision (year-only, year+month, full date).
 * Used throughout the application for storing and displaying birth/death dates
 * that may not have complete information.
 */

/**
 * Precision level of a date value.
 * - 'year': Only the year is known (e.g., "1945")
 * - 'month': Year and month are known (e.g., "June 1945")
 * - 'day': Full date is known (e.g., "June 15, 1945")
 */
export type DatePrecision = "year" | "month" | "day"

/**
 * A date value with associated precision metadata.
 */
export interface PartialDate {
  /** Date in YYYY-MM-DD format for PostgreSQL storage */
  date: string
  /** How much of the date is actually known */
  precision: DatePrecision
}

/**
 * Parse various date formats into a PartialDate.
 *
 * Handles:
 * - Year only: 1945 or "1945" → precision='year'
 * - Year+month: "1945-06" or "June 1945" → precision='month'
 * - Full date: "1945-06-15" or "June 15, 1945" → precision='day'
 * - ISO format: "1945-06-15T00:00:00Z" → precision='day'
 *
 * @param value - Date value to parse
 * @returns PartialDate or null if unparseable
 */
export function parsePartialDate(value: string | number | null | undefined): PartialDate | null {
  if (value === null || value === undefined) {
    return null
  }

  // Handle numeric year
  if (typeof value === "number") {
    if (value >= 1800 && value <= 2100) {
      return {
        date: `${value}-01-01`,
        precision: "year",
      }
    }
    return null
  }

  const str = String(value).trim()
  if (!str) {
    return null
  }

  // Year-only format (YYYY)
  if (/^\d{4}$/.test(str)) {
    return {
      date: `${str}-01-01`,
      precision: "year",
    }
  }

  // Year-month format (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(str)) {
    return {
      date: `${str}-01`,
      precision: "month",
    }
  }

  // Full date format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return {
      date: str,
      precision: "day",
    }
  }

  // ISO format with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const datePart = str.split("T")[0]
    return {
      date: datePart,
      precision: "day",
    }
  }

  // Try parsing informal formats like "June 1945" or "June 15, 1945"
  const monthYearMatch = str.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i
  )
  if (monthYearMatch) {
    const months: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    }
    const month = months[monthYearMatch[1].toLowerCase()]
    const year = monthYearMatch[2]
    return {
      date: `${year}-${month}-01`,
      precision: "month",
    }
  }

  // Try parsing full date formats
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return {
      date: `${year}-${month}-${day}`,
      precision: "day",
    }
  }

  return null
}

/**
 * Format a date for display based on its precision.
 *
 * @param date - Date in YYYY-MM-DD format
 * @param precision - How much of the date is known
 * @returns Formatted date string
 *
 * Examples:
 * - ('1945-01-01', 'year') → "1945"
 * - ('1945-06-01', 'month') → "June 1945"
 * - ('1945-06-15', 'day') → "Jun 15, 1945"
 */
export function formatPartialDate(
  date: string | null | undefined,
  precision: DatePrecision = "day"
): string {
  if (!date) {
    return "Unknown"
  }

  // Parse the date - add time component to avoid timezone issues (if not already present)
  const hasTimeComponent = /[T ]\d{2}:\d{2}/.test(date)
  const dateString = hasTimeComponent ? date : `${date}T00:00:00`
  const parsed = new Date(dateString)
  if (isNaN(parsed.getTime())) {
    return "Unknown"
  }

  switch (precision) {
    case "year":
      return parsed.getUTCFullYear().toString()

    case "month":
      return parsed.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })

    case "day":
      return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })

    default:
      return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
  }
}

/**
 * Get the default precision to use when no explicit precision is provided.
 * Null/undefined precision means full day precision (backward compatible).
 */
export function getEffectivePrecision(precision: DatePrecision | null | undefined): DatePrecision {
  return precision ?? "day"
}

/**
 * Determine the precision of a date string by examining its format.
 * Useful when importing data that doesn't have explicit precision metadata.
 *
 * @param value - Date string to analyze
 * @returns Detected precision or null if not a valid date
 */
export function detectPrecision(value: string | null | undefined): DatePrecision | null {
  if (!value) {
    return null
  }

  const str = String(value).trim()

  // Year-only (YYYY)
  if (/^\d{4}$/.test(str)) {
    return "year"
  }

  // Year-month (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(str)) {
    return "month"
  }

  // Full date (YYYY-MM-DD or with time component)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return "day"
  }

  return null
}
