import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { Express } from "express"

// Mock dependencies before imports
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/cache.js", () => ({
  getCached: vi.fn(),
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

describe("admin actors routes", () => {
  let app: Express
  let mockPool: {
    query: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use("/admin/api/actors", router)

    mockPool = {
      query: vi.fn(),
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

    it("should return 400 for invalid ID", async () => {
      const res = await request(app).get("/admin/api/actors/invalid")

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe("Invalid actor ID")
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
      mockPool.query
        // Check actor exists
        .mockResolvedValueOnce({ rows: [mockActor] })
        // Check circumstances
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        // Create snapshot - actor
        .mockResolvedValueOnce({ rows: [mockActor] })
        // Create snapshot - circumstances
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        // Insert snapshot
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // Record history
        .mockResolvedValueOnce({ rows: [] })
        // Update actor
        .mockResolvedValueOnce({ rows: [] })
        // Fetch updated actor
        .mockResolvedValueOnce({ rows: [{ ...mockActor, cause_of_death: "Lung cancer" }] })
        // Fetch updated circumstances
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

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
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] }) // history
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ ...mockCircumstances, circumstances: "Updated circumstances" }],
        })

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
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] }) // insert circumstances
        .mockResolvedValueOnce({ rows: [] }) // history
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({
          rows: [{ actor_id: 123, circumstances: "New circumstances" }],
        })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ circumstances: { circumstances: "New circumstances" } })

      expect(res.status).toBe(200)
    })

    it("should skip unchanged fields", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // No update or history calls since value unchanged
        .mockResolvedValueOnce({ rows: [mockActor] })
        .mockResolvedValueOnce({ rows: [mockCircumstances] })

      const res = await request(app)
        .patch("/admin/api/actors/123")
        .send({ actor: { cause_of_death: "Stomach cancer" } }) // Same value

      expect(res.status).toBe(200)
      expect(res.body.changes).toHaveLength(0)
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
