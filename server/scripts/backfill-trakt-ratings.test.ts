import { describe, it, expect, beforeEach, vi } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parseNonNegativeFloat } from "./backfill-trakt-ratings.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-trakt-ratings argument parsing", () => {
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

    it("rejects floating point numbers", () => {
      expect(() => parsePositiveInt("1.5")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("10.0")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("ten")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseNonNegativeFloat", () => {
    it("parses valid non-negative floats", () => {
      expect(parseNonNegativeFloat("0")).toBe(0)
      expect(parseNonNegativeFloat("1.5")).toBe(1.5)
      expect(parseNonNegativeFloat("100.25")).toBe(100.25)
      expect(parseNonNegativeFloat("0.001")).toBe(0.001)
    })

    it("parses integers as floats", () => {
      expect(parseNonNegativeFloat("10")).toBe(10)
      expect(parseNonNegativeFloat("100")).toBe(100)
    })

    it("rejects negative numbers", () => {
      expect(() => parseNonNegativeFloat("-1")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeFloat("-0.5")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeFloat("-100.25")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parseNonNegativeFloat("abc")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeFloat("")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeFloat("ten")).toThrow(InvalidArgumentError)
    })
  })
})

describe("backfill-trakt-ratings movie query building logic", () => {
  interface QueryOptions {
    minPopularity?: number
    limit?: number
    trendingOnly?: boolean
  }

  function buildMovieQuery(options: QueryOptions): { query: string; params: number[] } {
    if (options.trendingOnly) {
      return { query: "TRENDING_MODE", params: [] }
    }

    const conditions: string[] = [
      "imdb_id IS NOT NULL",
      "trakt_updated_at IS NULL",
      "trakt_permanently_failed = false",
      "trakt_fetch_attempts < 3",
      `(
      trakt_last_fetch_attempt IS NULL
      OR trakt_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, trakt_fetch_attempts)
    )`,
    ]

    const params: number[] = []
    let paramIndex = 1

    if (options.minPopularity !== undefined) {
      conditions.push(`popularity >= $${paramIndex}`)
      params.push(options.minPopularity)
      paramIndex += 1
    }

    let limitClause = ""
    if (options.limit !== undefined) {
      limitClause = `LIMIT $${paramIndex}`
      params.push(options.limit)
    }

    const query = `
    SELECT tmdb_id, title, imdb_id, popularity, trakt_fetch_attempts
    FROM movies
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

    return { query, params }
  }

  it("builds basic query without optional filters", () => {
    const { query, params } = buildMovieQuery({})
    expect(query).toContain("imdb_id IS NOT NULL")
    expect(query).toContain("trakt_updated_at IS NULL")
    expect(query).toContain("trakt_permanently_failed = false")
    expect(query).toContain("trakt_fetch_attempts < 3")
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
    expect(params).toEqual([])
  })

  it("adds min popularity filter", () => {
    const { query, params } = buildMovieQuery({ minPopularity: 10 })
    expect(query).toContain("popularity >= $1")
    expect(params).toEqual([10])
  })

  it("adds limit clause", () => {
    const { query, params } = buildMovieQuery({ limit: 100 })
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([100])
  })

  it("combines min popularity and limit with correct parameter indices", () => {
    const { query, params } = buildMovieQuery({ minPopularity: 5.5, limit: 50 })
    expect(query).toContain("popularity >= $1")
    expect(query).toContain("LIMIT $2")
    expect(params).toEqual([5.5, 50])
  })

  it("uses trending mode when --trending-only flag is set", () => {
    const { query, params } = buildMovieQuery({ trendingOnly: true })
    expect(query).toBe("TRENDING_MODE")
    expect(params).toEqual([])
  })

  it("includes exponential backoff condition", () => {
    const { query } = buildMovieQuery({})
    expect(query).toContain("POWER(2, trakt_fetch_attempts)")
  })
})

describe("backfill-trakt-ratings show query building logic", () => {
  interface QueryOptions {
    minPopularity?: number
    limit?: number
  }

  function buildShowQuery(options: QueryOptions): { query: string; params: number[] } {
    const conditions: string[] = [
      "thetvdb_id IS NOT NULL",
      "trakt_updated_at IS NULL",
      "trakt_permanently_failed = false",
      "trakt_fetch_attempts < 3",
      `(
      trakt_last_fetch_attempt IS NULL
      OR trakt_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, trakt_fetch_attempts)
    )`,
    ]

    const params: number[] = []
    let paramIndex = 1

    if (options.minPopularity !== undefined) {
      conditions.push(`popularity >= $${paramIndex}`)
      params.push(options.minPopularity)
      paramIndex += 1
    }

    let limitClause = ""
    if (options.limit !== undefined) {
      limitClause = `LIMIT $${paramIndex}`
      params.push(options.limit)
    }

    const query = `
    SELECT tmdb_id, name, thetvdb_id, popularity, trakt_fetch_attempts
    FROM shows
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

    return { query, params }
  }

  it("requires TheTVDB ID instead of IMDb ID for shows", () => {
    const { query } = buildShowQuery({})
    expect(query).toContain("thetvdb_id IS NOT NULL")
    expect(query).not.toContain("imdb_id")
  })

  it("builds query with trakt-specific columns", () => {
    const { query } = buildShowQuery({})
    expect(query).toContain("trakt_updated_at IS NULL")
    expect(query).toContain("trakt_permanently_failed = false")
    expect(query).toContain("trakt_fetch_attempts < 3")
  })

  it("adds min popularity filter", () => {
    const { query, params } = buildShowQuery({ minPopularity: 20 })
    expect(query).toContain("popularity >= $1")
    expect(params).toEqual([20])
  })
})

