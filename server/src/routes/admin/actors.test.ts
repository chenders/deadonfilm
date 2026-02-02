import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { Express } from "express"

// Mock dependencies before imports
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/cache.js", () => ({
  getCached: vi.fn(),
  invalidateActorCache: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    actor: (id: number) => ({
      profile: `actor:id:${id}`,
      death: `actor:id:${id}:type:death`,
    }),
  },
}))

vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import router from "./actors.js"
import { getPool } from "../../lib/db/pool.js"
import { logAdminAction } from "../../lib/admin-auth.js"
import { invalidateActorCache } from "../../lib/cache.js"

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
    app = express()
    app.use(express.json())
    app.use("/admin/api/actors", router)

    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    }

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient),
    }
    vi.mocked(getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof getPool>)
    vi.clearAllMocks()
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
      // Verify cache invalidation
      expect(invalidateActorCache).toHaveBeenCalledWith(123)
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
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
        birthday: "1950-01-01",
        deathday: "2020-01-01",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday: "1940-01-01" } }) // Death before birth

      expect(res.status).toBe(400)
      expect(res.body.error.invalidDates[0].reason).toBe("Death date cannot be before birth date")
    })

    it("should return 400 when birth date is after death date", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
        birthday: "1950-01-01",
        deathday: "2020-01-01",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { birthday: "2025-01-01" } }) // Birth after death

      expect(res.status).toBe(400)
      expect(res.body.error.invalidDates[0].reason).toBe("Birth date cannot be after death date")
    })

    it("should return 400 for invalid death_manner value", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { death_manner: "invalid_value" } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("death_manner")
    })

    it("should return 400 for invalid confidence value", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { circumstances_confidence: "very_high" } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("circumstances_confidence")
    })

    it("should return 400 for invalid deathday_confidence in actor updates", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday_confidence: "high" } }) // Invalid - should be verified/unverified/conflicting

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("deathday_confidence")
      expect(res.body.error.invalidEnums[0].validValues).toEqual([
        "verified",
        "unverified",
        "conflicting",
      ])
    })

    it("should return 400 for invalid career_status_at_death value", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { career_status_at_death: "working" } }) // Invalid value

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("career_status_at_death")
      expect(res.body.error.invalidEnums[0].validValues).toEqual([
        "active",
        "semi-retired",
        "retired",
        "hiatus",
        "unknown",
      ])
    })

    it("should accept valid career_status_at_death values", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }
      const mockCircumstances = {
        id: 1,
        actor_id: 123,
        career_status_at_death: null,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, career_status_at_death: "retired" }],
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
        .send({ circumstances: { career_status_at_death: "retired" } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("should return 400 for invalid birthday_precision value", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { birthday_precision: "exact" } }) // Invalid value

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("birthday_precision")
      expect(res.body.error.invalidEnums[0].validValues).toEqual(["year", "month", "day"])
    })

    it("should return 400 for invalid deathday_precision value", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { deathday_precision: "approximate" } }) // Invalid value

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid enum value")
      expect(res.body.error.invalidEnums[0].field).toBe("deathday_precision")
      expect(res.body.error.invalidEnums[0].validValues).toEqual(["year", "month", "day"])
    })

    it("should accept valid date precision values", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
        birthday_precision: null,
        deathday_precision: null,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...mockActor, birthday_precision: "month", deathday_precision: "day" }],
        })
        .mockResolvedValueOnce({ rows: [] })

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockResolvedValueOnce({ rows: [] }) // Select circumstances for snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }) // history birthday_precision
        .mockResolvedValueOnce({ rows: [] }) // history deathday_precision
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { birthday_precision: "month", deathday_precision: "day" } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("should return 400 for invalid sources field type (not array)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { sources: "not an array" } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid field type")
      expect(res.body.error.invalidTypes[0].field).toBe("sources")
      expect(res.body.error.invalidTypes[0].expectedType).toBe("object[]")
    })

    it("should return 400 for invalid sources field (array with non-objects)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { sources: ["string1", "string2"] } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid field type")
      expect(res.body.error.invalidTypes[0].field).toBe("sources")
      expect(res.body.error.invalidTypes[0].actualType).toBe("array with non-object elements")
    })

    it("should accept valid sources field (array of objects)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }
      const mockCircumstances = {
        id: 1,
        actor_id: 123,
        sources: null,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, sources: [{ url: "https://example.com", name: "Test" }] }],
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
        .send({ circumstances: { sources: [{ url: "https://example.com", name: "Test" }] } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("should return 400 for invalid entity_links field type (not object)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { entity_links: "not an object" } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid field type")
      expect(res.body.error.invalidTypes[0].field).toBe("entity_links")
      expect(res.body.error.invalidTypes[0].expectedType).toBe("object")
    })

    it("should return 400 for invalid entity_links field type (array instead of object)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [] }) // Get circumstances

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { entity_links: [{ key: "value" }] } })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid field type")
      expect(res.body.error.invalidTypes[0].field).toBe("entity_links")
      expect(res.body.error.invalidTypes[0].actualType).toBe("array")
    })

    it("should accept valid entity_links field (object)", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }
      const mockCircumstances = {
        id: 1,
        actor_id: 123,
        entity_links: null,
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, entity_links: { wikipedia: "https://en.wikipedia.org" } }],
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
        .send({ circumstances: { entity_links: { wikipedia: "https://en.wikipedia.org" } } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("should return 400 for non-editable circumstances fields", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { id: 999, actor_id: 456 } }) // These are not editable

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Cannot update non-editable fields")
      expect(res.body.error.invalidFields.circumstances).toContain("id")
      expect(res.body.error.invalidFields.circumstances).toContain("actor_id")
    })

    it("should accept null values for nullable fields", async () => {
      const mockActor = {
        id: 123,
        tmdb_id: 456,
        name: "Test Actor",
        birthday: "1950-01-01",
        deathday: "2020-01-01",
        cause_of_death: "Heart attack",
      }
      const mockCircumstances = {
        id: 1,
        actor_id: 123,
        circumstances: "Some circumstances",
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [{ ...mockActor, cause_of_death: null }] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

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
        .send({ actor: { cause_of_death: null } })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.changes).toHaveLength(1)
      expect(res.body.changes[0].field).toBe("cause_of_death")
      expect(res.body.changes[0].newValue).toBeNull()
    })

    it("should update both actor and circumstances fields in same transaction", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] }) // Check actor exists
        .mockResolvedValueOnce({ rows: [mockCircumstances] }) // Check circumstances
        .mockResolvedValueOnce({ rows: [{ ...mockActor, cause_of_death: "Lung cancer" }] }) // Fetch updated actor
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, circumstances: "Updated circumstances" }],
        }) // Fetch updated circumstances

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockActor] }) // Select actor for snapshot
        .mockResolvedValueOnce({ rows: [mockCircumstances] }) // Select circumstances for snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }) // Record actor history
        .mockResolvedValueOnce({ rows: [] }) // Update actor
        .mockResolvedValueOnce({ rows: [] }) // Record circumstances history
        .mockResolvedValueOnce({ rows: [] }) // Update circumstances
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({
          actor: { cause_of_death: "Lung cancer" },
          circumstances: { circumstances: "Updated circumstances" },
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.snapshotId).toBe(1)
      expect(res.body.changes).toHaveLength(2)
      expect(res.body.changes.map((c: { field: string }) => c.field).sort()).toEqual([
        "cause_of_death",
        "circumstances",
      ])
      // Verify transaction was used
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN")
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT")
      expect(mockClient.release).toHaveBeenCalled()
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
