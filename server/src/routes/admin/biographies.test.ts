import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import biographiesRouter from "./biographies.js"

// Mock the database pool
const mockQuery = vi.fn()
vi.mock("../../lib/db/pool.js", () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}))

// Mock logger
vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock admin auth
vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(),
}))

// Mock TMDB
vi.mock("../../lib/tmdb.js", () => ({
  getPersonDetails: vi.fn(),
}))

// Mock biography generator
vi.mock("../../lib/biography/biography-generator.js", () => ({
  generateBiographyWithTracking: vi.fn(),
}))

// Mock cache
const mockInvalidateActorCache = vi.fn()
vi.mock("../../lib/cache.js", () => ({
  invalidateActorCache: (...args: unknown[]) => mockInvalidateActorCache(...args),
}))

// Mock Wikipedia fetcher
vi.mock("../../lib/biography/wikipedia-fetcher.js", () => ({
  fetchWikipediaIntro: vi.fn().mockResolvedValue(null),
}))

// Mock queue manager
const mockAddJob = vi.fn()
vi.mock("../../lib/jobs/queue-manager.js", () => ({
  queueManager: {
    isReady: true,
    addJob: (...args: unknown[]) => mockAddJob(...args),
  },
}))

// Mock job types (needed for route import)
vi.mock("../../lib/jobs/types.js", async () => {
  const actual = await vi.importActual("../../lib/jobs/types.js")
  return actual
})

import { getPersonDetails } from "../../lib/tmdb.js"
import { generateBiographyWithTracking } from "../../lib/biography/biography-generator.js"

