/**
 * Shared utilities for backfill scripts.
 */

/**
 * Check if an error is permanent (e.g., 404 Not Found) vs transient (e.g., network timeout).
 * Permanent errors should not be retried as they indicate the resource doesn't exist or access is denied.
 */
export function isPermanentError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const permanentErrorPattern = /(404|not found|400|bad request|401|unauthorized)/
  return permanentErrorPattern.test(errorMsg)
}
