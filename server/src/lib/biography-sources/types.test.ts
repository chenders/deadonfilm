import { describe, it, expect } from "vitest"
import {
  VALID_LIFE_NOTABLE_FACTORS,
  DEFAULT_BIOGRAPHY_CONFIG,
  BiographySourceType,
} from "./types.js"

describe("VALID_LIFE_NOTABLE_FACTORS", () => {
  it("contains all expected tags", () => {
    const expectedTags = [
      "orphaned",
      "adopted",
      "foster_child",
      "single_parent",
      "poverty",
      "wealth",
      "immigrant",
      "refugee",
      "military_service",
      "war_veteran",
      "combat_wounded",
      "pow",
      "scholar",
      "self_taught",
      "dropout",
      "child_star",
      "child_labor",
      "incarcerated",
      "wrongfully_convicted",
      "addiction_recovery",
      "disability",
      "chronic_illness",
      "civil_rights_activist",
      "political_figure",
      "athlete",
      "multiple_careers",
      "turned_down_fame",
      "rags_to_riches",
      "prodigy",
      "polyglot",
      "clergy",
      "royalty",
      "nobility",
      "espionage",
      "holocaust_survivor",
      "cancer_survivor",
      "disaster_survivor",
      "accident_survivor",
      "abuse_survivor",
      "whistleblower",
      "philanthropist",
    ]

    for (const tag of expectedTags) {
      expect(VALID_LIFE_NOTABLE_FACTORS.has(tag)).toBe(true)
    }
    expect(VALID_LIFE_NOTABLE_FACTORS.size).toBe(expectedTags.length)
  })

  it("all tags are lowercase snake_case", () => {
    const snakeCasePattern = /^[a-z][a-z0-9_]*$/
    for (const tag of VALID_LIFE_NOTABLE_FACTORS) {
      expect(tag).toMatch(snakeCasePattern)
    }
  })

  it("has no duplicates", () => {
    const asArray = [...VALID_LIFE_NOTABLE_FACTORS]
    const uniqueSet = new Set(asArray)
    expect(asArray.length).toBe(uniqueSet.size)
  })
})

describe("DEFAULT_BIOGRAPHY_CONFIG", () => {
  it("has sensible confidence threshold", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.confidenceThreshold).toBeGreaterThan(0)
    expect(DEFAULT_BIOGRAPHY_CONFIG.confidenceThreshold).toBeLessThanOrEqual(1)
    // Biography threshold should be >= death threshold (0.5)
    expect(DEFAULT_BIOGRAPHY_CONFIG.confidenceThreshold).toBeGreaterThanOrEqual(0.5)
  })

  it("has sensible reliability threshold", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.reliabilityThreshold).toBeGreaterThan(0)
    expect(DEFAULT_BIOGRAPHY_CONFIG.reliabilityThreshold).toBeLessThanOrEqual(1)
  })

  it("enables reliability threshold by default", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.useReliabilityThreshold).toBe(true)
  })

  it("enables free sources by default", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.sourceCategories.free).toBe(true)
  })

  it("disables AI sources by default", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.sourceCategories.ai).toBe(false)
  })

  it("has positive cost limits", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.costLimits.maxCostPerActor).toBeGreaterThan(0)
    expect(DEFAULT_BIOGRAPHY_CONFIG.costLimits.maxTotalCost).toBeGreaterThan(0)
    expect(DEFAULT_BIOGRAPHY_CONFIG.costLimits.maxTotalCost).toBeGreaterThan(
      DEFAULT_BIOGRAPHY_CONFIG.costLimits.maxCostPerActor
    )
  })

  it("has a valid synthesis model", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.synthesisModel).toBeTruthy()
    expect(typeof DEFAULT_BIOGRAPHY_CONFIG.synthesisModel).toBe("string")
  })

  it("enables Haiku content cleaning by default", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.contentCleaning.haikuEnabled).toBe(true)
    expect(DEFAULT_BIOGRAPHY_CONFIG.contentCleaning.mechanicalOnly).toBe(false)
  })

  it("has a positive limit", () => {
    expect(DEFAULT_BIOGRAPHY_CONFIG.limit).toBeGreaterThan(0)
  })
})

describe("BiographySourceType", () => {
  it("has unique values for all enum members", () => {
    const values = Object.values(BiographySourceType)
    const uniqueValues = new Set(values)
    expect(values.length).toBe(uniqueValues.size)
  })

  it("includes structured data sources", () => {
    expect(BiographySourceType.WIKIDATA_BIO).toBe("wikidata-bio")
    expect(BiographySourceType.WIKIPEDIA_BIO).toBe("wikipedia-bio")
    expect(BiographySourceType.TMDB_BIO).toBe("tmdb-bio")
  })

  it("includes web search sources", () => {
    expect(BiographySourceType.GOOGLE_SEARCH_BIO).toBe("google-search-bio")
    expect(BiographySourceType.BING_SEARCH_BIO).toBe("bing-search-bio")
    expect(BiographySourceType.BRAVE_SEARCH_BIO).toBe("brave-search-bio")
    expect(BiographySourceType.DUCKDUCKGO_BIO).toBe("duckduckgo-bio")
  })

  it("includes AI sources", () => {
    expect(BiographySourceType.GEMINI_BIO).toBe("gemini-bio")
    expect(BiographySourceType.GPT_BIO).toBe("gpt-bio")
    expect(BiographySourceType.GROQ_BIO).toBe("groq-bio")
  })
})
