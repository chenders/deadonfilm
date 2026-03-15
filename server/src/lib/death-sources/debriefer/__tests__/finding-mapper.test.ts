import { describe, it, expect } from "vitest"
import { mapFindings, mapSourceType, mapReliabilityTier } from "../finding-mapper.js"
import { DataSourceType, ReliabilityTier } from "../../types.js"
import type { ScoredFinding } from "@debriefer/core"
import { ReliabilityTier as DebrieferTier } from "@debriefer/core"

describe("mapSourceType", () => {
  it("maps deadonfilm-native source types directly", () => {
    expect(mapSourceType("wikipedia")).toBe(DataSourceType.WIKIPEDIA)
    expect(mapSourceType("wikidata")).toBe(DataSourceType.WIKIDATA)
    expect(mapSourceType("reuters")).toBe(DataSourceType.REUTERS)
    expect(mapSourceType("guardian")).toBe(DataSourceType.GUARDIAN)
    expect(mapSourceType("nytimes")).toBe(DataSourceType.NYTIMES)
  })

  it("maps debriefer hyphenated source types via mapping table", () => {
    expect(mapSourceType("google-search")).toBe(DataSourceType.GOOGLE_SEARCH)
    expect(mapSourceType("bing-search")).toBe(DataSourceType.BING_SEARCH)
    expect(mapSourceType("brave-search")).toBe(DataSourceType.BRAVE_SEARCH)
    expect(mapSourceType("duckduckgo-search")).toBe(DataSourceType.DUCKDUCKGO)
    expect(mapSourceType("ap-news")).toBe(DataSourceType.AP_NEWS)
    expect(mapSourceType("bbc-news")).toBe(DataSourceType.BBC_NEWS)
    expect(mapSourceType("washington-post")).toBe(DataSourceType.WASHINGTON_POST)
    expect(mapSourceType("la-times")).toBe(DataSourceType.LA_TIMES)
    expect(mapSourceType("rolling-stone")).toBe(DataSourceType.ROLLING_STONE)
    expect(mapSourceType("new-yorker")).toBe(DataSourceType.NEW_YORKER)
    expect(mapSourceType("national-geographic")).toBe(DataSourceType.NATIONAL_GEOGRAPHIC)
    expect(mapSourceType("google-books")).toBe(DataSourceType.GOOGLE_BOOKS)
    expect(mapSourceType("open-library")).toBe(DataSourceType.OPEN_LIBRARY)
    expect(mapSourceType("chronicling-america")).toBe(DataSourceType.CHRONICLING_AMERICA)
    expect(mapSourceType("internet-archive")).toBe(DataSourceType.INTERNET_ARCHIVE)
    expect(mapSourceType("find-a-grave")).toBe(DataSourceType.FINDAGRAVE)
  })

  it("maps debriefer name-different source types", () => {
    expect(mapSourceType("time")).toBe(DataSourceType.TIME_MAGAZINE)
    expect(mapSourceType("people")).toBe(DataSourceType.PEOPLE_MAGAZINE)
  })

  it("falls back to UNMAPPED for unknown source types", () => {
    expect(mapSourceType("some_future_source")).toBe(DataSourceType.UNMAPPED)
    expect(mapSourceType("")).toBe(DataSourceType.UNMAPPED)
  })
})

describe("mapReliabilityTier", () => {
  it("maps known tiers directly", () => {
    expect(mapReliabilityTier("structured_data")).toBe(ReliabilityTier.STRUCTURED_DATA)
    expect(mapReliabilityTier("tier_1_news")).toBe(ReliabilityTier.TIER_1_NEWS)
    expect(mapReliabilityTier("secondary")).toBe(ReliabilityTier.SECONDARY_COMPILATION)
  })

  it("falls back to UNRELIABLE_UGC for unknown tiers", () => {
    expect(mapReliabilityTier("unknown_tier")).toBe(ReliabilityTier.UNRELIABLE_UGC)
    expect(mapReliabilityTier("")).toBe(ReliabilityTier.UNRELIABLE_UGC)
  })
})

describe("mapFindings", () => {
  const makeFinding = (overrides: Partial<ScoredFinding> = {}): ScoredFinding => ({
    text: "Actor died of natural causes in 2020.",
    url: "https://en.wikipedia.org/wiki/Actor",
    confidence: 0.85,
    costUsd: 0,
    sourceType: "wikipedia",
    sourceName: "Wikipedia",
    reliabilityTier: DebrieferTier.SECONDARY_COMPILATION,
    reliabilityScore: 0.85,
    ...overrides,
  })

  it("maps a single finding correctly", () => {
    const result = mapFindings([makeFinding()])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      sourceName: "Wikipedia",
      sourceType: DataSourceType.WIKIPEDIA,
      text: "Actor died of natural causes in 2020.",
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
    expect(result[0]!.sourceType).toBe(DataSourceType.WIKIDATA)
    expect(result[0]!.reliabilityTier).toBe(ReliabilityTier.STRUCTURED_DATA)
    expect(result[1]!.sourceType).toBe(DataSourceType.GUARDIAN)
    expect(result[1]!.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
  })

  it("filters out findings with empty text", () => {
    const findings: ScoredFinding[] = [
      makeFinding({ text: "" }),
      makeFinding({ text: "   " }),
      makeFinding({ text: "Valid content" }),
    ]

    const result = mapFindings(findings)

    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe("Valid content")
  })

  it("handles findings without urls", () => {
    const result = mapFindings([makeFinding({ url: undefined })])

    expect(result).toHaveLength(1)
    expect(result[0]!.url).toBeUndefined()
  })

  it("falls back gracefully for unknown source types", () => {
    const result = mapFindings([makeFinding({ sourceType: "new_debriefer_source" })])

    expect(result).toHaveLength(1)
    expect(result[0]!.sourceType).toBe(DataSourceType.UNMAPPED)
  })

  it("returns empty array for empty input", () => {
    expect(mapFindings([])).toEqual([])
  })
})
