import { formatDistanceToNow, format, parseISO } from "date-fns"

/**
 * Format a date string as relative time (e.g., "about 2 hours ago", "3 days ago").
 * Returns empty string for null/invalid dates.
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    const date = parseISO(dateStr)
    if (Number.isNaN(date.getTime())) return ""
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return ""
  }
}

/**
 * Format a date string as a full readable timestamp for tooltips.
 * e.g., "Feb 16, 2026 at 3:45 PM"
 */
export function formatFullDateTime(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    const date = parseISO(dateStr)
    if (Number.isNaN(date.getTime())) return ""
    return format(date, "MMM d, yyyy 'at' h:mm a")
  } catch {
    return ""
  }
}
