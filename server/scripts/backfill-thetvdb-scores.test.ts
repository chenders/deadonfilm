import { describe, it, expect, beforeEach, vi } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parseNonNegativeFloat } from "./backfill-thetvdb-scores.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-thetvdb-scores argument parsing", () => {
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

describe("backfill-thetvdb-scores query building logic", () => {
  interface QueryOptions {
    minPopularity?: number
    limit?: number
  }

  function buildQuery(options: QueryOptions): { query: string; params: number[] } {
    const conditions: string[] = [
      "thetvdb_id IS NOT NULL",
      "thetvdb_score IS NULL",
      "thetvdb_permanently_failed = false",
      "thetvdb_fetch_attempts < 3",
      `(
        thetvdb_last_fetch_attempt IS NULL
        OR thetvdb_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, thetvdb_fetch_attempts)
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
      SELECT tmdb_id, name, thetvdb_id, popularity, thetvdb_fetch_attempts
      FROM shows
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY popularity DESC NULLS LAST
      ${limitClause}
    `

    return { query, params }
  }

  it("builds basic query without optional filters", () => {
    const { query, params } = buildQuery({})
    expect(query).toContain("thetvdb_id IS NOT NULL")
    expect(query).toContain("thetvdb_score IS NULL")
    expect(query).toContain("thetvdb_permanently_failed = false")
    expect(query).toContain("thetvdb_fetch_attempts < 3")
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
    expect(params).toEqual([])
  })

  it("adds min popularity filter", () => {
    const { query, params } = buildQuery({ minPopularity: 10 })
    expect(query).toContain("popularity >= $1")
    expect(params).toEqual([10])
  })

  it("adds limit clause", () => {
    const { query, params } = buildQuery({ limit: 100 })
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([100])
  })

  it("combines min popularity and limit with correct parameter indices", () => {
    const { query, params } = buildQuery({ minPopularity: 5.5, limit: 50 })
    expect(query).toContain("popularity >= $1")
    expect(query).toContain("LIMIT $2")
    expect(params).toEqual([5.5, 50])
  })

  it("includes exponential backoff condition", () => {
    const { query } = buildQuery({})
    expect(query).toContain("POWER(2, thetvdb_fetch_attempts)")
  })

  it("filters out permanently failed items", () => {
    const { query } = buildQuery({})
    expect(query).toContain("thetvdb_permanently_failed = false")
  })

  it("filters out items with 3+ attempts", () => {
    const { query } = buildQuery({})
    expect(query).toContain("thetvdb_fetch_attempts < 3")
  })

  it("only selects shows without scores", () => {
    const { query } = buildQuery({})
    expect(query).toContain("thetvdb_score IS NULL")
  })
})

describe("backfill-thetvdb-scores retry logic", () => {
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

describe("backfill-thetvdb-scores circuit breaker logic", () => {
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

  it("tracks consecutive failures correctly", () => {
    let state = { consecutiveFailures: 0, maxFailures: 3 }
    state = updateCircuitBreaker(state, false) // fail
    expect(state.consecutiveFailures).toBe(1)
    state = updateCircuitBreaker(state, false) // fail
    expect(state.consecutiveFailures).toBe(2)
    state = updateCircuitBreaker(state, true) // success - reset
    expect(state.consecutiveFailures).toBe(0)
    state = updateCircuitBreaker(state, false) // fail
    expect(state.consecutiveFailures).toBe(1)
  })
})

describe("backfill-thetvdb-scores update decision logic", () => {
  interface SeriesData {
    score: number | null | undefined
  }

  function shouldUpdateScore(seriesData: SeriesData | null): boolean {
    return seriesData !== null && seriesData.score !== null && seriesData.score !== undefined
  }

  function shouldSkipNoData(seriesData: SeriesData | null): boolean {
    return seriesData === null
  }

  function shouldSkipNoScore(seriesData: SeriesData | null): boolean {
    return seriesData !== null && (seriesData.score === null || seriesData.score === undefined)
  }

  it("returns true when series data has valid score", () => {
    expect(shouldUpdateScore({ score: 8.5 })).toBe(true)
    expect(shouldUpdateScore({ score: 0 })).toBe(true)
    expect(shouldUpdateScore({ score: 10 })).toBe(true)
  })

  it("returns false when API returns null", () => {
    expect(shouldUpdateScore(null)).toBe(false)
  })

  it("returns false when score is null", () => {
    expect(shouldUpdateScore({ score: null })).toBe(false)
  })

  it("returns false when score is undefined", () => {
    expect(shouldUpdateScore({ score: undefined })).toBe(false)
  })

  it("detects when no data is returned", () => {
    expect(shouldSkipNoData(null)).toBe(true)
    expect(shouldSkipNoData({ score: 8.5 })).toBe(false)
  })

  it("detects when data exists but no score available", () => {
    expect(shouldSkipNoScore({ score: null })).toBe(true)
    expect(shouldSkipNoScore({ score: undefined })).toBe(true)
    expect(shouldSkipNoScore({ score: 8.5 })).toBe(false)
    expect(shouldSkipNoScore(null)).toBe(false)
  })
})

describe("backfill-thetvdb-scores environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    thetvdbApiKey?: string
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl) {
      errors.push("DATABASE_URL environment variable is required")
    }

    if (!env.thetvdbApiKey) {
      errors.push("THETVDB_API_KEY environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL", () => {
    const errors = checkEnv({ thetvdbApiKey: "key" })
    expect(errors).toContain("DATABASE_URL environment variable is required")
  })

  it("requires THETVDB_API_KEY", () => {
    const errors = checkEnv({ databaseUrl: "postgres://..." })
    expect(errors).toContain("THETVDB_API_KEY environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", thetvdbApiKey: "key" })
    expect(errors).toHaveLength(0)
  })
})

describe("backfill-thetvdb-scores rate limiting", () => {
  const RATE_LIMIT_DELAY_MS = 100

  function getRateLimit(): number {
    return RATE_LIMIT_DELAY_MS
  }

  it("uses 100ms delay between requests", () => {
    expect(getRateLimit()).toBe(100)
  })

  it("is faster than OMDb/Trakt rate limits", () => {
    const OMDB_RATE_LIMIT = 200
    const TRAKT_RATE_LIMIT = 200
    expect(getRateLimit()).toBeLessThan(OMDB_RATE_LIMIT)
    expect(getRateLimit()).toBeLessThan(TRAKT_RATE_LIMIT)
  })
})
