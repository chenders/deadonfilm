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
              tmdb_popularity: 10.5,
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
        expect.stringContaining("COALESCE(tmdb_popularity, 0) >="),
        expect.arrayContaining([5])
      )
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
    })

    it("returns 400 for missing actorId", async () => {
      const response = await request(app).post("/admin/api/biographies/generate").send({})

      expect(response.status).toBe(400)
      expect(response.body.error.message).toBe("actorId is required and must be a number")
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
    it("generates biographies for multiple actors", async () => {
      // Mock actor lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            tmdb_id: 12345,
            name: "Actor One",
            wikipedia_url: null,
            imdb_person_id: null,
          },
        ],
      })

      vi.mocked(getPersonDetails).mockResolvedValueOnce({
        id: 12345,
        name: "Actor One",
        biography: "A well-known actor with a long career spanning several decades.",
        birthday: null,
        deathday: null,
        place_of_birth: null,
        popularity: 10,
        profile_path: null,
        imdb_id: null,
      })

      vi.mocked(generateBiographyWithTracking).mockResolvedValueOnce({
        biography: "Actor One is a well-known actor.",
        hasSubstantiveContent: true,
        sourceUrl: "https://www.themoviedb.org/person/12345",
        sourceType: "tmdb",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: 0.005,
        latencyMs: 1500,
      })

      // Mock database update
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: [1], limit: 1 })

      expect(response.status).toBe(200)
      expect(response.body.results).toHaveLength(1)
      expect(response.body.results[0].success).toBe(true)
      expect(response.body.summary.successful).toBe(1)
    })

    it("respects limit parameter", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 111, name: "Actor 1", wikipedia_url: null, imdb_person_id: null },
          { id: 2, tmdb_id: 222, name: "Actor 2", wikipedia_url: null, imdb_person_id: null },
        ],
      })

      // Mock TMDB and generation for both actors
      for (let i = 0; i < 2; i++) {
        vi.mocked(getPersonDetails).mockResolvedValueOnce({
          id: 111 + i * 111,
          name: `Actor ${i + 1}`,
          biography: "A well-known actor with a long career spanning several decades.",
          birthday: null,
          deathday: null,
          place_of_birth: null,
          popularity: 10,
          profile_path: null,
          imdb_id: null,
        })

        vi.mocked(generateBiographyWithTracking).mockResolvedValueOnce({
          biography: `Actor ${i + 1} biography.`,
          hasSubstantiveContent: true,
          sourceUrl: `https://www.themoviedb.org/person/${111 + i * 111}`,
          sourceType: "tmdb",
          inputTokens: 500,
          outputTokens: 200,
          costUsd: 0.005,
          latencyMs: 1500,
        })

        mockQuery.mockResolvedValueOnce({ rows: [] })
      }

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ limit: 2, minPopularity: 5 })

      expect(response.status).toBe(200)
      expect(response.body.results.length).toBeLessThanOrEqual(2)
    })

    it("handles errors for individual actors in batch", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 12345, name: "Actor One", wikipedia_url: null, imdb_person_id: null },
        ],
      })

      vi.mocked(getPersonDetails).mockRejectedValueOnce(new Error("TMDB API error"))

      const response = await request(app)
        .post("/admin/api/biographies/generate-batch")
        .send({ actorIds: [1] })

      expect(response.status).toBe(200)
      expect(response.body.results[0].success).toBe(false)
      expect(response.body.results[0].error).toBe("TMDB API error")
      expect(response.body.summary.failed).toBe(1)
    })
  })
})
