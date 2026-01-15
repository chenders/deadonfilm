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

import { GroqLlamaSource } from "./groq.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

describe("GroqLlamaSource", () => {
  let source: GroqLlamaSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GROQ_API_KEY", "test-api-key")
    source = new GroqLlamaSource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Groq (Llama)")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.LLAMA_GROQ)
    })

    it("is not marked as free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.0002)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new GroqLlamaSource()
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
      const sourceWithoutKey = new GroqLlamaSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("returns source entry with correct type", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new GroqLlamaSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.source.type).toBe(DataSourceType.LLAMA_GROQ)
    })
  })
})
