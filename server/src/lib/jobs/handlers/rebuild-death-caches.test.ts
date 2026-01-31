/**
 * Tests for RebuildDeathCachesHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { RebuildDeathCachesHandler } from "./rebuild-death-caches.js"
import { JobType, QueueName } from "../types.js"
import * as cache from "../../cache.js"
import * as db from "../../db.js"

// Mock external dependencies
vi.mock("../../cache.js")
vi.mock("../../db.js")
vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}))

// Mock New Relic
vi.mock("newrelic", () => ({
  default: {
    startBackgroundTransaction: vi.fn((name, fn) => fn()),
    addCustomAttribute: vi.fn(),
    startSegment: vi.fn((name, record, fn) => fn()),
    recordMetric: vi.fn(),
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  },
}))

describe("RebuildDeathCachesHandler", () => {
  let handler: RebuildDeathCachesHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new RebuildDeathCachesHandler()
    mockPool = { query: vi.fn() }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.REBUILD_DEATH_CACHES)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.CACHE)
    })
  })

  describe("process - successful cache rebuild", () => {
    const mockJob = {
      id: "test-job-123",
      data: {},
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    const mockRecentDeath = {
      name: "John Doe",
      deathday: "2026-01-15",
    }

    it("successfully rebuilds caches and stores metadata", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      vi.mocked(cache.setDeathCacheMetadata).mockResolvedValue()
      mockPool.query.mockResolvedValue({ rows: [mockRecentDeath] })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.rebuilt).toBe(true)
      expect(result.data?.mostRecentDeath).toEqual(mockRecentDeath)
      expect(result.data?.cacheRebuiltAt).toBeDefined()
      expect(result.data?.duration).toBeGreaterThanOrEqual(0)
      expect(cache.rebuildDeathCaches).toHaveBeenCalled()
      expect(cache.setDeathCacheMetadata).toHaveBeenCalledWith({
        lastRebuiltAt: expect.any(String),
        mostRecentDeath: mockRecentDeath,
      })
    })

    it("queries for most recent non-obscure death", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      vi.mocked(cache.setDeathCacheMetadata).mockResolvedValue()
      mockPool.query.mockResolvedValue({ rows: [mockRecentDeath] })

      await handler.process(mockJob)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE deathday IS NOT NULL AND is_obscure = false")
      )
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY deathday DESC"))
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 1"))
    })

    it("handles case with no recent deaths", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      vi.mocked(cache.setDeathCacheMetadata).mockResolvedValue()
      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.mostRecentDeath).toBeUndefined()
      expect(cache.setDeathCacheMetadata).toHaveBeenCalledWith({
        lastRebuiltAt: expect.any(String),
        mostRecentDeath: undefined,
      })
    })
  })

  describe("process - error handling", () => {
    const mockJob = {
      id: "test-job-error",
      data: {},
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    it("handles cache rebuild failure", async () => {
      const error = new Error("Redis connection failed")
      vi.mocked(cache.rebuildDeathCaches).mockRejectedValue(error)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Redis connection failed")
      expect(result.data?.rebuilt).toBe(false)
      expect(result.data?.duration).toBeGreaterThanOrEqual(0)
    })

    it("handles metadata storage failure", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      mockPool.query.mockResolvedValue({ rows: [] })
      vi.mocked(cache.setDeathCacheMetadata).mockRejectedValue(
        new Error("Failed to store metadata")
      )

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Failed to store metadata")
      expect(result.data?.rebuilt).toBe(false)
    })

    it("handles database query failure", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      mockPool.query.mockRejectedValue(new Error("Database connection lost"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Database connection lost")
      expect(result.data?.rebuilt).toBe(false)
    })
  })

  describe("New Relic integration", () => {
    const mockJob = {
      id: "test-job-newrelic",
      data: {},
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    it("records success metrics on successful rebuild", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockResolvedValue()
      vi.mocked(cache.setDeathCacheMetadata).mockResolvedValue()
      mockPool.query.mockResolvedValue({ rows: [] })

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/RebuildDeathCaches/Success",
        1
      )
      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/RebuildDeathCaches/Duration",
        expect.any(Number)
      )
    })

    it("records error metric on failure", async () => {
      vi.mocked(cache.rebuildDeathCaches).mockRejectedValue(new Error("Cache rebuild failed"))

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/RebuildDeathCaches/Error",
        1
      )
    })
  })
})
