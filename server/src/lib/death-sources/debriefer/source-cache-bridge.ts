/**
 * Bridge between debriefer-sources and deadonfilm's source_query_cache table.
 *
 * Writes per-source findings to the cache so they appear in admin analytics
 * and prevent re-fetching on subsequent enrichment runs.
 */

import { setCachedQuery } from "../cache.js"
import { DataSourceType } from "../types.js"
import { mapSourceType } from "./finding-mapper.js"

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
  const sourceType = mapSourceType(sourceName)
  // Skip UNMAPPED sources — they'd pollute the cache with unknown keys
  if (sourceType === DataSourceType.UNMAPPED) return

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
  }).catch(() => {
    // Fire-and-forget — don't block enrichment on cache write failures
  })
}

/**
 * Write a failed source attempt to the cache table.
 * Prevents re-trying sources that consistently fail for a given actor.
 */
export function cacheSourceFailure(actorId: number, sourceName: string, error: string): void {
  const sourceType = mapSourceType(sourceName)
  if (sourceType === DataSourceType.UNMAPPED) return

  setCachedQuery({
    sourceType,
    actorId,
    queryString: `debriefer:${sourceName}:actor:${actorId}`,
    responseStatus: null,
    errorMessage: error,
  }).catch(() => {
    // Fire-and-forget
  })
}
