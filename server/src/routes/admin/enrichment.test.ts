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

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(expect.any(Object), 1, 20, {})
      expect(response.body).toEqual(mockRunsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app).get("/admin/api/enrichment/runs?page=-5&pageSize=1000").expect(200)

      // Negative page should default to 1, pageSize should clamp to 100
      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(expect.any(Object), 1, 100, {})
    })

    it("applies date filters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app)
        .get("/admin/api/enrichment/runs?startDate=2024-01-01&endDate=2024-12-31")
        .expect(200)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.any(Object),
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

      expect(response.body.error.message).toContain("Invalid minCost: must be a finite number")
    })

    it("returns 400 for invalid maxCost", async () => {
      const response = await request(app).get("/admin/api/enrichment/runs?maxCost=invalid").expect(400)

      expect(response.body.error.message).toContain("Invalid maxCost: must be a finite number")
    })

    it("applies cost and error filters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      await request(app)
        .get("/admin/api/enrichment/runs?minCost=1.0&maxCost=10.0&hasErrors=true")
        .expect(200)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith(
        expect.any(Object),
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

      expect(queries.getEnrichmentRunDetails).toHaveBeenCalledWith(expect.any(Object), 1)
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

      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith(expect.any(Object), 1, 1, 50)
      expect(response.body).toEqual(mockActorsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      vi.mocked(queries.getEnrichmentRunActors).mockResolvedValue(mockActorsResult)

      await request(app).get("/admin/api/enrichment/runs/1/actors?page=-1&pageSize=200").expect(200)

      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith(expect.any(Object), 1, 1, 200)
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
        expect.any(Object),
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
        expect.any(Object),
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

      expect(queries.getRunSourcePerformanceStats).toHaveBeenCalledWith(expect.any(Object), 1)
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
})
