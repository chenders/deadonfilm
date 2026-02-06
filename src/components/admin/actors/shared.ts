/**
 * Shared utilities for actor tab components.
 */

/**
 * Format a date as relative time (e.g., "2 days ago", "3 months ago")
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  // Handle future dates (defensive)
  if (diffMs < 0) {
    return "Just now"
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? "s" : ""} ago`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} year${years > 1 ? "s" : ""} ago`
}
