/**
 * Tests for admin rejected factors endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./rejected-factors.js"

vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Admin Rejected Factors Endpoints", () => {
  let app: express.Application
  let mockPool: {
    query: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    mockPool = {
      query: vi.fn(),
    }

    const { getPool } = await import("../../lib/db/pool.js")
    vi.mocked(getPool).mockReturnValue(mockPool as any)

    app = express()
    app.use(express.json())
    app.use("/admin/api/rejected-factors", router)
  })

  describe("GET /admin/api/rejected-factors", () => {
    const mockItem = {
      factor_name: "nepo_baby",
      factor_type: "life",
      occurrence_count: 12,
      last_seen: "2026-02-20T10:00:00Z",
      recent_actors: JSON.stringify([
        { id: 1, name: "Actor One" },
        { id: 2, name: "Actor Two" },
      ]),
    }

    it("returns aggregated rejected factors", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            ...mockItem,
            recent_actors: [
              { id: 1, name: "Actor One" },
              { id: 2, name: "Actor Two" },
            ],
          },
        ],
      })

      const response = await request(app).get("/admin/api/rejected-factors").expect(200)

      expect(response.body).toEqual({
        items: [
          {
            factorName: "nepo_baby",
            factorType: "life",
            occurrenceCount: 12,
            lastSeen: "2026-02-20T10:00:00Z",
            recentActors: [
              { id: 1, name: "Actor One" },
              { id: 2, name: "Actor Two" },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      })
    })

    it("filters by type when provided", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })

      await request(app).get("/admin/api/rejected-factors?type=death").expect(200)

      // Count query should include type filter
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("factor_type = $1"), [
        "death",
      ])
    })

    it("accepts custom pagination parameters", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .get("/admin/api/rejected-factors?page=2&pageSize=25")
        .expect(200)

      expect(response.body.page).toBe(2)
      expect(response.body.pageSize).toBe(25)
    })

    it("clamps pageSize to maximum of 100", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .get("/admin/api/rejected-factors?pageSize=500")
        .expect(200)

      expect(response.body.pageSize).toBe(100)
    })

    it("returns empty list when no rejected factors found", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app).get("/admin/api/rejected-factors").expect(200)

      expect(response.body.items).toEqual([])
      expect(response.body.total).toBe(0)
    })

    it("handles null recent_actors gracefully", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({
        rows: [{ ...mockItem, recent_actors: null }],
      })

      const response = await request(app).get("/admin/api/rejected-factors").expect(200)

      expect(response.body.items[0].recentActors).toEqual([])
    })

    it("returns 500 on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/rejected-factors").expect(500)

      expect(response.body.error.message).toBe("Failed to fetch rejected factors")
    })
  })
})
