/**
 * Splits a search string into individual words for multi-word ILIKE matching.
 * Handles edge cases: trims whitespace, filters empty strings.
 * Returns an empty array for blank/whitespace-only input.
 */
export function splitSearchWords(search: string): string[] {
  return search.trim().split(/\s+/).filter(Boolean)
}
