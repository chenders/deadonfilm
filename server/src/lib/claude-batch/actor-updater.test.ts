import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { applyUpdate } from "./actor-updater.js"
import { createEmptyCheckpoint, type ClaudeResponse, type Checkpoint } from "./schemas.js"
import type { Pool } from "pg"
import { SOURCE_NAME, MIN_CIRCUMSTANCES_LENGTH } from "./constants.js"

function createMockPool(): Pool {
  return {
    query: vi.fn(),
  } as unknown as Pool
}

function createTestCheckpoint(): Checkpoint {
  return createEmptyCheckpoint()
}

describe("applyUpdate", () => {
  let mockPool: Pool
  let checkpoint: Checkpoint

  beforeEach(() => {
    mockPool = createMockPool()
    checkpoint = createTestCheckpoint()
    vi.clearAllMocks()
  })

  it("logs error and returns early when actor not found", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    ;(mockPool.query as Mock).mockResolvedValueOnce({ rows: [] })

    const parsed: ClaudeResponse = { cause: "heart failure" }
    await applyUpdate(mockPool, 999, parsed, "batch-1", checkpoint)

    expect(consoleSpy).toHaveBeenCalledWith("Actor 999 not found in database")
    expect(mockPool.query).toHaveBeenCalledTimes(1) // Only the SELECT query

    consoleSpy.mockRestore()
  })

  it("updates cause_of_death when actor has none", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: null,
            cause_of_death_details: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { cause: "heart failure" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    // Find the UPDATE actors call
    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![0]).toContain("cause_of_death =")
    expect(updateCall![0]).toContain("cause_of_death_source =")
    expect(updateCall![1]).toContain("Heart failure") // toSentenceCase applied
    expect(updateCall![1]).toContain(SOURCE_NAME)
    expect(checkpoint.stats.updatedCause).toBe(1)
  })

  it("does not overwrite existing cause_of_death", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing cause",
            cause_of_death_details: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { cause: "new cause" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    expect(checkpoint.stats.updatedCause).toBe(0)
  })

  it("updates details when actor has none", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { details: "Detailed information about the death." }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    expect(checkpoint.stats.updatedDetails).toBe(1)
  })

  it("updates death_manner when provided", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { manner: "natural" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall![0]).toContain("death_manner =")
    expect(checkpoint.stats.updatedManner).toBe(1)
  })

  it("updates death_categories when provided", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { categories: ["cancer", "respiratory"] }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    expect(checkpoint.stats.updatedCategories).toBe(1)
  })

  it("sets has_detailed_death_info when circumstances exceed minimum length", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    // Create circumstances longer than MIN_CIRCUMSTANCES_LENGTH
    const longCircumstances = "A".repeat(MIN_CIRCUMSTANCES_LENGTH + 50)
    const parsed: ClaudeResponse = { circumstances: longCircumstances }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall![0]).toContain("has_detailed_death_info =")
  })

  it("corrects birthday when year differs", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-03-15",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = {
      corrections: { birthYear: 1948 },
    }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall![0]).toContain("birthday =")
    // Should preserve month/day
    expect(updateCall![1]).toContain("1948-03-15")
    expect(checkpoint.stats.updatedBirthday).toBe(1)
  })

  it("corrects deathday with full date", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = {
      corrections: { deathDate: "2019-12-15" },
    }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall![0]).toContain("deathday =")
    expect(updateCall![1]).toContain("2019-12-15")
    expect(checkpoint.stats.updatedDeathday).toBe(1)
  })

  it("records history entries for changed fields", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: null,
            cause_of_death_details: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = { cause: "cancer" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const historyCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_info_history")
    )
    expect(historyCall).toBeDefined()
    expect(historyCall![1]).toContain("cause_of_death")
    expect(historyCall![1]).toContain(SOURCE_NAME)
    expect(historyCall![1]).toContain("batch-1")
  })

  it("creates actor_death_circumstances record when circumstances provided", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = {
      circumstances: "The actor passed away peacefully at home.",
      location_of_death: "Los Angeles, CA",
      circumstances_confidence: "high",
    }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const circumstancesCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_circumstances")
    )
    expect(circumstancesCall).toBeDefined()
    expect(circumstancesCall![0]).toContain("ON CONFLICT (actor_id) DO UPDATE")
    expect(checkpoint.stats.updatedCircumstances).toBe(1)
    expect(checkpoint.stats.createdCircumstancesRecord).toBe(1)
  })

  it("extracts related_celebrity_ids from related_celebrities", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = {
      related_celebrities: [
        { name: "Celebrity A", tmdb_id: 100, relationship: "spouse" },
        { name: "Celebrity B", tmdb_id: null, relationship: "friend" },
        { name: "Celebrity C", tmdb_id: 200, relationship: "co-star" },
      ],
    }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const circumstancesCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_circumstances")
    )
    expect(circumstancesCall).toBeDefined()
    // Check that related_celebrity_ids array contains only non-null tmdb_ids
    const params = circumstancesCall![1]
    const relatedIdsIndex = 12 // related_celebrity_ids is at index 12 in the VALUES
    expect(params[relatedIdsIndex]).toEqual([100, 200])
  })

  it("stores raw response when provided", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const rawResponse = '{"cause": "cancer", "manner": "natural"}'
    const parsed: ClaudeResponse = { circumstances: "Some circumstances" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint, rawResponse)

    const circumstancesCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_circumstances")
    )
    expect(circumstancesCall).toBeDefined()
    // raw_response is at index 17, stored as JSON with escaped quotes
    const rawResponseParam = circumstancesCall![1][17]
    // The raw response is wrapped in a JSON object with escaped quotes
    expect(rawResponseParam).toContain("response")
    expect(rawResponseParam).toContain("cancer")
    expect(rawResponseParam).toContain("parsed_at")
  })

  it("does not update actors table when no changes needed", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    // Only provide circumstances (no actor table updates)
    const parsed: ClaudeResponse = { circumstances: "Some info" }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateActorsCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    // Should not have an UPDATE actors call since no actor fields changed
    expect(updateActorsCall).toBeUndefined()
  })

  it("handles covid_related and strange_death flags", async () => {
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            cause_of_death: "existing",
            cause_of_death_details: "existing",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const parsed: ClaudeResponse = {
      covid_related: true,
      strange_death: true,
    }
    await applyUpdate(mockPool, 1, parsed, "batch-1", checkpoint)

    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
    )
    expect(updateCall![0]).toContain("covid_related =")
    expect(updateCall![0]).toContain("strange_death =")
  })
})
