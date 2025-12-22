import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import {
  parsePositiveInt,
  parsePhase,
  shouldAbortDueToErrors,
  filterShowsByPopularity,
  processShowsPage,
  PHASE_THRESHOLDS,
  type ImportPhase,
} from "./import-shows.js"

describe("parsePositiveInt", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("500")).toBe(500)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("truncates decimal values to integers", () => {
    // JavaScript parseInt truncates decimals, so "1.5" becomes 1
    expect(parsePositiveInt("1.5")).toBe(1)
    expect(parsePositiveInt("3.14")).toBe(3)
  })

  it("throws for non-numeric strings", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
  })

  it("parses leading digits from mixed strings", () => {
    // JavaScript parseInt stops at first non-digit, so "12abc" becomes 12
    expect(parsePositiveInt("12abc")).toBe(12)
  })

  it("throws for whitespace", () => {
    expect(() => parsePositiveInt(" ")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("\t")).toThrow(InvalidArgumentError)
  })
})

describe("parsePhase", () => {
  it("parses valid phase values", () => {
    expect(parsePhase("popular")).toBe("popular")
    expect(parsePhase("standard")).toBe("standard")
    expect(parsePhase("obscure")).toBe("obscure")
  })

  it("throws for invalid phase values", () => {
    expect(() => parsePhase("invalid")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("invalid")).toThrow("Phase must be: popular, standard, or obscure")
  })

  it("throws for empty string", () => {
    expect(() => parsePhase("")).toThrow(InvalidArgumentError)
  })

  it("throws for similar but incorrect values", () => {
    expect(() => parsePhase("Popular")).toThrow(InvalidArgumentError) // case-sensitive
    expect(() => parsePhase("POPULAR")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("pop")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("std")).toThrow(InvalidArgumentError)
  })
})

describe("PHASE_THRESHOLDS", () => {
  it("has correct thresholds for popular phase", () => {
    expect(PHASE_THRESHOLDS.popular.min).toBe(50)
    expect(PHASE_THRESHOLDS.popular.max).toBe(Infinity)
  })

  it("has correct thresholds for standard phase", () => {
    expect(PHASE_THRESHOLDS.standard.min).toBe(10)
    expect(PHASE_THRESHOLDS.standard.max).toBe(50)
  })

  it("has correct thresholds for obscure phase", () => {
    expect(PHASE_THRESHOLDS.obscure.min).toBe(0)
    expect(PHASE_THRESHOLDS.obscure.max).toBe(10)
  })

  it("has non-overlapping ranges", () => {
    // obscure: 0-10, standard: 10-50, popular: 50+
    // Boundary check: standard.min === obscure.max
    expect(PHASE_THRESHOLDS.standard.min).toBe(PHASE_THRESHOLDS.obscure.max)
    // popular.min === standard.max
    expect(PHASE_THRESHOLDS.popular.min).toBe(PHASE_THRESHOLDS.standard.max)
  })
})

describe("shouldAbortDueToErrors", () => {
  describe("with default minShowsForRateCheck (10)", () => {
    it("returns false when error count is low", () => {
      expect(shouldAbortDueToErrors(5, 100)).toBe(false)
      expect(shouldAbortDueToErrors(10, 100)).toBe(false)
    })

    it("returns false when not enough shows processed", () => {
      // 11 errors but only 5 shows processed (below minShowsForRateCheck)
      expect(shouldAbortDueToErrors(11, 5)).toBe(false)
      expect(shouldAbortDueToErrors(11, 9)).toBe(false)
    })

    it("returns false when error rate is below 10%", () => {
      // 11 errors, 200 shows = 5.5% error rate
      expect(shouldAbortDueToErrors(11, 200)).toBe(false)
      // 15 errors, 200 shows = 7.5% error rate
      expect(shouldAbortDueToErrors(15, 200)).toBe(false)
    })

    it("returns true when all conditions are met", () => {
      // 12 errors, 100 shows = 12% error rate, >10 errors, >10 shows
      expect(shouldAbortDueToErrors(12, 100)).toBe(true)
      // 11 errors, 10 shows = 110% error rate
      expect(shouldAbortDueToErrors(11, 10)).toBe(true)
    })

    it("handles edge case at exactly 10% error rate", () => {
      // 11 errors, 110 shows = exactly 10%, should NOT abort (needs >10%)
      expect(shouldAbortDueToErrors(11, 110)).toBe(false)
      // 12 errors, 110 shows = 10.9%, should abort
      expect(shouldAbortDueToErrors(12, 110)).toBe(true)
    })

    it("handles edge case at exactly 10 errors", () => {
      // Exactly 10 errors should NOT abort (needs >10)
      expect(shouldAbortDueToErrors(10, 50)).toBe(false)
    })

    it("handles edge case at exactly minShowsForRateCheck shows", () => {
      // 11 errors, exactly 10 shows = 110% error rate, should abort
      expect(shouldAbortDueToErrors(11, 10)).toBe(true)
    })
  })

  describe("with custom minShowsForRateCheck", () => {
    it("respects custom minimum shows threshold", () => {
      // 11 errors, 15 shows, but minShowsForRateCheck=20
      expect(shouldAbortDueToErrors(11, 15, 20)).toBe(false)
      // 11 errors, 20 shows, minShowsForRateCheck=20
      expect(shouldAbortDueToErrors(11, 20, 20)).toBe(true)
    })
  })
})

