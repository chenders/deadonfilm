import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies using vi.hoisted to ensure they're available in mock factories
const { mockGet, mockSetex, mockSet, mockDel, mockScan, mockPing, mockClient } = vi.hoisted(() => {
  const mockGet = vi.fn()
  const mockSetex = vi.fn()
  const mockSet = vi.fn()
  const mockDel = vi.fn()
  const mockScan = vi.fn()
  const mockPing = vi.fn()

  const mockClient = {
    get: mockGet,
    setex: mockSetex,
    set: mockSet,
    del: mockDel,
    scan: mockScan,
    ping: mockPing,
  }

  return { mockGet, mockSetex, mockSet, mockDel, mockScan, mockPing, mockClient }
})

const { mockRecordCustomEvent, mockStartSegment } = vi.hoisted(() => {
  const mockRecordCustomEvent = vi.fn()
  const mockStartSegment = vi.fn((name, record, handler) => handler())
  return { mockRecordCustomEvent, mockStartSegment }
})

vi.mock("./redis.js", () => ({
  getRedisClient: vi.fn(() => mockClient),
}))

vi.mock("./newrelic.js", () => ({
  recordCustomEvent: mockRecordCustomEvent,
  startSegment: mockStartSegment,
}))

import {
  instrumentedGet,
  instrumentedSet,
  instrumentedDel,
  instrumentedScan,
  instrumentedPing,
} from "./redis-instrumentation.js"

describe("redis-instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("instrumentedGet", () => {
    it("records RedisOperation event on cache hit", async () => {
      mockGet.mockResolvedValue("cached-value")

      const result = await instrumentedGet("actor:id:123")

      expect(result).toBe("cached-value")
      expect(mockStartSegment).toHaveBeenCalledWith("Redis/get", true, expect.any(Function))
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "get",
          keyPrefix: "actor",
          hit: true,
          success: true,
          durationMs: expect.any(Number),
        })
      )
    })

    it("records RedisOperation event on cache miss", async () => {
      mockGet.mockResolvedValue(null)

      const result = await instrumentedGet("movie:id:456")

      expect(result).toBeNull()
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "get",
          keyPrefix: "movie",
          hit: false,
          success: true,
        })
      )
    })

    it("records error when Redis operation fails", async () => {
      const error = new Error("Redis connection failed")
      mockGet.mockRejectedValue(error)

      await expect(instrumentedGet("show:id:789")).rejects.toThrow("Redis connection failed")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "get",
          keyPrefix: "show",
          success: false,
          error: "Redis connection failed",
        })
      )
    })

    it("extracts key prefix correctly for simple keys", async () => {
      mockGet.mockResolvedValue(null)

      await instrumentedGet("stats")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          keyPrefix: "stats",
        })
      )
    })
  })

  describe("instrumentedSet", () => {
    it("records RedisOperation event with TTL", async () => {
      mockSetex.mockResolvedValue("OK")

      await instrumentedSet("actor:id:123", "value", 3600)

      expect(mockSetex).toHaveBeenCalledWith("actor:id:123", 3600, "value")
      expect(mockStartSegment).toHaveBeenCalledWith("Redis/set", true, expect.any(Function))
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "set",
          keyPrefix: "actor",
          ttl: 3600,
          success: true,
          durationMs: expect.any(Number),
        })
      )
    })

    it("records RedisOperation event without TTL", async () => {
      mockSet.mockResolvedValue("OK")

      await instrumentedSet("temp-key", "value")

      expect(mockSet).toHaveBeenCalledWith("temp-key", "value")
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "set",
          keyPrefix: "temp-key",
          success: true,
        })
      )
      expect(mockRecordCustomEvent.mock.calls[0][1]).not.toHaveProperty("ttl")
    })

    it("records error when set operation fails", async () => {
      const error = new Error("Write failed")
      mockSetex.mockRejectedValue(error)

      await expect(instrumentedSet("key", "value", 100)).rejects.toThrow("Write failed")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          success: false,
          error: "Write failed",
        })
      )
    })
  })

  describe("instrumentedDel", () => {
    it("records RedisOperation event for single key deletion", async () => {
      mockDel.mockResolvedValue(1)

      const result = await instrumentedDel("actor:id:123")

      expect(result).toBe(1)
      expect(mockDel).toHaveBeenCalledWith("actor:id:123")
      expect(mockStartSegment).toHaveBeenCalledWith("Redis/del", true, expect.any(Function))
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "del",
          keyPrefix: "actor",
          success: true,
        })
      )
    })

    it("records RedisOperation events for multiple keys with same prefix", async () => {
      mockDel.mockResolvedValue(2)

      await instrumentedDel("actor:id:123", "actor:id:456")

      expect(mockRecordCustomEvent).toHaveBeenCalledTimes(1)
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "del",
          keyPrefix: "actor",
        })
      )
    })

    it("records RedisOperation events for multiple keys with different prefixes", async () => {
      mockDel.mockResolvedValue(2)

      await instrumentedDel("actor:id:123", "movie:id:456")

      expect(mockRecordCustomEvent).toHaveBeenCalledTimes(2)
      expect(mockRecordCustomEvent).toHaveBeenNthCalledWith(
        1,
        "RedisOperation",
        expect.objectContaining({
          keyPrefix: "actor",
        })
      )
      expect(mockRecordCustomEvent).toHaveBeenNthCalledWith(
        2,
        "RedisOperation",
        expect.objectContaining({
          keyPrefix: "movie",
        })
      )
    })

    it("records error when delete operation fails", async () => {
      const error = new Error("Delete failed")
      mockDel.mockRejectedValue(error)

      await expect(instrumentedDel("key")).rejects.toThrow("Delete failed")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          success: false,
          error: "Delete failed",
        })
      )
    })
  })

  describe("instrumentedScan", () => {
    it("records RedisOperation event for scan operation", async () => {
      mockScan
        .mockResolvedValueOnce(["10", ["key1", "key2"]])
        .mockResolvedValueOnce(["0", ["key3"]])

      const result = await instrumentedScan("actor:*", 100)

      expect(result).toEqual(["key1", "key2", "key3"])
      expect(mockScan).toHaveBeenCalledTimes(2)
      expect(mockStartSegment).toHaveBeenCalledWith("Redis/scan", true, expect.any(Function))
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "scan",
          keyPrefix: "actor:*",
          success: true,
          durationMs: expect.any(Number),
        })
      )
    })

    it("records error when scan operation fails", async () => {
      const error = new Error("Scan failed")
      mockScan.mockRejectedValue(error)

      await expect(instrumentedScan("pattern:*")).rejects.toThrow("Scan failed")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "scan",
          success: false,
          error: "Scan failed",
        })
      )
    })
  })

  describe("instrumentedPing", () => {
    it("records RedisOperation event for ping operation", async () => {
      mockPing.mockResolvedValue("PONG")

      const result = await instrumentedPing()

      expect(result).toBe("PONG")
      expect(mockPing).toHaveBeenCalled()
      expect(mockStartSegment).toHaveBeenCalledWith("Redis/ping", true, expect.any(Function))
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "ping",
          keyPrefix: "healthcheck",
          success: true,
          durationMs: expect.any(Number),
        })
      )
    })

    it("records error when ping operation fails", async () => {
      const error = new Error("Connection timeout")
      mockPing.mockRejectedValue(error)

      await expect(instrumentedPing()).rejects.toThrow("Connection timeout")

      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        "RedisOperation",
        expect.objectContaining({
          operation: "ping",
          success: false,
          error: "Connection timeout",
        })
      )
    })
  })
})
