import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  recordActorSnapshots,
  recordMovieSnapshots,
  recordShowSnapshots,
  type ActorSnapshotUpdate,
  type ContentSnapshotUpdate,
} from "./popularity-history.js"

// Mock pool
function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as import("pg").Pool
}

let mockPool: ReturnType<typeof createMockPool>

beforeEach(() => {
  mockPool = createMockPool()
})

describe("recordActorSnapshots", () => {
  it("inserts actor snapshots with correct params", async () => {
    const updates: ActorSnapshotUpdate[] = [
      { id: 1, popularity: 75.5, confidence: 0.9 },
      { id: 2, popularity: 50.0, confidence: 0.6 },
    ]

    await recordActorSnapshots(mockPool, updates, "1.1", 42, "2026-02-09")

    expect(mockPool.query).toHaveBeenCalledOnce()
    const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("actor_popularity_history")
    expect(sql).toContain("ON CONFLICT")
    expect(params).toEqual([[1, 2], [75.5, 50.0], [0.9, 0.6], "1.1", 42, "2026-02-09"])
  })

  it("does not query when updates are empty", async () => {
    await recordActorSnapshots(mockPool, [], "1.0", null, "2026-02-09")
    expect(mockPool.query).not.toHaveBeenCalled()
  })

  it("passes null runId correctly", async () => {
    const updates: ActorSnapshotUpdate[] = [{ id: 1, popularity: 50, confidence: 0.5 }]

    await recordActorSnapshots(mockPool, updates, "1.0", null, "2026-02-09")

    const [, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(params[4]).toBeNull()
  })
})

describe("recordMovieSnapshots", () => {
  it("inserts movie snapshots with correct params", async () => {
    const updates: ContentSnapshotUpdate[] = [
      { id: 10, popularity: 80, weight: 65, confidence: 0.95 },
      { id: 20, popularity: 40, weight: 30, confidence: 0.7 },
    ]

    await recordMovieSnapshots(mockPool, updates, "1.1", 42, "2026-02-09")

    expect(mockPool.query).toHaveBeenCalledOnce()
    const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("movie_popularity_history")
    expect(sql).toContain("ON CONFLICT")
    expect(params).toEqual([[10, 20], [80, 40], [65, 30], [0.95, 0.7], "1.1", 42, "2026-02-09"])
  })

  it("does not query when updates are empty", async () => {
    await recordMovieSnapshots(mockPool, [], "1.0", null, "2026-02-09")
    expect(mockPool.query).not.toHaveBeenCalled()
  })
})

describe("recordShowSnapshots", () => {
  it("inserts show snapshots with correct params", async () => {
    const updates: ContentSnapshotUpdate[] = [
      { id: 100, popularity: 60, weight: 55, confidence: 0.85 },
    ]

    await recordShowSnapshots(mockPool, updates, "1.0", null, "2026-02-09")

    expect(mockPool.query).toHaveBeenCalledOnce()
    const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("show_popularity_history")
    expect(sql).toContain("ON CONFLICT")
    expect(params).toEqual([[100], [60], [55], [0.85], "1.0", null, "2026-02-09"])
  })

  it("does not query when updates are empty", async () => {
    await recordShowSnapshots(mockPool, [], "1.0", 1, "2026-02-09")
    expect(mockPool.query).not.toHaveBeenCalled()
  })
})
