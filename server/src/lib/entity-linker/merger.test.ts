import { describe, it, expect } from "vitest"
import { mergeLinks, filterByConfidence, calculateStats } from "./merger.js"
import type { EntityLink } from "./types.js"

describe("merger", () => {
  const createLink = (
    start: number,
    end: number,
    method: "exact" | "fuzzy" | "ai",
    confidence = 1.0
  ): EntityLink => ({
    start,
    end,
    text: "test",
    entityType: "actor",
    entityId: 1,
    entitySlug: "test-1",
    matchMethod: method,
    confidence,
  })

  describe("mergeLinks", () => {
    it("includes all non-overlapping links", () => {
      const exactLinks = [createLink(0, 10, "exact")]
      const fuzzyLinks = [createLink(20, 30, "fuzzy")]
      const aiLinks = [createLink(40, 50, "ai")]

      const merged = mergeLinks(exactLinks, fuzzyLinks, aiLinks)

      expect(merged).toHaveLength(3)
    })

    it("prioritizes exact over fuzzy when overlapping", () => {
      const exactLinks = [createLink(0, 15, "exact")]
      const fuzzyLinks = [createLink(10, 25, "fuzzy")] // Overlaps with exact

      const merged = mergeLinks(exactLinks, fuzzyLinks, [])

      expect(merged).toHaveLength(1)
      expect(merged[0].matchMethod).toBe("exact")
    })

    it("prioritizes fuzzy over AI when overlapping", () => {
      const fuzzyLinks = [createLink(0, 15, "fuzzy")]
      const aiLinks = [createLink(10, 25, "ai")] // Overlaps with fuzzy

      const merged = mergeLinks([], fuzzyLinks, aiLinks)

      expect(merged).toHaveLength(1)
      expect(merged[0].matchMethod).toBe("fuzzy")
    })

    it("prioritizes exact over both fuzzy and AI", () => {
      const exactLinks = [createLink(10, 20, "exact")]
      const fuzzyLinks = [createLink(5, 15, "fuzzy")] // Overlaps
      const aiLinks = [createLink(15, 25, "ai")] // Overlaps

      const merged = mergeLinks(exactLinks, fuzzyLinks, aiLinks)

      expect(merged).toHaveLength(1)
      expect(merged[0].matchMethod).toBe("exact")
    })

    it("sorts merged links by start position", () => {
      const exactLinks = [createLink(30, 40, "exact")]
      const fuzzyLinks = [createLink(10, 20, "fuzzy")]
      const aiLinks = [createLink(50, 60, "ai")]

      const merged = mergeLinks(exactLinks, fuzzyLinks, aiLinks)

      expect(merged[0].start).toBe(10)
      expect(merged[1].start).toBe(30)
      expect(merged[2].start).toBe(50)
    })

    it("handles empty arrays", () => {
      const merged = mergeLinks([], [], [])

      expect(merged).toHaveLength(0)
    })

    it("handles overlapping exact and AI with non-overlapping fuzzy", () => {
      const exactLinks = [createLink(0, 10, "exact")]
      const fuzzyLinks = [createLink(20, 30, "fuzzy")]
      const aiLinks = [createLink(5, 15, "ai")] // Overlaps with exact

      const merged = mergeLinks(exactLinks, fuzzyLinks, aiLinks)

      expect(merged).toHaveLength(2)
      expect(merged[0].matchMethod).toBe("exact")
      expect(merged[1].matchMethod).toBe("fuzzy")
    })
  })

  describe("filterByConfidence", () => {
    it("filters out links below threshold", () => {
      const links: EntityLink[] = [
        createLink(0, 10, "exact", 1.0),
        createLink(20, 30, "fuzzy", 0.85),
        createLink(40, 50, "ai", 0.6),
      ]

      const filtered = filterByConfidence(links, 0.7)

      expect(filtered).toHaveLength(2)
      expect(filtered.every((l) => l.confidence >= 0.7)).toBe(true)
    })

    it("keeps links at exactly the threshold", () => {
      const links = [createLink(0, 10, "fuzzy", 0.8)]

      const filtered = filterByConfidence(links, 0.8)

      expect(filtered).toHaveLength(1)
    })

    it("returns empty array when all below threshold", () => {
      const links = [createLink(0, 10, "ai", 0.5), createLink(20, 30, "ai", 0.6)]

      const filtered = filterByConfidence(links, 0.7)

      expect(filtered).toHaveLength(0)
    })

    it("keeps all links when threshold is 0", () => {
      const links = [
        createLink(0, 10, "exact", 1.0),
        createLink(20, 30, "fuzzy", 0.5),
        createLink(40, 50, "ai", 0.1),
      ]

      const filtered = filterByConfidence(links, 0)

      expect(filtered).toHaveLength(3)
    })
  })

  describe("calculateStats", () => {
    it("counts links by match method", () => {
      const links: EntityLink[] = [
        createLink(0, 10, "exact"),
        createLink(20, 30, "exact"),
        createLink(40, 50, "fuzzy"),
        createLink(60, 70, "ai"),
      ]

      const stats = calculateStats(links)

      expect(stats).toEqual({
        exactMatches: 2,
        fuzzyMatches: 1,
        aiMatches: 1,
        totalLinks: 4,
      })
    })

    it("handles empty array", () => {
      const stats = calculateStats([])

      expect(stats).toEqual({
        exactMatches: 0,
        fuzzyMatches: 0,
        aiMatches: 0,
        totalLinks: 0,
      })
    })

    it("handles single match type", () => {
      const links = [createLink(0, 10, "fuzzy"), createLink(20, 30, "fuzzy")]

      const stats = calculateStats(links)

      expect(stats).toEqual({
        exactMatches: 0,
        fuzzyMatches: 2,
        aiMatches: 0,
        totalLinks: 2,
      })
    })
  })
})
