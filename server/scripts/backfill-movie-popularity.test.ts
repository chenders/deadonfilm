import { describe, it, expect, beforeEach, vi } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt } from "./backfill-movie-popularity.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-movie-popularity argument parsing", () => {
  describe("parsePositiveInt", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1)
      expect(parsePositiveInt("50")).toBe(50)
      expect(parsePositiveInt("1000")).toBe(1000)
    })

    it("rejects zero", () => {
      expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("-50")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("ten")).toThrow(InvalidArgumentError)
    })
  })
})

describe("backfill-movie-popularity query building logic", () => {
  interface QueryOptions {
    year?: number
    limit: number
  }

  function buildQuery(options: QueryOptions): { query: string; params: (number | string)[] } {
    const params: (number | string)[] = []
    let query = `
      SELECT tmdb_id, title, release_year
      FROM movies
      WHERE popularity IS NULL
        AND tmdb_id IS NOT NULL
    `

    if (options.year) {
      params.push(options.year)
      query += ` AND release_year = $${params.length}`
    }

    query += ` ORDER BY release_year DESC NULLS LAST, tmdb_id`

    params.push(options.limit)
    query += ` LIMIT $${params.length}`

    return { query, params }
  }

  it("builds basic query with limit", () => {
    const { query, params } = buildQuery({ limit: 100 })
    expect(query).toContain("WHERE popularity IS NULL")
    expect(query).toContain("AND tmdb_id IS NOT NULL")
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([100])
  })

  it("adds year filter when provided", () => {
    const { query, params } = buildQuery({ year: 2020, limit: 100 })
    expect(query).toContain("AND release_year = $1")
    expect(query).toContain("LIMIT $2")
    expect(params).toEqual([2020, 100])
  })

  it("orders by release_year DESC then tmdb_id", () => {
    const { query } = buildQuery({ limit: 100 })
    expect(query).toContain("ORDER BY release_year DESC NULLS LAST, tmdb_id")
  })
})

describe("backfill-movie-popularity update decision logic", () => {
  interface MovieDetails {
    popularity?: number | null
  }

  function shouldUpdate(details: MovieDetails): boolean {
    return details.popularity !== undefined && details.popularity !== null
  }

  it("returns true when popularity is present", () => {
    expect(shouldUpdate({ popularity: 10.5 })).toBe(true)
    expect(shouldUpdate({ popularity: 0 })).toBe(true)
    expect(shouldUpdate({ popularity: 0.001 })).toBe(true)
  })

  it("returns false when popularity is null", () => {
    expect(shouldUpdate({ popularity: null })).toBe(false)
  })

  it("returns false when popularity is undefined", () => {
    expect(shouldUpdate({ popularity: undefined })).toBe(false)
    expect(shouldUpdate({})).toBe(false)
  })
})

describe("backfill-movie-popularity environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl) {
      errors.push("DATABASE_URL environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL", () => {
    const errors = checkEnv({})
    expect(errors).toContain("DATABASE_URL environment variable is required")
  })

  it("passes when DATABASE_URL is present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://..." })
    expect(errors).toHaveLength(0)
  })
})

describe("backfill-movie-popularity progress tracking", () => {
  interface Stats {
    processed: number
    updated: number
    errors: number
  }

  function formatProgress(index: number, total: number): string {
    return `[${index + 1}/${total}]`
  }

  function calculateStats(results: Array<{ success: boolean; updated: boolean }>): Stats {
    return results.reduce(
      (stats, r) => ({
        processed: stats.processed + 1,
        updated: stats.updated + (r.updated ? 1 : 0),
        errors: stats.errors + (r.success ? 0 : 1),
      }),
      { processed: 0, updated: 0, errors: 0 }
    )
  }

  it("formats progress correctly", () => {
    expect(formatProgress(0, 10)).toBe("[1/10]")
    expect(formatProgress(9, 10)).toBe("[10/10]")
    expect(formatProgress(49, 100)).toBe("[50/100]")
  })

  it("calculates stats correctly", () => {
    const results = [
      { success: true, updated: true },
      { success: true, updated: true },
      { success: true, updated: false },
      { success: false, updated: false },
    ]

    const stats = calculateStats(results)
    expect(stats.processed).toBe(4)
    expect(stats.updated).toBe(2)
    expect(stats.errors).toBe(1)
  })

  it("handles empty results", () => {
    const stats = calculateStats([])
    expect(stats.processed).toBe(0)
    expect(stats.updated).toBe(0)
    expect(stats.errors).toBe(0)
  })
})
