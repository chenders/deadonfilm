/**
 * Maps debriefer ScoredFinding[] to deadonfilm RawBiographySourceData[].
 *
 * This is the bridge between debriefer's orchestrator output and deadonfilm's
 * biography claude-cleanup input. Debriefer uses hyphenated source type strings
 * (e.g., "ap-news", "google-search") while deadonfilm biography sources use
 * hyphenated enum values with a "-bio" suffix (e.g., "ap-news-bio",
 * "google-search-bio"). This module handles the mapping.
 */

import type { ScoredFinding } from "@debriefer/core"
import type { RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { logger } from "../../logger.js"

const log = logger.child({ name: "bio-finding-mapper" })

/** Set of valid BiographySourceType string values for O(1) lookup */
const VALID_SOURCE_TYPES = new Set<string>(Object.values(BiographySourceType))

/** Set of valid ReliabilityTier string values for O(1) lookup */
const VALID_RELIABILITY_TIERS = new Set<string>(Object.values(ReliabilityTier))

/**
 * Maps debriefer's hyphenated source type strings to deadonfilm's BiographySourceType enum.
 * Most debriefer sources map to a "-bio" suffixed variant. Sources that match directly
 * (e.g., "britannica") don't need an entry here — they pass through via the
 * VALID_SOURCE_TYPES check.
 */
const DEBRIEFER_TO_BIOGRAPHY: Record<string, BiographySourceType> = {
  // Structured Data
  wikidata: BiographySourceType.WIKIDATA_BIO,
  wikipedia: BiographySourceType.WIKIPEDIA_BIO,

  // Reference Sites
  britannica: BiographySourceType.BRITANNICA,
  "biography-com": BiographySourceType.BIOGRAPHY_COM,
  tcm: BiographySourceType.TCM_BIO,
  allmusic: BiographySourceType.ALLMUSIC_BIO,

  // Web Search
  "google-search": BiographySourceType.GOOGLE_SEARCH_BIO,
  "bing-search": BiographySourceType.BING_SEARCH_BIO,
  "brave-search": BiographySourceType.BRAVE_SEARCH_BIO,
  "duckduckgo-search": BiographySourceType.DUCKDUCKGO_BIO,
  duckduckgo: BiographySourceType.DUCKDUCKGO_BIO,

  // News (hyphenated → bio-suffixed)
  guardian: BiographySourceType.GUARDIAN_BIO,
  nytimes: BiographySourceType.NYTIMES_BIO,
  "ap-news": BiographySourceType.AP_NEWS_BIO,
  reuters: BiographySourceType.REUTERS_BIO,
  "bbc-news": BiographySourceType.BBC_NEWS_BIO,
  "washington-post": BiographySourceType.WASHINGTON_POST_BIO,
  people: BiographySourceType.PEOPLE_BIO,
  "la-times": BiographySourceType.LA_TIMES_BIO,
  npr: BiographySourceType.NPR_BIO,
  independent: BiographySourceType.INDEPENDENT_BIO,
  telegraph: BiographySourceType.TELEGRAPH_BIO,
  time: BiographySourceType.TIME_BIO,
  "new-yorker": BiographySourceType.NEW_YORKER_BIO,
  pbs: BiographySourceType.PBS_BIO,
  "rolling-stone": BiographySourceType.ROLLING_STONE_BIO,
  "national-geographic": BiographySourceType.NATIONAL_GEOGRAPHIC_BIO,
  smithsonian: BiographySourceType.SMITHSONIAN_BIO,
  "history-com": BiographySourceType.HISTORY_COM_BIO,

  // Obituary Sites
  legacy: BiographySourceType.LEGACY_BIO,
  "find-a-grave": BiographySourceType.FINDAGRAVE_BIO,

  // Books
  "google-books": BiographySourceType.GOOGLE_BOOKS_BIO,
  "open-library": BiographySourceType.OPEN_LIBRARY_BIO,
  "ia-books": BiographySourceType.IA_BOOKS_BIO,

  // Archives
  "internet-archive": BiographySourceType.INTERNET_ARCHIVE_BIO,
  "chronicling-america": BiographySourceType.CHRONICLING_AMERICA_BIO,
  trove: BiographySourceType.TROVE_BIO,
  europeana: BiographySourceType.EUROPEANA_BIO,
}

/** Tracks unknown source types we've already warned about (avoid log spam) */
const warnedSourceTypes = new Set<string>()

/**
 * Maps a debriefer source type string to deadonfilm's BiographySourceType enum.
 *
 * 1. Check the explicit mapping table (handles debriefer names to bio-suffixed enum values)
 * 2. Check if the value directly exists in BiographySourceType (handles matching names)
 * 3. Try appending "-bio" suffix (e.g., "guardian" -> "guardian-bio")
 * 4. Try underscore-to-hyphen conversion (e.g., "ap_news" -> "ap-news" -> lookup)
 * 5. Log warning and return UNMAPPED for truly unknown types
 */
export function mapSourceType(sourceType: string): BiographySourceType {
  const mapped = DEBRIEFER_TO_BIOGRAPHY[sourceType]
  if (mapped) {
    return mapped
  }
  if (VALID_SOURCE_TYPES.has(sourceType)) {
    return sourceType as BiographySourceType
  }
  // Try appending "-bio" suffix
  const bioSuffixed = `${sourceType}-bio`
  if (VALID_SOURCE_TYPES.has(bioSuffixed)) {
    return bioSuffixed as BiographySourceType
  }
  // Try converting underscores to hyphens, then check again
  const hyphenated = sourceType.replace(/_/g, "-")
  if (VALID_SOURCE_TYPES.has(hyphenated)) {
    return hyphenated as BiographySourceType
  }
  // Try hyphenated + bio suffix
  const hyphenatedBio = `${hyphenated}-bio`
  if (VALID_SOURCE_TYPES.has(hyphenatedBio)) {
    return hyphenatedBio as BiographySourceType
  }
  if (!warnedSourceTypes.has(sourceType)) {
    warnedSourceTypes.add(sourceType)
    log.warn(
      { sourceType },
      "Unmapped debriefer source type — add it to DEBRIEFER_TO_BIOGRAPHY in biography finding-mapper.ts"
    )
  }
  return BiographySourceType.UNMAPPED
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
 * Converts debriefer ScoredFinding[] to deadonfilm RawBiographySourceData[].
 *
 * Filters out findings with empty text since claude-cleanup needs content to work with.
 */
export function mapFindings(findings: ScoredFinding[]): RawBiographySourceData[] {
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
