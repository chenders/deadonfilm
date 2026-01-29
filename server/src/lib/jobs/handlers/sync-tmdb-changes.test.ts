/**
 * Tests for SyncTMDBChangesHandler (orchestrator)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { SyncTMDBChangesHandler } from "./sync-tmdb-changes.js"
import { JobType, QueueName } from "../types.js"
import * as queueManagerModule from "../queue-manager.js"

// Mock external dependencies
vi.mock("../queue-manager.js", () => ({
  queueManager: {
    addJob: vi.fn(),
  },
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

vi.mock("newrelic", () => ({
  default: {
    startBackgroundTransaction: vi.fn((name, fn) => fn()),
    addCustomAttribute: vi.fn(),
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  },
}))

describe("SyncTMDBChangesHandler", () => {
  let handler: SyncTMDBChangesHandler

  beforeEach(() => {
    handler = new SyncTMDBChangesHandler()
    vi.clearAllMocks()

    // Default mock for addJob
    vi.mocked(queueManagerModule.queueManager.addJob)
      .mockResolvedValueOnce("movies-job-123")
      .mockResolvedValueOnce("shows-job-456")
      .mockResolvedValueOnce("people-job-789")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.SYNC_TMDB_CHANGES)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.MAINTENANCE)
    })
  })

  describe("process - queues sub-jobs", () => {
    const mockJob = {
      id: "orchestrator-job-123",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("queues all three sub-jobs in correct order", async () => {
      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.queuedJobs).toEqual({
        movies: "movies-job-123",
        shows: "shows-job-456",
        people: "people-job-789",
      })

      // Verify addJob was called 3 times with correct job types
      expect(queueManagerModule.queueManager.addJob).toHaveBeenCalledTimes(3)

      // First call: SYNC_TMDB_MOVIES
      expect(queueManagerModule.queueManager.addJob).toHaveBeenNthCalledWith(
        1,
        JobType.SYNC_TMDB_MOVIES,
        { startDate: "2026-01-20", endDate: "2026-01-25" },
        { createdBy: "sync-tmdb-changes:orchestrator-job-123" }
      )

      // Second call: SYNC_TMDB_SHOWS
      expect(queueManagerModule.queueManager.addJob).toHaveBeenNthCalledWith(
        2,
        JobType.SYNC_TMDB_SHOWS,
        {},
        { createdBy: "sync-tmdb-changes:orchestrator-job-123" }
      )

      // Third call: SYNC_TMDB_PEOPLE (runs last)
      expect(queueManagerModule.queueManager.addJob).toHaveBeenNthCalledWith(
        3,
        JobType.SYNC_TMDB_PEOPLE,
        { startDate: "2026-01-20", endDate: "2026-01-25" },
        { createdBy: "sync-tmdb-changes:orchestrator-job-123" }
      )
    })

    it("returns date range in result", async () => {
      const result = await handler.process(mockJob)

      expect(result.data?.dateRange).toEqual({
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      })
    })
  })

  describe("process - default date range", () => {
    it("defaults to yesterday-today when no dates provided", async () => {
      const mockJob = {
        id: "orchestrator-job-no-dates",
        data: {},
        attemptsMade: 0,
        opts: { priority: 10, attempts: 3 },
      } as Job

      // Mock Date to have predictable output
      const mockDate = new Date("2026-01-28T12:00:00Z")
      vi.setSystemTime(mockDate)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.dateRange).toEqual({
        startDate: "2026-01-27", // yesterday
        endDate: "2026-01-28", // today
      })

      // Verify sub-jobs got the calculated dates
      expect(queueManagerModule.queueManager.addJob).toHaveBeenNthCalledWith(
        1,
        JobType.SYNC_TMDB_MOVIES,
        { startDate: "2026-01-27", endDate: "2026-01-28" },
        expect.anything()
      )

      vi.useRealTimers()
    })

    it("uses provided startDate with default endDate", async () => {
      const mockJob = {
        id: "orchestrator-job-start-only",
        data: {
          startDate: "2026-01-15",
        },
        attemptsMade: 0,
        opts: { priority: 10, attempts: 3 },
      } as Job

      const mockDate = new Date("2026-01-28T12:00:00Z")
      vi.setSystemTime(mockDate)

      const result = await handler.process(mockJob)

      expect(result.data?.dateRange).toEqual({
        startDate: "2026-01-15",
        endDate: "2026-01-28", // today
      })

      vi.useRealTimers()
    })
  })

  describe("process - error handling", () => {
    it("propagates errors from addJob", async () => {
      vi.mocked(queueManagerModule.queueManager.addJob).mockReset()
      vi.mocked(queueManagerModule.queueManager.addJob).mockRejectedValue(
        new Error("Queue not initialized")
      )

      const mockJob = {
        id: "orchestrator-job-error",
        data: {
          startDate: "2026-01-20",
          endDate: "2026-01-25",
        },
        attemptsMade: 0,
        opts: { priority: 10, attempts: 3 },
      } as Job

      await expect(handler.process(mockJob)).rejects.toThrow("Queue not initialized")
    })
  })
})
