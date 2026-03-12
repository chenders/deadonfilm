/**
 * Tests for EnrichDeathDetailsHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { EnrichDeathDetailsHandler } from "./enrich-death-details.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"

// Mock EnrichmentRunner — capture constructor config for assertions
const mockRunnerRun = vi.hoisted(() => vi.fn())
const mockRunnerConfig = vi.hoisted(() => vi.fn())

vi.mock("../../enrichment-runner.js", () => ({
  EnrichmentRunner: class MockEnrichmentRunner {
    run = mockRunnerRun
    constructor(config: Record<string, unknown>) {
      mockRunnerConfig(config)
    }
  },
}))

vi.mock("newrelic", () => ({
  default: {
    startBackgroundTransaction: vi.fn((_name: string, fn: () => unknown) => fn()),
    addCustomAttribute: vi.fn(),
    startSegment: vi.fn((_name: string, _record: boolean, fn: () => unknown) => fn()),
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  },
}))

vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
}))

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

function makeJob(
  overrides: Partial<{ actorId: number; actorName: string; forceRefresh: boolean }> = {}
): Job {
  return {
    id: "test-job-123",
    data: {
      actorId: 2157,
      actorName: "John Wayne",
      forceRefresh: false,
      ...overrides,
    },
    attemptsMade: 0,
    opts: { priority: 10, attempts: 3 },
  } as Job
}

describe("EnrichDeathDetailsHandler", () => {
  let handler: EnrichDeathDetailsHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new EnrichDeathDetailsHandler()
    vi.clearAllMocks()

    mockPool = { query: vi.fn() }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.ENRICH_DEATH_DETAILS)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.ENRICHMENT)
    })
  })

  describe("actor not found", () => {
    it("returns failure when actor not found in database", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await handler.process(makeJob({ actorId: 999999 }))

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor with ID 999999 not found")
      expect(result.metadata?.isPermanent).toBe(true)
      expect(mockRunnerRun).not.toHaveBeenCalled()
    })
  })

  describe("actor not deceased", () => {
    it("returns failure when actor has no deathday", async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 12345, name: "Living Actor", deathday: null, circumstances: null }],
      })

      const result = await handler.process(makeJob({ actorId: 12345, actorName: "Living Actor" }))

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor Living Actor (ID: 12345) is not deceased")
      expect(result.metadata?.isPermanent).toBe(true)
      expect(mockRunnerRun).not.toHaveBeenCalled()
    })
  })

  describe("already enriched", () => {
    it("skips enrichment when actor already has circumstances", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            deathday: "1979-06-11",
            circumstances: "John Wayne died of stomach cancer.",
          },
        ],
      })

      const result = await handler.process(makeJob())

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
      expect(result.data?.costUsd).toBe(0)
      expect(result.metadata?.skipped).toBe(true)
      expect(result.metadata?.reason).toBe("already_enriched")
      expect(mockRunnerRun).not.toHaveBeenCalled()
    })
  })

  describe("forceRefresh", () => {
    it("runs enrichment when forceRefresh is true even with existing data", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            deathday: "1979-06-11",
            circumstances: "Old data",
          },
        ],
      })

      mockRunnerRun.mockResolvedValue({
        actorsProcessed: 1,
        actorsEnriched: 1,
        fillRate: 100,
        totalCostUsd: 0.05,
        totalTimeMs: 3000,
        costBySource: {},
        exitReason: "completed",
        updatedActors: [{ name: "John Wayne", id: 2157 }],
      })

      const result = await handler.process(makeJob({ forceRefresh: true }))

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(true)
      expect(mockRunnerRun).toHaveBeenCalled()
      expect(mockRunnerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          actorIds: [2157],
          limit: 1,
          ignoreCache: true,
          claudeCleanup: true,
          confidence: 0.5,
        })
      )
    })
  })

  describe("successful enrichment", () => {
    it("returns success with enrichment stats", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            deathday: "1979-06-11",
            circumstances: null,
          },
        ],
      })

      mockRunnerRun.mockResolvedValue({
        actorsProcessed: 1,
        actorsEnriched: 1,
        fillRate: 100,
        totalCostUsd: 0.03,
        totalTimeMs: 2500,
        costBySource: { wikipedia: 0, claude_cleanup: 0.03 },
        exitReason: "completed",
        updatedActors: [{ name: "John Wayne", id: 2157 }],
      })

      const result = await handler.process(makeJob())

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        actorId: 2157,
        actorName: "John Wayne",
        enriched: true,
        costUsd: 0.03,
        stats: expect.objectContaining({
          actorsProcessed: 1,
          actorsEnriched: 1,
        }),
      })
      expect(mockRunnerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          actorIds: [2157],
          limit: 1,
          ignoreCache: false,
          claudeCleanup: true,
          confidence: 0.5,
        })
      )
    })

    it("returns enriched: false when runner finds no data", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            deathday: "1979-06-11",
            circumstances: null,
          },
        ],
      })

      mockRunnerRun.mockResolvedValue({
        actorsProcessed: 1,
        actorsEnriched: 0,
        fillRate: 0,
        totalCostUsd: 0.01,
        totalTimeMs: 1500,
        costBySource: {},
        exitReason: "completed",
        updatedActors: [],
      })

      const result = await handler.process(makeJob())

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
    })
  })

  describe("canonical name from DB", () => {
    it("uses DB name over stale payload name", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "Marion Robert Morrison",
            deathday: "1979-06-11",
            circumstances: null,
          },
        ],
      })

      mockRunnerRun.mockResolvedValue({
        actorsProcessed: 1,
        actorsEnriched: 1,
        fillRate: 100,
        totalCostUsd: 0.03,
        totalTimeMs: 2500,
        costBySource: {},
        exitReason: "completed",
        updatedActors: [{ name: "Marion Robert Morrison", id: 2157 }],
      })

      const result = await handler.process(makeJob({ actorName: "John Wayne" }))

      expect(result.success).toBe(true)
      expect(result.data?.actorName).toBe("Marion Robert Morrison")
    })
  })

  describe("error handling", () => {
    it("throws transient errors for BullMQ retry", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            deathday: "1979-06-11",
            circumstances: null,
          },
        ],
      })

      mockRunnerRun.mockRejectedValue(new Error("Network timeout"))

      await expect(handler.process(makeJob())).rejects.toThrow("Network timeout")
    })
  })
})
