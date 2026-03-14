import { describe, it, expect } from "vitest"
import { mapFindings, mapSourceType, mapReliabilityTier } from "../finding-mapper.js"
import { BiographySourceType } from "../../types.js"
import { ReliabilityTier } from "../../../death-sources/types.js"
import type { ScoredFinding } from "debriefer"
import { ReliabilityTier as DebrieferTier } from "debriefer"

describe("mapSourceType", () => {
  it("maps debriefer source types via explicit mapping table", () => {
    expect(mapSourceType("wikidata")).toBe(BiographySourceType.WIKIDATA_BIO)
    expect(mapSourceType("wikipedia")).toBe(BiographySourceType.WIKIPEDIA_BIO)
    expect(mapSourceType("britannica")).toBe(BiographySourceType.BRITANNICA)
    expect(mapSourceType("biography-com")).toBe(BiographySourceType.BIOGRAPHY_COM)
    expect(mapSourceType("tcm")).toBe(BiographySourceType.TCM_BIO)
    expect(mapSourceType("allmusic")).toBe(BiographySourceType.ALLMUSIC_BIO)
  })

  it("maps web search source types", () => {
    expect(mapSourceType("google-search")).toBe(BiographySourceType.GOOGLE_SEARCH_BIO)
    expect(mapSourceType("bing-search")).toBe(BiographySourceType.BING_SEARCH_BIO)
    expect(mapSourceType("brave-search")).toBe(BiographySourceType.BRAVE_SEARCH_BIO)
    expect(mapSourceType("duckduckgo-search")).toBe(BiographySourceType.DUCKDUCKGO_BIO)
    expect(mapSourceType("duckduckgo")).toBe(BiographySourceType.DUCKDUCKGO_BIO)
  })

  it("maps news source types to bio-suffixed enum values", () => {
    expect(mapSourceType("guardian")).toBe(BiographySourceType.GUARDIAN_BIO)
    expect(mapSourceType("nytimes")).toBe(BiographySourceType.NYTIMES_BIO)
    expect(mapSourceType("ap-news")).toBe(BiographySourceType.AP_NEWS_BIO)
    expect(mapSourceType("reuters")).toBe(BiographySourceType.REUTERS_BIO)
    expect(mapSourceType("bbc-news")).toBe(BiographySourceType.BBC_NEWS_BIO)
    expect(mapSourceType("washington-post")).toBe(BiographySourceType.WASHINGTON_POST_BIO)
    expect(mapSourceType("la-times")).toBe(BiographySourceType.LA_TIMES_BIO)
    expect(mapSourceType("rolling-stone")).toBe(BiographySourceType.ROLLING_STONE_BIO)
    expect(mapSourceType("new-yorker")).toBe(BiographySourceType.NEW_YORKER_BIO)
    expect(mapSourceType("national-geographic")).toBe(BiographySourceType.NATIONAL_GEOGRAPHIC_BIO)
    expect(mapSourceType("people")).toBe(BiographySourceType.PEOPLE_BIO)
    expect(mapSourceType("smithsonian")).toBe(BiographySourceType.SMITHSONIAN_BIO)
    expect(mapSourceType("history-com")).toBe(BiographySourceType.HISTORY_COM_BIO)
  })

  it("maps book and archive source types", () => {
    expect(mapSourceType("google-books")).toBe(BiographySourceType.GOOGLE_BOOKS_BIO)
    expect(mapSourceType("open-library")).toBe(BiographySourceType.OPEN_LIBRARY_BIO)
    expect(mapSourceType("ia-books")).toBe(BiographySourceType.IA_BOOKS_BIO)
    expect(mapSourceType("internet-archive")).toBe(BiographySourceType.INTERNET_ARCHIVE_BIO)
    expect(mapSourceType("chronicling-america")).toBe(BiographySourceType.CHRONICLING_AMERICA_BIO)
    expect(mapSourceType("trove")).toBe(BiographySourceType.TROVE_BIO)
    expect(mapSourceType("europeana")).toBe(BiographySourceType.EUROPEANA_BIO)
  })

  it("falls back via bio-suffix when value is not in the mapping table", () => {
    // "guardian-bio" is a valid BiographySourceType value, so appending "-bio" to "guardian"
    // would find it — but it's also in the explicit mapping table, so it goes through there.
    // This tests the suffix fallback by using a type that could be directly valid.
    expect(mapSourceType("wikidata-bio")).toBe(BiographySourceType.WIKIDATA_BIO)
  })

  it("falls back to UNMAPPED for unknown source types", () => {
    expect(mapSourceType("some_future_source")).toBe(BiographySourceType.UNMAPPED)
    expect(mapSourceType("")).toBe(BiographySourceType.UNMAPPED)
  })
})

