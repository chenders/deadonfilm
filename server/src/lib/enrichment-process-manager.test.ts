/**
 * Tests for enrichment process manager
 *
 * The process manager now uses BullMQ instead of spawning scripts directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as processManager from "./enrichment-process-manager.js"
import * as db from "./db.js"
import { queueManager } from "./jobs/queue-manager.js"

// Mock database
vi.mock("./db.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}))

// Mock queue manager
vi.mock("./jobs/queue-manager.js", () => ({
  queueManager: {
    addJob: vi.fn(),
    cancelJob: vi.fn(),
  },
}))

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock newrelic
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

describe("enrichment-process-manager", () => {
  let mockPool: {
    query: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)

    // Setup default mock for addJob
    vi.mocked(queueManager.addJob).mockResolvedValue("job-123")
    vi.mocked(queueManager.cancelJob).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("startEnrichmentRun", () => {
    it("should create a new enrichment run and enqueue BullMQ job", async () => {
      // Mock database responses
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT enrichment_runs
        .mockResolvedValueOnce({ rows: [] }) // UPDATE status to running

      const config = {
        limit: 10,
        maxTotalCost: 5,
        free: true,
        paid: false,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      }

      const runId = await processManager.startEnrichmentRun(config)

      expect(runId).toBe(1)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO enrichment_runs"),
        expect.arrayContaining(["pending", JSON.stringify(config)])
      )
      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({
          runId: 1,
          limit: 10,
          maxTotalCost: 5,
          free: true,
          paid: false,
          ai: false,
        }),
        expect.objectContaining({ createdBy: "admin-enrichment" })
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([1])
      )
    })

    it("should include limit in job payload", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        limit: 50,
      })

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({ limit: 50 }),
        expect.any(Object)
      )
    })

    it("should include maxTotalCost in job payload", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        maxTotalCost: 10,
      })

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({ maxTotalCost: 10 }),
        expect.any(Object)
      )
    })

    it("should include runId in job payload", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        limit: 10,
      })

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({ runId: 42 }),
        expect.any(Object)
      )
    })

    it("should include actorIds in job payload when provided", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        actorIds: [123, 456, 789],
      })

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({ actorIds: [123, 456, 789] }),
        expect.any(Object)
      )
    })

    it("should use default values for boolean flags", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({})

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-death-details-batch",
        expect.objectContaining({
          free: true,
          paid: true,
          ai: false,
          confidence: 0.5,
          claudeCleanup: true,
          gatherAllSources: true,
          followLinks: true,
          aiLinkSelection: true,
          aiContentExtraction: true,
          usActorsOnly: false,
        }),
        expect.any(Object)
      )
    })
  })

  describe("stopEnrichmentRun", () => {
    it("should cancel running job and update database", async () => {
      // Start a run first
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      const runId = await processManager.startEnrichmentRun({
        limit: 10,
      })

      // Mock the update query for stopping
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      // Stop the run
      const stopped = await processManager.stopEnrichmentRun(runId)

      expect(stopped).toBe(true)
      expect(queueManager.cancelJob).toHaveBeenCalledWith("job-123")
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([runId])
      )
    })

    it("should throw error if run not found", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      await expect(processManager.stopEnrichmentRun(999)).rejects.toThrow(
        "Enrichment run 999 not found"
      )
    })

    it("should throw error if run is not running", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: "completed" }],
      })

      await expect(processManager.stopEnrichmentRun(2)).rejects.toThrow(
        "Enrichment run 2 is not running (status: completed)"
      )
    })

    it("should handle job not in memory by updating database directly", async () => {
      // Don't start a run first - simulate orphaned job scenario
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ status: "running" }] }) // SELECT status
        .mockResolvedValueOnce({ rows: [] }) // UPDATE

      const stopped = await processManager.stopEnrichmentRun(999)

      expect(stopped).toBe(true)
      expect(queueManager.cancelJob).not.toHaveBeenCalled()
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([999])
      )
    })
  })

  describe("getEnrichmentRunProgress", () => {
    it("should fetch progress from database", async () => {
      const mockProgress = {
        status: "running",
        current_actor_index: 5,
        current_actor_name: "Test Actor",
        actors_queried: 10,
        actors_processed: 5,
        actors_enriched: 3,
        total_cost_usd: "1.5000",
        started_at: new Date("2024-01-01T00:00:00Z"),
      }

      mockPool.query.mockResolvedValueOnce({ rows: [mockProgress] })

      const progress = await processManager.getEnrichmentRunProgress(1)

      expect(progress.status).toBe("running")
      expect(progress.currentActorIndex).toBe(5)
      expect(progress.currentActorName).toBe("Test Actor")
      expect(progress.actorsQueried).toBe(10)
      expect(progress.actorsProcessed).toBe(5)
      expect(progress.actorsEnriched).toBe(3)
      expect(progress.totalCostUsd).toBe(1.5)
      expect(progress.progressPercentage).toBe(50.0)
    })

    it("should calculate estimated time remaining", async () => {
      const startedAt = new Date(Date.now() - 10000) // 10 seconds ago
      const mockProgress = {
        status: "running",
        current_actor_index: 5,
        current_actor_name: "Test Actor",
        actors_queried: 10,
        actors_processed: 5,
        actors_enriched: 3,
        total_cost_usd: "1.5000",
        started_at: startedAt,
      }

      mockPool.query.mockResolvedValueOnce({ rows: [mockProgress] })

      const progress = await processManager.getEnrichmentRunProgress(1)

      // Should estimate ~10 seconds remaining (5 actors left at 2 sec/actor)
      expect(progress.estimatedTimeRemainingMs).toBeGreaterThan(9000)
      expect(progress.estimatedTimeRemainingMs).toBeLessThan(11000)
    })

    it("should throw error if run not found", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      await expect(processManager.getEnrichmentRunProgress(999)).rejects.toThrow(
        "Enrichment run 999 not found"
      )
    })
  })

  describe("getRunningEnrichments", () => {
    it("should track run IDs when jobs are started", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 101 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 102 }] })
        .mockResolvedValueOnce({ rows: [] })

      vi.mocked(queueManager.addJob)
        .mockResolvedValueOnce("job-101")
        .mockResolvedValueOnce("job-102")

      await processManager.startEnrichmentRun({ limit: 10 })
      await processManager.startEnrichmentRun({ limit: 20 })

      const running = processManager.getRunningEnrichments()
      expect(running).toContain(101)
      expect(running).toContain(102)
    })
  })
})
