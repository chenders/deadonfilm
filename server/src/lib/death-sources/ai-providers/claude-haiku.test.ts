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

// Create a mock for the Anthropic client's messages.create method
const mockCreate = vi.fn()

// Mock @anthropic-ai/sdk with proper class constructor
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

import { ClaudeHaikuDeathSource } from "./claude-haiku.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

describe("ClaudeHaikuDeathSource", () => {
  let source: ClaudeHaikuDeathSource

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockReset()
    vi.stubEnv("ANTHROPIC_API_KEY", "test-api-key")
    source = new ClaudeHaikuDeathSource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Claude Haiku")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.CLAUDE_HAIKU)
    })

    it("is not marked as free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.0001)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      delete process.env.ANTHROPIC_API_KEY
      const sourceWithoutKey = new ClaudeHaikuDeathSource()
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
      delete process.env.ANTHROPIC_API_KEY
      const sourceWithoutKey = new ClaudeHaikuDeathSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Anthropic API key not configured")
    })

    it("parses successful response with death circumstances", async () => {
      const mockResponse = JSON.stringify({
        circumstances: "Died of heart failure at age 70",
        confidence: "high",
        notable_factors: ["natural_causes"],
        location_of_death: "Los Angeles, CA",
        sources: ["https://example.com/obituary"],
      })

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: mockResponse }],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBe("Died of heart failure at age 70")
      expect(result.data?.locationOfDeath).toBe("Los Angeles, CA")
      expect(result.data?.notableFactors).toEqual(["natural_causes"])
    })

    it("returns error when response has no death information", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "{}" }],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No death information in response")
    })

    it("handles API errors gracefully", async () => {
      mockCreate.mockRejectedValue(new Error("API rate limit exceeded"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("API rate limit exceeded")
    })

    it("calls Anthropic API with correct model and temperature", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ circumstances: "Test" }) }],
      })

      await source.lookup(testActor)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-haiku-4-5-20251001",
          temperature: 0,
          max_tokens: 2000,
        })
      )
    })
  })
})