describe("mapReliabilityTier", () => {
  it("maps known tiers directly", () => {
    expect(mapReliabilityTier("structured_data")).toBe(ReliabilityTier.STRUCTURED_DATA)
    expect(mapReliabilityTier("tier_1_news")).toBe(ReliabilityTier.TIER_1_NEWS)
    expect(mapReliabilityTier("secondary")).toBe(ReliabilityTier.SECONDARY_COMPILATION)
    expect(mapReliabilityTier("trade_press")).toBe(ReliabilityTier.TRADE_PRESS)
  })

  it("falls back to UNRELIABLE_UGC for unknown tiers", () => {
    expect(mapReliabilityTier("unknown_tier")).toBe(ReliabilityTier.UNRELIABLE_UGC)
    expect(mapReliabilityTier("")).toBe(ReliabilityTier.UNRELIABLE_UGC)
  })
})

describe("mapFindings", () => {
  const makeFinding = (overrides: Partial<ScoredFinding> = {}): ScoredFinding => ({
    text: "Born in a small town, the actor grew up on a farm.",
    url: "https://en.wikipedia.org/wiki/Actor",
    confidence: 0.85,
    costUsd: 0,
    sourceType: "wikipedia",
    sourceName: "Wikipedia",
    reliabilityTier: DebrieferTier.SECONDARY_COMPILATION,
    reliabilityScore: 0.85,
    ...overrides,
  })

  it("maps a single finding correctly with BiographySourceType", () => {
    const result = mapFindings([makeFinding()])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      sourceName: "Wikipedia",
      sourceType: BiographySourceType.WIKIPEDIA_BIO,
      text: "Born in a small town, the actor grew up on a farm.",
      url: "https://en.wikipedia.org/wiki/Actor",
      confidence: 0.85,
      reliabilityTier: ReliabilityTier.SECONDARY_COMPILATION,
      reliabilityScore: 0.85,
      costUsd: 0,
    })
  })

  it("maps multiple findings from different sources", () => {
    const findings: ScoredFinding[] = [
      makeFinding({
        sourceType: "wikidata",
        sourceName: "Wikidata",
        reliabilityTier: DebrieferTier.STRUCTURED_DATA,
        reliabilityScore: 1.0,
      }),
      makeFinding({
        sourceType: "guardian",
        sourceName: "The Guardian",
        reliabilityTier: DebrieferTier.TIER_1_NEWS,
        reliabilityScore: 0.95,
        url: "https://theguardian.com/article",
      }),
    ]

    const result = mapFindings(findings)

    expect(result).toHaveLength(2)
    expect(result[0]!.sourceType).toBe(BiographySourceType.WIKIDATA_BIO)
    expect(result[0]!.reliabilityTier).toBe(ReliabilityTier.STRUCTURED_DATA)
    expect(result[1]!.sourceType).toBe(BiographySourceType.GUARDIAN_BIO)
    expect(result[1]!.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
  })

  it("filters out findings with empty text", () => {
    const findings: ScoredFinding[] = [
      makeFinding({ text: "" }),
      makeFinding({ text: "   " }),
      makeFinding({ text: "Valid biographical content" }),
    ]

    const result = mapFindings(findings)

    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe("Valid biographical content")
  })

  it("handles findings without urls", () => {
    const result = mapFindings([makeFinding({ url: undefined })])

    expect(result).toHaveLength(1)
    expect(result[0]!.url).toBeUndefined()
  })

  it("preserves costUsd from findings", () => {
    const result = mapFindings([makeFinding({ costUsd: 0.005 })])

    expect(result).toHaveLength(1)
    expect(result[0]!.costUsd).toBe(0.005)
  })

  it("falls back gracefully for unknown source types", () => {
    const result = mapFindings([makeFinding({ sourceType: "new_debriefer_source" })])

    expect(result).toHaveLength(1)
    expect(result[0]!.sourceType).toBe(BiographySourceType.UNMAPPED)
  })

  it("returns empty array for empty input", () => {
    expect(mapFindings([])).toEqual([])
  })
})