describe("filterShowsByPopularity", () => {
  const testShows = [
    { popularity: 100 },
    { popularity: 75 },
    { popularity: 50 },
    { popularity: 49 },
    { popularity: 25 },
    { popularity: 10 },
    { popularity: 9 },
    { popularity: 5 },
    { popularity: 0 },
    { popularity: undefined },
  ]

  it("filters popular shows (popularity >= 50)", () => {
    const result = filterShowsByPopularity(testShows, "popular")
    expect(result).toHaveLength(3)
    expect(result.map((s) => s.popularity)).toEqual([100, 75, 50])
  })

  it("filters standard shows (10 <= popularity < 50)", () => {
    const result = filterShowsByPopularity(testShows, "standard")
    expect(result).toHaveLength(3)
    expect(result.map((s) => s.popularity)).toEqual([49, 25, 10])
  })

  it("filters obscure shows (popularity < 10)", () => {
    const result = filterShowsByPopularity(testShows, "obscure")
    expect(result).toHaveLength(4) // 9, 5, 0, undefined (treated as 0)
    expect(result.map((s) => s.popularity)).toEqual([9, 5, 0, undefined])
  })

  it("treats undefined popularity as 0", () => {
    const shows = [{ popularity: undefined }]
    expect(filterShowsByPopularity(shows, "obscure")).toHaveLength(1)
    expect(filterShowsByPopularity(shows, "standard")).toHaveLength(0)
    expect(filterShowsByPopularity(shows, "popular")).toHaveLength(0)
  })

  it("returns empty array when no shows match", () => {
    const popularOnly = [{ popularity: 100 }, { popularity: 80 }]
    expect(filterShowsByPopularity(popularOnly, "obscure")).toHaveLength(0)
    expect(filterShowsByPopularity(popularOnly, "standard")).toHaveLength(0)
  })

  it("handles empty input array", () => {
    expect(filterShowsByPopularity([], "popular")).toHaveLength(0)
    expect(filterShowsByPopularity([], "standard")).toHaveLength(0)
    expect(filterShowsByPopularity([], "obscure")).toHaveLength(0)
  })

  it("handles boundary values correctly", () => {
    // Test exact boundary values
    const boundaryShows = [
      { popularity: 50 }, // Should be popular (>= 50)
      { popularity: 49.99 }, // Should be standard (< 50, >= 10)
      { popularity: 10 }, // Should be standard (>= 10)
      { popularity: 9.99 }, // Should be obscure (< 10)
    ]

    expect(filterShowsByPopularity(boundaryShows, "popular")).toHaveLength(1)
    expect(filterShowsByPopularity(boundaryShows, "standard")).toHaveLength(2)
    expect(filterShowsByPopularity(boundaryShows, "obscure")).toHaveLength(1)
  })
})

