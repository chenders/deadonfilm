/**
 * Link merger and deduplication for entity links.
 *
 * Merges links from multiple matching approaches, handling overlaps
 * with priority ordering: exact > fuzzy > AI.
 */

import type { EntityLink } from "./types.js"

/**
 * Check if a link overlaps with any other link
 */
function overlapsAny(link: EntityLink, others: EntityLink[]): boolean {
  return others.some(
    (other) =>
      (link.start >= other.start && link.start < other.end) ||
      (link.end > other.start && link.end <= other.end) ||
      (link.start <= other.start && link.end >= other.end)
  )
}

/**
 * Merge links from multiple approaches, handling overlaps.
 *
 * Priority ordering (when overlapping):
 * 1. Exact matches (confidence 1.0)
 * 2. Fuzzy matches (confidence 0.8-0.99)
 * 3. AI matches (confidence 0.7-1.0)
 *
 * Non-overlapping links from all approaches are included.
 *
 * @param exactLinks - Links from exact matching (highest priority)
 * @param fuzzyLinks - Links from fuzzy matching
 * @param aiLinks - Links from AI matching (lowest priority)
 * @returns Merged, deduplicated links sorted by position
 */
export function mergeLinks(
  exactLinks: EntityLink[],
  fuzzyLinks: EntityLink[],
  aiLinks: EntityLink[]
): EntityLink[] {
  const merged: EntityLink[] = []

  // Add all exact matches (highest priority)
  merged.push(...exactLinks)

  // Add fuzzy matches that don't overlap with exact
  for (const fuzzy of fuzzyLinks) {
    if (!overlapsAny(fuzzy, merged)) {
      merged.push(fuzzy)
    }
  }

  // Add AI matches that don't overlap with exact or fuzzy
  for (const ai of aiLinks) {
    if (!overlapsAny(ai, merged)) {
      merged.push(ai)
    }
  }

  // Sort by start position for consistent rendering
  merged.sort((a, b) => a.start - b.start)

  return merged
}

/**
 * Filter links by minimum confidence threshold.
 *
 * @param links - Links to filter
 * @param minConfidence - Minimum confidence (0.0-1.0)
 * @returns Filtered links meeting confidence threshold
 */
export function filterByConfidence(links: EntityLink[], minConfidence: number): EntityLink[] {
  return links.filter((link) => link.confidence >= minConfidence)
}

/**
 * Calculate linking statistics from merged results.
 */
export function calculateStats(links: EntityLink[]): {
  exactMatches: number
  fuzzyMatches: number
  aiMatches: number
  totalLinks: number
} {
  return {
    exactMatches: links.filter((l) => l.matchMethod === "exact").length,
    fuzzyMatches: links.filter((l) => l.matchMethod === "fuzzy").length,
    aiMatches: links.filter((l) => l.matchMethod === "ai").length,
    totalLinks: links.length,
  }
}
