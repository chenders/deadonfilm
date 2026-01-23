/**
 * Tests for admin analytics endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./analytics.js"
import * as queries from "../../lib/db/admin-analytics-queries.js"

// Mock dependencies
vi.mock("../../lib/db/admin-analytics-queries.js", () => ({
  getCostBySource: vi.fn(),
}))
vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}))

describe("Admin Analytics Endpoints", () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()

    app = express()
    app.use(express.json())
    app.use("/admin/api/analytics", router)
  })

  describe("GET /admin/api/analytics/costs/by-source", () => {
    const mockCostBySourceResult = {
      sources: [
        {
          source: "wikidata",
          total_cost: 15.25,
          queries_count: 150,
          avg_cost_per_query: 0.1017,
          last_used: "2024-01-15T10:30:00Z",
        },
        {
          source: "wikipedia",
          total_cost: 0,
          queries_count: 200,
          avg_cost_per_query: 0,
          last_used: "2024-01-14T09:00:00Z",
        },
      ],
      totalCost: 15.25,
      totalQueries: 350,
    }

    it("returns cost by source with default parameters (no date filtering)", async () => {
      vi.mocked(queries.getCostBySource).mockResolvedValue(mockCostBySourceResult)

      const response = await request(app).get("/admin/api/analytics/costs/by-source").expect(200)

      expect(queries.getCostBySource).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        undefined,
        undefined
      )
      expect(response.body).toEqual(mockCostBySourceResult)
    })

    it("passes date range parameters when provided", async () => {
      vi.mocked(queries.getCostBySource).mockResolvedValue(mockCostBySourceResult)

      const response = await request(app)
        .get("/admin/api/analytics/costs/by-source?startDate=2024-01-01&endDate=2024-01-31")
        .expect(200)

      expect(queries.getCostBySource).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        "2024-01-01",
        "2024-01-31"
      )
      expect(response.body).toEqual(mockCostBySourceResult)
    })

    it("handles empty results", async () => {
      const emptyResult = {
        sources: [],
        totalCost: 0,
        totalQueries: 0,
      }
      vi.mocked(queries.getCostBySource).mockResolvedValue(emptyResult)

      const response = await request(app).get("/admin/api/analytics/costs/by-source").expect(200)

      expect(response.body).toEqual(emptyResult)
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getCostBySource).mockRejectedValue(new Error("Database connection failed"))

      const response = await request(app).get("/admin/api/analytics/costs/by-source").expect(500)

      expect(response.body).toEqual({
        error: { message: "Failed to fetch cost by source analytics" },
      })
    })
  })
})