describe("processShowsPage", () => {
  // Helper to create test shows
  const createShows = (ids: number[], popularity: number = 100) =>
    ids.map((id) => ({ id, popularity }))

  describe("resume logic (afterId handling)", () => {
    it("skips shows before afterId when not yet found", () => {
      const shows = createShows([1, 2, 3, 4, 5])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 3, false, seenIds, 10, 0)

      // Should skip 1, 2, 3 and include 4, 5
      expect(result.includedShows.map((s) => s.id)).toEqual([4, 5])
      expect(result.foundAfterId).toBe(true)
    })

    it("includes shows after afterId is found", () => {
      const shows = createShows([1, 2, 3, 4, 5])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 2, false, seenIds, 10, 0)

      // Should skip 1, 2 and include 3, 4, 5
      expect(result.includedShows.map((s) => s.id)).toEqual([3, 4, 5])
      expect(result.foundAfterId).toBe(true)
    })

    it("includes all shows when afterId is null (no resume)", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", null, true, seenIds, 10, 0)

      expect(result.includedShows.map((s) => s.id)).toEqual([1, 2, 3])
      expect(result.foundAfterId).toBe(true)
    })

    it("includes all shows when foundAfterId is already true", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 999, true, seenIds, 10, 0)

      // foundAfterId is true, so ignore afterId
      expect(result.includedShows.map((s) => s.id)).toEqual([1, 2, 3])
      expect(result.foundAfterId).toBe(true)
    })

    it("returns empty array when afterId not found in page", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 999, false, seenIds, 10, 0)

      // afterId 999 not found, so all shows are skipped
      expect(result.includedShows).toHaveLength(0)
      expect(result.foundAfterId).toBe(false)
    })

    it("excludes afterId itself from results", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 2, false, seenIds, 10, 0)

      // Show 2 is the afterId, so it should be skipped
      expect(result.includedShows.map((s) => s.id)).toEqual([3])
      expect(result.foundAfterId).toBe(true)
    })
  })

  describe("duplicate handling", () => {
    it("skips shows already in seenIds", () => {
      const shows = createShows([1, 2, 3, 4, 5])
      const seenIds = new Set<number>([2, 4])

      const result = processShowsPage(shows, "popular", null, true, seenIds, 10, 0)

      expect(result.includedShows.map((s) => s.id)).toEqual([1, 3, 5])
    })

    it("adds included shows to seenIds", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      processShowsPage(shows, "popular", null, true, seenIds, 10, 0)

      expect(seenIds.has(1)).toBe(true)
      expect(seenIds.has(2)).toBe(true)
      expect(seenIds.has(3)).toBe(true)
    })
  })

  describe("popularity filtering", () => {
    it("only includes shows matching phase popularity threshold", () => {
      const shows = [
        { id: 1, popularity: 100 }, // popular
        { id: 2, popularity: 30 }, // standard
        { id: 3, popularity: 5 }, // obscure
        { id: 4, popularity: 75 }, // popular
      ]
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", null, true, seenIds, 10, 0)

      expect(result.includedShows.map((s) => s.id)).toEqual([1, 4])
    })

    it("filters by standard phase correctly", () => {
      const shows = [
        { id: 1, popularity: 100 }, // too popular
        { id: 2, popularity: 30 }, // standard
        { id: 3, popularity: 15 }, // standard
        { id: 4, popularity: 5 }, // too obscure
      ]
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "standard", null, true, seenIds, 10, 0)

      expect(result.includedShows.map((s) => s.id)).toEqual([2, 3])
    })
  })

  describe("limit handling", () => {
    it("stops when limit is reached", () => {
      const shows = createShows([1, 2, 3, 4, 5])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", null, true, seenIds, 3, 0)

      expect(result.includedShows).toHaveLength(3)
      expect(result.includedShows.map((s) => s.id)).toEqual([1, 2, 3])
    })

    it("accounts for currentCount when checking limit", () => {
      const shows = createShows([1, 2, 3, 4, 5])
      const seenIds = new Set<number>()

      // Already have 2 shows, limit is 4, so only include 2 more
      const result = processShowsPage(shows, "popular", null, true, seenIds, 4, 2)

      expect(result.includedShows).toHaveLength(2)
      expect(result.includedShows.map((s) => s.id)).toEqual([1, 2])
    })

    it("returns empty when already at limit", () => {
      const shows = createShows([1, 2, 3])
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", null, true, seenIds, 5, 5)

      expect(result.includedShows).toHaveLength(0)
    })
  })

  describe("combined scenarios", () => {
    it("handles resume + popularity filter + limit together", () => {
      const shows = [
        { id: 1, popularity: 100 }, // skipped (before afterId)
        { id: 2, popularity: 100 }, // afterId, skipped
        { id: 3, popularity: 30 }, // after afterId but wrong popularity
        { id: 4, popularity: 100 }, // included
        { id: 5, popularity: 100 }, // included (reaches limit)
        { id: 6, popularity: 100 }, // would be included but limit reached
      ]
      const seenIds = new Set<number>()

      const result = processShowsPage(shows, "popular", 2, false, seenIds, 2, 0)

      expect(result.includedShows.map((s) => s.id)).toEqual([4, 5])
      expect(result.foundAfterId).toBe(true)
    })
  })
})
