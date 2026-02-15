import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { Express } from "express"

// Mock dependencies before imports
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/cache.js", () => ({
  getCached: vi.fn(),
  invalidateActorCache: vi.fn(() => Promise.resolve()),
  CACHE_KEYS: {
    actor: (id: number) => ({
      profile: `actor:id:${id}`,
      death: `actor:id:${id}:type:death`,
    }),
  },
}))

vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(() => Promise.resolve()),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

const mockEnrichActor = vi.fn()
vi.mock("../../lib/death-sources/orchestrator.js", () => {
  return {
    DeathEnrichmentOrchestrator: function MockOrchestrator() {
      return { enrichActor: mockEnrichActor }
    },
  }
})

vi.mock("../../lib/enrichment-db-writer.js", () => ({
  writeToProduction: vi.fn(() => Promise.resolve()),
}))

vi.mock("../../lib/entity-linker/index.js", () => ({
  linkMultipleFields: vi.fn(() => Promise.resolve({})),
  hasEntityLinks: vi.fn(() => false),
}))

vi.mock("../../lib/claude-batch/constants.js", () => ({
  MIN_CIRCUMSTANCES_LENGTH: 200,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH: 100,
}))

import router from "./actors.js"
import { getPool } from "../../lib/db/pool.js"
import { logAdminAction } from "../../lib/admin-auth.js"
import { invalidateActorCache } from "../../lib/cache.js"
import { writeToProduction } from "../../lib/enrichment-db-writer.js"

