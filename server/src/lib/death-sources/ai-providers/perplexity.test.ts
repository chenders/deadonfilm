import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cache module before importing source
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger to avoid file operations during tests
vi.mock("../logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// Create a mock for the OpenAI client's chat.completions.create method
const mockCreate = vi.fn()

// Mock OpenAI module with proper class constructor
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      }
    },
  }
})

import { PerplexitySource } from "./perplexity.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

describe("PerplexitySource", () => {
  let source: PerplexitySource

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockReset()
    vi.stubEnv("PERPLEXITY_API_KEY", "test-api-key")
    source = new PerplexitySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Perplexity")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.PERPLEXITY)
    })

    it("is not marked as free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.005)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new PerplexitySource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Test Actor",
      birthday: "1950-01-01",
      deathday: "2020-06-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 50.0,
    }

    it("returns error when API key is missing", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new PerplexitySource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("extracts death info from API response with multiple sources", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                circumstances: "Died of heart failure at their home after a brief illness.",
                notable_factors: ["sudden"],
                rumored_circumstances: null,
                location_of_death: "New York City, New York",
                confidence: "high",
                sources: [
                  "https://www.nytimes.com/obituary/test-actor",
                  "https://www.bbc.com/news/entertainment-test-actor",
                  "https://variety.com/article/test-actor-death",
                ],
              }),
            },
          },
        ],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBe(
        "Died of heart failure at their home after a brief illness."
      )
      expect(result.data?.locationOfDeath).toBe("New York City, New York")
      // First source URL is stored at top level
      expect(result.source.url).toBe("https://www.nytimes.com/obituary/test-actor")
      // All sources are stored in rawData.parsed.sources
      const rawData = result.source.rawData as { parsed: { sources: string[] } }
      expect(rawData.parsed.sources).toEqual([
        "https://www.nytimes.com/obituary/test-actor",
        "https://www.bbc.com/news/entertainment-test-actor",
        "https://variety.com/article/test-actor-death",
      ])
    })

    it("handles API errors gracefully", async () => {
      mockCreate.mockRejectedValueOnce(new Error("API Error: Rate limited"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Rate limited")
    })

    it("handles empty response gracefully", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                circumstances: null,
                notable_factors: [],
                rumored_circumstances: null,
                location_of_death: null,
                confidence: null,
                sources: [],
              }),
            },
          },
        ],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No death information found")
    })

    it("parses rumored circumstances correctly", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                circumstances: "Found unresponsive at home and pronounced dead at the scene.",
                notable_factors: ["found unresponsive"],
                rumored_circumstances:
                  "Some reports suggested foul play but this was ruled out by investigators.",
                location_of_death: "Los Angeles, California",
                confidence: "medium",
                sources: ["https://tmz.com/news/test-actor"],
              }),
            },
          },
        ],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.rumoredCircumstances).toBe(
        "Some reports suggested foul play but this was ruled out by investigators."
      )
      expect(result.data?.notableFactors).toEqual(["found unresponsive"])
      // Medium confidence should result in 0.65
      expect(result.source.confidence).toBe(0.65)
    })

    it("handles low confidence responses", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                circumstances: "Reportedly died of unknown causes.",
                notable_factors: [],
                rumored_circumstances: null,
                location_of_death: null,
                confidence: "low",
                sources: [],
              }),
            },
          },
        ],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.confidence).toBe(0.45)
    })

    it("parses prose responses when JSON fails", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Test Actor died in 2020 from heart failure. The death was sudden and unexpected.",
            },
          },
        ],
      })

      const result = await source.lookup(testActor)

      // Prose parsing should work and extract some information
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("died")
    })
  })
})
