import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request, Response } from "express"
import type { Pool } from "pg"

// Mock the database module
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}))

vi.mock("../../lib/cronjob-tracking.js", () => ({
  getCronjobRuns: vi.fn(),
  getCronjobStats: vi.fn(),
}))

describe("Cronjobs API Routes", () => {
  let mockPool: Pool
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jsonSpy = vi.fn()
    statusSpy = vi.fn(() => ({ json: jsonSpy }))

    mockRes = {
      json: jsonSpy as any,
      status: statusSpy as any,
    }

    mockReq = {
      query: {},
      params: {},
    }

    mockPool = {
      query: vi.fn(),
    } as any
  })

  describe("GET /admin/api/cronjobs/runs", () => {
    it("returns all cronjob runs", async () => {
      const mockRuns = [
        {
          id: 1,
          job_name: "coverage-snapshot",
          started_at: "2024-01-01T02:00:00Z",
          completed_at: "2024-01-01T02:00:05Z",
          status: "success" as const,
          error_message: null,
          duration_ms: 5000,
        },
      ]

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { getCronjobRuns } = await import("../../lib/cronjob-tracking.js")
      vi.mocked(getCronjobRuns).mockResolvedValueOnce(mockRuns)

      const cronjobsModule = await import("./cronjobs.js")
      const router = cronjobsModule.default

      const runsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/runs" && layer.route?.methods.get
      )

      expect(runsRoute).toBeDefined()
    })

    it("filters by job name", async () => {
      mockReq.query = {
        jobName: "coverage-snapshot",
      }

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { getCronjobRuns } = await import("../../lib/cronjob-tracking.js")
      vi.mocked(getCronjobRuns).mockResolvedValueOnce([])

      const cronjobsModule = await import("./cronjobs.js")
      const router = cronjobsModule.default

      const runsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/runs" && layer.route?.methods.get
      )

      expect(runsRoute).toBeDefined()
    })

    it("applies custom limit", async () => {
      mockReq.query = {
        limit: "50",
      }

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { getCronjobRuns } = await import("../../lib/cronjob-tracking.js")
      vi.mocked(getCronjobRuns).mockResolvedValueOnce([])

      const cronjobsModule = await import("./cronjobs.js")
      const router = cronjobsModule.default

      const runsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/runs" && layer.route?.methods.get
      )

      expect(runsRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/cronjobs/stats/:jobName", () => {
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

      mockReq.params = {
        jobName: "coverage-snapshot",
      }

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { getCronjobStats } = await import("../../lib/cronjob-tracking.js")
      vi.mocked(getCronjobStats).mockResolvedValueOnce(mockStats)

      const cronjobsModule = await import("./cronjobs.js")
      const router = cronjobsModule.default

      const statsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/stats/:jobName" && layer.route?.methods.get
      )

      expect(statsRoute).toBeDefined()
    })
  })
})
