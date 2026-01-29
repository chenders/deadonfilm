/**
 * Entity linker main API.
 *
 * Orchestrates multiple matching approaches (exact, fuzzy, AI) to identify
 * and link mentions of actors, movies, and TV shows in narrative text.
 */

import type { Pool } from "pg"
import type { EntityLink, LinkingResult, LinkingOptions, StoredEntityLinks } from "./types.js"
import { findExactMatches } from "./exact-matcher.js"
import { findFuzzyMatches } from "./fuzzy-matcher.js"
import { mergeLinks, filterByConfidence, calculateStats } from "./merger.js"

// Re-export types for consumers
export * from "./types.js"

// Default options (excludeActorId intentionally omitted - it's optional)
const DEFAULT_OPTIONS: Omit<Required<LinkingOptions>, "excludeActorId"> & {
  excludeActorId?: number
} = {
  excludeActorId: undefined,
  minConfidence: 0.7,
  enableExact: true,
  enableFuzzy: true,
  enableAI: false, // Disabled by default for cost control
}

/**
 * Link entities in a text string.
 *
 * Runs enabled matchers in sequence:
 * 1. Exact matching (confidence 1.0)
 * 2. Fuzzy matching (confidence 0.8-0.99)
 * 3. AI matching (confidence 0.7-1.0, disabled by default)
 *
 * Merges results with priority ordering (exact > fuzzy > AI).
 *
 * @param db - Database pool
 * @param text - Text to search for entity mentions
 * @param options - Linking configuration options
 * @returns LinkingResult with links and statistics
 */
export async function linkEntities(
  db: Pool,
  text: string,
  options: LinkingOptions = {}
): Promise<LinkingResult> {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Skip empty or very short text
  if (!text || text.length < 5) {
    return {
      links: [],
      stats: { exactMatches: 0, fuzzyMatches: 0, aiMatches: 0, totalLinks: 0 },
    }
  }

  let exactLinks: EntityLink[] = []
  let fuzzyLinks: EntityLink[] = []
  const aiLinks: EntityLink[] = [] // AI matching not implemented yet

  // Step 1: Exact matching
  if (opts.enableExact) {
    exactLinks = await findExactMatches(db, text, opts.excludeActorId)
  }

  // Get ranges already linked by exact matcher
  const linkedRanges = exactLinks.map((l) => ({ start: l.start, end: l.end }))

  // Step 2: Fuzzy matching (skip ranges already linked by exact)
  if (opts.enableFuzzy) {
    fuzzyLinks = await findFuzzyMatches(db, text, linkedRanges, opts.excludeActorId)
  }

  // Step 3: AI matching (not implemented - would go here)
  // if (opts.enableAI) {
  //   const allLinkedRanges = [...linkedRanges, ...fuzzyLinks.map(l => ({ start: l.start, end: l.end }))]
  //   aiLinks = await findAIMatches(db, text, allLinkedRanges, context, opts.excludeActorId)
  // }

  // Merge and deduplicate
  let links = mergeLinks(exactLinks, fuzzyLinks, aiLinks)

  // Apply confidence filter
  links = filterByConfidence(links, opts.minConfidence)

  // Calculate stats
  const stats = calculateStats(links)

  return { links, stats }
}

/**
 * Link entities in multiple text fields.
 *
 * Convenience function for processing multiple fields at once
 * (e.g., circumstances, rumored_circumstances, additional_context).
 *
 * @param db - Database pool
 * @param fields - Object with field names as keys and text as values
 * @param options - Linking configuration options
 * @returns StoredEntityLinks with links keyed by field name
 */
export async function linkMultipleFields(
  db: Pool,
  fields: Record<string, string | null | undefined>,
  options: LinkingOptions = {}
): Promise<StoredEntityLinks> {
  const result: StoredEntityLinks = {}

  for (const [fieldName, text] of Object.entries(fields)) {
    if (!text) continue

    const linkingResult = await linkEntities(db, text, options)

    if (linkingResult.links.length > 0) {
      // Type assertion needed because TypeScript can't infer the field names
      ;(result as Record<string, EntityLink[]>)[fieldName] = linkingResult.links
    }
  }

  return result
}

/**
 * Check if entity links contain any links.
 * Utility function for conditional rendering.
 */
export function hasEntityLinks(links: StoredEntityLinks | null | undefined): boolean {
  if (!links) return false
  return Object.values(links).some((arr) => arr && arr.length > 0)
}
