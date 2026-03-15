/**
 * Maps debriefer ScoredFinding[] to deadonfilm RawSourceData[].
 *
 * This is the bridge between debriefer's orchestrator output and deadonfilm's
 * claude-cleanup input. Debriefer uses hyphenated source type strings
 * (e.g., "ap-news", "google-search") while deadonfilm uses underscored enum
 * values (e.g., "ap_news", "google_search"). This module handles the mapping.
 */

import type { ScoredFinding } from "@debriefer/core"
import type { RawSourceData } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { logger } from "../../logger.js"

const log = logger.child({ name: "finding-mapper" })

/** Set of valid DataSourceType string values for O(1) lookup */
const VALID_SOURCE_TYPES = new Set<string>(Object.values(DataSourceType))

/** Set of valid ReliabilityTier string values for O(1) lookup */
const VALID_RELIABILITY_TIERS = new Set<string>(Object.values(ReliabilityTier))

/**
 * Maps debriefer's hyphenated source type strings to deadonfilm's DataSourceType enum.
 * Sources that match directly (e.g., "wikipedia", "wikidata", "reuters") don't need
 * an entry here — they pass through via the VALID_SOURCE_TYPES check.
 */
const DEBRIEFER_TO_DEADONFILM: Record<string, DataSourceType> = {
  // Web search
  "google-search": DataSourceType.GOOGLE_SEARCH,
  "bing-search": DataSourceType.BING_SEARCH,
  "brave-search": DataSourceType.BRAVE_SEARCH,
  "duckduckgo-search": DataSourceType.DUCKDUCKGO,
  // News (hyphenated → underscored)
  "ap-news": DataSourceType.AP_NEWS,
  "bbc-news": DataSourceType.BBC_NEWS,
  "washington-post": DataSourceType.WASHINGTON_POST,
  "la-times": DataSourceType.LA_TIMES,
  "rolling-stone": DataSourceType.ROLLING_STONE,
  "new-yorker": DataSourceType.NEW_YORKER,
  "national-geographic": DataSourceType.NATIONAL_GEOGRAPHIC,
  // News (name differences)
  time: DataSourceType.TIME_MAGAZINE,
  people: DataSourceType.PEOPLE_MAGAZINE,
  // Books
  "google-books": DataSourceType.GOOGLE_BOOKS,
  "open-library": DataSourceType.OPEN_LIBRARY,
  // Archives
  "chronicling-america": DataSourceType.CHRONICLING_AMERICA,
  "internet-archive": DataSourceType.INTERNET_ARCHIVE,
  // Obituary
  "find-a-grave": DataSourceType.FINDAGRAVE,
}

/** Tracks unknown source types we've already warned about (avoid log spam) */
const warnedSourceTypes = new Set<string>()

/**
 * Maps a debriefer source type string to deadonfilm's DataSourceType enum.
 *
 * 1. Check the explicit mapping table (handles hyphen→underscore and name differences)
 * 2. Check if the value directly exists in DataSourceType (handles matching names like "wikipedia")
 * 3. Try underscore conversion (e.g., "ap-news" → "ap_news")
 * 4. Log warning and return UNMAPPED for truly unknown types
 */
export function mapSourceType(sourceType: string): DataSourceType {
  const mapped = DEBRIEFER_TO_DEADONFILM[sourceType]
  if (mapped) {
    return mapped
  }
  if (VALID_SOURCE_TYPES.has(sourceType)) {
    return sourceType as DataSourceType
  }
  // Try converting hyphens to underscores as a last automatic mapping
  const underscored = sourceType.replace(/-/g, "_")
  if (VALID_SOURCE_TYPES.has(underscored)) {
    return underscored as DataSourceType
  }
  if (!warnedSourceTypes.has(sourceType)) {
    warnedSourceTypes.add(sourceType)
    log.warn(
      { sourceType },
      "Unmapped debriefer source type — add it to DEBRIEFER_TO_DEADONFILM in finding-mapper.ts"
    )
  }
  return DataSourceType.UNMAPPED
}

/**
 * Maps a debriefer ReliabilityTier string to deadonfilm's ReliabilityTier enum.
 * Returns the value as-is if valid, otherwise falls back to UNRELIABLE_UGC.
 */
export function mapReliabilityTier(tier: string): ReliabilityTier {
  if (VALID_RELIABILITY_TIERS.has(tier)) {
    return tier as ReliabilityTier
  }
  return ReliabilityTier.UNRELIABLE_UGC
}

/**
 * Converts debriefer ScoredFinding[] to deadonfilm RawSourceData[].
 *
 * Filters out findings with empty text since claude-cleanup needs content to work with.
 */
export function mapFindings(findings: ScoredFinding[]): RawSourceData[] {
  return findings
    .filter((f) => f.text && f.text.trim().length > 0)
    .map((f) => ({
      sourceName: f.sourceName,
      sourceType: mapSourceType(f.sourceType),
      text: f.text,
      url: f.url,
      confidence: f.confidence,
      reliabilityTier: mapReliabilityTier(String(f.reliabilityTier)),
      reliabilityScore: f.reliabilityScore,
      costUsd: f.costUsd,
    }))
}
