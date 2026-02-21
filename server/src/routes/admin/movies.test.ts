/**
 * Tests for admin movie endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./movies.js"

vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(),
}))
vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const mockPoolQuery = vi.fn()
const mockPool = { query: mockPoolQuery }

vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(() => mockPool),
}))

describe("Admin Movie Endpoints", () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()

    app = express()
    app.use(express.json())
    app.use("/admin/api/movies", router)
  })

  // ========================================================================
  // GET /:tmdbId/enrichment-status
  // ========================================================================

  describe("GET /admin/api/movies/:tmdbId/enrichment-status", () => {
    it("returns empty when no tmdbIds provided", async () => {
      const response = await request(app).get("/admin/api/movies/550/enrichment-status").expect(200)

      expect(response.body).toEqual({
        totalDeceased: 0,
        needsBioEnrichment: [],
        needsDeathEnrichment: [],
      })
      expect(mockPoolQuery).not.toHaveBeenCalled()
    })

    it("returns enrichment status for actors", async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            tmdb_id: 100,
            name: "Actor A",
            enriched_at: "2024-01-01",
            cause_of_death: "cancer",
            has_bio_enrichment: true,
          },
          {
            id: 2,
            tmdb_id: 200,
            name: "Actor B",
            enriched_at: null,
            cause_of_death: null,
            has_bio_enrichment: false,
          },
          {
            id: 3,
            tmdb_id: 300,
            name: "Actor C",
            enriched_at: "2024-01-01",
            cause_of_death: "heart attack",
            has_bio_enrichment: false,
          },
        ],
      })

      const response = await request(app)
        .get("/admin/api/movies/550/enrichment-status?tmdbIds=100,200,300")
        .expect(200)

      expect(response.body).toEqual({
        totalDeceased: 3,
        needsBioEnrichment: [2, 3],
        needsDeathEnrichment: [2],
      })
    })

    it("handles invalid tmdbIds gracefully", async () => {
      const response = await request(app)
        .get("/admin/api/movies/550/enrichment-status?tmdbIds=abc,xyz")
        .expect(200)

      expect(response.body).toEqual({
        totalDeceased: 0,
        needsBioEnrichment: [],
        needsDeathEnrichment: [],
      })
    })

    it("returns 500 on database error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("DB error"))

      const response = await request(app)
        .get("/admin/api/movies/550/enrichment-status?tmdbIds=100")
        .expect(500)

      expect(response.body.error.message).toBe("Failed to fetch enrichment status")
    })
  })

  // ========================================================================
  // POST /:tmdbId/enrich-bios
  // ========================================================================

  describe("POST /admin/api/movies/:tmdbId/enrich-bios", () => {
    it("returns 400 when tmdbIds not provided", async () => {
      const response = await request(app)
        .post("/admin/api/movies/550/enrich-bios")
        .send({})
        .expect(400)

      expect(response.body.error.message).toBe("tmdbIds array is required")
    })

    it("returns 400 when tmdbIds is empty array", async () => {
      const response = await request(app)
        .post("/admin/api/movies/550/enrich-bios")
        .send({ tmdbIds: [] })
        .expect(400)

      expect(response.body.error.message).toBe("tmdbIds array is required")
    })

    it("returns success with 0 count when all actors already enriched", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/movies/550/enrich-bios")
        .send({ tmdbIds: [100, 200] })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        actorCount: 0,
        message: "All actors already have biographies",
      })
    })

    it("queues batch job for unenriched actors", async () => {
      // Mock finding unenriched actors
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }, { id: 20 }],
      })

      // Mock creating run record
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 42 }],
      })

      // Mock updating run status
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const mockAddJob = vi.fn().mockResolvedValue("job-123")
      vi.doMock("../../lib/jobs/queue-manager.js", () => ({
        queueManager: {
          isReady: true,
          addJob: mockAddJob,
        },
      }))
      vi.doMock("../../lib/jobs/types.js", () => ({
        JobType: { ENRICH_BIOGRAPHIES_BATCH: "enrich-biographies-batch" },
      }))

      const response = await request(app)
        .post("/admin/api/movies/550/enrich-bios")
        .send({ tmdbIds: [100, 200] })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.actorCount).toBe(2)
    })
  })

  // ========================================================================
  // POST /:tmdbId/enrich-deaths
  // ========================================================================

  describe("POST /admin/api/movies/:tmdbId/enrich-deaths", () => {
    it("returns 400 when tmdbIds not provided", async () => {
      const response = await request(app)
        .post("/admin/api/movies/550/enrich-deaths")
        .send({})
        .expect(400)

      expect(response.body.error.message).toBe("tmdbIds array is required")
    })

    it("returns success with 0 count when all actors already enriched", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/movies/550/enrich-deaths")
        .send({ tmdbIds: [100, 200] })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        actorCount: 0,
        message: "All actors already have death info",
      })
    })

    it("starts enrichment run for unenriched actors", async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }, { id: 20 }, { id: 30 }],
      })

      const mockStartRun = vi.fn().mockResolvedValue(99)
      vi.doMock("../../lib/enrichment-process-manager.js", () => ({
        startEnrichmentRun: mockStartRun,
      }))

      const response = await request(app)
        .post("/admin/api/movies/550/enrich-deaths")
        .send({ tmdbIds: [100, 200, 300] })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.actorCount).toBe(3)
    })
  })
})
