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
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttribute: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
}))

describe("cache", () => {
  describe("CACHE_PREFIX", () => {
    it("has expected prefixes", () => {
      expect(CACHE_PREFIX.RECENT_DEATHS).toBe("recent-deaths")
      expect(CACHE_PREFIX.STATS).toBe("stats")
      expect(CACHE_PREFIX.TRIVIA).toBe("trivia")
    })
  })

  describe("CACHE_TTL", () => {
    it("has expected TTL values in seconds", () => {
      expect(CACHE_TTL.SHORT).toBe(300) // 5 minutes
      expect(CACHE_TTL.WEEK).toBe(604800) // 1 week
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
      const key = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { page: 1, limit: 50 })
      expect(key).toBe("recent-deaths:limit:50:page:1")
    })

    it("sorts params alphabetically for consistent keys", () => {
      const key1 = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { limit: 10, offset: 0 })
      const key2 = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { offset: 0, limit: 10 })
      expect(key1).toBe(key2)
      expect(key1).toBe("recent-deaths:limit:10:offset:0")
    })

    it("handles boolean params", () => {
      const key = buildCacheKey(CACHE_PREFIX.CAUSES, { includeObscure: true })
      expect(key).toBe("causes:includeObscure:true")
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
      const key = buildCacheKey(CACHE_PREFIX.CAUSES, {
        page: 2,
        status: "living",
        minMovies: 5,
        includeObscure: false,
      })
      expect(key).toBe("causes:includeObscure:false:minMovies:5:page:2:status:living")
    })
  })
})

