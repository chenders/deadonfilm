import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the pool module before importing appearances
vi.mock("./pool.js", () => ({
  getPool: vi.fn(),
}))

import { batchUpsertActorMovieAppearances, batchUpsertShowActorAppearances } from "./appearances.js"
import { getPool } from "./pool.js"
import type { ActorMovieAppearanceRecord, ShowActorAppearanceRecord } from "./types.js"

describe("batchUpsertActorMovieAppearances", () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue(mockClient),
    } as never)
  })

  it("does nothing for empty array", async () => {
    await batchUpsertActorMovieAppearances([])
    expect(getPool).not.toHaveBeenCalled()
  })

  it("deduplicates by actor_id and movie_tmdb_id, keeping lowest billing_order", async () => {
    const appearances: ActorMovieAppearanceRecord[] = [
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Role A",
        billing_order: 0,
        age_at_filming: 30,
        appearance_type: "regular",
      },
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Role B",
        billing_order: 5,
        age_at_filming: 30,
        appearance_type: "regular",
      },
      {
        actor_id: 2,
        movie_tmdb_id: 100,
        character_name: "Other Actor",
        billing_order: 1,
        age_at_filming: 40,
        appearance_type: "regular",
      },
    ]

    await batchUpsertActorMovieAppearances(appearances)

    // Should have: BEGIN, one INSERT (with 2 rows, not 3), COMMIT
    expect(mockClient.query).toHaveBeenCalledTimes(3)

    const insertCall = mockClient.query.mock.calls[1]
    const sql = insertCall[0] as string
    const values = insertCall[1] as unknown[]

    // 2 unique actors × 6 columns = 12 values
    expect(values).toHaveLength(12)
    // Kept Role A (billing_order 0) over Role B (billing_order 5)
    expect(values[2]).toBe("Role A")
    // Second unique actor preserved
    expect(values[6]).toBe(2)
    expect(values[8]).toBe("Other Actor")

    // Verify parameterized placeholders — should have 2 rows, not 3
    expect(sql).toContain("($1, $2, $3, $4, $5, $6)")
    expect(sql).toContain("($7, $8, $9, $10, $11, $12)")
    expect(sql).not.toContain("$13")
  })

  it("prefers non-null billing_order over null", async () => {
    const appearances: ActorMovieAppearanceRecord[] = [
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Null Order",
        billing_order: null,
        age_at_filming: 30,
        appearance_type: "regular",
      },
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Has Order",
        billing_order: 3,
        age_at_filming: 30,
        appearance_type: "self",
      },
    ]

    await batchUpsertActorMovieAppearances(appearances)

    const values = mockClient.query.mock.calls[1][1] as unknown[]
    // Should keep "Has Order" (billing_order 3) over "Null Order" (null)
    expect(values).toHaveLength(6)
    expect(values[2]).toBe("Has Order")
    expect(values[3]).toBe(3)
  })

  it("keeps first entry when both have null billing_order", async () => {
    const appearances: ActorMovieAppearanceRecord[] = [
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "First Null",
        billing_order: null,
        age_at_filming: 30,
        appearance_type: "regular",
      },
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Second Null",
        billing_order: null,
        age_at_filming: 31,
        appearance_type: "self",
      },
    ]

    await batchUpsertActorMovieAppearances(appearances)

    const values = mockClient.query.mock.calls[1][1] as unknown[]
    expect(values).toHaveLength(6)
    expect(values[2]).toBe("First Null")
  })

  it("passes through non-duplicate entries unchanged", async () => {
    const appearances: ActorMovieAppearanceRecord[] = [
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Role A",
        billing_order: 0,
        age_at_filming: 30,
        appearance_type: "regular",
      },
      {
        actor_id: 2,
        movie_tmdb_id: 100,
        character_name: "Role B",
        billing_order: 1,
        age_at_filming: 25,
        appearance_type: "regular",
      },
    ]

    await batchUpsertActorMovieAppearances(appearances)

    const insertCall = mockClient.query.mock.calls[1]
    const values = insertCall[1] as unknown[]
    // 2 actors × 6 columns = 12 values, all preserved
    expect(values).toHaveLength(12)
  })

  it("rolls back on error", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error("db error")) // INSERT fails

    const appearances: ActorMovieAppearanceRecord[] = [
      {
        actor_id: 1,
        movie_tmdb_id: 100,
        character_name: "Role",
        billing_order: 0,
        age_at_filming: 30,
        appearance_type: "regular",
      },
    ]

    await expect(batchUpsertActorMovieAppearances(appearances)).rejects.toThrow("db error")
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK")
    expect(mockClient.release).toHaveBeenCalled()
  })
})

describe("batchUpsertShowActorAppearances", () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue(mockClient),
    } as never)
  })

  it("deduplicates by actor_id, show_tmdb_id, season_number, episode_number", async () => {
    const appearances: ShowActorAppearanceRecord[] = [
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Role A",
        appearance_type: "cast",
        billing_order: 0,
        age_at_filming: 30,
      },
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Role B",
        appearance_type: "guest",
        billing_order: 5,
        age_at_filming: 30,
      },
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 2,
        character_name: "Role A",
        appearance_type: "cast",
        billing_order: 0,
        age_at_filming: 30,
      },
    ]

    await batchUpsertShowActorAppearances(appearances)

    const insertCall = mockClient.query.mock.calls[1]
    const values = insertCall[1] as unknown[]

    // 2 unique entries × 8 columns = 16 values (duplicate S01E01 dropped, S01E02 kept)
    expect(values).toHaveLength(16)
    // First entry: S01E01 Role A (kept, lower billing_order)
    expect(values[4]).toBe("Role A")
    // Second entry: S01E02 Role A (different episode, not a duplicate)
    expect(values[11]).toBe(2) // episode_number
  })

  it("prefers non-null billing_order over null", async () => {
    const appearances: ShowActorAppearanceRecord[] = [
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Null Order",
        appearance_type: "cast",
        billing_order: null,
        age_at_filming: 30,
      },
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Has Order",
        appearance_type: "guest",
        billing_order: 2,
        age_at_filming: 30,
      },
    ]

    await batchUpsertShowActorAppearances(appearances)

    const values = mockClient.query.mock.calls[1][1] as unknown[]
    expect(values).toHaveLength(8)
    expect(values[4]).toBe("Has Order")
    expect(values[6]).toBe(2) // billing_order
  })

  it("keeps first entry when both have null billing_order", async () => {
    const appearances: ShowActorAppearanceRecord[] = [
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "First Null",
        appearance_type: "cast",
        billing_order: null,
        age_at_filming: 30,
      },
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Second Null",
        appearance_type: "guest",
        billing_order: null,
        age_at_filming: 31,
      },
    ]

    await batchUpsertShowActorAppearances(appearances)

    const values = mockClient.query.mock.calls[1][1] as unknown[]
    expect(values).toHaveLength(8)
    expect(values[4]).toBe("First Null")
  })

  it("rolls back on error", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error("db error")) // INSERT fails

    const appearances: ShowActorAppearanceRecord[] = [
      {
        actor_id: 1,
        show_tmdb_id: 200,
        season_number: 1,
        episode_number: 1,
        character_name: "Role",
        appearance_type: "cast",
        billing_order: 0,
        age_at_filming: 30,
      },
    ]

    await expect(batchUpsertShowActorAppearances(appearances)).rejects.toThrow("db error")
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK")
    expect(mockClient.release).toHaveBeenCalled()
  })
})
