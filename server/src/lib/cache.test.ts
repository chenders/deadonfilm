import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildCacheKey, CACHE_PREFIX, CACHE_TTL } from "./cache.js"

// Mock the redis module
vi.mock("./redis.js", () => ({
  getRedisClient: vi.fn(),
}))

// Mock the logger
vi.mock("./logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock the newrelic module
vi.mock("./newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

describe("cache", () => {
  describe("CACHE_PREFIX", () => {
    it("has expected prefixes", () => {
      expect(CACHE_PREFIX.RECENT_DEATHS).toBe("recent-deaths")
      expect(CACHE_PREFIX.STATS).toBe("stats")
      expect(CACHE_PREFIX.TRIVIA).toBe("trivia")
      expect(CACHE_PREFIX.CURSED_MOVIES).toBe("cursed-movies")
      expect(CACHE_PREFIX.CURSED_ACTORS).toBe("cursed-actors")
    })
  })

  describe("CACHE_TTL", () => {
    it("has expected TTL values in seconds", () => {
      expect(CACHE_TTL.SHORT).toBe(120) // 2 minutes
      expect(CACHE_TTL.MEDIUM).toBe(300) // 5 minutes
      expect(CACHE_TTL.LONG).toBe(600) // 10 minutes
      expect(CACHE_TTL.HOUR).toBe(3600) // 1 hour
      expect(CACHE_TTL.DAY).toBe(86400) // 24 hours
    })
  })

  describe("buildCacheKey", () => {
    it("returns prefix when no params provided", () => {
      expect(buildCacheKey(CACHE_PREFIX.STATS)).toBe("stats")
    })

    it("returns prefix when params is empty object", () => {
      expect(buildCacheKey(CACHE_PREFIX.STATS, {})).toBe("stats")
    })

    it("includes sorted params in key", () => {
      const key = buildCacheKey(CACHE_PREFIX.CURSED_MOVIES, { page: 1, limit: 50 })
      expect(key).toBe("cursed-movies:limit:50:page:1")
    })

    it("sorts params alphabetically for consistent keys", () => {
      const key1 = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { limit: 10, offset: 0 })
      const key2 = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { offset: 0, limit: 10 })
      expect(key1).toBe(key2)
      expect(key1).toBe("recent-deaths:limit:10:offset:0")
    })

    it("handles boolean params", () => {
      const key = buildCacheKey(CACHE_PREFIX.CURSED_ACTORS, { includeObscure: true })
      expect(key).toBe("cursed-actors:includeObscure:true")
    })

    it("handles string params", () => {
      const key = buildCacheKey(CACHE_PREFIX.CAUSES, { slug: "cancer" })
      expect(key).toBe("causes:slug:cancer")
    })

    it("filters out undefined params", () => {
      const key = buildCacheKey(CACHE_PREFIX.STATS, {
        page: 1,
        filter: undefined,
      })
      expect(key).toBe("stats:page:1")
    })

    it("filters out null params", () => {
      const key = buildCacheKey(CACHE_PREFIX.STATS, {
        page: 1,
        filter: null,
      })
      expect(key).toBe("stats:page:1")
    })

    it("handles multiple params of different types", () => {
      const key = buildCacheKey(CACHE_PREFIX.CURSED_ACTORS, {
        page: 2,
        status: "living",
        minMovies: 5,
        includeObscure: false,
      })
      expect(key).toBe("cursed-actors:includeObscure:false:minMovies:5:page:2:status:living")
    })
  })
})

