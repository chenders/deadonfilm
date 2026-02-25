import { describe, it, expect, vi, beforeEach } from "vitest"

const mockQuery = vi.fn()
vi.mock("../../lib/db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}))
vi.mock("../../middleware/admin-auth.js", () => ({
  adminAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import express from "express"
import request from "supertest"
import { createRunLogsHandler } from "./run-logs-handler.js"

describe("run logs handler", () => {
  const app = express()
  app.get("/run-logs", createRunLogsHandler("death"))
  app.get("/bio-run-logs", createRunLogsHandler("biography"))

  beforeEach(() => {
    mockQuery.mockReset()
  })

  it("returns paginated run logs filtered by run_type and run_id", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            timestamp: "2026-02-24T00:00:00Z",
            level: "info",
            message: "Starting enrichment",
            data: null,
            source: null,
          },
        ],
      })

    const res = await request(app).get("/run-logs?runId=42&page=1&pageSize=50")
    expect(res.status).toBe(200)
    expect(res.body.logs).toHaveLength(1)
    expect(res.body.logs[0].message).toBe("Starting enrichment")
    expect(res.body.pagination.total).toBe(5)

    // Verify run_type filter was applied
    const countCall = mockQuery.mock.calls[0]
    expect(countCall[0]).toContain("run_type = $1")
    expect(countCall[1]).toContain("death")
  })

  it("filters by level when provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            timestamp: "2026-02-24T00:00:00Z",
            level: "error",
            message: "Failed",
            data: null,
            source: null,
          },
        ],
      })

    const res = await request(app).get("/run-logs?runId=42&level=error")
    expect(res.status).toBe(200)

    // Verify level filter was applied in the SQL
    const countCall = mockQuery.mock.calls[0]
    expect(countCall[0]).toContain("level = $")
  })

  it("returns 400 for missing runId", async () => {
    const res = await request(app).get("/run-logs")
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe("Invalid or missing run ID")
  })

  it("ignores invalid level values", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get("/run-logs?runId=42&level=invalid")
    expect(res.status).toBe(200)

    // Verify no level filter was applied
    const countCall = mockQuery.mock.calls[0]
    expect(countCall[0]).not.toContain("level = $")
  })

  it("uses biography run_type for bio-run-logs route", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get("/bio-run-logs?runId=10")
    expect(res.status).toBe(200)

    const countCall = mockQuery.mock.calls[0]
    expect(countCall[1]).toContain("biography")
  })

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"))

    const res = await request(app).get("/run-logs?runId=42")
    expect(res.status).toBe(500)
    expect(res.body.error.message).toBe("Failed to fetch death run logs")
  })

  it("clamps pagination to valid bounds", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "200" }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get("/run-logs?runId=42&page=-1&pageSize=999")
    expect(res.status).toBe(200)
    expect(res.body.pagination.page).toBe(1)
    expect(res.body.pagination.pageSize).toBe(100)
  })
})
