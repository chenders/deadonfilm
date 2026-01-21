import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock ioredis with a class-like factory
const mockConnect = vi.fn()
const mockQuit = vi.fn()
const mockDisconnect = vi.fn()
const mockPing = vi.fn()
const mockOn = vi.fn()

// Store event handlers to simulate events
const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {}

const MockRedis = vi.fn(function (this: unknown) {
  mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = []
    }
    eventHandlers[event].push(handler)
    return this
  })
  return {
    connect: mockConnect,
    quit: mockQuit,
    disconnect: mockDisconnect,
    ping: mockPing,
    on: mockOn,
  }
})

vi.mock("ioredis", () => ({
  default: MockRedis,
}))

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

function emitEvent(event: string, ...args: unknown[]) {
  if (eventHandlers[event]) {
    eventHandlers[event].forEach((handler) => handler(...args))
  }
}

describe("redis", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Clear event handlers
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key])

    // Reset mock implementations
    mockConnect.mockResolvedValue(undefined)
    mockQuit.mockResolvedValue("OK")
    mockPing.mockResolvedValue("PONG")

    // Clear env
    delete process.env.REDIS_URL
  })

  afterEach(() => {
    delete process.env.REDIS_URL
  })

  describe("getRedisClient", () => {
    it("returns null when REDIS_URL is not set", async () => {
      const { getRedisClient } = await import("./redis.js")
      const client = getRedisClient()
      expect(client).toBeNull()
    })

    it("creates Redis client when REDIS_URL is set", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, _resetForTesting } = await import("./redis.js")
      getRedisClient()

      expect(MockRedis).toHaveBeenCalledWith("redis://localhost:6379", expect.any(Object))
      _resetForTesting()
    })

    it("returns null when not connected yet", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, _resetForTesting } = await import("./redis.js")

      // Client exists but not connected
      const client = getRedisClient()
      expect(client).toBeNull() // isConnected is false

      _resetForTesting()
    })

    it("returns client when connected", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, _resetForTesting } = await import("./redis.js")

      // First call creates the client
      getRedisClient()

      // Simulate connect event
      emitEvent("connect")

      // Now client should be returned (not null)
      const client = getRedisClient()
      expect(client).not.toBeNull()

      _resetForTesting()
    })

    it("sets isConnected true on ready event", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, isRedisAvailable, _resetForTesting } = await import("./redis.js")

      getRedisClient()
      expect(isRedisAvailable()).toBe(false)

      emitEvent("ready")
      expect(isRedisAvailable()).toBe(true)

      _resetForTesting()
    })

    it("sets isConnected false on close event", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, isRedisAvailable, _resetForTesting } = await import("./redis.js")

      getRedisClient()
      emitEvent("connect")
      expect(isRedisAvailable()).toBe(true)

      emitEvent("close")
      expect(isRedisAvailable()).toBe(false)

      _resetForTesting()
    })

    it("handles error event without crashing", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"
      const { logger } = await import("./logger.js")

      const { getRedisClient, _resetForTesting } = await import("./redis.js")

      getRedisClient()
      emitEvent("error", new Error("Connection refused"))

      expect(logger.warn).toHaveBeenCalledWith({ err: "Connection refused" }, "Redis error")

      _resetForTesting()
    })

    it("logs on reconnecting event", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"
      const { logger } = await import("./logger.js")

      const { getRedisClient, _resetForTesting } = await import("./redis.js")

      getRedisClient()
      emitEvent("reconnecting")

      expect(logger.info).toHaveBeenCalledWith("Redis reconnecting...")

      _resetForTesting()
    })

    it("reuses existing client on subsequent calls", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, _resetForTesting } = await import("./redis.js")

      MockRedis.mockClear()
      getRedisClient()
      getRedisClient()
      getRedisClient()

      // Redis constructor should only be called once
      expect(MockRedis).toHaveBeenCalledTimes(1)

      _resetForTesting()
    })
  })

  describe("isRedisAvailable", () => {
    it("returns false when client is null", async () => {
      const { isRedisAvailable } = await import("./redis.js")
      expect(isRedisAvailable()).toBe(false)
    })

    it("returns false when client exists but not connected", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, isRedisAvailable, _resetForTesting } = await import("./redis.js")

      getRedisClient() // Creates client but not connected
      expect(isRedisAvailable()).toBe(false)

      _resetForTesting()
    })

    it("returns true when client is connected", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, isRedisAvailable, _resetForTesting } = await import("./redis.js")

      getRedisClient()
      emitEvent("connect")
      expect(isRedisAvailable()).toBe(true)

      _resetForTesting()
    })
  })

  describe("closeRedis", () => {
    it("does nothing when client is null", async () => {
      const { closeRedis } = await import("./redis.js")
      await closeRedis()
      expect(mockQuit).not.toHaveBeenCalled()
    })

    it("closes the client and resets state", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, closeRedis, isRedisAvailable } = await import("./redis.js")

      getRedisClient()
      emitEvent("connect")
      expect(isRedisAvailable()).toBe(true)

      await closeRedis()

      expect(mockQuit).toHaveBeenCalled()
      expect(isRedisAvailable()).toBe(false)
    })

    it("handles errors on quit gracefully", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"
      mockQuit.mockRejectedValue(new Error("Quit failed"))

      const { getRedisClient, closeRedis, isRedisAvailable } = await import("./redis.js")

      getRedisClient()
      emitEvent("connect")

      // Should not throw
      await expect(closeRedis()).resolves.toBeUndefined()
      expect(isRedisAvailable()).toBe(false)
    })
  })

  describe("initRedis", () => {
    it("returns false when REDIS_URL is not set", async () => {
      const { logger } = await import("./logger.js")
      const { initRedis } = await import("./redis.js")

      const result = await initRedis()

      expect(result).toBe(false)
      expect(logger.info).toHaveBeenCalledWith("REDIS_URL not set - caching disabled")
    })

    it("returns true when connection is established and ping succeeds", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { initRedis, _resetForTesting } = await import("./redis.js")

      // Simulate immediate connection via event
      mockConnect.mockImplementation(async () => {
        emitEvent("connect")
      })

      const result = await initRedis()
      expect(result).toBe(true)

      _resetForTesting()
    })

    it("returns false when connection fails", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { initRedis, _resetForTesting } = await import("./redis.js")

      // Connection fails
      mockConnect.mockRejectedValue(new Error("Connection failed"))

      const result = await initRedis()
      expect(result).toBe(false)

      _resetForTesting()
    })

    it("returns false when ping fails", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"
      mockPing.mockRejectedValue(new Error("Ping failed"))

      const { initRedis, _resetForTesting } = await import("./redis.js")

      mockConnect.mockImplementation(async () => {
        emitEvent("connect")
      })

      const result = await initRedis()
      expect(result).toBe(false)

      _resetForTesting()
    })
  })

  describe("_resetForTesting", () => {
    it("disconnects client and resets state", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      const { getRedisClient, _resetForTesting, isRedisAvailable } = await import("./redis.js")

      getRedisClient()
      emitEvent("connect")
      expect(isRedisAvailable()).toBe(true)

      _resetForTesting()

      expect(mockDisconnect).toHaveBeenCalled()
      expect(isRedisAvailable()).toBe(false)
    })
  })

  describe("retryStrategy", () => {
    it("returns increasing delay for retries up to 3", async () => {
      process.env.REDIS_URL = "redis://localhost:6379"

      // Capture the options passed to Redis constructor
      let capturedOptions: { retryStrategy?: (times: number) => number | null } | undefined

      const mockRedisAny = MockRedis as any
      mockRedisAny.mockImplementation(function (
        this: unknown,
        _url: string,
        options: typeof capturedOptions
      ) {
        capturedOptions = options
        return {
          connect: mockConnect,
          quit: mockQuit,
          disconnect: mockDisconnect,
          ping: mockPing,
          on: mockOn,
        }
      })

      const { getRedisClient, _resetForTesting } = await import("./redis.js")
      getRedisClient()

      expect(capturedOptions?.retryStrategy).toBeDefined()
      expect(capturedOptions?.retryStrategy?.(1)).toBe(100)
      expect(capturedOptions?.retryStrategy?.(2)).toBe(200)
      expect(capturedOptions?.retryStrategy?.(3)).toBe(300)
      expect(capturedOptions?.retryStrategy?.(4)).toBeNull() // Give up after 3

      _resetForTesting()
    })
  })
})
