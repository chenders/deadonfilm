/**
 * Tests for enrichment process manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { spawn } from "child_process"
import { EventEmitter } from "events"
import * as processManager from "./enrichment-process-manager.js"
import * as db from "./db.js"

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

// Mock database
vi.mock("./db.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}))

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock newrelic
vi.mock("./newrelic.js", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

describe("enrichment-process-manager", () => {
  let mockPool: any
  let mockChildProcess: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(db.getPool).mockReturnValue(mockPool)

    // Setup mock child process
    mockChildProcess = new EventEmitter()
    mockChildProcess.pid = 12345
    mockChildProcess.kill = vi.fn()
    mockChildProcess.stdout = new EventEmitter()
    mockChildProcess.stderr = new EventEmitter()
    vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("startEnrichmentRun", () => {
    it("should create a new enrichment run and spawn process", async () => {
      // Mock database responses
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT enrichment_runs
        .mockResolvedValueOnce({ rows: [] }) // UPDATE with process_id

      const config = {
        limit: 10,
        maxTotalCost: 5,
        free: true,
        paid: false,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
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
      expect(spawn).toHaveBeenCalledWith(
        "npx",
        expect.arrayContaining(["tsx", expect.stringContaining("enrich-death-details.ts")]),
        expect.any(Object)
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([12345, 1])
      )
    })

    it("should include --limit in script args", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        limit: 50,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      const spawnCall = vi.mocked(spawn).mock.calls[0]
      const args = spawnCall[1]
      expect(args).toContain("--limit")
      expect(args).toContain("50")
    })

    it("should include --max-total-cost in script args", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        maxTotalCost: 10,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      const spawnCall = vi.mocked(spawn).mock.calls[0]
      const args = spawnCall[1]
      expect(args).toContain("--max-total-cost")
      expect(args).toContain("10")
    })

    it("should include --run-id and --yes in script args", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        limit: 10,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      const spawnCall = vi.mocked(spawn).mock.calls[0]
      const args = spawnCall[1]
      expect(args).toContain("--run-id")
      expect(args).toContain("1")
      expect(args).toContain("--yes")
    })

    it("should include --actor-ids in script args when actorIds provided", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      await processManager.startEnrichmentRun({
        actorIds: [123, 456, 789],
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      const spawnCall = vi.mocked(spawn).mock.calls[0]
      const args = spawnCall[1]
      expect(args).toContain("--actor-ids")
      expect(args).toContain("123,456,789")
    })
  })

  describe("stopEnrichmentRun", () => {
    it("should kill running process and update database", async () => {
      // Start a run first
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })

      const runId = await processManager.startEnrichmentRun({
        limit: 10,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      // Mock the update query for stopping
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      // Stop the run
      const stopped = await processManager.stopEnrichmentRun(runId)

      expect(stopped).toBe(true)
      expect(mockChildProcess.kill).toHaveBeenCalledWith("SIGTERM")
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
        rows: [{ process_id: null, status: "completed" }],
      })

      await expect(processManager.stopEnrichmentRun(2)).rejects.toThrow(
        "Enrichment run 2 is not running (status: completed)"
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

  describe("process event handlers", () => {
    it("should update database when process exits with non-zero code", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // For the exit handler

      await processManager.startEnrichmentRun({
        limit: 10,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      // Simulate process exit with error
      mockChildProcess.emit("exit", 1, null)

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([1])
      )
    })

    it("should update database when process has error", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // For the error handler

      await processManager.startEnrichmentRun({
        limit: 10,
        free: true,
        paid: true,
        ai: false,
        claudeCleanup: false,
        gatherAllSources: false,
        stopOnMatch: true,
        followLinks: false,
        aiLinkSelection: false,
        aiContentExtraction: false,
      })

      // Simulate process error
      const error = new Error("Process failed")
      mockChildProcess.emit("error", error)

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE enrichment_runs"),
        expect.arrayContaining([1, "Process failed"])
      )
    })
  })
})