describe("cache operations with mocked Redis", () => {
  let mockInstrumentedGet: ReturnType<typeof vi.fn>
  let mockInstrumentedSet: ReturnType<typeof vi.fn>
  let mockInstrumentedDel: ReturnType<typeof vi.fn>
  let mockInstrumentedScan: ReturnType<typeof vi.fn>
  let mockRedisClient: {
    flushdb: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    // Reset modules to get fresh imports
    vi.resetModules()

    mockInstrumentedGet = vi.fn()
    mockInstrumentedSet = vi.fn()
    mockInstrumentedDel = vi.fn()
    mockInstrumentedScan = vi.fn()

    mockRedisClient = {
      flushdb: vi.fn(),
    }

    // Mock instrumented Redis functions
    vi.doMock("./redis-instrumentation.js", () => ({
      instrumentedGet: mockInstrumentedGet,
      instrumentedSet: mockInstrumentedSet,
      instrumentedDel: mockInstrumentedDel,
      instrumentedScan: mockInstrumentedScan,
    }))

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
      mockInstrumentedGet.mockResolvedValue(JSON.stringify(testData))

      const { getCached } = await import("./cache.js")
      const result = await getCached<typeof testData>("test-key")

      expect(result).toEqual(testData)
      expect(mockInstrumentedGet).toHaveBeenCalledWith("test-key")
    })

    it("returns null on cache miss", async () => {
      mockInstrumentedGet.mockResolvedValue(null)

      const { getCached } = await import("./cache.js")
      const result = await getCached("test-key")

      expect(result).toBeNull()
    })

    it("returns null and logs warning on Redis error", async () => {
      mockInstrumentedGet.mockRejectedValue(new Error("Redis error"))

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

      expect(mockInstrumentedSet).not.toHaveBeenCalled()
    })

    it("sets value with TTL", async () => {
      mockInstrumentedSet.mockResolvedValue("OK")

      const { setCached } = await import("./cache.js")
      const testData = { foo: "bar" }
      await setCached("test-key", testData, 300)

      expect(mockInstrumentedSet).toHaveBeenCalledWith("test-key", JSON.stringify(testData), 300)
    })

    it("handles Redis errors gracefully", async () => {
      mockInstrumentedSet.mockRejectedValue(new Error("Redis error"))

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

      expect(mockInstrumentedDel).not.toHaveBeenCalled()
    })

    it("does nothing when no keys provided", async () => {
      const { invalidateKeys } = await import("./cache.js")
      await invalidateKeys()

      expect(mockInstrumentedDel).not.toHaveBeenCalled()
    })

    it("deletes specified keys", async () => {
      mockInstrumentedDel.mockResolvedValue(2)

      const { invalidateKeys } = await import("./cache.js")
      await invalidateKeys("key1", "key2")

      expect(mockInstrumentedDel).toHaveBeenCalledWith("key1", "key2")
    })
  })

  describe("getActorCacheKeys", () => {
    it("returns array of all cache keys for an actor", async () => {
      const { getActorCacheKeys } = await import("./cache.js")
      const keys = getActorCacheKeys(5576)

      expect(keys).toEqual(["actor:id:5576", "actor:id:5576:type:death"])
    })
  })

  describe("invalidateActorCache", () => {
    it("invalidates both profile and death cache keys", async () => {
      mockInstrumentedDel.mockResolvedValue(2)

      const { invalidateActorCache } = await import("./cache.js")
      await invalidateActorCache(5576)

      // Should invalidate both profile and death detail cache keys
      expect(mockInstrumentedDel).toHaveBeenCalledWith("actor:id:5576", "actor:id:5576:type:death")
    })
  })

  describe("invalidateActorCacheRequired", () => {
    it("throws error when Redis client is not available", async () => {
      vi.doMock("./redis.js", () => ({
        getRedisClient: vi.fn(() => null),
      }))

      const { invalidateActorCacheRequired } = await import("./cache.js")

      await expect(invalidateActorCacheRequired(5576)).rejects.toThrow(
        "Redis client not available - cannot invalidate cache"
      )
    })

    it("successfully deletes cache keys and logs when Redis is available", async () => {
      mockInstrumentedDel.mockResolvedValue(2)

      const { logger } = await import("./logger.js")
      const { invalidateActorCacheRequired } = await import("./cache.js")

      await invalidateActorCacheRequired(5576)

      expect(mockInstrumentedDel).toHaveBeenCalledWith("actor:id:5576", "actor:id:5576:type:death")
      expect(logger.info).toHaveBeenCalledWith(
        { keys: ["actor:id:5576", "actor:id:5576:type:death"], actorId: 5576 },
        "Actor cache invalidated"
      )
    })

    it("propagates Redis deletion errors", async () => {
      mockInstrumentedDel.mockRejectedValue(new Error("Redis connection failed"))

      const { invalidateActorCacheRequired } = await import("./cache.js")

      await expect(invalidateActorCacheRequired(5576)).rejects.toThrow("Redis connection failed")
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
      mockInstrumentedScan.mockResolvedValue(["key1", "key2", "key3"])
      mockInstrumentedDel.mockResolvedValue(3)

      const { invalidateByPattern } = await import("./cache.js")
      const result = await invalidateByPattern("test:*")

      expect(result).toBe(3)
      expect(mockInstrumentedScan).toHaveBeenCalledWith("test:*", 100)
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

  describe("invalidatePrerenderCache", () => {
    it("invalidates all prerender keys when no pattern is provided", async () => {
      mockInstrumentedScan.mockResolvedValue([
        "prerender:path:/actor/test",
        "prerender:path:/movie/test",
      ])
      mockInstrumentedDel.mockResolvedValue(2)

      const { invalidatePrerenderCache, CACHE_PREFIX } = await import("./cache.js")
      const result = await invalidatePrerenderCache()

      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.PRERENDER}:*`, 100)
      expect(mockInstrumentedDel).toHaveBeenCalledWith(
        "prerender:path:/actor/test",
        "prerender:path:/movie/test"
      )
      expect(result).toBe(2)
    })

    it("invalidates only matching prerender keys when pattern is provided", async () => {
      mockInstrumentedScan.mockResolvedValue(["prerender:path:/actor/john-wayne-2157"])
      mockInstrumentedDel.mockResolvedValue(1)

      const { invalidatePrerenderCache, CACHE_PREFIX } = await import("./cache.js")
      const result = await invalidatePrerenderCache("/actor/*-2157")

      expect(mockInstrumentedScan).toHaveBeenCalledWith(
        `${CACHE_PREFIX.PRERENDER}:*/actor/*-2157*`,
        100
      )
      expect(result).toBe(1)
    })

    it("returns 0 when no keys match", async () => {
      mockInstrumentedScan.mockResolvedValue([])

      const { invalidatePrerenderCache } = await import("./cache.js")
      const result = await invalidatePrerenderCache("/nonexistent")

      expect(result).toBe(0)
      expect(mockInstrumentedDel).not.toHaveBeenCalled()
    })
  })

  describe("invalidateDeathCaches", () => {
    it("invalidates all death-related cache patterns", async () => {
      // Mock scan to return empty keys (no deletions) for each pattern
      mockInstrumentedScan.mockResolvedValue([])

      const { invalidateDeathCaches, CACHE_PREFIX } = await import("./cache.js")
      await invalidateDeathCaches()

      // Should call scan for each pattern-based cache
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.RECENT_DEATHS}:*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.THIS_WEEK}:*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.CAUSES}:*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.DECADES}:*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.COVID_DEATHS}:*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.UNNATURAL_DEATHS}:*`, 100)
      // Should delete simple key caches directly (no pattern)
      expect(mockInstrumentedDel).toHaveBeenCalledWith(
        CACHE_PREFIX.STATS,
        CACHE_PREFIX.TRIVIA,
        CACHE_PREFIX.FEATURED_MOVIE
      )
      // Should invalidate prerender caches for death-related pages
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.PRERENDER}:*/deaths*`, 100)
      expect(mockInstrumentedScan).toHaveBeenCalledWith(
        `${CACHE_PREFIX.PRERENDER}:*/causes-of-death*`,
        100
      )
    })
  })

  describe("invalidateMovieCaches", () => {
    it("invalidates all movie-related cache patterns", async () => {
      // Mock scan to return empty keys (no deletions) for each pattern
      mockInstrumentedScan.mockResolvedValue([])

      const { invalidateMovieCaches, CACHE_PREFIX } = await import("./cache.js")
      await invalidateMovieCaches()

      // Should call scan for each pattern
      expect(mockInstrumentedScan).toHaveBeenCalledWith(`${CACHE_PREFIX.POPULAR_MOVIES}:*`, 100)
      // Should also delete the featured-movie key directly
      expect(mockInstrumentedDel).toHaveBeenCalledWith(CACHE_PREFIX.FEATURED_MOVIE)
    })
  })

  describe("rebuildDeathCaches", () => {
    const mockDeaths = [{ id: 1, name: "Actor 1" }]
    const mockStats = { totalActors: 100 }
    const mockThisWeekDeaths = [{ id: 2, name: "Actor 2" }]

    beforeEach(() => {
      // Mock db functions
      vi.doMock("./db.js", () => ({
        getRecentDeaths: vi.fn().mockResolvedValue(mockDeaths),
        getSiteStats: vi.fn().mockResolvedValue(mockStats),
        getDeathsThisWeekSimple: vi.fn().mockResolvedValue(mockThisWeekDeaths),
      }))
    })

    it("invalidates death caches first, then rebuilds common caches", async () => {
      mockInstrumentedScan.mockResolvedValue([])
      mockInstrumentedSet.mockResolvedValue(undefined)

      const { rebuildDeathCaches, CACHE_PREFIX, CACHE_TTL } = await import("./cache.js")
      await rebuildDeathCaches()

      // Should invalidate first (via scan calls)
      expect(mockInstrumentedScan).toHaveBeenCalled()

      // Should rebuild recent deaths for limits 5, 10, 20
      expect(mockInstrumentedSet).toHaveBeenCalledWith(
        "recent-deaths:limit:5",
        JSON.stringify(mockDeaths),
        CACHE_TTL.WEEK
      )
      expect(mockInstrumentedSet).toHaveBeenCalledWith(
        "recent-deaths:limit:10",
        JSON.stringify(mockDeaths),
        CACHE_TTL.WEEK
      )
      expect(mockInstrumentedSet).toHaveBeenCalledWith(
        "recent-deaths:limit:20",
        JSON.stringify(mockDeaths),
        CACHE_TTL.WEEK
      )

      // Should rebuild stats
      expect(mockInstrumentedSet).toHaveBeenCalledWith(
        CACHE_PREFIX.STATS,
        JSON.stringify(mockStats),
        CACHE_TTL.WEEK
      )

      // Should rebuild this-week deaths (with week key)
      expect(mockInstrumentedSet).toHaveBeenCalledWith(
        expect.stringMatching(/^this-week:week:\d{4}-\d{2}-\d{2}$/),
        JSON.stringify(mockThisWeekDeaths),
        CACHE_TTL.WEEK
      )
    })

    it("handles errors gracefully without throwing", async () => {
      mockInstrumentedScan.mockResolvedValue([])

      // Mock db function to throw
      vi.doMock("./db.js", () => ({
        getRecentDeaths: vi.fn().mockRejectedValue(new Error("DB error")),
        getSiteStats: vi.fn().mockResolvedValue(mockStats),
        getDeathsThisWeekSimple: vi.fn().mockResolvedValue(mockThisWeekDeaths),
      }))

      const { rebuildDeathCaches } = await import("./cache.js")

      // Should not throw
      await expect(rebuildDeathCaches()).resolves.toBeUndefined()
    })
  })
})
