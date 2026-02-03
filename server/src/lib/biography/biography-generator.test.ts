import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  buildBiographyPrompt,
  calculateCost,
  determineSourceUrl,
  generateBiography,
  type ActorForBiography,
} from "./biography-generator.js"

// Mock Anthropic
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}))

describe("biography-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("buildBiographyPrompt", () => {
    it("creates prompt with actor name and biography", () => {
      const prompt = buildBiographyPrompt("John Wayne", "A famous American actor.")

      expect(prompt).toContain("John Wayne")
      expect(prompt).toContain("A famous American actor.")
      expect(prompt).toContain("6 lines")
      expect(prompt).toContain("Wikipedia")
    })

    it("includes instructions to remove Wikipedia artifacts", () => {
      const prompt = buildBiographyPrompt("Actor Name", "Biography text")

      expect(prompt).toContain("Wikipedia")
      expect(prompt).toContain("Citation markers")
    })
  })

  describe("calculateCost", () => {
    it("calculates cost based on token counts", () => {
      const inputTokens = 1000
      const outputTokens = 500

      const cost = calculateCost(inputTokens, outputTokens)

      // Cost = (1000 * $3 / 1M) + (500 * $15 / 1M) = $0.003 + $0.0075 = $0.0105
      expect(cost).toBeCloseTo(0.0105, 4)
    })

    it("returns 0 for zero tokens", () => {
      expect(calculateCost(0, 0)).toBe(0)
    })

    it("handles large token counts", () => {
      const cost = calculateCost(100000, 50000)

      // (100000 * 3 / 1M) + (50000 * 15 / 1M) = 0.3 + 0.75 = 1.05
      expect(cost).toBeCloseTo(1.05, 2)
    })
  })

  describe("determineSourceUrl", () => {
    const baseActor: ActorForBiography = {
      id: 1,
      name: "Test Actor",
      tmdbId: 12345,
      wikipediaUrl: null,
      imdbId: null,
    }

    it("returns Wikipedia URL when available", () => {
      const actor = { ...baseActor, wikipediaUrl: "https://en.wikipedia.org/wiki/Test_Actor" }

      const result = determineSourceUrl(actor)

      expect(result).toEqual({
        url: "https://en.wikipedia.org/wiki/Test_Actor",
        type: "wikipedia",
      })
    })

    it("returns TMDB URL when only TMDB ID available", () => {
      const actor = { ...baseActor }

      const result = determineSourceUrl(actor)

      expect(result).toEqual({
        url: "https://www.themoviedb.org/person/12345",
        type: "tmdb",
      })
    })

    it("returns IMDB URL when Wikipedia missing but IMDB available", () => {
      const actor = { ...baseActor, imdbId: "nm1234567", tmdbId: null }

      const result = determineSourceUrl(actor)

      expect(result).toEqual({
        url: "https://www.imdb.com/name/nm1234567",
        type: "imdb",
      })
    })

    it("prioritizes Wikipedia over IMDB", () => {
      const actor = {
        ...baseActor,
        wikipediaUrl: "https://en.wikipedia.org/wiki/Test_Actor",
        imdbId: "nm1234567",
      }

      const result = determineSourceUrl(actor)

      expect(result).not.toBeNull()
      expect(result!.type).toBe("wikipedia")
    })

    it("prioritizes TMDB over IMDB", () => {
      const actor = { ...baseActor, imdbId: "nm1234567" }

      const result = determineSourceUrl(actor)

      expect(result).not.toBeNull()
      expect(result!.type).toBe("tmdb")
    })

    it("returns null when no sources available", () => {
      const actor = { ...baseActor, tmdbId: null }

      const result = determineSourceUrl(actor)

      expect(result).toBeNull()
    })
  })

  describe("generateBiography", () => {
    it("returns hasSubstantiveContent: false for empty input", async () => {
      const actor: ActorForBiography = {
        id: 1,
        name: "Test Actor",
        tmdbId: 12345,
        wikipediaUrl: null,
        imdbId: null,
      }

      const result = await generateBiography(actor, "")

      expect(result.biography).toBeNull()
      expect(result.hasSubstantiveContent).toBe(false)
    })

    it("returns hasSubstantiveContent: false for very short input", async () => {
      const actor: ActorForBiography = {
        id: 1,
        name: "Test Actor",
        tmdbId: 12345,
        wikipediaUrl: null,
        imdbId: null,
      }

      const result = await generateBiography(actor, "Short bio.")

      expect(result.biography).toBeNull()
      expect(result.hasSubstantiveContent).toBe(false)
    })

    it("includes cost as 0 when no API call made", async () => {
      const actor: ActorForBiography = {
        id: 1,
        name: "Test Actor",
        tmdbId: 12345,
        wikipediaUrl: null,
        imdbId: null,
      }

      const result = await generateBiography(actor, "")

      expect(result.costUsd).toBe(0)
    })

    it("returns null source URL for empty biography input", async () => {
      const actor: ActorForBiography = {
        id: 1,
        name: "Test Actor",
        tmdbId: 12345,
        wikipediaUrl: "https://en.wikipedia.org/wiki/Test_Actor",
        imdbId: null,
      }

      // When input is empty, source URL is not populated
      const result = await generateBiography(actor, "")

      expect(result.sourceUrl).toBeNull()
      expect(result.sourceType).toBeNull()
    })
  })
})
