/**
 * Tests for admin biography enrichment endpoints.
 * Focuses on golden test endpoint error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./biography-enrichment.js"

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

// Mock dynamic imports used by the golden test endpoint
const mockEnrichActor = vi.fn()
const mockWriteBiographyToProduction = vi.fn()
const mockScoreAllResults = vi.fn()

vi.mock("../../lib/biography/golden-test-cases.js", () => ({
  GOLDEN_TEST_CASES: [{ actorName: "Actor A" }, { actorName: "Actor B" }, { actorName: "Actor C" }],
  scoreAllResults: (...args: unknown[]) => mockScoreAllResults(...args),
}))

vi.mock("../../lib/biography-sources/orchestrator.js", () => ({
  BiographyEnrichmentOrchestrator: class {
    enrichActor = mockEnrichActor
  },
}))

vi.mock("../../lib/biography-enrichment-db-writer.js", () => ({
  writeBiographyToProduction: (...args: unknown[]) => mockWriteBiographyToProduction(...args),
}))

vi.mock("../../lib/jobs/queue-manager.js", () => ({
  queueManager: {
    isReady: true,
    addJob: vi.fn().mockResolvedValue("job-123"),
  },
}))

vi.mock("../../lib/jobs/types.js", () => ({
  JobType: { ENRICH_BIOGRAPHIES_BATCH: "enrich-biographies-batch" },
}))

describe("Admin Biography Enrichment Endpoints", () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use("/admin/api/biography-enrichment", router)
  })

  // ==========================================================================
  // GET /admin/api/biography-enrichment
  // ==========================================================================

  describe("GET /", () => {
    it("returns actors with enrichment status", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: "5" }] }) // count
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: "John Wayne",
              dof_popularity: "45.2",
              deathday: "1979-06-11",
              bio_id: 10,
              narrative_confidence: "high",
              narrative_teaser: "A legendary actor known for...",
              life_notable_factors: ["military_service"],
              bio_updated_at: "2026-01-15",
              biography_version: "v2",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_deceased: "100", enriched: "40", needs_enrichment: "60" }],
        })

      const res = await request(app).get("/admin/api/biography-enrichment")

      expect(res.status).toBe(200)
      expect(res.body.actors).toHaveLength(1)
      expect(res.body.actors[0]).toEqual({
        id: 1,
        name: "John Wayne",
        popularity: 45.2,
        deathday: "1979-06-11",
        hasEnrichment: true,
        narrativeConfidence: "high",
        narrativeTeaserPreview: "A legendary actor known for..." + "...",
        lifeNotableFactors: ["military_service"],
        bioUpdatedAt: "2026-01-15",
        biographyVersion: "v2",
      })
      expect(res.body.stats.totalDeceased).toBe(100)
      expect(res.body.stats.enriched).toBe(40)
    })

    it("splits multi-word search into independent ILIKE conditions", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 25991,
              name: "Paul L. Smith",
              dof_popularity: "12.5",
              deathday: "2012-04-25",
              bio_id: null,
              narrative_confidence: null,
              narrative_teaser: null,
              life_notable_factors: null,
              bio_updated_at: null,
              biography_version: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_deceased: "100", enriched: "40", needs_enrichment: "60" }],
        })

      const res = await request(app).get("/admin/api/biography-enrichment?searchName=paul+smith")

      expect(res.status).toBe(200)
      expect(res.body.actors).toHaveLength(1)
      expect(res.body.actors[0].name).toBe("Paul L. Smith")

      // Verify the count query used two separate ILIKE params
      const countCall = mockPoolQuery.mock.calls[0]
      expect(countCall[0]).toContain("a.name ILIKE $1")
      expect(countCall[0]).toContain("a.name ILIKE $2")
      expect(countCall[1]).toEqual(["%paul%", "%smith%"])
    })

    it("returns 500 on database error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("DB connection failed"))

      const res = await request(app).get("/admin/api/biography-enrichment")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch biography enrichment list")
    })
  })

  // ==========================================================================
  // POST /admin/api/biography-enrichment/enrich
  // ==========================================================================

  describe("POST /enrich", () => {
    it("rejects missing actorId", async () => {
      const res = await request(app).post("/admin/api/biography-enrichment/enrich").send({})

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("actorId is required")
    })

    it("rejects non-numeric actorId", async () => {
      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich")
        .send({ actorId: "abc" })

      expect(res.status).toBe(400)
    })

    it("returns 404 for unknown actor", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich")
        .send({ actorId: 99999 })

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })
  })

  // ==========================================================================
  // POST /admin/api/biography-enrichment/golden-test
  // ==========================================================================

  describe("POST /golden-test", () => {
    const actorA = {
      id: 1,
      name: "Actor A",
      tmdb_id: 100,
      birthday: "1920-01-01",
      deathday: "1980-01-01",
    }
    const actorB = {
      id: 2,
      name: "Actor B",
      tmdb_id: 200,
      birthday: "1930-01-01",
      deathday: "1990-01-01",
    }
    const actorC = {
      id: 3,
      name: "Actor C",
      tmdb_id: 300,
      birthday: "1940-01-01",
      deathday: "2000-01-01",
    }

    it("returns 400 when no golden test actors are found in database", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).post("/admin/api/biography-enrichment/golden-test")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("None of the 3 golden test actors found")
      expect(res.body.error.message).toContain("Actor A")
    })

    it("reports missing actors when only some are found", async () => {
      // Only Actor A found, B and C missing
      mockPoolQuery.mockResolvedValueOnce({ rows: [actorA] })

      const enrichedData = {
        hasSubstantiveContent: true,
        narrative: "Test narrative",
        narrativeTeaser: "Test teaser",
      }
      mockEnrichActor.mockResolvedValueOnce({
        data: enrichedData,
        sources: [],
        stats: { totalCostUsd: 0.01 },
      })
      mockWriteBiographyToProduction.mockResolvedValueOnce(undefined)
      mockScoreAllResults.mockReturnValueOnce({
        scores: [{ name: "Actor A", score: 85 }],
        averageScore: 85,
        summary: "1 actor scored",
      })

      const res = await request(app).post("/admin/api/biography-enrichment/golden-test")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.actorsFound).toBe(1)
      expect(res.body.actorsExpected).toBe(3)
      expect(res.body.missingActors).toEqual(["Actor B", "Actor C"])
    })

    it("collects per-actor errors when enrichment fails for individual actors", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [actorA, actorB, actorC] })

      // Actor A succeeds
      mockEnrichActor.mockResolvedValueOnce({
        data: { hasSubstantiveContent: true, narrative: "Ok" },
        sources: [],
        stats: { totalCostUsd: 0.01 },
      })
      mockWriteBiographyToProduction.mockResolvedValueOnce(undefined)

      // Actor B throws an error
      mockEnrichActor.mockRejectedValueOnce(new Error("API timeout"))

      // Actor C returns no substantive content
      mockEnrichActor.mockResolvedValueOnce({
        data: { hasSubstantiveContent: false },
        sources: [],
        error: "Insufficient sources",
        stats: { totalCostUsd: 0.005 },
      })

      mockScoreAllResults.mockReturnValueOnce({
        scores: [{ name: "Actor A", score: 80 }],
        averageScore: 80,
        summary: "1 actor scored",
      })

      const res = await request(app).post("/admin/api/biography-enrichment/golden-test")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.actorsFound).toBe(3)
      expect(res.body.errors).toEqual(["Actor B: API timeout", "Actor C: Insufficient sources"])
    })

    it("succeeds when all actors are found and enriched", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [actorA, actorB, actorC] })

      const enrichedData = {
        hasSubstantiveContent: true,
        narrative: "Test narrative",
      }

      mockEnrichActor.mockResolvedValue({
        data: enrichedData,
        sources: [],
        stats: { totalCostUsd: 0.01 },
      })
      mockWriteBiographyToProduction.mockResolvedValue(undefined)
      mockScoreAllResults.mockReturnValueOnce({
        scores: [
          { name: "Actor A", score: 90 },
          { name: "Actor B", score: 85 },
          { name: "Actor C", score: 80 },
        ],
        averageScore: 85,
        summary: "3 actors scored",
      })

      const res = await request(app).post("/admin/api/biography-enrichment/golden-test")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.actorsFound).toBe(3)
      expect(res.body.actorsExpected).toBe(3)
      expect(res.body.missingActors).toBeUndefined()
      expect(res.body.errors).toBeUndefined()
      expect(res.body.averageScore).toBe(85)
      expect(mockWriteBiographyToProduction).toHaveBeenCalledTimes(3)
    })

    it("returns 500 when golden test cases module fails to load", async () => {
      // Simulate unexpected error (e.g., DB connection failure during query)
      mockPoolQuery.mockRejectedValueOnce(new Error("Connection refused"))

      const res = await request(app).post("/admin/api/biography-enrichment/golden-test")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Connection refused")
    })
  })

  // ==========================================================================
  // POST /admin/api/biography-enrichment/enrich-batch
  // ==========================================================================

  describe("POST /enrich-batch", () => {
    it("queues a batch job with provided options", async () => {
      // Mock INSERT for bio_enrichment_runs record
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] })
      // Mock UPDATE to set status = 'running'
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1, 2], limit: 5, useStaging: true })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.jobId).toBe("job-123")
      expect(res.body.runId).toBe(42)
    })

    it("defaults allowRegeneration to true when actorIds are provided", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 43 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [7278] })

      // Config stored in DB should have allowRegeneration: true
      const insertCall = mockPoolQuery.mock.calls[0]
      const storedConfig = JSON.parse(insertCall[1][0])
      expect(storedConfig.allowRegeneration).toBe(true)

      // Job payload should also have allowRegeneration: true
      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-biographies-batch",
        expect.objectContaining({ allowRegeneration: true }),
        expect.any(Object)
      )
    })

    it("defaults allowRegeneration to false when no actorIds provided", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 44 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      await request(app).post("/admin/api/biography-enrichment/enrich-batch").send({ limit: 10 })

      const insertCall = mockPoolQuery.mock.calls[0]
      const storedConfig = JSON.parse(insertCall[1][0])
      expect(storedConfig.allowRegeneration).toBe(false)

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-biographies-batch",
        expect.objectContaining({ allowRegeneration: false }),
        expect.any(Object)
      )
    })

    it("respects explicit allowRegeneration=false even with actorIds", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 45 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [7278], allowRegeneration: false })

      const insertCall = mockPoolQuery.mock.calls[0]
      const storedConfig = JSON.parse(insertCall[1][0])
      expect(storedConfig.allowRegeneration).toBe(false)

      expect(queueManager.addJob).toHaveBeenCalledWith(
        "enrich-biographies-batch",
        expect.objectContaining({ allowRegeneration: false }),
        expect.any(Object)
      )
    })

    it("returns 503 when job queue is not available", async () => {
      const { queueManager } = await import("../../lib/jobs/queue-manager.js")
      const original = queueManager.isReady
      ;(queueManager as unknown as Record<string, unknown>).isReady = false

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1, 2] })

      expect(res.status).toBe(503)
      expect(res.body.error.message).toContain("Job queue is not available")
      expect(queueManager.addJob).not.toHaveBeenCalled()
      ;(queueManager as unknown as Record<string, unknown>).isReady = original
    })
  })
})
