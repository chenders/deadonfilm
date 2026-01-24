import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Pool } from "pg"
import {
  startCronjobRun,
  completeCronjobRun,
  getCronjobRuns,
  getCronjobStats,
} from "./cronjob-tracking.js"

describe("Cronjob Tracking", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool
  })

  describe("startCronjobRun", () => {
    it("inserts a new run and returns its ID", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: 42 }],
      } as any)

      const runId = await startCronjobRun(mockPool, "coverage-snapshot")

      expect(runId).toBe(42)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO cronjob_runs"),
        ["coverage-snapshot"]
      )
    })
  })

  describe("completeCronjobRun", () => {
    it("marks run as successful", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await completeCronjobRun(mockPool, 42, "success")

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE cronjob_runs"), [
        42,
        "success",
        null,
      ])
    })

    it("marks run as failed with error message", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await completeCronjobRun(mockPool, 42, "failure", "Database connection failed")

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE cronjob_runs"), [
        42,
        "failure",
        "Database connection failed",
      ])
    })
  })

  describe("getCronjobRuns", () => {
    it("returns all runs when no job name specified", async () => {
      const mockRuns = [
        {
          id: 1,
          job_name: "coverage-snapshot",
          started_at: "2024-01-01T02:00:00Z",
          completed_at: "2024-01-01T02:00:05Z",
          status: "success",
          error_message: null,
          duration_ms: 5000,
        },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockRuns,
      } as any)

      const result = await getCronjobRuns(mockPool)

      expect(result).toEqual(mockRuns)
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [100])
    })

    it("filters by job name", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getCronjobRuns(mockPool, "coverage-snapshot", 50)

      const call = vi.mocked(mockPool.query).mock.calls[0]
      expect(call[0]).toContain("WHERE job_name = $1")
      expect(call[1]).toEqual(["coverage-snapshot", 50])
    })

    it("applies custom limit", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getCronjobRuns(mockPool, undefined, 25)

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [25])
    })
  })

  describe("getCronjobStats", () => {
    it("returns statistics for a job", async () => {
      const mockStats = {
        total_runs: 100,
        successful_runs: 95,
        failed_runs: 5,
        success_rate: 95.0,
        avg_duration_ms: 4500,
        last_success_at: "2024-01-31T02:00:05Z",
        last_failure_at: "2024-01-15T02:00:10Z",
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any)

      const result = await getCronjobStats(mockPool, "coverage-snapshot")

      expect(result).toEqual(mockStats)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*) as total_runs"),
        ["coverage-snapshot"]
      )
    })

    it("handles zero runs", async () => {
      const mockStats = {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        success_rate: 0,
        avg_duration_ms: null,
        last_success_at: null,
        last_failure_at: null,
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any)

      const result = await getCronjobStats(mockPool, "new-job")

      expect(result.total_runs).toBe(0)
      expect(result.success_rate).toBe(0)
    })
  })
})
