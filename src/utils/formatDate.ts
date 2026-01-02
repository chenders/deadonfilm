import type { DatePrecision } from "../types/actor"

/**
 * Formats a date string (YYYY-MM-DD or ISO timestamp) to a readable format.
 * Respects precision level for partial dates.
 *
 * Examples with precision='day' (default):
 *   "1977-06-14" → "Jun 14, 1977"
 *   "2025-12-10T08:00:00.000Z" → "Dec 10, 2025"
 *
 * Examples with precision='month':
 *   "1977-06-01" → "June 1977"
 *
 * Examples with precision='year':
 *   "1977-01-01" → "1977"
 *
 * @param dateString - Date in YYYY-MM-DD or ISO format
 * @param precision - How much of the date to display (null defaults to 'day')
 */
export function formatDate(dateString: string | null, precision?: DatePrecision | null): string {
  if (!dateString) return "Unknown"

  // Default precision to 'day' if not specified
  const effectivePrecision = precision ?? "day"

  try {
    // If it's already an ISO timestamp (contains 'T'), parse directly
    // Otherwise add T00:00:00 for consistent timezone handling
    const date = dateString.includes("T")
      ? new Date(dateString)
      : new Date(dateString + "T00:00:00")

    if (isNaN(date.getTime())) return "Unknown"

    switch (effectivePrecision) {
      case "year":
        return date.getFullYear().toString()

      case "month":
        return date.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })

      case "day":
      default:
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
    }
  } catch {
    return dateString
  }
}

/**
 * Gets the year from a release date
 * Example: "1961-10-05" → "1961"
 */
export function getYear(dateString: string | null): string {
  if (!dateString) return "Unknown"
  return dateString.slice(0, 4)
}

/**
 * Calculates age at death
 */
export function calculateAge(birthday: string | null, deathday: string): number | null {
  if (!birthday) return null

  const birth = new Date(birthday)
  const death = new Date(deathday)

  let age = death.getFullYear() - birth.getFullYear()
  const monthDiff = death.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
    age--
  }

  return age
}

/**
 * Calculates current age for living people
 */
export function calculateCurrentAge(birthday: string | null): number | null {
  if (!birthday) return null

  const birth = new Date(birthday)
  const today = new Date()

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age
}

/**
 * Generates decade filter options from current decade down to a minimum
 * Example: In 2025, generates [2020s, 2010s, 2000s, ... down to minDecade]
 */
export function getDecadeOptions(minDecade: number = 1930): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear()
  const currentDecade = Math.floor(currentYear / 10) * 10

  const options: { value: string; label: string }[] = [{ value: "", label: "Any" }]

  for (let decade = currentDecade; decade >= minDecade; decade -= 10) {
    options.push({ value: String(decade), label: `${decade}s` })
  }

  return options
}
