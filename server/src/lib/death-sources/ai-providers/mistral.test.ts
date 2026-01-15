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

import { MistralSource } from "./mistral.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

describe("MistralSource", () => {
  let source: MistralSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("MISTRAL_API_KEY", "test-api-key")
    source = new MistralSource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Mistral")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.MISTRAL)
    })

    it("is not marked as free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.001)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new MistralSource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Jean-Paul Belmondo",
      birthday: "1933-04-09",
      deathday: "2021-09-06",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 35.0,
    }

    it("returns error when API key is missing", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new MistralSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("returns source entry with correct type", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new MistralSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.source.type).toBe(DataSourceType.MISTRAL)
    })
  })
})
