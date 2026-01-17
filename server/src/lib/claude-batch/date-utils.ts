/**
 * Date normalization utilities for handling PostgreSQL date fields
 * and partial dates (YYYY, YYYY-MM).
 */

/**
 * Safely normalizes a date value to YYYY-MM-DD string format.
 * Handles:
 * - Date objects (from PostgreSQL)
 * - Strings in YYYY-MM-DD format
 * - Strings that are just a year (YYYY) -> converts to YYYY-01-01
 * - Strings that are year+month (YYYY-MM) -> converts to YYYY-MM-01
 * - null/undefined values
 *
 * @param value - Date object, string, null, or undefined
 * @returns YYYY-MM-DD string or null if invalid/empty
 */
export function normalizeDateToString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  // Handle Date objects from PostgreSQL
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null // Invalid date
    }
    // Use UTC methods to avoid timezone shifts
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  // Handle strings
  const str = String(value).trim()
  if (!str) {
    return null
  }

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // Year-only format (YYYY) - validate reasonable year range
  if (/^\d{4}$/.test(str)) {
    const year = Number(str)
    if (year < 1800 || year > 2100) {
      return null
    }
    return `${str}-01-01`
  }

  // Year-month format (YYYY-MM) - validate month range
  if (/^\d{4}-\d{2}$/.test(str)) {
    const monthNum = Number(str.slice(5, 7))
    if (monthNum < 1 || monthNum > 12) {
      return null
    }
    return `${str}-01`
  }

  // Try parsing as a date string and normalizing
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Safely extracts year from a date value.
 * @returns Year as number, or null if invalid/empty
 */
export function getYearFromDate(value: Date | string | null | undefined): number | null {
  const normalized = normalizeDateToString(value)
  if (!normalized) {
    return null
  }
  const year = parseInt(normalized.split("-")[0], 10)
  return isNaN(year) ? null : year
}

/**
 * Safely extracts month and day from a date value.
 * Handles partial dates (year-only, year+month).
 *
 * @returns Object with month and day (nullable if partial date), or null if invalid input
 *
 * Examples:
 * - Date object "1945-06-15" -> { month: "06", day: "15" }
 * - "1945-06-15" -> { month: "06", day: "15" }
 * - "1945-06" -> { month: "06", day: null }
 * - "1945" -> { month: null, day: null }
 * - null -> null
 */
export function getMonthDayFromDate(
  value: Date | string | null | undefined
): { month: string | null; day: string | null } | null {
  if (value === null || value === undefined) {
    return null
  }

  // Handle Date objects - always have full precision
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null
    }
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return { month, day }
  }

  // Handle strings - check for partial formats
  const str = String(value).trim()
  if (!str) {
    return null
  }

  // Year-only format (YYYY)
  if (/^\d{4}$/.test(str)) {
    return { month: null, day: null }
  }

  // Year-month format (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(str)) {
    return { month: str.split("-")[1], day: null }
  }

  // Full date format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split("-")
    return { month: parts[1], day: parts[2] }
  }

  // Try parsing as a date string
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return { month, day }
  }

  return null
}

/**
 * Get birth year from a date value.
 * Convenience alias for getYearFromDate.
 */
export function getBirthYear(birthday: Date | string | null | undefined): number | null {
  return getYearFromDate(birthday)
}

/**
 * Get death year from a date value.
 * Convenience alias for getYearFromDate.
 */
export function getDeathYear(deathday: Date | string | null | undefined): number | null {
  return getYearFromDate(deathday)
}
