/**
 * Bridge between debriefer-sources and deadonfilm's source_query_cache table.
 *
 * Writes per-source findings to the cache for admin visibility and analytics.
 * Note: debriefer-sources don't read from this cache — cache reads are handled
 * by BaseDataSource for legacy sources only.
 */

import { setCachedQuery } from "../cache.js"
import { DataSourceType } from "../types.js"
import { logger } from "../../logger.js"

const log = logger.child({ name: "source-cache-bridge" })

/**
 * Maps debriefer source display names to DataSourceType.
 * Lifecycle hooks receive the source's `name` property (e.g., "Google Search"),
 * not the `type` property (e.g., "google-search"). This table handles the mapping.
 */
const SOURCE_NAME_TO_TYPE: Record<string, DataSourceType> = {
  Wikidata: DataSourceType.WIKIDATA,
  Wikipedia: DataSourceType.WIKIPEDIA,
  "Google Search": DataSourceType.GOOGLE_SEARCH,
  "Bing Search": DataSourceType.BING_SEARCH,
  "Brave Search": DataSourceType.BRAVE_SEARCH,
  DuckDuckGo: DataSourceType.DUCKDUCKGO,
  "AP News": DataSourceType.AP_NEWS,
  "BBC News": DataSourceType.BBC_NEWS,
  Reuters: DataSourceType.REUTERS,
  "The Guardian": DataSourceType.GUARDIAN,
  "New York Times": DataSourceType.NYTIMES,
  NPR: DataSourceType.NPR,
  "The Independent": DataSourceType.INDEPENDENT,
  "The Telegraph": DataSourceType.TELEGRAPH,
  "Washington Post": DataSourceType.WASHINGTON_POST,
  "Los Angeles Times": DataSourceType.LA_TIMES,
  Time: DataSourceType.TIME_MAGAZINE,
  "The New Yorker": DataSourceType.NEW_YORKER,
  PBS: DataSourceType.PBS,
  "Rolling Stone": DataSourceType.ROLLING_STONE,
  "National Geographic": DataSourceType.NATIONAL_GEOGRAPHIC,
  People: DataSourceType.PEOPLE_MAGAZINE,
  "Find a Grave": DataSourceType.FINDAGRAVE,
  "Legacy.com": DataSourceType.LEGACY,
  "Google Books": DataSourceType.GOOGLE_BOOKS,
  "Open Library": DataSourceType.OPEN_LIBRARY,
  "Chronicling America": DataSourceType.CHRONICLING_AMERICA,
  Trove: DataSourceType.TROVE,
  Europeana: DataSourceType.EUROPEANA,
  "Internet Archive": DataSourceType.INTERNET_ARCHIVE,
}

export function resolveSourceType(sourceName: string): DataSourceType | null {
  return SOURCE_NAME_TO_TYPE[sourceName] ?? null
}

/**
 * Write a successful source finding to the cache table.
 * Fire-and-forget — cache write failures should not block enrichment.
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
    sourceType,
    actorId,
    queryString: `debriefer:${sourceName}:actor:${actorId}`,
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
    sourceType,
    actorId,
    queryString: `debriefer:${sourceName}:actor:${actorId}`,
    responseStatus: null,
    errorMessage: error,
    costUsd: costUsd ?? null,
  }).catch((err) => {
    log.debug({ err, sourceName, actorId }, "Cache write failed (non-blocking)")
  })
}
