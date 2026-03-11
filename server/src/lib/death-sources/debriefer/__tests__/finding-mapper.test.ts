import { describe, it, expect } from "vitest"
import { mapFindings, mapSourceType, mapReliabilityTier } from "../finding-mapper.js"
import { DataSourceType, ReliabilityTier } from "../../types.js"
import type { ScoredFinding } from "debriefer"
import { ReliabilityTier as DebrieferTier } from "debriefer"

describe("mapSourceType", () => {
  it("maps known source types directly", () => {
    expect(mapSourceType("wikipedia")).toBe(DataSourceType.WIKIPEDIA)
    expect(mapSourceType("google_search")).toBe(DataSourceType.GOOGLE_SEARCH)
    expect(mapSourceType("ap_news")).toBe(DataSourceType.AP_NEWS)
    expect(mapSourceType("findagrave")).toBe(DataSourceType.FINDAGRAVE)
  })

  it("falls back to DUCKDUCKGO for unknown source types", () => {
    expect(mapSourceType("some_future_source")).toBe(DataSourceType.DUCKDUCKGO)
    expect(mapSourceType("")).toBe(DataSourceType.DUCKDUCKGO)
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
    expect(result[0]!.sourceType).toBe(DataSourceType.DUCKDUCKGO)
  })

  it("returns empty array for empty input", () => {
    expect(mapFindings([])).toEqual([])
  })
})
