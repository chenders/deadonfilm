import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"

// Create mock query function
const mockQuery = vi.fn()
const mockEnd = vi.fn()
const mockOn = vi.fn()

// Mock the pg module before importing the module under test
vi.mock("pg", async () => {
  return {
    default: {
      Pool: class MockPool {
        query = (globalThis as Record<string, unknown>).__verifyShowsMockQuery as typeof mockQuery
        end = (globalThis as Record<string, unknown>).__verifyShowsMockEnd as typeof mockEnd
        on = (globalThis as Record<string, unknown>).__verifyShowsMockOn as typeof mockOn
      },
    },
  }
})

// Set up the global mock functions before imports
;(globalThis as Record<string, unknown>).__verifyShowsMockQuery = mockQuery
;(globalThis as Record<string, unknown>).__verifyShowsMockEnd = mockEnd
;(globalThis as Record<string, unknown>).__verifyShowsMockOn = mockOn

// Import after mocking
import {
  parsePositiveInt,
  parsePhase,
  PHASE_THRESHOLDS,
  fixCastCounts,
  fixDeceasedFlags,
  fixDeceasedCounts,
  type ImportPhase,
} from "./verify-shows.js"

describe("parsePositiveInt", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("500")).toBe(500)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws InvalidArgumentError for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws InvalidArgumentError for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("truncates decimal values to integers", () => {
    expect(parsePositiveInt("1.5")).toBe(1)
    expect(parsePositiveInt("3.14")).toBe(3)
  })

  it("throws InvalidArgumentError for non-numeric strings", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
  })

  it("parses leading digits from mixed strings", () => {
    expect(parsePositiveInt("12abc")).toBe(12)
  })

  it("throws InvalidArgumentError for whitespace", () => {
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

  it("throws InvalidArgumentError for invalid phase values", () => {
    expect(() => parsePhase("invalid")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("invalid")).toThrow("Phase must be: popular, standard, or obscure")
  })

  it("throws InvalidArgumentError for empty string", () => {
    expect(() => parsePhase("")).toThrow(InvalidArgumentError)
  })

  it("throws InvalidArgumentError for similar but incorrect values", () => {
    expect(() => parsePhase("Popular")).toThrow(InvalidArgumentError)
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
    expect(PHASE_THRESHOLDS.standard.min).toBe(PHASE_THRESHOLDS.obscure.max)
    expect(PHASE_THRESHOLDS.popular.min).toBe(PHASE_THRESHOLDS.standard.max)
  })
})

describe("Fix Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  describe("fixCastCounts", () => {
    it("returns 0 for empty mismatches array", async () => {
      const result = await fixCastCounts([], false)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("returns 0 when dryRun is true", async () => {
      const mismatches = [{ tmdb_id: 1, name: "Show 1", stored_count: 10, actual_count: 15 }]
      const result = await fixCastCounts(mismatches, true)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("performs batch update with unnest arrays", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const mismatches = [
        { tmdb_id: 1, name: "Show 1", stored_count: 10, actual_count: 15 },
        { tmdb_id: 2, name: "Show 2", stored_count: 5, actual_count: 8 },
        { tmdb_id: 3, name: "Show 3", stored_count: 20, actual_count: 25 },
      ]

      const result = await fixCastCounts(mismatches, false)

      expect(result).toBe(3)
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE shows s"), [
        [1, 2, 3],
        [15, 8, 25],
      ])
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("unnest($1::int[], $2::int[])"),
        expect.any(Array)
      )
    })

    it("updates cast_count and living_count in single query", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await fixCastCounts(
        [{ tmdb_id: 100, name: "Test Show", stored_count: 5, actual_count: 10 }],
        false
      )

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET cast_count = u.actual_count"),
        expect.any(Array)
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("living_count = u.actual_count - COALESCE(s.deceased_count, 0)"),
        expect.any(Array)
      )
    })
  })

  describe("fixDeceasedFlags", () => {
    it("returns 0 for empty issues array", async () => {
      const result = await fixDeceasedFlags([], false)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("returns 0 when dryRun is true", async () => {
      const issues = [
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 100,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
      ]
      const result = await fixDeceasedFlags(issues, true)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("updates is_deceased to true for should_be_true issues", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const issues = [
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 100,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
        {
          actor_tmdb_id: 2,
          show_tmdb_id: 200,
          actor_name: "Actor 2",
          issue: "should_be_true" as const,
        },
      ]

      const result = await fixDeceasedFlags(issues, false)

      expect(result).toBe(2)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE show_actor_appearances SET is_deceased = true"),
        [1, 2]
      )
    })

    it("updates is_deceased to false for should_be_false issues", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const issues = [
        {
          actor_tmdb_id: 3,
          show_tmdb_id: 300,
          actor_name: "Actor 3",
          issue: "should_be_false" as const,
        },
      ]

      const result = await fixDeceasedFlags(issues, false)

      expect(result).toBe(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE show_actor_appearances SET is_deceased = false"),
        [3]
      )
    })

    it("handles mixed should_be_true and should_be_false issues", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const issues = [
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 100,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
        {
          actor_tmdb_id: 2,
          show_tmdb_id: 200,
          actor_name: "Actor 2",
          issue: "should_be_false" as const,
        },
        {
          actor_tmdb_id: 3,
          show_tmdb_id: 300,
          actor_name: "Actor 3",
          issue: "should_be_true" as const,
        },
      ]

      const result = await fixDeceasedFlags(issues, false)

      expect(result).toBe(3)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      // First call for should_be_true
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("is_deceased = true"),
        [1, 3]
      )
      // Second call for should_be_false
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("is_deceased = false"),
        [2]
      )
    })

    it("deduplicates actor IDs within each category", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const issues = [
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 100,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 200,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
        {
          actor_tmdb_id: 1,
          show_tmdb_id: 300,
          actor_name: "Actor 1",
          issue: "should_be_true" as const,
        },
      ]

      await fixDeceasedFlags(issues, false)

      // Should only have actor ID 1 once
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [1])
    })
  })

  describe("fixDeceasedCounts", () => {
    it("returns 0 for empty mismatches array", async () => {
      const result = await fixDeceasedCounts([], false)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("returns 0 when dryRun is true", async () => {
      const mismatches = [{ tmdb_id: 1, name: "Show 1", stored_count: 5, actual_count: 8 }]
      const result = await fixDeceasedCounts(mismatches, true)
      expect(result).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("performs batch update with unnest arrays", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const mismatches = [
        { tmdb_id: 1, name: "Show 1", stored_count: 5, actual_count: 8 },
        { tmdb_id: 2, name: "Show 2", stored_count: 3, actual_count: 5 },
      ]

      const result = await fixDeceasedCounts(mismatches, false)

      expect(result).toBe(2)
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE shows s"), [
        [1, 2],
        [8, 5],
      ])
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("unnest($1::int[], $2::int[])"),
        expect.any(Array)
      )
    })

    it("updates deceased_count and living_count in single query", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await fixDeceasedCounts(
        [{ tmdb_id: 100, name: "Test Show", stored_count: 5, actual_count: 10 }],
        false
      )

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET deceased_count = u.actual_count"),
        expect.any(Array)
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("living_count = COALESCE(s.cast_count, 0) - u.actual_count"),
        expect.any(Array)
      )
    })
  })
})