describe("backfill-trakt-ratings retry logic", () => {
  interface RetryState {
    fetchAttempts: number
    permanentlyFailed: boolean
  }

  function shouldRetry(state: RetryState): boolean {
    return !state.permanentlyFailed && state.fetchAttempts < 3
  }

  function getNextRetryDelay(attemptNumber: number): number {
    return Math.pow(2, attemptNumber) * 3600 * 1000 // hours in milliseconds
  }

  function markPermanentFailure(attemptNumber: number, isPermanentError: boolean): boolean {
    return isPermanentError || attemptNumber >= 3
  }

  it("allows retry when attempts < 3 and not permanently failed", () => {
    expect(shouldRetry({ fetchAttempts: 0, permanentlyFailed: false })).toBe(true)
    expect(shouldRetry({ fetchAttempts: 1, permanentlyFailed: false })).toBe(true)
    expect(shouldRetry({ fetchAttempts: 2, permanentlyFailed: false })).toBe(true)
  })

  it("blocks retry after 3 attempts", () => {
    expect(shouldRetry({ fetchAttempts: 3, permanentlyFailed: false })).toBe(false)
    expect(shouldRetry({ fetchAttempts: 4, permanentlyFailed: false })).toBe(false)
  })

  it("blocks retry when permanently failed", () => {
    expect(shouldRetry({ fetchAttempts: 0, permanentlyFailed: true })).toBe(false)
    expect(shouldRetry({ fetchAttempts: 1, permanentlyFailed: true })).toBe(false)
  })

  it("calculates exponential backoff delay", () => {
    expect(getNextRetryDelay(0)).toBe(1 * 3600 * 1000) // 1 hour
    expect(getNextRetryDelay(1)).toBe(2 * 3600 * 1000) // 2 hours
    expect(getNextRetryDelay(2)).toBe(4 * 3600 * 1000) // 4 hours
    expect(getNextRetryDelay(3)).toBe(8 * 3600 * 1000) // 8 hours
  })

  it("marks permanent failure after 3 attempts", () => {
    expect(markPermanentFailure(3, false)).toBe(true)
    expect(markPermanentFailure(4, false)).toBe(true)
  })

  it("marks permanent failure for permanent errors regardless of attempts", () => {
    expect(markPermanentFailure(1, true)).toBe(true)
    expect(markPermanentFailure(2, true)).toBe(true)
  })

  it("does not mark permanent failure before 3 attempts if transient error", () => {
    expect(markPermanentFailure(1, false)).toBe(false)
    expect(markPermanentFailure(2, false)).toBe(false)
  })
})

