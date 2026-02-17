/**
 * Shared utilities for actor tab components.
 */

import { formatRelativeTime as formatRelative } from "@/utils/formatRelativeTime"

/**
 * Format a date as relative time (e.g., "2 days ago", "about 3 months ago").
 * Returns "Never" for null dates (admin context).
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const result = formatRelative(dateStr)
  return result || "Unknown"
}
