/**
 * Bridge between debriefer-sources and deadonfilm's source_query_cache table
 * for biography enrichment.
 *
 * Writes per-source findings to the cache for admin visibility and analytics.
 * Uses BiographySourceType values (e.g., "wikipedia-bio") instead of
 * DataSourceType values (e.g., "wikipedia") used by the death enrichment bridge.
 *
 * Note: The cache module is typed for DataSourceType, so we cast via
 * `as unknown as DataSourceType` — this is the documented wart from
 * enrichment-infrastructure.md.
 */

import { setCachedQuery } from "../../death-sources/cache.js"
import type { DataSourceType } from "../../death-sources/types.js"
import { BiographySourceType } from "../types.js"
import { logger } from "../../logger.js"

const log = logger.child({ name: "bio-source-cache-bridge" })

/**
 * Maps debriefer source display names to BiographySourceType.
 * Lifecycle hooks receive the source's `name` property (e.g., "Google Search"),
 * not the `type` property (e.g., "google-search-bio"). This table handles the mapping.
 */
const SOURCE_NAME_TO_TYPE: Record<string, BiographySourceType> = {
  // Structured Data
  Wikidata: BiographySourceType.WIKIDATA_BIO,
  Wikipedia: BiographySourceType.WIKIPEDIA_BIO,

  // Reference Sites
  Britannica: BiographySourceType.BRITANNICA,
  "Biography.com": BiographySourceType.BIOGRAPHY_COM,
  TCM: BiographySourceType.TCM_BIO,
  AllMusic: BiographySourceType.ALLMUSIC_BIO,

  // Web Search
  "Google Search": BiographySourceType.GOOGLE_SEARCH_BIO,
  "Bing Search": BiographySourceType.BING_SEARCH_BIO,
  "Brave Search": BiographySourceType.BRAVE_SEARCH_BIO,
  DuckDuckGo: BiographySourceType.DUCKDUCKGO_BIO,

  // News Sources
  "AP News": BiographySourceType.AP_NEWS_BIO,
  "BBC News": BiographySourceType.BBC_NEWS_BIO,
  Reuters: BiographySourceType.REUTERS_BIO,
  "The Guardian": BiographySourceType.GUARDIAN_BIO,
  "New York Times": BiographySourceType.NYTIMES_BIO,
  NPR: BiographySourceType.NPR_BIO,
  "The Independent": BiographySourceType.INDEPENDENT_BIO,
  "The Telegraph": BiographySourceType.TELEGRAPH_BIO,
  "Washington Post": BiographySourceType.WASHINGTON_POST_BIO,
  "Los Angeles Times": BiographySourceType.LA_TIMES_BIO,
  Time: BiographySourceType.TIME_BIO,
  "The New Yorker": BiographySourceType.NEW_YORKER_BIO,
  PBS: BiographySourceType.PBS_BIO,
  "Rolling Stone": BiographySourceType.ROLLING_STONE_BIO,
  "National Geographic": BiographySourceType.NATIONAL_GEOGRAPHIC_BIO,
  People: BiographySourceType.PEOPLE_BIO,
  Smithsonian: BiographySourceType.SMITHSONIAN_BIO,
  "History.com": BiographySourceType.HISTORY_COM_BIO,

  // Obituary Sites
  "Find a Grave": BiographySourceType.FINDAGRAVE_BIO,
  "Legacy.com": BiographySourceType.LEGACY_BIO,

  // Books
  "Google Books": BiographySourceType.GOOGLE_BOOKS_BIO,
  "Open Library": BiographySourceType.OPEN_LIBRARY_BIO,
  "IA Books": BiographySourceType.IA_BOOKS_BIO,

  // Archives
  "Chronicling America": BiographySourceType.CHRONICLING_AMERICA_BIO,
  Trove: BiographySourceType.TROVE_BIO,
  Europeana: BiographySourceType.EUROPEANA_BIO,
  "Internet Archive": BiographySourceType.INTERNET_ARCHIVE_BIO,
}

/** Tracks unknown source names we've already warned about (avoid log spam) */
const warnedUnknownNames = new Set<string>()

export function resolveSourceType(sourceName: string): BiographySourceType | null {
  const mapped = SOURCE_NAME_TO_TYPE[sourceName]
  if (!mapped && sourceName && !warnedUnknownNames.has(sourceName)) {
    warnedUnknownNames.add(sourceName)
    log.warn(
      { sourceName },
      "Unmapped debriefer source name — add to SOURCE_NAME_TO_TYPE in biography source-cache-bridge.ts"
    )
  }
  return mapped ?? null
}

/**
 * Write a successful source finding to the cache table.
 * Fire-and-forget — cache write failures should not block enrichment.
 *
 * Casts BiographySourceType to DataSourceType for the cache module,
 * which is typed for death enrichment but shared by both systems.
 */
export function cacheSourceFinding(
  actorId: number,
  sourceName: string,
  finding: { text: string; confidence: number; url?: string },
  costUsd: number
): void {
  const sourceType = resolveSourceType(sourceName)
  if (!sourceType) return

  setCachedQuery({
    sourceType: sourceType as unknown as DataSourceType,
    actorId,
    queryString: `debriefer-bio:${sourceName}:actor:${actorId}`,
    responseStatus: 200,
    responseData: {
      text: finding.text,
      confidence: finding.confidence,
      url: finding.url,
    },
    costUsd,
  }).catch((err) => {
    log.debug({ err, sourceName, actorId }, "Cache write failed (non-blocking)")
  })
}

/**
 * Write a failed source attempt to the cache table.
 */
export function cacheSourceFailure(
  actorId: number,
  sourceName: string,
  error: string,
  costUsd?: number
): void {
  const sourceType = resolveSourceType(sourceName)
  if (!sourceType) return

  setCachedQuery({
    sourceType: sourceType as unknown as DataSourceType,
    actorId,
    queryString: `debriefer-bio:${sourceName}:actor:${actorId}`,
    responseStatus: 500,
    errorMessage: error,
    costUsd: costUsd ?? null,
  }).catch((err) => {
    log.debug({ err, sourceName, actorId }, "Cache write failed (non-blocking)")
  })
}