describe("backfill-trakt-ratings circuit breaker logic", () => {
  interface CircuitBreakerState {
    consecutiveFailures: number
    maxFailures: number
  }

  function shouldTripCircuitBreaker(state: CircuitBreakerState): boolean {
    return state.consecutiveFailures >= state.maxFailures
  }

  function updateCircuitBreaker(state: CircuitBreakerState, success: boolean): CircuitBreakerState {
    return {
      ...state,
      consecutiveFailures: success ? 0 : state.consecutiveFailures + 1,
    }
  }

  it("does not trip circuit breaker below threshold", () => {
    expect(shouldTripCircuitBreaker({ consecutiveFailures: 0, maxFailures: 3 })).toBe(false)
    expect(shouldTripCircuitBreaker({ consecutiveFailures: 1, maxFailures: 3 })).toBe(false)
    expect(shouldTripCircuitBreaker({ consecutiveFailures: 2, maxFailures: 3 })).toBe(false)
  })

  it("trips circuit breaker at threshold", () => {
    expect(shouldTripCircuitBreaker({ consecutiveFailures: 3, maxFailures: 3 })).toBe(true)
    expect(shouldTripCircuitBreaker({ consecutiveFailures: 4, maxFailures: 3 })).toBe(true)
  })

  it("resets consecutive failures on success", () => {
    const state = { consecutiveFailures: 2, maxFailures: 3 }
    const nextState = updateCircuitBreaker(state, true)
    expect(nextState.consecutiveFailures).toBe(0)
  })

  it("increments consecutive failures on error", () => {
    const state = { consecutiveFailures: 1, maxFailures: 3 }
    const nextState = updateCircuitBreaker(state, false)
    expect(nextState.consecutiveFailures).toBe(2)
  })
})

describe("backfill-trakt-ratings trending mode logic", () => {
  interface TrendingItem {
    movie?: {
      title: string
      ids: {
        imdb: string
      }
    }
    watchers: number
  }

  function calculateTrendingRank(index: number): number {
    return index + 1 // 1-indexed ranking
  }

  function shouldProcessTrendingItem(item: TrendingItem): boolean {
    return item.movie !== undefined && item.movie.ids.imdb !== undefined
  }

  it("calculates trending rank from array index", () => {
    expect(calculateTrendingRank(0)).toBe(1)
    expect(calculateTrendingRank(4)).toBe(5)
    expect(calculateTrendingRank(99)).toBe(100)
  })

  it("validates trending items have required fields", () => {
    expect(
      shouldProcessTrendingItem({
        movie: { title: "Test", ids: { imdb: "tt1234567" } },
        watchers: 100,
      })
    ).toBe(true)
  })

  it("rejects trending items without movie data", () => {
    expect(shouldProcessTrendingItem({ watchers: 100 })).toBe(false)
  })
})

describe("backfill-trakt-ratings update decision logic", () => {
  interface TraktStats {
    rating: number | null
    votes: number | null
    watchers: number | null
    plays: number | null
    collectors: number | null
  }

  function shouldUpdateStats(stats: TraktStats | null): boolean {
    return stats !== null
  }

  function hasAnyStats(stats: TraktStats): boolean {
    return (
      stats.rating !== null ||
      stats.watchers !== null ||
      stats.plays !== null ||
      stats.collectors !== null
    )
  }

  it("returns false when Trakt API returns null", () => {
    expect(shouldUpdateStats(null)).toBe(false)
  })

  it("returns true when Trakt API returns stats object", () => {
    const stats = {
      rating: 8.5,
      votes: 50000,
      watchers: 100000,
      plays: 250000,
      collectors: 30000,
    }
    expect(shouldUpdateStats(stats)).toBe(true)
  })

  it("detects when stats object has at least one value", () => {
    expect(
      hasAnyStats({
        rating: 8.5,
        votes: null,
        watchers: null,
        plays: null,
        collectors: null,
      })
    ).toBe(true)

    expect(
      hasAnyStats({
        rating: null,
        votes: null,
        watchers: 50000,
        plays: null,
        collectors: null,
      })
    ).toBe(true)

    expect(
      hasAnyStats({
        rating: null,
        votes: null,
        watchers: null,
        plays: null,
        collectors: 10000,
      })
    ).toBe(true)
  })

  it("returns false when no stats are present", () => {
    expect(
      hasAnyStats({
        rating: null,
        votes: null,
        watchers: null,
        plays: null,
        collectors: null,
      })
    ).toBe(false)
  })
})

describe("backfill-trakt-ratings environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    traktClientId?: string
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl) {
      errors.push("DATABASE_URL environment variable is required")
    }

    if (!env.traktClientId) {
      errors.push("TRAKT_CLIENT_ID environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL", () => {
    const errors = checkEnv({ traktClientId: "client-id" })
    expect(errors).toContain("DATABASE_URL environment variable is required")
  })

  it("requires TRAKT_CLIENT_ID", () => {
    const errors = checkEnv({ databaseUrl: "postgres://..." })
    expect(errors).toContain("TRAKT_CLIENT_ID environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", traktClientId: "client-id" })
    expect(errors).toHaveLength(0)
  })
})
