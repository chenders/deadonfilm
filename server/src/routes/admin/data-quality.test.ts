/**
 * Tests for admin data quality endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./data-quality.js"

// Mock dependencies
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

vi.mock("../../lib/cache.js", () => ({
  invalidateActorCache: vi.fn(),
  rebuildDeathCaches: vi.fn(),
}))

describe("Admin Data Quality Endpoints", () => {
  let app: express.Application
  let mockPool: {
    query: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
  }
  let mockClient: {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    }

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient),
    }

    const { getPool } = await import("../../lib/db/pool.js")
    vi.mocked(getPool).mockReturnValue(mockPool as any)

    // Create test app
    app = express()
    app.use(express.json())
    app.use("/admin/api/data-quality", router)
  })

  // ========================================================================
  // GET /admin/api/data-quality/overview
  // ========================================================================

  describe("GET /admin/api/data-quality/overview", () => {
    it("returns overview statistics", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const response = await request(app).get("/admin/api/data-quality/overview").expect(200)

      expect(response.body).toEqual({
        futureDeathsCount: 5,
        uncertainDeathsCount: 10,
        pendingResetCount: 3,
      })
    })

    it("returns zeros when no issues found", async () => {
      mockPool.query.mockResolvedValue({ rows: [{ count: 0 }] })

      const response = await request(app).get("/admin/api/data-quality/overview").expect(200)

      expect(response.body).toEqual({
        futureDeathsCount: 0,
        uncertainDeathsCount: 0,
        pendingResetCount: 0,
      })
    })

    it("returns 500 on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/data-quality/overview").expect(500)

      expect(response.body.error.message).toBe("Failed to fetch data quality overview")
    })
  })

  // ========================================================================
  // GET /admin/api/data-quality/future-deaths
  // ========================================================================

  describe("GET /admin/api/data-quality/future-deaths", () => {
    const mockActor = {
      id: 1,
      name: "Test Actor",
      tmdb_id: 12345,
      deathday: "2030-01-01",
      birthday: "1950-01-01",
      popularity: 50,
      issue_type: "future_date",
    }

    it("returns paginated actors with future death dates", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [mockActor] })

      const response = await request(app).get("/admin/api/data-quality/future-deaths").expect(200)

      expect(response.body).toEqual({
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        actors: [
          {
            id: 1,
            name: "Test Actor",
            tmdbId: 12345,
            deathDate: "2030-01-01",
            birthDate: "1950-01-01",
            popularity: 50,
            issueType: "future_date",
          },
        ],
      })
    })

    it("accepts custom pagination parameters", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({ rows: [] })

      await request(app).get("/admin/api/data-quality/future-deaths?page=2&pageSize=25").expect(200)

      expect(mockPool.query).toHaveBeenLastCalledWith(expect.any(String), [25, 25])
    })

    it("clamps pageSize to maximum of 100", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })

      await request(app).get("/admin/api/data-quality/future-deaths?pageSize=500").expect(200)

      expect(mockPool.query).toHaveBeenLastCalledWith(expect.any(String), [100, 0])
    })

    it("returns empty list when no issues found", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app).get("/admin/api/data-quality/future-deaths").expect(200)

      expect(response.body.actors).toEqual([])
      expect(response.body.total).toBe(0)
    })

    it("returns 500 on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/data-quality/future-deaths").expect(500)

      expect(response.body.error.message).toBe("Failed to fetch future deaths")
    })
  })

  // ========================================================================
  // POST /admin/api/data-quality/cleanup-future-deaths
  // ========================================================================

  describe("POST /admin/api/data-quality/cleanup-future-deaths", () => {
    it("performs dry run and returns affected actors", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: "Actor One" },
          { id: 2, name: "Actor Two" },
        ],
      })

      const response = await request(app)
        .post("/admin/api/data-quality/cleanup-future-deaths")
        .send({ dryRun: true })
        .expect(200)

      expect(response.body.dryRun).toBe(true)
      expect(response.body.wouldClean).toBe(2)
      expect(response.body.actorIds).toEqual([1, 2])
    })

    it("cleans up actors and invalidates caches", async () => {
      const { invalidateActorCache, rebuildDeathCaches } = await import("../../lib/cache.js")

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "Actor One" }] })
        .mockResolvedValueOnce({ rowCount: 1 })

      const response = await request(app)
        .post("/admin/api/data-quality/cleanup-future-deaths")
        .send({ dryRun: false })
        .expect(200)

      expect(response.body.cleaned).toBe(1)
      expect(response.body.actorIds).toEqual([1])
      expect(invalidateActorCache).toHaveBeenCalledWith(1)
      expect(rebuildDeathCaches).toHaveBeenCalled()
    })

    it("cleans up specific actor IDs when provided", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "Actor One" }] })
        .mockResolvedValueOnce({ rowCount: 1 })

      const response = await request(app)
        .post("/admin/api/data-quality/cleanup-future-deaths")
        .send({ actorIds: [1, 2, 3] })
        .expect(200)

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("ANY($1)"), [[1, 2, 3]])
      expect(response.body.cleaned).toBe(1)
    })

    it("returns zero cleaned when no actors affected", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app)
        .post("/admin/api/data-quality/cleanup-future-deaths")
        .send({})
        .expect(200)

      expect(response.body.cleaned).toBe(0)
      expect(response.body.actorIds).toEqual([])
    })

    it("returns 500 on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database error"))

      const response = await request(app)
        .post("/admin/api/data-quality/cleanup-future-deaths")
        .send({})
        .expect(500)

      expect(response.body.error.message).toBe("Failed to cleanup future deaths")
    })
  })

  // ========================================================================
  // GET /admin/api/data-quality/uncertain-deaths
  // ========================================================================

  describe("GET /admin/api/data-quality/uncertain-deaths", () => {
    const mockUncertainActor = {
      id: 1,
      name: "Test Actor",
      tmdb_id: 12345,
      deathday: "2020-01-01",
      popularity: 30,
      circumstances: "Cannot verify the death information...",
    }

    it("returns paginated actors with uncertain death info", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [mockUncertainActor] })

      const response = await request(app)
        .get("/admin/api/data-quality/uncertain-deaths")
        .expect(200)

      expect(response.body).toEqual({
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        actors: [
          {
            id: 1,
            name: "Test Actor",
            tmdbId: 12345,
            deathDate: "2020-01-01",
            popularity: 30,
            circumstancesExcerpt: "Cannot verify the death information...",
          },
        ],
      })
    })

    it("truncates long circumstances to 200 chars", async () => {
      const longCircumstances = "A".repeat(300)
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({
        rows: [{ ...mockUncertainActor, circumstances: longCircumstances }],
      })

      const response = await request(app)
        .get("/admin/api/data-quality/uncertain-deaths")
        .expect(200)

      expect(response.body.actors[0].circumstancesExcerpt).toHaveLength(200)
    })

    it("accepts custom pagination parameters", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 50 }] })
        .mockResolvedValueOnce({ rows: [] })

      await request(app)
        .get("/admin/api/data-quality/uncertain-deaths?page=3&pageSize=10")
        .expect(200)

      // Should be called with pattern, limit=10, offset=20
      expect(mockPool.query).toHaveBeenLastCalledWith(expect.any(String), [
        expect.any(String),
        10,
        20,
      ])
    })

    it("returns 500 on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database error"))

      const response = await request(app)
        .get("/admin/api/data-quality/uncertain-deaths")
        .expect(500)

      expect(response.body.error.message).toBe("Failed to fetch uncertain deaths")
    })
  })

  // ========================================================================
  // POST /admin/api/data-quality/reset-enrichment
  // ========================================================================

  describe("POST /admin/api/data-quality/reset-enrichment", () => {
    const mockActor = {
      id: 1,
      name: "Test Actor",
      tmdb_id: 12345,
      has_detailed_death_info: true,
      history_count: 3,
    }

    it("returns 400 when neither actorId nor tmdbId provided", async () => {
      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({})
        .expect(400)

      expect(response.body.error.message).toBe("Either actorId or tmdbId is required")
    })

    it("returns 404 when actor not found", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({ actorId: 999 })
        .expect(404)

      expect(response.body.error.message).toBe("Actor not found")
    })

    it("performs dry run by actorId", async () => {
      mockPool.query.mockResolvedValue({ rows: [mockActor] })

      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({ actorId: 1, dryRun: true })
        .expect(200)

      expect(response.body.dryRun).toBe(true)
      expect(response.body.actor).toEqual({
        id: 1,
        name: "Test Actor",
        tmdbId: 12345,
        hasDetailedDeathInfo: true,
        historyCount: 3,
      })
      expect(response.body.wouldReset).toEqual({
        actorFields: true,
        historyEntries: 3,
        circumstancesRecord: true,
      })
    })

    it("performs dry run by tmdbId", async () => {
      mockPool.query.mockResolvedValue({ rows: [mockActor] })

      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({ tmdbId: 12345, dryRun: true })
        .expect(200)

      expect(response.body.dryRun).toBe(true)
      expect(response.body.actor.tmdbId).toBe(12345)
    })

    it("resets enrichment data in transaction", async () => {
      const { invalidateActorCache } = await import("../../lib/cache.js")

      mockPool.query.mockResolvedValue({ rows: [mockActor] })
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE actors
        .mockResolvedValueOnce({ rowCount: 3 }) // DELETE history
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE circumstances
        .mockResolvedValueOnce({}) // COMMIT

      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({ actorId: 1 })
        .expect(200)

      expect(response.body).toEqual({
        reset: true,
        actorId: 1,
        name: "Test Actor",
        historyDeleted: 3,
        circumstancesDeleted: 1,
      })

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN")
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT")
      expect(mockClient.release).toHaveBeenCalled()
      expect(invalidateActorCache).toHaveBeenCalledWith(1)
    })

    it("rolls back transaction on error", async () => {
      mockPool.query.mockResolvedValue({ rows: [mockActor] })
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Update failed"))

      const response = await request(app)
        .post("/admin/api/data-quality/reset-enrichment")
        .send({ actorId: 1 })
        .expect(500)

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK")
      expect(mockClient.release).toHaveBeenCalled()
      expect(response.body.error.message).toBe("Failed to reset enrichment data")
    })
  })
})
