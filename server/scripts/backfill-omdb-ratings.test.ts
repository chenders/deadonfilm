import { describe, it, expect, beforeEach, vi } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parseNonNegativeFloat } from "./backfill-omdb-ratings.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-omdb-ratings argument parsing", () => {
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

describe("backfill-omdb-ratings query building logic", () => {
  interface QueryOptions {
    minPopularity?: number
    limit?: number
  }

  function buildMovieQuery(options: QueryOptions): { query: string; params: number[] } {
    const conditions: string[] = [
      "imdb_id IS NOT NULL",
      "omdb_updated_at IS NULL",
      "omdb_permanently_failed = false",
      "omdb_fetch_attempts < 3",
      `(
      omdb_last_fetch_attempt IS NULL
      OR omdb_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, omdb_fetch_attempts)
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
    SELECT tmdb_id, title, imdb_id, popularity, omdb_fetch_attempts
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
    expect(query).toContain("omdb_updated_at IS NULL")
    expect(query).toContain("omdb_permanently_failed = false")
    expect(query).toContain("omdb_fetch_attempts < 3")
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

  it("includes exponential backoff condition", () => {
    const { query } = buildMovieQuery({})
    expect(query).toContain("POWER(2, omdb_fetch_attempts)")
  })

  it("filters out permanently failed items", () => {
    const { query } = buildMovieQuery({})
    expect(query).toContain("omdb_permanently_failed = false")
  })

  it("filters out items with 3+ attempts", () => {
    const { query } = buildMovieQuery({})
    expect(query).toContain("omdb_fetch_attempts < 3")
  })
})

describe("backfill-omdb-ratings retry logic", () => {
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

describe("backfill-omdb-ratings circuit breaker logic", () => {
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

describe("backfill-omdb-ratings update decision logic", () => {
  interface OMDbRatings {
    imdbRating: number | null
    imdbVotes: number | null
    rottenTomatoesScore: number | null
    rottenTomatoesAudience: number | null
    metacriticScore: number | null
  }

  function shouldUpdateRatings(ratings: OMDbRatings | null): boolean {
    return ratings !== null
  }

  function hasAnyRating(ratings: OMDbRatings): boolean {
    return (
      ratings.imdbRating !== null ||
      ratings.rottenTomatoesScore !== null ||
      ratings.metacriticScore !== null
    )
  }

  it("returns false when OMDb API returns null", () => {
    expect(shouldUpdateRatings(null)).toBe(false)
  })

  it("returns true when OMDb API returns ratings object", () => {
    const ratings = {
      imdbRating: 8.5,
      imdbVotes: 1500000,
      rottenTomatoesScore: 85,
      rottenTomatoesAudience: 92,
      metacriticScore: 75,
    }
    expect(shouldUpdateRatings(ratings)).toBe(true)
  })

  it("detects when ratings object has at least one rating", () => {
    expect(
      hasAnyRating({
        imdbRating: 8.5,
        imdbVotes: 1500000,
        rottenTomatoesScore: null,
        rottenTomatoesAudience: null,
        metacriticScore: null,
      })
    ).toBe(true)

    expect(
      hasAnyRating({
        imdbRating: null,
        imdbVotes: null,
        rottenTomatoesScore: 85,
        rottenTomatoesAudience: null,
        metacriticScore: null,
      })
    ).toBe(true)

    expect(
      hasAnyRating({
        imdbRating: null,
        imdbVotes: null,
        rottenTomatoesScore: null,
        rottenTomatoesAudience: null,
        metacriticScore: 75,
      })
    ).toBe(true)
  })

  it("returns false when no ratings are present", () => {
    expect(
      hasAnyRating({
        imdbRating: null,
        imdbVotes: null,
        rottenTomatoesScore: null,
        rottenTomatoesAudience: null,
        metacriticScore: null,
      })
    ).toBe(false)
  })
})

describe("backfill-omdb-ratings environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    omdbApiKey?: string
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl) {
      errors.push("DATABASE_URL environment variable is required")
    }

    if (!env.omdbApiKey) {
      errors.push("OMDB_API_KEY environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL", () => {
    const errors = checkEnv({ omdbApiKey: "key" })
    expect(errors).toContain("DATABASE_URL environment variable is required")
  })

  it("requires OMDB_API_KEY", () => {
    const errors = checkEnv({ databaseUrl: "postgres://..." })
    expect(errors).toContain("OMDB_API_KEY environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", omdbApiKey: "key" })
    expect(errors).toHaveLength(0)
  })
})
