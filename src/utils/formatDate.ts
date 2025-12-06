/**
 * Formats a date string (YYYY-MM-DD) to a readable format
 * Example: "1977-06-14" → "Jun 14, 1977"
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown"

  try {
    const date = new Date(dateString + "T00:00:00") // Ensure consistent parsing
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return dateString
  }
}

/**
 * Formats a date to show just month and day
 * Example: "1977-06-14" → "Jun 14"
 */
export function formatMonthDay(dateString: string): string {
  try {
    const date = new Date(dateString + "T00:00:00")
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
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
