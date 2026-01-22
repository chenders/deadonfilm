/**
 * Tests for admin enrichment endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import router from "./enrichment.js"
import * as processManager from "../../lib/enrichment-process-manager.js"
import * as queries from "../../lib/db/admin-enrichment-queries.js"
import * as adminAuth from "../../lib/admin-auth.js"

// Mock dependencies
vi.mock("../../lib/enrichment-process-manager.js")
vi.mock("../../lib/db/admin-enrichment-queries.js", () => ({
  getEnrichmentRuns: vi.fn(),
  getEnrichmentRunDetails: vi.fn(),
  getEnrichmentRunActors: vi.fn(),
  getSourcePerformanceStats: vi.fn(),
  getRunSourcePerformanceStats: vi.fn(),
  getPendingEnrichments: vi.fn(),
  getEnrichmentReviewDetail: vi.fn(),
  approveEnrichment: vi.fn(),
  rejectEnrichment: vi.fn(),
  editEnrichment: vi.fn(),
  commitEnrichmentRun: vi.fn(),
}))
vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(),
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

describe("Admin Enrichment Endpoints", () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()

    // Create test app
    app = express()
    app.use(express.json())
    app.use("/admin/api/enrichment", router)
  })

  // ========================================================================
  // GET endpoints (monitoring)
  // ========================================================================

  describe("GET /admin/api/enrichment/runs", () => {
    const mockRunsResult = {
      items: [
        {
          id: 1,
          started_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T01:00:00Z",
          duration_ms: 3600000,
          actors_queried: 100,
          actors_processed: 95,
          actors_enriched: 80,
          actors_with_death_page: 75,
          fill_rate: "84.21",
          total_cost_usd: "1.50",
          exit_reason: "completed",
          error_count: 0,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    }

    it("returns paginated runs with default parameters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      const response = await request(app).get("/admin/api/enrichment/runs").expect(200)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        20,
        {}
      )
      expect(response.body).toEqual(mockRunsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app).get("/admin/api/enrichment/runs?page=-5&pageSize=1000").expect(200)

      // Negative page should default to 1, pageSize should clamp to 100
      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        100,
        {}
      )
    })

    it("applies date filters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app)
        .get("/admin/api/enrichment/runs?startDate=2024-01-01&endDate=2024-12-31")
        .expect(200)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        20,
        expect.objectContaining({
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        })
      )
    })

    it("returns 400 for invalid minCost", async () => {
      const response = await request(app)
        .get("/admin/api/enrichment/runs?minCost=invalid")
        .expect(400)

      expect(response.body.error.message).toContain("Invalid minCost")
    })

    it("returns 400 for invalid maxCost", async () => {
      const response = await request(app)
        .get("/admin/api/enrichment/runs?maxCost=invalid")
        .expect(400)

      expect(response.body.error.message).toContain("Invalid maxCost")
    })

    it("applies cost and error filters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app)
        .get("/admin/api/enrichment/runs?minCost=1.0&maxCost=10.0&hasErrors=true")
        .expect(200)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        20,
        expect.objectContaining({
          minCost: 1.0,
          maxCost: 10.0,
          hasErrors: true,
        })
      )
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/enrichment/runs").expect(500)

      expect(response.body.error.message).toContain("Failed to fetch enrichment runs")
    })
  })

  describe("GET /admin/api/enrichment/runs/:id", () => {
    const mockRunDetails = {
      id: 1,
      started_at: "2024-01-01T00:00:00Z",
      completed_at: "2024-01-01T01:00:00Z",
      duration_ms: 3600000,
      actors_queried: 100,
      actors_processed: 95,
      actors_enriched: 80,
      actors_with_death_page: 75,
      fill_rate: "84.21",
      total_cost_usd: "1.50",
      exit_reason: "completed",
      error_count: 0,
      cost_by_source: {},
      source_hit_rates: {},
      sources_attempted: [],
      config: {},
      links_followed: 0,
      pages_fetched: 0,
      ai_link_selections: 0,
      ai_content_extractions: 0,
      errors: [],
      script_name: null,
      script_version: null,
      hostname: null,
    }

    it("returns run details for valid ID", async () => {
      vi.mocked(queries.getEnrichmentRunDetails).mockResolvedValue(mockRunDetails)

      const response = await request(app).get("/admin/api/enrichment/runs/1").expect(200)

      expect(queries.getEnrichmentRunDetails).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1
      )
      expect(response.body).toEqual(mockRunDetails)
    })

    it("returns 400 for invalid run ID", async () => {
      const response = await request(app).get("/admin/api/enrichment/runs/invalid").expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
    })

    it("returns 404 when run not found", async () => {
      vi.mocked(queries.getEnrichmentRunDetails).mockResolvedValue(null)

      const response = await request(app).get("/admin/api/enrichment/runs/999").expect(404)

      expect(response.body.error.message).toBe("Enrichment run not found")
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getEnrichmentRunDetails).mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/enrichment/runs/1").expect(500)

      expect(response.body.error.message).toContain("Failed to fetch enrichment run details")
    })
  })

  describe("GET /admin/api/enrichment/runs/:id/actors", () => {
    const mockActorsResult = {
      items: [
        {
          actor_id: 1,
          actor_name: "Test Actor",
          actor_tmdb_id: 123,
          was_enriched: true,
          created_death_page: true,
          confidence: "0.95",
          sources_attempted: ["wikidata"],
          winning_source: "wikidata",
          processing_time_ms: 1000,
          cost_usd: "0.05",
          links_followed: 2,
          pages_fetched: 3,
          error: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }

    it("returns paginated actor results", async () => {
      vi.mocked(queries.getEnrichmentRunActors).mockResolvedValue(mockActorsResult)

      const response = await request(app).get("/admin/api/enrichment/runs/1/actors").expect(200)

      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        1,
        50
      )
      expect(response.body).toEqual(mockActorsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      vi.mocked(queries.getEnrichmentRunActors).mockResolvedValue(mockActorsResult)

      await request(app).get("/admin/api/enrichment/runs/1/actors?page=-1&pageSize=500").expect(200)

      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        1,
        200
      )
    })

    it("returns 400 for invalid run ID", async () => {
      const response = await request(app)
        .get("/admin/api/enrichment/runs/invalid/actors")
        .expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getEnrichmentRunActors).mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/enrichment/runs/1/actors").expect(500)

      expect(response.body.error.message).toContain("Failed to fetch enrichment run actors")
    })
  })

  describe("GET /admin/api/enrichment/sources/stats", () => {
    const mockSourceStats = [
      {
        source: "wikidata",
        total_attempts: 100,
        successful_attempts: 80,
        success_rate: 80.0,
        total_cost_usd: 5.0,
        average_cost_usd: 0.05,
        total_processing_time_ms: 100000,
        average_processing_time_ms: 1000,
      },
    ]

    it("returns source performance stats", async () => {
      vi.mocked(queries.getSourcePerformanceStats).mockResolvedValue(mockSourceStats)

      const response = await request(app).get("/admin/api/enrichment/sources/stats").expect(200)

      expect(queries.getSourcePerformanceStats).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        undefined,
        undefined
      )
      expect(response.body).toEqual(mockSourceStats)
    })

    it("applies date filters", async () => {
      vi.mocked(queries.getSourcePerformanceStats).mockResolvedValue(mockSourceStats)

      await request(app)
        .get("/admin/api/enrichment/sources/stats?startDate=2024-01-01&endDate=2024-12-31")
        .expect(200)

      expect(queries.getSourcePerformanceStats).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        "2024-01-01",
        "2024-12-31"
      )
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getSourcePerformanceStats).mockRejectedValue(new Error("Database error"))

      const response = await request(app).get("/admin/api/enrichment/sources/stats").expect(500)

      expect(response.body.error.message).toContain("Failed to fetch source performance stats")
    })
  })

  describe("GET /admin/api/enrichment/runs/:id/sources/stats", () => {
    const mockSourceStats = [
      {
        source: "wikidata",
        total_attempts: 50,
        successful_attempts: 40,
        success_rate: 80.0,
        total_cost_usd: 2.5,
        average_cost_usd: 0.05,
        total_processing_time_ms: 50000,
        average_processing_time_ms: 1000,
      },
    ]

    it("returns source stats for specific run", async () => {
      vi.mocked(queries.getRunSourcePerformanceStats).mockResolvedValue(mockSourceStats)

      const response = await request(app)
        .get("/admin/api/enrichment/runs/1/sources/stats")
        .expect(200)

      expect(queries.getRunSourcePerformanceStats).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1
      )
      expect(response.body).toEqual(mockSourceStats)
    })

    it("returns 400 for invalid run ID", async () => {
      const response = await request(app)
        .get("/admin/api/enrichment/runs/invalid/sources/stats")
        .expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getRunSourcePerformanceStats).mockRejectedValue(new Error("Database error"))

      const response = await request(app)
        .get("/admin/api/enrichment/runs/1/sources/stats")
        .expect(500)

      expect(response.body.error.message).toContain("Failed to fetch run source performance stats")
    })
  })

  // ========================================================================
  // POST endpoints (interactive controls)
  // ========================================================================

  describe("POST /admin/api/enrichment/start", () => {
    it("should start a new enrichment run with valid config", async () => {
      vi.mocked(processManager.startEnrichmentRun).mockResolvedValue(1)

      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 10,
          maxTotalCost: 5,
          minPopularity: 10,
          confidence: 0.7,
          recentOnly: true,
        })
        .expect(201)

      expect(response.body).toEqual({
        id: 1,
        status: "running",
        message: "Enrichment run started successfully",
      })

      expect(processManager.startEnrichmentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          maxTotalCost: 5,
          minPopularity: 10,
          confidence: 0.7,
          recentOnly: true,
        })
      )

      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "start_enrichment",
          resourceType: "enrichment_run",
        })
      )
    })

    it("should reject invalid limit (too high)", async () => {
      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 2000, // Too high
          maxTotalCost: 5,
        })
        .expect(400)

      expect(response.body.error.message).toContain("Limit must be between 1 and 1000")
      expect(processManager.startEnrichmentRun).not.toHaveBeenCalled()
    })

    it("should reject invalid limit (too low)", async () => {
      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 0,
          maxTotalCost: 5,
        })
        .expect(400)

      expect(response.body.error.message).toContain("Limit must be between 1 and 1000")
      expect(processManager.startEnrichmentRun).not.toHaveBeenCalled()
    })

    it("should reject negative maxTotalCost", async () => {
      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 10,
          maxTotalCost: -5,
        })
        .expect(400)

      expect(response.body.error.message).toContain("Max total cost must be positive")
      expect(processManager.startEnrichmentRun).not.toHaveBeenCalled()
    })

    it("should reject negative maxCostPerActor", async () => {
      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 10,
          maxTotalCost: 10,
          maxCostPerActor: -1,
        })
        .expect(400)

      expect(response.body.error.message).toContain("Max cost per actor must be positive")
      expect(processManager.startEnrichmentRun).not.toHaveBeenCalled()
    })

    it("should handle errors from process manager", async () => {
      vi.mocked(processManager.startEnrichmentRun).mockRejectedValue(
        new Error("Failed to spawn process")
      )

      const response = await request(app)
        .post("/admin/api/enrichment/start")
        .send({
          limit: 10,
          maxTotalCost: 5,
        })
        .expect(500)

      expect(response.body.error.message).toBe("Failed to start enrichment run")
    })
  })

  describe("POST /admin/api/enrichment/runs/:id/stop", () => {
    it("should stop a running enrichment run", async () => {
      vi.mocked(processManager.stopEnrichmentRun).mockResolvedValue(true)

      const response = await request(app).post("/admin/api/enrichment/runs/1/stop").expect(200)

      expect(response.body).toEqual({
        id: 1,
        stopped: true,
        message: "Enrichment run stopped successfully",
      })

      expect(processManager.stopEnrichmentRun).toHaveBeenCalledWith(1)
      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "stop_enrichment",
          resourceType: "enrichment_run",
          resourceId: 1,
        })
      )
    })

    it("should reject invalid run ID", async () => {
      const response = await request(app)
        .post("/admin/api/enrichment/runs/invalid/stop")
        .expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
      expect(processManager.stopEnrichmentRun).not.toHaveBeenCalled()
    })

    it("should handle errors from process manager", async () => {
      vi.mocked(processManager.stopEnrichmentRun).mockRejectedValue(new Error("Process not found"))

      const response = await request(app).post("/admin/api/enrichment/runs/999/stop").expect(500)

      expect(response.body.error.message).toBe("Failed to stop enrichment run")
    })
  })

  describe("GET /admin/api/enrichment/runs/:id/progress", () => {
    it("should return progress for a running enrichment", async () => {
      const mockProgress = {
        status: "running",
        currentActorIndex: 5,
        currentActorName: "Test Actor",
        actorsQueried: 10,
        actorsProcessed: 5,
        actorsEnriched: 3,
        totalCostUsd: 1.5,
        progressPercentage: 50.0,
        elapsedMs: 10000,
        estimatedTimeRemainingMs: 10000,
      }

      vi.mocked(processManager.getEnrichmentRunProgress).mockResolvedValue(mockProgress)

      const response = await request(app).get("/admin/api/enrichment/runs/1/progress").expect(200)

      expect(response.body).toEqual(mockProgress)
      expect(processManager.getEnrichmentRunProgress).toHaveBeenCalledWith(1)
    })

    it("should reject invalid run ID", async () => {
      const response = await request(app)
        .get("/admin/api/enrichment/runs/invalid/progress")
        .expect(400)

      expect(response.body.error.message).toBe("Invalid run ID")
      expect(processManager.getEnrichmentRunProgress).not.toHaveBeenCalled()
    })

    it("should handle errors from process manager", async () => {
      vi.mocked(processManager.getEnrichmentRunProgress).mockRejectedValue(
        new Error("Run not found")
      )

      const response = await request(app).get("/admin/api/enrichment/runs/999/progress").expect(500)

      expect(response.body.error.message).toBe("Failed to fetch enrichment run progress")
    })

    it("should return progress for completed run", async () => {
      const mockProgress = {
        status: "completed",
        currentActorIndex: null,
        currentActorName: null,
        actorsQueried: 10,
        actorsProcessed: 10,
        actorsEnriched: 8,
        totalCostUsd: 3.5,
        progressPercentage: 100.0,
        elapsedMs: 30000,
        estimatedTimeRemainingMs: null,
      }

      vi.mocked(processManager.getEnrichmentRunProgress).mockResolvedValue(mockProgress)

      const response = await request(app).get("/admin/api/enrichment/runs/1/progress").expect(200)

      expect(response.body.status).toBe("completed")
      expect(response.body.progressPercentage).toBe(100.0)
      expect(response.body.estimatedTimeRemainingMs).toBeNull()
    })
  })

  // ========================================================================
  // REVIEW WORKFLOW ENDPOINTS (Stage 4)
  // ========================================================================

  describe("GET /admin/api/enrichment/pending-review", () => {
    const mockPendingResult = {
      items: [
        {
          enrichment_run_actor_id: 1,
          run_id: 1,
          run_started_at: "2024-01-01T00:00:00Z",
          actor_id: 100,
          actor_name: "John Doe",
          actor_tmdb_id: 12345,
          deathday: "2023-05-15",
          cause_of_death: "Heart attack",
          cause_of_death_details: "Myocardial infarction",
          review_status: "pending",
          circumstances_confidence: "high",
          cause_confidence: "high",
          details_confidence: "medium",
          deathday_confidence: "high",
          overall_confidence: "0.85",
          winning_source: "wikidata",
          cost_usd: "0.05",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }

    it("returns paginated pending enrichments with default parameters", async () => {
      vi.mocked(queries.getPendingEnrichments).mockResolvedValue(mockPendingResult)

      const response = await request(app).get("/admin/api/enrichment/pending-review").expect(200)

      expect(queries.getPendingEnrichments).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        { page: 1, pageSize: 50 }
      )
      expect(response.body).toEqual(mockPendingResult)
    })

    it("validates and clamps pagination parameters", async () => {
      vi.mocked(queries.getPendingEnrichments).mockResolvedValue(mockPendingResult)

      await request(app)
        .get("/admin/api/enrichment/pending-review?page=-1&pageSize=500")
        .expect(200)

      expect(queries.getPendingEnrichments).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        { page: 1, pageSize: 200 }
      )
    })

    it("applies runId filter", async () => {
      vi.mocked(queries.getPendingEnrichments).mockResolvedValue(mockPendingResult)

      await request(app).get("/admin/api/enrichment/pending-review?runId=5").expect(200)

      expect(queries.getPendingEnrichments).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        expect.objectContaining({ runId: 5 })
      )
    })

    it("rejects invalid runId", async () => {
      await request(app).get("/admin/api/enrichment/pending-review?runId=abc").expect(400)
    })

    it("applies minConfidence filter", async () => {
      vi.mocked(queries.getPendingEnrichments).mockResolvedValue(mockPendingResult)

      await request(app).get("/admin/api/enrichment/pending-review?minConfidence=0.8").expect(200)

      expect(queries.getPendingEnrichments).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        expect.objectContaining({ minConfidence: 0.8 })
      )
    })

    it("rejects invalid minConfidence values", async () => {
      await request(app).get("/admin/api/enrichment/pending-review?minConfidence=1.5").expect(400)
      await request(app).get("/admin/api/enrichment/pending-review?minConfidence=-0.1").expect(400)
    })

    it("applies causeConfidence filter", async () => {
      vi.mocked(queries.getPendingEnrichments).mockResolvedValue(mockPendingResult)

      await request(app)
        .get("/admin/api/enrichment/pending-review?causeConfidence=high")
        .expect(200)

      expect(queries.getPendingEnrichments).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        expect.objectContaining({ causeConfidence: "high" })
      )
    })

    it("rejects invalid causeConfidence values", async () => {
      await request(app)
        .get("/admin/api/enrichment/pending-review?causeConfidence=invalid")
        .expect(400)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.getPendingEnrichments).mockRejectedValue(new Error("DB error"))

      await request(app).get("/admin/api/enrichment/pending-review").expect(500)
    })
  })

  describe("GET /admin/api/enrichment/review/:enrichmentRunActorId", () => {
    const mockDetailResult = {
      enrichment_run_actor_id: 1,
      run_id: 1,
      actor_id: 100,
      actor_name: "John Doe",
      actor_tmdb_id: 12345,
      was_enriched: true,
      confidence: "0.85",
      sources_attempted: ["wikidata", "wikipedia"],
      winning_source: "wikidata",
      processing_time_ms: 1500,
      cost_usd: "0.05",
      staging_id: 1,
      review_status: "pending",
      deathday: "2023-05-15",
      cause_of_death: "Heart attack",
      cause_of_death_source: "wikidata",
      cause_of_death_details: null,
      cause_of_death_details_source: null,
      wikipedia_url: null,
      age_at_death: 65,
      expected_lifespan: "78.5",
      years_lost: "13.5",
      violent_death: false,
      has_detailed_death_info: false,
      circumstances: null,
      circumstances_confidence: null,
      rumored_circumstances: null,
      cause_confidence: "high",
      details_confidence: null,
      birthday_confidence: null,
      deathday_confidence: "high",
      location_of_death: null,
      last_project: null,
      career_status_at_death: null,
      posthumous_releases: null,
      related_celebrity_ids: null,
      related_celebrities: null,
      notable_factors: null,
      additional_context: null,
      sources: null,
      raw_response: null,
      prod_deathday: "2023-05-15",
      prod_cause_of_death: "Unknown",
      prod_cause_of_death_details: null,
      prod_has_detailed_death_info: false,
    }

    it("returns detailed enrichment data", async () => {
      vi.mocked(queries.getEnrichmentReviewDetail).mockResolvedValue(mockDetailResult)

      const response = await request(app).get("/admin/api/enrichment/review/1").expect(200)

      expect(queries.getEnrichmentReviewDetail).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1
      )
      expect(response.body).toEqual(mockDetailResult)
    })

    it("returns 404 if enrichment not found", async () => {
      vi.mocked(queries.getEnrichmentReviewDetail).mockResolvedValue(null)

      await request(app).get("/admin/api/enrichment/review/999").expect(404)
    })

    it("rejects invalid enrichmentRunActorId", async () => {
      await request(app).get("/admin/api/enrichment/review/abc").expect(400)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.getEnrichmentReviewDetail).mockRejectedValue(new Error("DB error"))

      await request(app).get("/admin/api/enrichment/review/1").expect(500)
    })
  })

  describe("POST /admin/api/enrichment/review/:enrichmentRunActorId/approve", () => {
    it("approves an enrichment successfully", async () => {
      vi.mocked(queries.approveEnrichment).mockResolvedValue()

      const response = await request(app)
        .post("/admin/api/enrichment/review/1/approve")
        .send({ adminUser: "admin@example.com", notes: "Looks good" })
        .expect(200)

      expect(queries.approveEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        "Looks good"
      )
      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approve_enrichment",
          resourceType: "enrichment_review",
          resourceId: 1,
        })
      )
      expect(response.body.success).toBe(true)
    })

    it("approves without notes", async () => {
      vi.mocked(queries.approveEnrichment).mockResolvedValue()

      await request(app)
        .post("/admin/api/enrichment/review/1/approve")
        .send({ adminUser: "admin@example.com" })
        .expect(200)

      expect(queries.approveEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        undefined
      )
    })

    it("rejects missing adminUser", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/approve")
        .send({ notes: "test" })
        .expect(400)
    })

    it("rejects empty adminUser", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/approve")
        .send({ adminUser: "   " })
        .expect(400)
    })

    it("rejects invalid enrichmentRunActorId", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/abc/approve")
        .send({ adminUser: "admin@example.com" })
        .expect(400)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.approveEnrichment).mockRejectedValue(new Error("DB error"))

      await request(app)
        .post("/admin/api/enrichment/review/1/approve")
        .send({ adminUser: "admin@example.com" })
        .expect(500)
    })
  })

  describe("POST /admin/api/enrichment/review/:enrichmentRunActorId/reject", () => {
    it("rejects an enrichment successfully", async () => {
      vi.mocked(queries.rejectEnrichment).mockResolvedValue()

      const response = await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({
          adminUser: "admin@example.com",
          reason: "low_confidence",
          details: "Not enough sources",
        })
        .expect(200)

      expect(queries.rejectEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        "low_confidence",
        "Not enough sources"
      )
      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "reject_enrichment",
          resourceType: "enrichment_review",
          resourceId: 1,
        })
      )
      expect(response.body.success).toBe(true)
    })

    it("rejects without details", async () => {
      vi.mocked(queries.rejectEnrichment).mockResolvedValue()

      await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({ adminUser: "admin@example.com", reason: "incorrect_data" })
        .expect(200)

      expect(queries.rejectEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        "incorrect_data",
        undefined
      )
    })

    it("rejects missing adminUser", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({ reason: "low_confidence" })
        .expect(400)
    })

    it("rejects missing reason", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({ adminUser: "admin@example.com" })
        .expect(400)
    })

    it("rejects invalid reason", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({ adminUser: "admin@example.com", reason: "invalid_reason" })
        .expect(400)
    })

    it("accepts all valid rejection reasons", async () => {
      vi.mocked(queries.rejectEnrichment).mockResolvedValue()

      const validReasons = [
        "low_confidence",
        "incorrect_data",
        "duplicate",
        "no_death_info",
        "other",
      ]

      for (const reason of validReasons) {
        await request(app)
          .post("/admin/api/enrichment/review/1/reject")
          .send({ adminUser: "admin@example.com", reason })
          .expect(200)
      }

      expect(queries.rejectEnrichment).toHaveBeenCalledTimes(validReasons.length)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.rejectEnrichment).mockRejectedValue(new Error("DB error"))

      await request(app)
        .post("/admin/api/enrichment/review/1/reject")
        .send({ adminUser: "admin@example.com", reason: "low_confidence" })
        .expect(500)
    })
  })

  describe("POST /admin/api/enrichment/review/:enrichmentRunActorId/edit", () => {
    it("edits an enrichment successfully", async () => {
      vi.mocked(queries.editEnrichment).mockResolvedValue()

      const edits = {
        cause_of_death: "Myocardial infarction",
        cause_of_death_details: "Updated with more specific diagnosis",
      }

      const response = await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({
          adminUser: "admin@example.com",
          edits,
          notes: "Updated based on medical records",
        })
        .expect(200)

      expect(queries.editEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        edits,
        "Updated based on medical records"
      )
      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "edit_enrichment",
          resourceType: "enrichment_review",
          resourceId: 1,
        })
      )
      expect(response.body.success).toBe(true)
    })

    it("edits without notes", async () => {
      vi.mocked(queries.editEnrichment).mockResolvedValue()

      await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({
          adminUser: "admin@example.com",
          edits: { cause_of_death: "Updated" },
        })
        .expect(200)

      expect(queries.editEnrichment).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        { cause_of_death: "Updated" },
        undefined
      )
    })

    it("rejects missing adminUser", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({ edits: { cause_of_death: "test" } })
        .expect(400)
    })

    it("rejects missing edits", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({ adminUser: "admin@example.com" })
        .expect(400)
    })

    it("rejects empty edits object", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({ adminUser: "admin@example.com", edits: {} })
        .expect(400)
    })

    it("rejects invalid enrichmentRunActorId", async () => {
      await request(app)
        .post("/admin/api/enrichment/review/abc/edit")
        .send({ adminUser: "admin@example.com", edits: { cause_of_death: "test" } })
        .expect(400)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.editEnrichment).mockRejectedValue(new Error("DB error"))

      await request(app)
        .post("/admin/api/enrichment/review/1/edit")
        .send({ adminUser: "admin@example.com", edits: { cause_of_death: "test" } })
        .expect(500)
    })
  })

  describe("POST /admin/api/enrichment/runs/:id/commit", () => {
    it("commits approved enrichments successfully", async () => {
      vi.mocked(queries.commitEnrichmentRun).mockResolvedValue({ committedCount: 5 })

      const response = await request(app)
        .post("/admin/api/enrichment/runs/1/commit")
        .send({
          adminUser: "admin@example.com",
          notes: "All high confidence enrichments approved",
        })
        .expect(200)

      expect(queries.commitEnrichmentRun).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        "All high confidence enrichments approved"
      )
      expect(adminAuth.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "commit_enrichment_run",
          resourceType: "enrichment_run",
          resourceId: 1,
        })
      )
      expect(response.body.success).toBe(true)
      expect(response.body.committedCount).toBe(5)
      expect(response.body.message).toContain("5 enrichment(s) committed")
    })

    it("commits without notes", async () => {
      vi.mocked(queries.commitEnrichmentRun).mockResolvedValue({ committedCount: 3 })

      await request(app)
        .post("/admin/api/enrichment/runs/1/commit")
        .send({ adminUser: "admin@example.com" })
        .expect(200)

      expect(queries.commitEnrichmentRun).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        1,
        "admin@example.com",
        undefined
      )
    })

    it("handles zero commits", async () => {
      vi.mocked(queries.commitEnrichmentRun).mockResolvedValue({ committedCount: 0 })

      const response = await request(app)
        .post("/admin/api/enrichment/runs/1/commit")
        .send({ adminUser: "admin@example.com" })
        .expect(200)

      expect(response.body.committedCount).toBe(0)
    })

    it("rejects missing adminUser", async () => {
      await request(app).post("/admin/api/enrichment/runs/1/commit").send({}).expect(400)
    })

    it("rejects empty adminUser", async () => {
      await request(app)
        .post("/admin/api/enrichment/runs/1/commit")
        .send({ adminUser: "   " })
        .expect(400)
    })

    it("rejects invalid run ID", async () => {
      await request(app)
        .post("/admin/api/enrichment/runs/abc/commit")
        .send({ adminUser: "admin@example.com" })
        .expect(400)
    })

    it("handles query errors gracefully", async () => {
      vi.mocked(queries.commitEnrichmentRun).mockRejectedValue(new Error("DB error"))

      await request(app)
        .post("/admin/api/enrichment/runs/1/commit")
        .send({ adminUser: "admin@example.com" })
        .expect(500)
    })
  })
})
