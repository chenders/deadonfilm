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
const mockResynthesizeFromCache = vi.fn()
const mockWriteBiographyToProduction = vi.fn()
const mockScoreAllResults = vi.fn()

vi.mock("../../lib/biography/golden-test-cases.js", () => ({
  GOLDEN_TEST_CASES: [{ actorName: "Actor A" }, { actorName: "Actor B" }, { actorName: "Actor C" }],
  scoreAllResults: (...args: unknown[]) => mockScoreAllResults(...args),
}))

// Mock old orchestrator (still used for re-synthesis endpoint)
vi.mock("../../lib/biography-sources/orchestrator.js", () => ({
  BiographyEnrichmentOrchestrator: class {
    enrichActor = mockEnrichActor
    resynthesizeFromCache = mockResynthesizeFromCache
  },
}))

// Mock new debriefer adapter (used for enrichment and golden test endpoints)
vi.mock("../../lib/biography-sources/debriefer/adapter.js", () => ({
  createBioEnrichmentPipeline: () => mockEnrichActor,
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

const mockGetBioRunSourceErrors = vi.fn()
vi.mock("../../lib/db/admin-bio-enrichment-queries.js", () => ({
  getBioEnrichmentRuns: vi.fn(),
  getBioEnrichmentRunDetails: vi.fn(),
  getBioEnrichmentRunActors: vi.fn(),
  getBioRunSourcePerformanceStats: vi.fn(),
  getBioRunSourceErrors: (...args: unknown[]) => mockGetBioRunSourceErrors(...args),
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
              life_notable_factors: ["military_service"],
              bio_updated_at: "2026-01-15",
              biography_version: "v2",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "100", enriched: "40", needs_enrichment: "60" }],
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
        lifeNotableFactors: ["military_service"],
        bioUpdatedAt: "2026-01-15",
        biographyVersion: "v2",
      })
      expect(res.body.stats.totalActors).toBe(100)
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
              life_notable_factors: null,
              bio_updated_at: null,
              biography_version: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "100", enriched: "40", needs_enrichment: "60" }],
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

    it("filters by unattributed facts when unattributedFacts=true", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 42,
              name: "No Source Actor",
              dof_popularity: "10.0",
              deathday: "2020-01-01",
              bio_id: 5,
              narrative_confidence: "medium",
              life_notable_factors: null,
              bio_updated_at: "2026-01-01",
              biography_version: "v1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "100", enriched: "40", needs_enrichment: "60" }],
        })

      const res = await request(app).get("/admin/api/biography-enrichment?unattributedFacts=true")

      expect(res.status).toBe(200)
      expect(res.body.actors).toHaveLength(1)

      // Verify the count query includes the JSONB attribution predicate
      const countQuery = mockPoolQuery.mock.calls[0][0]
      expect(countQuery).toContain("lesser_known_facts IS NOT NULL")
      expect(countQuery).toContain("sourceUrl")
      expect(countQuery).toContain("sourceName")
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

    it("rejects non-integer actorId", async () => {
      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich")
        .send({ actorId: 42.5 })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("positive integer")
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
  // POST /admin/api/biography-enrichment/re-synthesize
  // ==========================================================================

  describe("POST /re-synthesize", () => {
    it("rejects missing actorId", async () => {
      const res = await request(app).post("/admin/api/biography-enrichment/re-synthesize").send({})

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("actorId is required")
    })

    it("rejects non-numeric actorId", async () => {
      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: "abc" })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("actorId is required")
    })

    it("rejects non-integer actorId", async () => {
      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 42.5 })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("positive integer")
    })

    it("returns 404 for unknown actor", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 99999 })

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })

    it("returns 422 when re-synthesis fails", async () => {
      // Actor lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 42, name: "John Wayne", tmdb_id: 100 }],
      })
      // Current narrative lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ narrative: "Old narrative text" }],
      })

      mockResynthesizeFromCache.mockResolvedValueOnce({
        error: "No cached source data found",
        data: null,
        sources: [],
        stats: { totalCostUsd: 0 },
      })

      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 42 })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe("No cached source data found")
      expect(res.body.previousNarrative).toBe("Old narrative text")
      expect(res.body.newNarrative).toBeNull()
    })

    it("re-synthesizes and writes to production on success", async () => {
      // Actor lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 42, name: "John Wayne", tmdb_id: 100 }],
      })
      // Current narrative lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ narrative: "Old narrative" }],
      })

      const newData = {
        hasSubstantiveContent: true,
        narrative: "New synthesized narrative",
      }
      mockResynthesizeFromCache.mockResolvedValueOnce({
        data: newData,
        sources: [{ type: "wikipedia-bio", url: "https://en.wikipedia.org/wiki/John_Wayne" }],
        stats: { totalCostUsd: 0.02 },
      })
      mockWriteBiographyToProduction.mockResolvedValueOnce(undefined)

      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 42 })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.previousNarrative).toBe("Old narrative")
      expect(res.body.newNarrative).toBe("New synthesized narrative")
      expect(res.body.stats.totalCostUsd).toBe(0.02)
      expect(mockWriteBiographyToProduction).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        42,
        newData,
        expect.any(Array)
      )
    })

    it("does not write to production when content is not substantive", async () => {
      // Actor lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 42, name: "John Wayne", tmdb_id: 100 }],
      })
      // Current narrative lookup
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      mockResynthesizeFromCache.mockResolvedValueOnce({
        data: { hasSubstantiveContent: false, narrative: null },
        sources: [],
        stats: { totalCostUsd: 0.01 },
      })

      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 42 })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockWriteBiographyToProduction).not.toHaveBeenCalled()
    })

    it("returns 500 on unexpected error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("Connection refused"))

      const res = await request(app)
        .post("/admin/api/biography-enrichment/re-synthesize")
        .send({ actorId: 42 })

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Connection refused")
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

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1, 2] })

      expect(res.status).toBe(200)
      const jobPayload = vi.mocked(queueManager.addJob).mock.calls[0][1] as Record<string, unknown>
      expect(jobPayload.allowRegeneration).toBe(true)
    })

    it("defaults allowRegeneration to false when no actorIds provided", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 44 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ limit: 10 })

      expect(res.status).toBe(200)
      const jobPayload = vi.mocked(queueManager.addJob).mock.calls[0][1] as Record<string, unknown>
      expect(jobPayload.allowRegeneration).toBe(false)
    })

    it("respects explicit allowRegeneration=false even with actorIds", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 45 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1, 2], allowRegeneration: false })

      expect(res.status).toBe(200)
      const jobPayload = vi.mocked(queueManager.addJob).mock.calls[0][1] as Record<string, unknown>
      expect(jobPayload.allowRegeneration).toBe(false)
    })

    it("forwards concurrency to job payload and run config", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 47 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1], concurrency: 10 })

      expect(res.status).toBe(200)

      // Verify forwarded to addJob payload
      const jobPayload = vi.mocked(queueManager.addJob).mock.calls[0][1] as Record<string, unknown>
      expect(jobPayload.concurrency).toBe(10)

      // Verify included in persisted run config
      const insertCall = mockPoolQuery.mock.calls[0]
      const configJson = JSON.parse(insertCall[1][0] as string)
      expect(configJson.concurrency).toBe(10)
    })

    it("forwards earlyStopSourceCount to job payload and run config", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 46 }] })
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const { queueManager } = await import("../../lib/jobs/queue-manager.js")

      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1], earlyStopSourceCount: 3 })

      expect(res.status).toBe(200)

      // Verify forwarded to addJob payload
      const jobPayload = vi.mocked(queueManager.addJob).mock.calls[0][1] as Record<string, unknown>
      expect(jobPayload.earlyStopSourceCount).toBe(3)

      // Verify included in persisted run config
      const insertCall = mockPoolQuery.mock.calls[0]
      const configJson = JSON.parse(insertCall[1][0] as string)
      expect(configJson.earlyStopSourceCount).toBe(3)
    })

    it("returns 400 for invalid earlyStopSourceCount", async () => {
      const res = await request(app)
        .post("/admin/api/biography-enrichment/enrich-batch")
        .send({ actorIds: [1], earlyStopSourceCount: -1 })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("earlyStopSourceCount")
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

  // ==========================================================================
  // GET /admin/api/biography-enrichment/runs/:id/run-logs
  // ==========================================================================

  describe("GET /runs/:id/run-logs", () => {
    it("returns paginated run logs", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: "3" }] }) // count
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              timestamp: "2026-02-24T10:00:00Z",
              level: "info",
              message: "Starting biography enrichment",
              data: null,
              source: null,
            },
            {
              id: 2,
              timestamp: "2026-02-24T10:01:00Z",
              level: "info",
              message: "Processing actor",
              data: { actorId: 123 },
              source: "wikipedia",
            },
          ],
        })

      const res = await request(app).get(
        "/admin/api/biography-enrichment/runs/42/run-logs?page=1&pageSize=50"
      )

      expect(res.status).toBe(200)
      expect(res.body.logs).toHaveLength(2)
      expect(res.body.logs[0].message).toBe("Starting biography enrichment")
      expect(res.body.pagination).toEqual({
        page: 1,
        pageSize: 50,
        total: 3,
        totalPages: 1,
      })

      // Verify biography run_type filter was applied
      const countCall = mockPoolQuery.mock.calls[0]
      expect(countCall[0]).toContain("run_type = $1")
      expect(countCall[1]).toContain("biography")
    })

    it("filters by level query param", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            timestamp: "2026-02-24T10:02:00Z",
            level: "error",
            message: "Source failed",
            data: null,
            source: null,
          },
        ],
      })

      const res = await request(app).get(
        "/admin/api/biography-enrichment/runs/42/run-logs?level=error"
      )

      expect(res.status).toBe(200)
      expect(res.body.logs).toHaveLength(1)
      expect(res.body.logs[0].level).toBe("error")

      // Verify level filter was applied in SQL
      const countCall = mockPoolQuery.mock.calls[0]
      expect(countCall[0]).toContain("level = $")
    })

    it("returns empty logs array when no logs exist", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/biography-enrichment/runs/99/run-logs")

      expect(res.status).toBe(200)
      expect(res.body.logs).toHaveLength(0)
      expect(res.body.pagination.total).toBe(0)
      expect(res.body.pagination.totalPages).toBe(0)
    })

    it("returns 400 for invalid run ID", async () => {
      const res = await request(app).get("/admin/api/biography-enrichment/runs/abc/run-logs")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid or missing run ID")
    })
  })

  // ==========================================================================
  // GET /admin/api/biography-enrichment/runs/:id/actors/:actorId/logs
  // ==========================================================================

  describe("GET /runs/:id/actors/:actorId/logs", () => {
    it("returns actor log entries", async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            actor_name: "John Wayne",
            log_entries: [
              { timestamp: "2026-02-24T10:00:00Z", level: "info", message: "Trying Wikipedia" },
              { timestamp: "2026-02-24T10:01:00Z", level: "info", message: "Found biography data" },
            ],
          },
        ],
      })

      const res = await request(app).get("/admin/api/biography-enrichment/runs/42/actors/123/logs")

      expect(res.status).toBe(200)
      expect(res.body.actorName).toBe("John Wayne")
      expect(res.body.logEntries).toHaveLength(2)
      expect(res.body.logEntries[0].message).toBe("Trying Wikipedia")
      expect(res.body.logEntries[1].message).toBe("Found biography data")

      // Verify query params
      const queryCall = mockPoolQuery.mock.calls[0]
      expect(queryCall[1]).toEqual([42, 123])
    })

    it("returns 400 for invalid run ID", async () => {
      const res = await request(app).get("/admin/api/biography-enrichment/runs/abc/actors/123/logs")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid run ID or actor ID")
    })

    it("returns 400 for invalid actor ID", async () => {
      const res = await request(app).get("/admin/api/biography-enrichment/runs/42/actors/xyz/logs")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid run ID or actor ID")
    })

    it("returns 404 when actor not found in run", async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get(
        "/admin/api/biography-enrichment/runs/42/actors/99999/logs"
      )

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Not found")
    })

    it("returns empty array when log_entries is null", async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            actor_name: "Jane Doe",
            log_entries: null,
          },
        ],
      })

      const res = await request(app).get("/admin/api/biography-enrichment/runs/42/actors/456/logs")

      expect(res.status).toBe(200)
      expect(res.body.actorName).toBe("Jane Doe")
      expect(res.body.logEntries).toEqual([])
    })

    it("returns 500 on database error", async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error("Connection lost"))

      const res = await request(app).get("/admin/api/biography-enrichment/runs/42/actors/123/logs")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch bio actor enrichment logs")
    })
  })

  // ==========================================================================
  // GET /admin/api/biography-enrichment/runs/:id/sources/errors
  // ==========================================================================

  describe("GET /runs/:id/sources/errors", () => {
    const mockSourceErrors = [
      { source: "wikipedia-bio", error_reason: "No biographical keywords found", count: 15 },
      {
        source: "guardian-bio",
        error_reason: "Content too short (42 chars, minimum 100)",
        count: 8,
      },
    ]

    it("returns source errors for specific run", async () => {
      mockGetBioRunSourceErrors.mockResolvedValue(mockSourceErrors)

      const response = await request(app)
        .get("/admin/api/biography-enrichment/runs/1/sources/errors")
        .expect(200)

      expect(mockGetBioRunSourceErrors).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1
      )
      expect(response.body).toEqual(mockSourceErrors)
    })

    it("returns 400 for invalid run ID", async () => {
      const response = await request(app)
        .get("/admin/api/biography-enrichment/runs/abc/sources/errors")
        .expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
    })

    it("returns 500 on database error", async () => {
      mockGetBioRunSourceErrors.mockRejectedValue(new Error("Database error"))

      const response = await request(app)
        .get("/admin/api/biography-enrichment/runs/1/sources/errors")
        .expect(500)

      expect(response.body.error.message).toContain("Failed to fetch source errors")
    })

    it("returns empty array when no errors exist", async () => {
      mockGetBioRunSourceErrors.mockResolvedValue([])

      const response = await request(app)
        .get("/admin/api/biography-enrichment/runs/1/sources/errors")
        .expect(200)

      expect(response.body).toEqual([])
    })
  })
})
