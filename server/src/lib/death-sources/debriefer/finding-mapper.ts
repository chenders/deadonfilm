/**
 * Maps debriefer ScoredFinding[] to deadonfilm RawSourceData[].
 *
 * This is the bridge between debriefer's orchestrator output and deadonfilm's
 * claude-cleanup input. The formats are nearly identical since debriefer was
 * extracted from deadonfilm — both use the same string values for reliability
 * tiers and source types.
 */

import type { ScoredFinding } from "debriefer"
import type { RawSourceData } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"

/** Set of valid DataSourceType string values for O(1) lookup */
const VALID_SOURCE_TYPES = new Set<string>(Object.values(DataSourceType))

/** Set of valid ReliabilityTier string values for O(1) lookup */
const VALID_RELIABILITY_TIERS = new Set<string>(Object.values(ReliabilityTier))

/**
 * Maps a debriefer source type string to deadonfilm's DataSourceType enum.
 * Returns the value as-is if it's a valid enum member, otherwise falls back
 * to DUCKDUCKGO as a generic "web source" fallback (since unknown sources
 * from debriefer are typically web-search-based).
 */
export function mapSourceType(sourceType: string): DataSourceType {
  if (VALID_SOURCE_TYPES.has(sourceType)) {
    return sourceType as DataSourceType
  }
  return DataSourceType.DUCKDUCKGO
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
    }))
}
