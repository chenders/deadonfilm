import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import causeMappingsRoutes from "./cause-mappings.js"

// Mock dependencies
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttribute: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
}))

import { getPool } from "../../lib/db/pool.js"

const app = express()
app.use(express.json())
app.use("/", causeMappingsRoutes)

function mockQuery(rows: Record<string, unknown>[]) {
  return vi.mocked(getPool).mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows }),
  } as never)
}

describe("GET /manner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns manner mappings with actor counts", async () => {
    const queryMock = vi.fn()
    // First call: mappings query
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          normalized_cause: "Heart attack",
          manner: "natural",
          source: "deterministic",
          created_at: "2026-01-01",
          actor_count: "50",
        },
      ],
    })
    // Second call: unmapped count
    queryMock.mockResolvedValueOnce({ rows: [{ count: "10" }] })

    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app).get("/manner")

    expect(res.status).toBe(200)
    expect(res.body.mappings).toHaveLength(1)
    expect(res.body.mappings[0].normalizedCause).toBe("Heart attack")
    expect(res.body.mappings[0].manner).toBe("natural")
    expect(res.body.mappings[0].actorCount).toBe(50)
    expect(res.body.totalUnmapped).toBe(10)
  })

  it("filters by manner", async () => {
    const queryMock = vi.fn()
    queryMock.mockResolvedValueOnce({ rows: [] })
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] })

    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app).get("/manner?manner=homicide")

    expect(res.status).toBe(200)
    // Verify the manner filter was included in the query
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("cmm.manner = $"),
      expect.arrayContaining(["homicide"])
    )
  })

  it("filters by search term", async () => {
    const queryMock = vi.fn()
    queryMock.mockResolvedValueOnce({ rows: [] })
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] })

    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app).get("/manner?search=cancer")

    expect(res.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("cmm.normalized_cause ILIKE"),
      expect.arrayContaining(["%cancer%"])
    )
  })
})

describe("PUT /manner/:cause", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updates manner for a cause", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ normalized_cause: "Gunshot wound", manner: "homicide", source: "manual" }],
    })
    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app)
      .put("/manner/Gunshot%20wound")
      .send({ manner: "homicide" })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("rejects invalid manner", async () => {
    const res = await request(app)
      .put("/manner/Gunshot%20wound")
      .send({ manner: "invalid" })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain("Invalid manner")
  })

  it("rejects missing manner", async () => {
    const res = await request(app)
      .put("/manner/Gunshot%20wound")
      .send({})

    expect(res.status).toBe(400)
  })
})

describe("GET /normalizations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns normalizations with actor counts", async () => {
    mockQuery([
      {
        original_cause: "lung cancer",
        normalized_cause: "Lung cancer",
        actor_count: "45",
      },
    ])

    const res = await request(app).get("/normalizations")

    expect(res.status).toBe(200)
    expect(res.body.normalizations).toHaveLength(1)
    expect(res.body.normalizations[0].originalCause).toBe("lung cancer")
    expect(res.body.normalizations[0].normalizedCause).toBe("Lung cancer")
    expect(res.body.normalizations[0].actorCount).toBe(45)
  })
})

describe("PUT /normalizations/:cause", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updates normalized cause", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ original_cause: "lung cancer", normalized_cause: "Lung cancer" }],
    })
    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app)
      .put("/normalizations/lung%20cancer")
      .send({ normalizedCause: "Lung cancer" })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 404 when normalization not found", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] })
    vi.mocked(getPool).mockReturnValue({ query: queryMock } as never)

    const res = await request(app)
      .put("/normalizations/nonexistent")
      .send({ normalizedCause: "Something" })

    expect(res.status).toBe(404)
  })

  it("rejects missing normalizedCause", async () => {
    const res = await request(app)
      .put("/normalizations/test")
      .send({})

    expect(res.status).toBe(400)
  })
})

describe("GET /preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns category preview with change summary", async () => {
    mockQuery([
      {
        normalized_cause: "Gunshot wound",
        manner: "homicide",
        current_category: "homicide",
        proposed_category: "homicide",
        actor_count: "42",
      },
      {
        normalized_cause: "Heart attack",
        manner: "natural",
        current_category: "heart-disease",
        proposed_category: "heart-disease",
        actor_count: "100",
      },
    ])

    const res = await request(app).get("/preview")

    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(2)
    expect(res.body.summary.totalCauses).toBe(2)
  })

  it("filters to changes only", async () => {
    mockQuery([
      {
        normalized_cause: "Gunshot wound",
        manner: "homicide",
        current_category: "other",
        proposed_category: "homicide",
        actor_count: "42",
      },
      {
        normalized_cause: "Heart attack",
        manner: null,
        current_category: "heart-disease",
        proposed_category: "heart-disease",
        actor_count: "100",
      },
    ])

    const res = await request(app).get("/preview?changesOnly=true")

    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.entries[0].normalizedCause).toBe("Gunshot wound")
    expect(res.body.summary.totalActorsAffected).toBe(42)
  })
})
