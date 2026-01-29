import { describe, it, expect } from "vitest"
import { extractPotentialEntities } from "./fuzzy-matcher.js"

describe("fuzzy-matcher", () => {
  describe("extractPotentialEntities", () => {
    it("extracts capitalized word sequences (proper nouns)", () => {
      const text = "He worked with Steven Spielberg on the film."
      const candidates = extractPotentialEntities(text)

      const stevenSpielberg = candidates.find((c) => c.text === "Steven Spielberg")
      expect(stevenSpielberg).toBeDefined()
      expect(stevenSpielberg?.start).toBe(15)
      expect(stevenSpielberg?.end).toBe(31)
    })

    it("extracts quoted titles with double quotes", () => {
      const text = 'He starred in "The Shawshank Redemption" in 1994.'
      const candidates = extractPotentialEntities(text)

      const title = candidates.find((c) => c.text === "The Shawshank Redemption")
      expect(title).toBeDefined()
    })

    it("extracts quoted titles with single quotes", () => {
      const text = "He loved 'Breaking Bad' as a show."
      const candidates = extractPotentialEntities(text)

      const title = candidates.find((c) => c.text === "Breaking Bad")
      expect(title).toBeDefined()
    })

    it('extracts "The X" patterns', () => {
      const text = "She appeared in The Godfather and The Shining."
      const candidates = extractPotentialEntities(text)

      expect(candidates.some((c) => c.text === "The Godfather")).toBe(true)
      expect(candidates.some((c) => c.text === "The Shining")).toBe(true)
    })

    it("skips very short matches", () => {
      const text = "He was the star."
      const candidates = extractPotentialEntities(text)

      // "He" is too short to be extracted
      expect(candidates.every((c) => c.text.length >= 5)).toBe(true)
    })

    it("handles multiple patterns in same text", () => {
      const text = 'John Wayne starred in "The Searchers" directed by John Ford.'
      const candidates = extractPotentialEntities(text)

      expect(candidates.length).toBeGreaterThan(0)
      // Should find multiple candidates
      const names = candidates.map((c) => c.text)
      expect(names).toContain("John Wayne")
      expect(names.some((n) => n.includes("Searchers"))).toBe(true)
    })

    it("returns empty array for text with no entity-like patterns", () => {
      const text = "he was there and did something."
      const candidates = extractPotentialEntities(text)

      // All lowercase text with no proper nouns
      expect(candidates).toHaveLength(0)
    })

    it("handles multi-word proper nouns", () => {
      const text = "Los Angeles was his home and New York City was hers."
      const candidates = extractPotentialEntities(text)

      expect(candidates.some((c) => c.text === "Los Angeles")).toBe(true)
      expect(candidates.some((c) => c.text === "New York City")).toBe(true)
    })

    it("extracts long proper noun sequences", () => {
      const text = "Martin Luther King Junior was influential."
      const candidates = extractPotentialEntities(text)

      expect(candidates.some((c) => c.text === "Martin Luther King Junior")).toBe(true)
    })

    it("ignores quoted text that is too short", () => {
      const text = 'He said "hi" to her.'
      const candidates = extractPotentialEntities(text)

      // "hi" is only 2 characters, should not be extracted
      expect(candidates.every((c) => c.text !== "hi")).toBe(true)
    })

    it("ignores quoted text that is too long", () => {
      const text =
        '"This is a very long sentence that should not be extracted as a potential entity because it exceeds the maximum length limit." He said.'
      const candidates = extractPotentialEntities(text)

      // Very long quotes should not be extracted
      expect(
        candidates.every(
          (c) =>
            !c.text.includes(
              "This is a very long sentence that should not be extracted as a potential entity"
            )
        )
      ).toBe(true)
    })
  })
})
