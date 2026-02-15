import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  buildBiographyPrompt,
  calculateCost,
  determineSourceUrl,
  generateBiography,
  sanitizeActorNameForPrompt,
  sanitizeBiographyForPrompt,
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

  describe("sanitizeActorNameForPrompt", () => {
    it("trims whitespace", () => {
      expect(sanitizeActorNameForPrompt("  John Wayne  ")).toBe("John Wayne")
    })

    it("replaces newlines with spaces", () => {
      expect(sanitizeActorNameForPrompt("John\nWayne")).toBe("John Wayne")
      expect(sanitizeActorNameForPrompt("John\r\nWayne")).toBe("John Wayne")
    })

    it("removes control characters", () => {
      expect(sanitizeActorNameForPrompt("John\x00Wayne")).toBe("JohnWayne")
      expect(sanitizeActorNameForPrompt("John\x1fWayne")).toBe("JohnWayne")
      expect(sanitizeActorNameForPrompt("John\x7fWayne")).toBe("JohnWayne")
    })

    it("collapses multiple spaces", () => {
      expect(sanitizeActorNameForPrompt("John    Wayne")).toBe("John Wayne")
    })

    it("truncates to 200 characters", () => {
      const longName = "A".repeat(250)
      expect(sanitizeActorNameForPrompt(longName)).toHaveLength(200)
    })

    it("handles empty string", () => {
      expect(sanitizeActorNameForPrompt("")).toBe("")
    })

    it("handles normal names unchanged", () => {
      expect(sanitizeActorNameForPrompt("Robert De Niro")).toBe("Robert De Niro")
      expect(sanitizeActorNameForPrompt("Renée Zellweger")).toBe("Renée Zellweger")
    })
  })

  describe("sanitizeBiographyForPrompt", () => {
    it("trims whitespace", () => {
      expect(sanitizeBiographyForPrompt("  Bio text  ")).toBe("Bio text")
    })

    it("normalizes Windows line endings", () => {
      expect(sanitizeBiographyForPrompt("Line1\r\nLine2")).toBe("Line1\nLine2")
    })

    it("normalizes old Mac line endings", () => {
      expect(sanitizeBiographyForPrompt("Line1\rLine2")).toBe("Line1\nLine2")
    })

    it("removes control characters but preserves newlines", () => {
      expect(sanitizeBiographyForPrompt("Bio\x00text")).toBe("Biotext")
      expect(sanitizeBiographyForPrompt("Bio\x09text")).toBe("Biotext") // tab
      expect(sanitizeBiographyForPrompt("Bio\ntext")).toBe("Bio\ntext") // newline preserved
    })

    it("collapses excessive newlines to double newlines", () => {
      expect(sanitizeBiographyForPrompt("Para1\n\n\n\nPara2")).toBe("Para1\n\nPara2")
      expect(sanitizeBiographyForPrompt("Para1\n\n\n\n\n\nPara2")).toBe("Para1\n\nPara2")
    })

    it("truncates to 4000 characters", () => {
      const longBio = "A".repeat(5000)
      expect(sanitizeBiographyForPrompt(longBio)).toHaveLength(4000)
    })

    it("handles empty string", () => {
      expect(sanitizeBiographyForPrompt("")).toBe("")
    })

    it("handles normal biography text unchanged", () => {
      const bio = "John Wayne was an American actor. He appeared in many Western films."
      expect(sanitizeBiographyForPrompt(bio)).toBe(bio)
    })
  })

  describe("buildBiographyPrompt with Wikipedia bio", () => {
    it("includes both TMDB and Wikipedia sections when wikipediaBio is provided", () => {
      const prompt = buildBiographyPrompt(
        "John Wayne",
        "A famous American actor from TMDB.",
        "John Wayne was born Marion Robert Morrison, an American actor and filmmaker."
      )

      expect(prompt).toContain("TMDB BIOGRAPHY:")
      expect(prompt).toContain("WIKIPEDIA BIOGRAPHY:")
      expect(prompt).toContain("A famous American actor from TMDB.")
      expect(prompt).toContain("John Wayne was born Marion Robert Morrison")
      expect(prompt).not.toContain("ORIGINAL BIOGRAPHY:")
    })

    it("uses ORIGINAL BIOGRAPHY section when wikipediaBio is undefined", () => {
      const prompt = buildBiographyPrompt("John Wayne", "A famous American actor.")

      expect(prompt).toContain("ORIGINAL BIOGRAPHY:")
      expect(prompt).toContain("A famous American actor.")
      expect(prompt).not.toContain("TMDB BIOGRAPHY:")
      expect(prompt).not.toContain("WIKIPEDIA BIOGRAPHY:")
    })

    it("uses ORIGINAL BIOGRAPHY section when wikipediaBio is empty string", () => {
      const prompt = buildBiographyPrompt("John Wayne", "A famous American actor.", "")

      expect(prompt).toContain("ORIGINAL BIOGRAPHY:")
      expect(prompt).not.toContain("TMDB BIOGRAPHY:")
      expect(prompt).not.toContain("WIKIPEDIA BIOGRAPHY:")
    })

    it("includes sanitized Wikipedia bio content in the prompt", () => {
      const wikiBio = "  Morrison was raised in  \r\n  Southern California.  "
      const prompt = buildBiographyPrompt("John Wayne", "TMDB bio text.", wikiBio)

      // sanitizeBiographyForPrompt trims whitespace and normalizes line endings
      expect(prompt).toContain("Morrison was raised in")
      expect(prompt).toContain("Southern California.")
      expect(prompt).toContain("WIKIPEDIA BIOGRAPHY:")
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