describe("admin actors routes", () => {
  let app: Express
  let mockPool: {
    query: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
  }
  let mockClient: {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Re-establish mock implementations that may have been cleared
    vi.mocked(logAdminAction).mockResolvedValue(undefined)

    app = express()
    app.use(express.json())
    app.use("/admin/api/actors", router)

    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    }

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockImplementation(() => Promise.resolve(mockClient)),
    }
    vi.mocked(getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof getPool>)
  })

  describe("GET /admin/api/actors/:id", () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      name: "John Wayne",
      birthday: "1907-05-26",
      deathday: "1979-06-11",
      profile_path: "/path.jpg",
      cause_of_death: "Stomach cancer",
      deathday_confidence: "verified",
      is_obscure: false,
    }

    const mockCircumstances = {
      id: 1,
      actor_id: 123,
      circumstances: "Died of stomach cancer in Los Angeles",
      circumstances_confidence: "high",
    }

    it("should return actor data for valid ID", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // actor query
        .mockResolvedValueOnce({ rows: [mockCircumstances] }) // circumstances query
        .mockResolvedValueOnce({ rows: [] }) // history query

      const res = await request(app).get("/admin/api/actors/123")

      expect(res.status).toBe(200)
      expect(res.body.actor).toEqual(mockActor)
      expect(res.body.circumstances).toEqual(mockCircumstances)
      expect(res.body.editableFields).toBeDefined()
      expect(res.body.editableFields.actor).toContain("name")
      expect(res.body.editableFields.actor).not.toContain("tmdb_popularity")
    })

    it("should return 404 for non-existent actor", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/999")

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })

    it("should return 404 for non-numeric ID (not matched by route)", async () => {
      // Route uses /:id(\\d+) so non-numeric IDs don't match and return 404
      const res = await request(app).get("/admin/api/actors/invalid")

      expect(res.status).toBe(404)
    })

    it("should detect data quality issues", async () => {
      const actorWithIssues = {
        ...mockActor,
        deathday_confidence: "conflicting",
      }
      const circumstancesWithIssues = {
        ...mockCircumstances,
        circumstances: "He reportedly died of cancer",
        cause_confidence: "low",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [actorWithIssues] })
        .mockResolvedValueOnce({ rows: [circumstancesWithIssues] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/123")

      expect(res.status).toBe(200)
      expect(res.body.dataQualityIssues.length).toBeGreaterThan(0)

      const issues = res.body.dataQualityIssues
      expect(issues.some((i: { field: string }) => i.field === "deathday")).toBe(true)
      expect(issues.some((i: { field: string }) => i.field === "circumstances")).toBe(true)
    })

    it("should detect future death dates", async () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      const actorWithFutureDeath = {
        ...mockActor,
        deathday: futureDate.toISOString().split("T")[0],
        deathday_confidence: "verified",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [actorWithFutureDeath] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/123")

      expect(res.status).toBe(200)
      const futureIssue = res.body.dataQualityIssues.find(
        (i: { field: string; issue: string }) =>
          i.field === "deathday" && i.issue === "Death date is in the future"
      )
      expect(futureIssue).toBeDefined()
      expect(futureIssue.severity).toBe("error")
    })
  })

  describe("GET /admin/api/actors/:id/history/:field", () => {
    const mockHistoryRows = [
      {
        id: 1,
        old_value: "heart attack",
        new_value: "cardiac arrest",
        source: "admin-manual-edit",
        batch_id: "admin-edit-123",
        created_at: "2026-01-15T10:00:00Z",
      },
      {
        id: 2,
        old_value: null,
        new_value: "heart attack",
        source: "claude-enrichment",
        batch_id: null,
        created_at: "2026-01-10T10:00:00Z",
      },
    ]

    it("should return history for valid actor field", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 123 }] }) // actor exists check
        .mockResolvedValueOnce({ rows: mockHistoryRows }) // history query
        .mockResolvedValueOnce({ rows: [{ count: "2" }] }) // count query

      const res = await request(app).get("/admin/api/actors/123/history/cause_of_death")

      expect(res.status).toBe(200)
      expect(res.body.field).toBe("cause_of_death")
      expect(res.body.history).toHaveLength(2)
      expect(res.body.history[0].old_value).toBe("heart attack")
      expect(res.body.total).toBe(2)
      expect(res.body.hasMore).toBe(false)
    })

    it("should return history for circumstances field with prefix", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 123 }] })
        .mockResolvedValueOnce({ rows: mockHistoryRows })
        .mockResolvedValueOnce({ rows: [{ count: "2" }] })

      const res = await request(app).get(
        "/admin/api/actors/123/history/circumstances.circumstances"
      )

      expect(res.status).toBe(200)
      expect(res.body.field).toBe("circumstances.circumstances")
    })

    it("should return 404 for non-existent actor", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/999/history/cause_of_death")

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })

    it("should return 400 for invalid field name", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 123 }] })

      const res = await request(app).get("/admin/api/actors/123/history/invalid_field")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid field name")
    })

    it("should respect limit parameter", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 123 }] })
        .mockResolvedValueOnce({ rows: mockHistoryRows.slice(0, 1) })
        .mockResolvedValueOnce({ rows: [{ count: "2" }] })

      const res = await request(app).get("/admin/api/actors/123/history/cause_of_death?limit=1")

      expect(res.status).toBe(200)
      expect(res.body.history).toHaveLength(1)
      expect(res.body.hasMore).toBe(true)
    })

    it("should cap limit at 200", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 123 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })

      await request(app).get("/admin/api/actors/123/history/cause_of_death?limit=500")

      // Verify the query was called with capped limit
      const historyQueryCall = mockPool.query.mock.calls[1]
      expect(historyQueryCall[1]).toContain(200) // limit should be capped
    })
  })

  describe("PATCH /admin/api/actors/:id", () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      name: "John Wayne",
      birthday: "1907-05-26",
      deathday: "1979-06-11",
      cause_of_death: "Stomach cancer",
    }

    const mockCircumstances = {
      id: 1,
      actor_id: 123,
      circumstances: "Died of stomach cancer",
    }

    it("should update actor fields", async () => {
      // Pool queries (outside transaction)
      mockPool.query
        // Check actor exists
        .mockResolvedValueOnce({ rows: [mockActor] })
        // Check circumstances
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        // Fetch updated actor (after transaction)
        .mockResolvedValueOnce({ rows: [{ ...mockActor, cause_of_death: "Lung cancer" }] })
        // Fetch updated circumstances (after transaction)
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      // Client queries (inside transaction)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockResolvedValueOnce({ rows: [mockCircumstances] }) // Select circumstances for snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }) // Record history
        .mockResolvedValueOnce({ rows: [] }) // Update actor
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { cause_of_death: "Lung cancer" } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.snapshotId).toBe(1)
      expect(res.body.changes).toHaveLength(1)
      expect(res.body.changes[0].field).toBe("cause_of_death")
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "actor-edit",
          resourceType: "actor",
          resourceId: 123,
        })
      )
      expect(mockClient.release).toHaveBeenCalled()
    })

    it("should return 400 for non-editable fields", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { tmdb_popularity: 99.9 } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Cannot update non-editable fields")
      expect(res.body.error.invalidFields.actor).toContain("tmdb_popularity")
    })

    it("should return 400 for external ID fields", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { tmdb_id: 999 } })

      expect(res.status).toBe(400)
      expect(res.body.error.invalidFields.actor).toContain("tmdb_id")
    })

    it("should return 400 when no updates provided", async () => {
      const res = await request(app).patch("/admin/api/actors/123").send({})

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("No updates provided")
    })

    it("should return 404 for non-existent actor", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .patch("/admin/api/actors/999")
        .send({ actor: { name: "New Name" } })

      expect(res.status).toBe(404)
    })

    it("should update circumstances fields", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, circumstances: "Updated circumstances" }],
        })

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockResolvedValueOnce({ rows: [mockCircumstances] }) // Select circumstances for snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }) // history
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { circumstances: "Updated circumstances" } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("should create circumstances if not exists", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [] }) // no existing circumstances
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ actor_id: 123, circumstances: "New circumstances" }],
        })

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockResolvedValueOnce({ rows: [] }) // Select circumstances for snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }) // insert circumstances
        .mockResolvedValueOnce({ rows: [] }) // history
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { circumstances: "New circumstances" } })

      expect(res.status).toBe(200)
    })

    it("should skip unchanged fields and return early without creating snapshot", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { cause_of_death: "Stomach cancer" } }) // Same value

      expect(res.status).toBe(200)
      expect(res.body.changes).toHaveLength(0)
      expect(res.body.snapshotId).toBeNull()
      // Should not have started a transaction
      expect(mockPool.connect).not.toHaveBeenCalled()
    })

    it("should return 400 for invalid date format", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { birthday: "not-a-date" } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid date format")
      expect(res.body.error.invalidDates[0].field).toBe("birthday")
    })

    it("should return 400 for future death date", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      const futureDateStr = futureDate.toISOString().split("T")[0]

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday: futureDateStr } })

      expect(res.status).toBe(400)
      expect(res.body.error.invalidDates[0].reason).toContain("future")
    })

    it("should return 400 when death date is before birth date", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // mockActor has birthday: 1907-05-26
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday: "1900-01-01" } }) // Before birthday

      expect(res.status).toBe(400)
      expect(res.body.error.invalidDates[0].reason).toContain("before birth date")
    })

    it("should validate deathday against existing birthday when only deathday is updated", async () => {
      const actorWithBirthday = { ...mockActor, birthday: "1950-06-15" }
      mockPool.query
        .mockResolvedValueOnce({ rows: [actorWithBirthday] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday: "1940-01-01" } }) // Before existing birthday

      expect(res.status).toBe(400)
      expect(res.body.error.invalidDates[0].reason).toContain("before birth date")
    })

    it("should return 500 when database query fails for GET", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Database connection failed"))

      const res = await request(app).get("/admin/api/actors/123")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch actor data")
    })

    it("should rollback transaction and return 500 when PATCH fails", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockRejectedValueOnce(new Error("Database error")) // Select circumstances fails

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { cause_of_death: "Lung cancer" } })

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to update actor")
      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK")
      expect(mockClient.release).toHaveBeenCalled()
    })
  })

  describe("GET /admin/api/actors/:id/metadata", () => {
    const mockActorRow = {
      id: 123,
      name: "John Wayne",
      deathday: "1979-06-11",
      is_obscure: false,
      deathday_confidence: "verified",
      has_detailed_death_info: true,
      enriched_at: "2026-01-20T00:00:00Z",
      enrichment_source: "multi-source",
      cause_of_death_source: "claude",
      biography: "A decorated film actor...",
      biography_generated_at: "2026-01-15T00:00:00Z",
      biography_source_type: "tmdb",
    }

    const mockCircumstancesRow = {
      circumstances: "Died of stomach cancer in Los Angeles",
      enriched_at: "2026-01-20T00:00:00Z",
      enrichment_source: "claude",
    }

    it("should return metadata for valid actor", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActorRow] })
        .mockResolvedValueOnce({ rows: [mockCircumstancesRow] })

      const res = await request(app).get("/admin/api/actors/123/metadata")

      expect(res.status).toBe(200)
      expect(res.body.actorId).toBe(123)
      expect(res.body.biography.hasContent).toBe(true)
      expect(res.body.biography.generatedAt).toBe("2026-01-15T00:00:00Z")
      expect(res.body.biography.sourceType).toBe("tmdb")
      expect(res.body.enrichment.enrichedAt).toBe("2026-01-20T00:00:00Z")
      expect(res.body.enrichment.source).toBe("multi-source")
      expect(res.body.enrichment.causeOfDeathSource).toBe("claude")
      expect(res.body.enrichment.hasCircumstances).toBe(true)
      expect(res.body.dataQuality.hasDetailedDeathInfo).toBe(true)
      expect(res.body.dataQuality.isObscure).toBe(false)
      expect(res.body.dataQuality.deathdayConfidence).toBe("verified")
      expect(res.body.adminEditorUrl).toBe("/admin/actors/123")
    })

    it("should return 404 for non-existent actor", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/999/metadata")

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })

    it("should handle actor without biography or circumstances", async () => {
      const actorNoBio = {
        ...mockActorRow,
        biography: null,
        biography_generated_at: null,
        biography_source_type: null,
        enriched_at: null,
        enrichment_source: null,
        cause_of_death_source: null,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [actorNoBio] })
        .mockResolvedValueOnce({ rows: [] }) // no circumstances

      const res = await request(app).get("/admin/api/actors/123/metadata")

      expect(res.status).toBe(200)
      expect(res.body.biography.hasContent).toBe(false)
      expect(res.body.biography.generatedAt).toBeNull()
      expect(res.body.enrichment.enrichedAt).toBeNull()
      expect(res.body.enrichment.hasCircumstances).toBe(false)
      expect(res.body.enrichment.circumstancesEnrichedAt).toBeNull()
    })

    it("should return 500 on database error", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Connection failed"))

      const res = await request(app).get("/admin/api/actors/123/metadata")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to fetch actor metadata")
    })
  })

  describe("POST /admin/api/actors/:id/enrich-inline", () => {
    const mockDeceasedActor = {
      id: 123,
      tmdb_id: 456,
      imdb_person_id: "nm0000078",
      name: "John Wayne",
      birthday: "1907-05-26",
      deathday: "1979-06-11",
      cause_of_death: null,
      cause_of_death_details: null,
      tmdb_popularity: "25.5",
    }

    it("should return 404 for non-existent actor", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).post("/admin/api/actors/999/enrich-inline")

      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Actor not found")
    })

    it("should return 400 for non-deceased actor", async () => {
      const aliveActor = { ...mockDeceasedActor, deathday: null }
      mockPool.query.mockResolvedValueOnce({ rows: [aliveActor] })

      const res = await request(app).post("/admin/api/actors/123/enrich-inline")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Actor is not deceased")
    })

    it("should return success with no data when orchestrator finds nothing", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockDeceasedActor] })

      mockEnrichActor.mockResolvedValueOnce({
        circumstances: null,
        notableFactors: [],
        cleanedDeathInfo: undefined,
      })

      const res = await request(app).post("/admin/api/actors/123/enrich-inline")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.fieldsUpdated).toEqual([])
      expect(res.body.message).toBe("No new enrichment data found")
    })

    it("should enrich actor and write to production", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDeceasedActor] }) // fetch actor
        .mockResolvedValueOnce({ rows: [] }) // related celebrities lookup

      mockEnrichActor.mockResolvedValueOnce({
        circumstances: "A".repeat(250), // Long enough to pass MIN_CIRCUMSTANCES_LENGTH
        circumstancesSource: { sourceType: "claude", confidence: 0.9 },
        notableFactors: ["cancer"],
        notableFactorsSource: { sourceType: "claude", confidence: 0.8 },
        locationOfDeath: "Los Angeles, CA",
        locationOfDeathSource: { sourceType: "claude", confidence: 0.9 },
        additionalContext: null,
        rumoredCircumstances: null,
        lastProject: null,
        careerStatusAtDeath: null,
        posthumousReleases: null,
        relatedCelebrities: null,
        relatedDeaths: null,
        rawSources: null,
        cleanedDeathInfo: undefined,
        actorStats: {
          sourcesAttempted: [
            { source: "claude", success: true },
            { source: "wikidata", success: false },
          ],
        },
      })

      const res = await request(app).post("/admin/api/actors/123/enrich-inline")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.fieldsUpdated).toContain("circumstances")
      expect(res.body.fieldsUpdated).toContain("locationOfDeath")
      expect(res.body.fieldsUpdated).toContain("notableFactors")
      expect(res.body.sourcesUsed).toEqual(["claude"])
      expect(res.body.durationMs).toBeGreaterThanOrEqual(0)
      expect(writeToProduction).toHaveBeenCalled()
      expect(invalidateActorCache).toHaveBeenCalledWith(123)
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "inline-enrich",
          resourceType: "actor",
          resourceId: 123,
        })
      )
    })

    it("should return 500 on orchestrator error", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockDeceasedActor] })

      mockEnrichActor.mockRejectedValueOnce(new Error("Orchestrator failed"))

      const res = await request(app).post("/admin/api/actors/123/enrich-inline")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe("Failed to enrich actor")
    })
  })

  describe("GET /admin/api/actors/:id/diagnostic", () => {
    it("should return diagnostic data", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "John Wayne",
        deathday: "1979-06-11",
        popularity: 25.5,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get("/admin/api/actors/123/diagnostic")

      expect(res.status).toBe(200)
      expect(res.body.actor.id).toBe(123)
      expect(res.body.urls.canonical).toContain("/actor/")
    })
  })
})