describe("Admin Biographies Routes", () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use("/admin/api/biographies", biographiesRouter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("GET /admin/api/biographies", () => {
    it("returns paginated list of actors needing biographies", async () => {
      // Mock count query
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: "100" }],
        })
        // Mock actors query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              tmdb_id: 12345,
              name: "John Wayne",
              dof_popularity: 10.5,
              biography: null,
              biography_generated_at: null,
              wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
              imdb_person_id: "nm0000078",
            },
          ],
        })
        // Mock stats query
        .mockResolvedValueOnce({
          rows: [
            {
              total_actors: "1000",
              with_biography: "500",
              without_biography: "500",
            },
          ],
        })

      const response = await request(app).get("/admin/api/biographies")

      expect(response.status).toBe(200)
      expect(response.body.actors).toHaveLength(1)
      expect(response.body.actors[0].name).toBe("John Wayne")
      expect(response.body.actors[0].hasBiography).toBe(false)
      expect(response.body.actors[0].hasWikipedia).toBe(true)
      expect(response.body.actors[0].hasImdb).toBe(true)
      expect(response.body.pagination.totalCount).toBe(100)
      expect(response.body.stats.totalActors).toBe(1000)
    })

    it("supports pagination parameters", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "50" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "50", with_biography: "25", without_biography: "25" }],
        })

      const response = await request(app).get("/admin/api/biographies?page=2&pageSize=25")

      expect(response.status).toBe(200)
      expect(response.body.pagination.page).toBe(2)
      expect(response.body.pagination.pageSize).toBe(25)
    })

    it("supports minPopularity filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "10" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?minPopularity=5")

      expect(response.status).toBe(200)
      // Check that the query was called with popularity filter
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("COALESCE(dof_popularity, 0) >="),
        expect.arrayContaining([5])
      )
    })

    it("supports sortBy=name param", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "10" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?sortBy=name")

      expect(response.status).toBe(200)
      // Second call is the actors query — check ORDER BY
      const actorsQuery = mockQuery.mock.calls[1][0] as string
      expect(actorsQuery).toContain("ORDER BY name ASC")
    })

    it("supports sortBy=generated_at param", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "10" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?sortBy=generated_at")

      expect(response.status).toBe(200)
      const actorsQuery = mockQuery.mock.calls[1][0] as string
      expect(actorsQuery).toContain("ORDER BY biography_generated_at DESC NULLS LAST")
    })

    it("defaults sortBy to popularity", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "10" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies")

      expect(response.status).toBe(200)
      const actorsQuery = mockQuery.mock.calls[1][0] as string
      expect(actorsQuery).toContain("ORDER BY COALESCE(dof_popularity, 0) DESC")
    })

    it("falls back to popularity sort for invalid sortBy values", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "10" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?sortBy=invalid")

      expect(response.status).toBe(200)
      const actorsQuery = mockQuery.mock.calls[1][0] as string
      expect(actorsQuery).toContain("ORDER BY COALESCE(dof_popularity, 0) DESC")
    })

    it("supports vitalStatus=alive filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?vitalStatus=alive")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("deathday IS NULL")
    })

    it("supports vitalStatus=deceased filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?vitalStatus=deceased")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("deathday IS NOT NULL")
    })

    it("supports hasWikipedia=true filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasWikipedia=true")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("wikipedia_url IS NOT NULL")
    })

    it("supports hasWikipedia=false filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasWikipedia=false")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("wikipedia_url IS NULL")
    })

    it("supports hasImdb=true filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasImdb=true")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("imdb_person_id IS NOT NULL")
    })

    it("supports hasImdb=false filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasImdb=false")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("imdb_person_id IS NULL")
    })

    it("supports hasEnrichedBio=true filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasEnrichedBio=true")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("EXISTS (SELECT 1 FROM actor_biography_details")
    })

    it("supports hasEnrichedBio=false filter", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ total_actors: "10", with_biography: "5", without_biography: "5" }],
        })

      const response = await request(app).get("/admin/api/biographies?hasEnrichedBio=false")

      expect(response.status).toBe(200)
      const countQuery = mockQuery.mock.calls[0][0] as string
      expect(countQuery).toContain("NOT EXISTS (SELECT 1 FROM actor_biography_details")
    })

    it("handles database errors", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const response = await request(app).get("/admin/api/biographies")

      expect(response.status).toBe(500)
      expect(response.body.error.message).toBe("Failed to get actors")
    })
  })

  describe("POST /admin/api/biographies/generate", () => {
    it("generates biography for valid actor", async () => {
      // Mock actor lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            tmdb_id: 12345,
            name: "John Wayne",
            wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
            imdb_person_id: "nm0000078",
          },
        ],
      })

      // Mock TMDB person details
      vi.mocked(getPersonDetails).mockResolvedValueOnce({
        id: 12345,
        name: "John Wayne",
        biography: "John Wayne was a famous American actor known for westerns and war films.",
        birthday: "1907-05-26",
        deathday: "1979-06-11",
        place_of_birth: "Winterset, Iowa, USA",
        popularity: 10.5,
        profile_path: "/path.jpg",
        imdb_id: "nm0000078",
      })

      // Mock biography generation
      vi.mocked(generateBiographyWithTracking).mockResolvedValueOnce({
        biography: "John Wayne was a legendary American actor.",
        hasSubstantiveContent: true,
        sourceUrl: "https://en.wikipedia.org/wiki/John_Wayne",
        sourceType: "wikipedia",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: 0.005,
        latencyMs: 1500,
      })

      // Mock database update
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/biographies/generate")
        .send({ actorId: 1 })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.result.biography).toBe("John Wayne was a legendary American actor.")
      expect(response.body.result.hasSubstantiveContent).toBe(true)
      expect(mockInvalidateActorCache).toHaveBeenCalledWith(1)
    })

    it("returns 400 for missing actorId", async () => {
      const response = await request(app).post("/admin/api/biographies/generate").send({})

      expect(response.status).toBe(400)
      expect(response.body.error.message).toBe("actorId is required and must be a positive integer")
    })

    it("returns 404 for non-existent actor", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/biographies/generate")
        .send({ actorId: 99999 })

      expect(response.status).toBe(404)
      expect(response.body.error.message).toBe("Actor not found")
    })

    it("returns 400 for actor without TMDB ID", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            tmdb_id: null,
            name: "Unknown Actor",
            wikipedia_url: null,
            imdb_person_id: null,
          },
        ],
      })

      const response = await request(app)
        .post("/admin/api/biographies/generate")
        .send({ actorId: 1 })

      expect(response.status).toBe(400)
      expect(response.body.error.message).toBe("Actor does not have a TMDB ID")
    })

    it("handles no substantial TMDB biography", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            tmdb_id: 12345,
            name: "Minor Actor",
            wikipedia_url: null,
            imdb_person_id: null,
          },
        ],
      })

      vi.mocked(getPersonDetails).mockResolvedValueOnce({
        id: 12345,
        name: "Minor Actor",
        biography: "Short.",
        birthday: null,
        deathday: null,
        place_of_birth: null,
        popularity: 1.0,
        profile_path: null,
        imdb_id: null,
      })

      // Mock database update for no-content case
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/biographies/generate")
        .send({ actorId: 1 })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.message).toBe("No substantial TMDB biography available")
      expect(response.body.result.hasSubstantiveContent).toBe(false)
    })
  })

  describe("POST /admin/api/biographies/generate-batch", () => {
    it("queues a BullMQ job for batch generation", async () => {
      mockAddJob.mockResolvedValueOnce("test-job-id-123")

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: [1, 2, 3], limit: 10 })

      expect(response.status).toBe(200)
      expect(response.body.jobId).toBe("test-job-id-123")
      expect(response.body.queued).toBe(true)
      expect(mockAddJob).toHaveBeenCalledWith(
        "generate-biographies-batch",
        expect.objectContaining({
          actorIds: [1, 2, 3],
          limit: 10,
          allowRegeneration: false,
        }),
        expect.objectContaining({
          attempts: 1,
          createdBy: "admin-biographies-api",
        })
      )
    })

    it("caps limit at 500", async () => {
      mockAddJob.mockResolvedValueOnce("job-456")

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ limit: 1000 })

      expect(response.status).toBe(200)
      expect(mockAddJob).toHaveBeenCalledWith(
        "generate-biographies-batch",
        expect.objectContaining({ limit: 500 }),
        expect.any(Object)
      )
    })

    it("caps actorIds at 500", async () => {
      mockAddJob.mockResolvedValueOnce("job-789")
      const manyIds = Array.from({ length: 600 }, (_, i) => i + 1)

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: manyIds })

      expect(response.status).toBe(200)
      const callPayload = mockAddJob.mock.calls[0][1]
      expect(callPayload.actorIds).toHaveLength(500)
    })

    it("returns 400 for invalid actorIds", async () => {
      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: ["not", "numbers"] })

      expect(response.status).toBe(400)
      expect(response.body.error.message).toBe("actorIds must be an array of positive integers")
    })

    it("queues by-popularity job when no actorIds provided", async () => {
      mockAddJob.mockResolvedValueOnce("pop-job-id")

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ limit: 50, minPopularity: 5 })

      expect(response.status).toBe(200)
      expect(response.body.queued).toBe(true)
      expect(mockAddJob).toHaveBeenCalledWith(
        "generate-biographies-batch",
        expect.objectContaining({
          limit: 50,
          minPopularity: 5,
          actorIds: undefined,
        }),
        expect.any(Object)
      )
    })

    it("handles queue manager errors", async () => {
      mockAddJob.mockRejectedValueOnce(new Error("Redis connection failed"))

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: [1] })

      expect(response.status).toBe(500)
      expect(response.body.error.message).toBe("Failed to queue batch generation")
    })

    it("returns 503 when job queue is not available", async () => {
      const { queueManager } = await import("../../lib/jobs/queue-manager.js")
      const original = queueManager.isReady
      ;(queueManager as Record<string, unknown>).isReady = false

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: [1, 2] })

      expect(response.status).toBe(503)
      expect(response.body.error.message).toContain("Job queue is not available")
      expect(mockAddJob).not.toHaveBeenCalled()
      ;(queueManager as Record<string, unknown>).isReady = original
    })
  })
})