describe("cache operations with mocked Redis", () => {
  let mockRedisClient: {
    get: ReturnType<typeof vi.fn>
    setex: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
    scan: ReturnType<typeof vi.fn>
    flushdb: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    // Reset modules to get fresh imports
    vi.resetModules()

    mockRedisClient = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
      flushdb: vi.fn(),
    }

    // Re-mock with the mock client
    vi.doMock("./redis.js", () => ({
      getRedisClient: vi.fn(() => mockRedisClient),
    }))

    vi.doMock("./logger.js", () => ({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    }))

    vi.doMock("./newrelic.js", () => ({
      recordCustomEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getCached", () => {
    it("returns null when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { getCached } = await import("./cache.js")
      const result = await getCached("test-key")
      expect(result).toBeNull()
    })

    it("returns parsed JSON on cache hit", async () => {
      const testData = { foo: "bar", count: 42 }
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData))

      const { getCached } = await import("./cache.js")
      const result = await getCached<typeof testData>("test-key")

      expect(result).toEqual(testData)
      expect(mockRedisClient.get).toHaveBeenCalledWith("test-key")
    })

    it("returns null on cache miss", async () => {
      mockRedisClient.get.mockResolvedValue(null)

      const { getCached } = await import("./cache.js")
      const result = await getCached("test-key")

      expect(result).toBeNull()
    })

    it("returns null and logs warning on Redis error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis error"))

      const { getCached } = await import("./cache.js")
      const result = await getCached("test-key")

      expect(result).toBeNull()
    })
  })

  describe("setCached", () => {
    it("does nothing when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { setCached } = await import("./cache.js")
      await setCached("test-key", { data: "test" }, 300)

      expect(mockRedisClient.setex).not.toHaveBeenCalled()
    })

    it("sets value with TTL", async () => {
      mockRedisClient.setex.mockResolvedValue("OK")

      const { setCached } = await import("./cache.js")
      const testData = { foo: "bar" }
      await setCached("test-key", testData, 300)

      expect(mockRedisClient.setex).toHaveBeenCalledWith("test-key", 300, JSON.stringify(testData))
    })

    it("handles Redis errors gracefully", async () => {
      mockRedisClient.setex.mockRejectedValue(new Error("Redis error"))

      const { setCached } = await import("./cache.js")
      // Should not throw
      await expect(setCached("test-key", { data: "test" }, 300)).resolves.toBeUndefined()
    })
  })

  describe("invalidateKeys", () => {
    it("does nothing when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { invalidateKeys } = await import("./cache.js")
      await invalidateKeys("key1", "key2")

      expect(mockRedisClient.del).not.toHaveBeenCalled()
    })

    it("does nothing when no keys provided", async () => {
      const { invalidateKeys } = await import("./cache.js")
      await invalidateKeys()

      expect(mockRedisClient.del).not.toHaveBeenCalled()
    })

    it("deletes specified keys", async () => {
      mockRedisClient.del.mockResolvedValue(2)

      const { invalidateKeys } = await import("./cache.js")
      await invalidateKeys("key1", "key2")

      expect(mockRedisClient.del).toHaveBeenCalledWith("key1", "key2")
    })
  })

  describe("invalidateByPattern", () => {
    it("returns 0 when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { invalidateByPattern } = await import("./cache.js")
      const result = await invalidateByPattern("recent-deaths:*")

      expect(result).toBe(0)
    })

    it("scans and deletes matching keys", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(["1", ["key1", "key2"]])
        .mockResolvedValueOnce(["0", ["key3"]])
      mockRedisClient.del.mockResolvedValue(3)

      const { invalidateByPattern } = await import("./cache.js")
      const result = await invalidateByPattern("test:*")

      expect(result).toBe(3)
      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "test:*", "COUNT", 100)
    })
  })

  describe("flushCache", () => {
    it("does nothing when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { flushCache } = await import("./cache.js")
      await flushCache()

      expect(mockRedisClient.flushdb).not.toHaveBeenCalled()
    })

    it("flushes the database", async () => {
      mockRedisClient.flushdb.mockResolvedValue("OK")

      const { flushCache } = await import("./cache.js")
      await flushCache()

      expect(mockRedisClient.flushdb).toHaveBeenCalled()
    })
  })

  describe("invalidateDeathCaches", () => {
    it("invalidates all death-related cache patterns", async () => {
      // Mock scan to return empty keys (no deletions) for each pattern
      mockRedisClient.scan.mockResolvedValue(["0", []])

      const { invalidateDeathCaches, CACHE_PREFIX } = await import("./cache.js")
      await invalidateDeathCaches()

      // Should call scan for each pattern-based cache
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.RECENT_DEATHS}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.THIS_WEEK}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.DEATH_WATCH}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.CURSED_ACTORS}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.CAUSES}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.DECADES}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.COVID_DEATHS}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.UNNATURAL_DEATHS}:*`,
        "COUNT",
        100
      )
      // Should delete simple key caches directly (no pattern)
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        CACHE_PREFIX.STATS,
        CACHE_PREFIX.TRIVIA,
        CACHE_PREFIX.FEATURED_MOVIE
      )
    })
  })

  describe("invalidateMovieCaches", () => {
    it("invalidates all movie-related cache patterns", async () => {
      // Mock scan to return empty keys (no deletions) for each pattern
      mockRedisClient.scan.mockResolvedValue(["0", []])

      const { invalidateMovieCaches, CACHE_PREFIX } = await import("./cache.js")
      await invalidateMovieCaches()

      // Should call scan for each pattern
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.CURSED_MOVIES}:*`,
        "COUNT",
        100
      )
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        `${CACHE_PREFIX.POPULAR_MOVIES}:*`,
        "COUNT",
        100
      )
      // Should also delete the featured-movie key directly
      expect(mockRedisClient.del).toHaveBeenCalledWith(CACHE_PREFIX.FEATURED_MOVIE)
    })
  })
})
