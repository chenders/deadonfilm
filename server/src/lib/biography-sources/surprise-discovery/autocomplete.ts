/**
 * Google Autocomplete client for surprise discovery.
 *
 * Queries Google's autocomplete endpoint with multiple patterns to discover
 * what the public associates with an actor. Each suggestion is tagged with
 * its query pattern for later analysis of which patterns are productive.
 *
 * 57 free HTTP requests per actor, no API key required.
 */

import { getCachedQuery, setCachedQuery } from "../../death-sources/cache.js"
import { logger } from "../../logger.js"
import { BiographySourceType } from "../types.js"
import type { DataSourceType } from "../../death-sources/types.js"
import type { AutocompleteSuggestion } from "./types.js"

const CACHE_SOURCE_TYPE = BiographySourceType.AUTOCOMPLETE_DISCOVERY as unknown as DataSourceType

const AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
const KEYWORD_SUFFIXES = ["why", "did", "secret", "weird", "surprising"]
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("")
const REQUEST_DELAY_MS = 100

/**
 * Result type for fetchAutocompleteSuggestions.
 */
export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[]
  /** True if results came from cache; false if queries were actually run. */
  fromCache: boolean
}

/**
 * Fetches autocomplete suggestions for an actor across 57 query patterns.
 *
 * Runs three pattern groups:
 * - 26 quoted-letter queries: `"Actor Name" a`, `"Actor Name" b`, ...
 * - 26 quoted-space-letter queries: `Actor Name a`, `Actor Name b`, ...
 * - 5 keyword queries: `"Actor Name" why`, `"Actor Name" did`, etc.
 *
 * Deduplicates by extracted term (lowercase association after actor name),
 * keeping the first occurrence across all patterns.
 *
 * @param actorName - Full actor name (e.g. "John Wayne")
 * @returns Deduplicated suggestions with provenance, and a fromCache flag
 */
export async function fetchAutocompleteSuggestions(actorName: string): Promise<AutocompleteResult> {
  // Check cache first
  const cached = await getCachedQuery(CACHE_SOURCE_TYPE, actorName)
  if (cached?.responseRaw) {
    logger.debug({ actorName }, "Autocomplete cache hit")
    return {
      suggestions: cached.responseRaw as AutocompleteSuggestion[],
      fromCache: true,
    }
  }

  const startTime = Date.now()
  const nameLower = actorName.toLowerCase()
  const seen = new Map<string, AutocompleteSuggestion>()

  const queries: Array<{ query: string; pattern: AutocompleteSuggestion["queryPattern"] }> = []

  for (const letter of ALPHABET) {
    queries.push({ query: `"${actorName}" ${letter}`, pattern: "quoted-letter" })
  }
  for (const letter of ALPHABET) {
    queries.push({ query: `${actorName} ${letter}`, pattern: "quoted-space-letter" })
  }
  for (const keyword of KEYWORD_SUFFIXES) {
    queries.push({ query: `"${actorName}" ${keyword}`, pattern: "keyword" })
  }

  for (const { query, pattern } of queries) {
    try {
      const suggestions = await fetchSingleAutocomplete(query)
      for (const suggestion of suggestions) {
        const term = extractTerm(suggestion, nameLower)
        if (!term || seen.has(term)) continue
        seen.set(term, { fullText: suggestion, term, queryPattern: pattern, rawQuery: query })
      }
      if (REQUEST_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS))
      }
    } catch (error) {
      logger.debug({ error, query }, "Autocomplete query failed")
    }
  }

  const results = Array.from(seen.values())

  // Cache results
  await setCachedQuery({
    sourceType: CACHE_SOURCE_TYPE,
    queryString: actorName,
    responseStatus: 200,
    responseData: results,
    responseTimeMs: Date.now() - startTime,
  }).catch((err) => logger.warn({ err }, "Failed to cache autocomplete results"))

  return { suggestions: results, fromCache: false }
}

/**
 * Fetches autocomplete suggestions for a single query string.
 *
 * @param query - The query string to autocomplete
 * @returns Array of suggestion strings, or empty array on failure
 */
async function fetchSingleAutocomplete(query: string): Promise<string[]> {
  const url = new URL(AUTOCOMPLETE_URL)
  url.searchParams.set("client", "firefox")
  url.searchParams.set("q", query)

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
  if (!response.ok) return []

  const data = (await response.json()) as [string, string[]]
  return Array.isArray(data[1]) ? data[1] : []
}

/**
 * Extracts the association term from a suggestion by removing the actor name prefix.
 *
 * Returns null if the suggestion doesn't start with the actor name, or if the
 * actor name is the entire suggestion with nothing after it.
 *
 * @param suggestion - Full suggestion text (lowercased by Google)
 * @param nameLower - Actor name in lowercase
 * @returns The extracted term, or null if not extractable
 */
function extractTerm(suggestion: string, nameLower: string): string | null {
  const lower = suggestion.toLowerCase().trim()
  if (!lower.startsWith(nameLower)) return null
  const remainder = lower.slice(nameLower.length).trim()
  if (!remainder) return null
  return remainder
}
