import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./popularity.js"

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

const mockPoolQuery = vi.fn()
const mockPool = { query: mockPoolQuery }

vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(() => mockPool),
}))

describe("Admin Popularity Endpoints", () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use("/admin/api/popularity", router)
  })

  describe("GET /stats", () => {
    it("returns popularity statistics", async () => {
      // actorStats, movieStats, showStats (Promise.all)
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            {
              total: "1000",
              with_score: "800",
              avg_score: "35.50",
              avg_confidence: "0.75",
              high_confidence: "600",
              low_confidence: "200",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: "500", with_score: "400", avg_score: "42.10", avg_weight: "3.20" }],
        })
        .mockResolvedValueOnce({
          rows: [{ total: "300", with_score: "250", avg_score: "38.00", avg_weight: "2.80" }],
        })
        // distribution
        .mockResolvedValueOnce({
          rows: [
            { bucket: "50-100 (Top)", count: "50" },
            { bucket: "40-50 (High)", count: "150" },
          ],
        })

      const res = await request(app).get("/admin/api/popularity/stats")

      expect(res.status).toBe(200)
      expect(res.body.actors.total).toBe(1000)
      expect(res.body.actors.withScore).toBe(800)
      expect(res.body.movies.total).toBe(500)
      expect(res.body.shows.total).toBe(300)
      expect(res.body.distribution).toHaveLength(2)
    })

    it("handles empty stats rows gracefully", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/popularity/stats")

      expect(res.status).toBe(200)
      expect(res.body.actors.total).toBe(0)
      expect(res.body.movies.total).toBe(0)
      expect(res.body.shows.total).toBe(0)
    })

    it("returns 500 on database error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("DB down"))

      const res = await request(app).get("/admin/api/popularity/stats")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch popularity stats")
    })
  })

  describe("GET /missing", () => {
    it("returns actors missing popularity scores", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              tmdb_id: 100,
              name: "Test Actor",
              tmdb_popularity: "12.5",
              movie_count: "5",
              show_count: "2",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: "42" }] })

      const res = await request(app).get("/admin/api/popularity/missing")

      expect(res.status).toBe(200)
      expect(res.body.totalMissing).toBe(42)
      expect(res.body.actors).toHaveLength(1)
      expect(res.body.actors[0].name).toBe("Test Actor")
    })

    it("handles empty count result gracefully", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/popularity/missing")

      expect(res.status).toBe(200)
      expect(res.body.totalMissing).toBe(0)
      expect(res.body.actors).toHaveLength(0)
    })

    it("returns 500 on database error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("DB down"))

      const res = await request(app).get("/admin/api/popularity/missing")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch missing popularity actors")
    })
  })
})
