import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Create a shared mock query function that persists across imports
const mockQuery = vi.fn()
const mockEnd = vi.fn()

// Mock the pg module
vi.mock("pg", async () => {
  // We need to get the outer scope's mockQuery via a workaround
  // Using globalThis to share the mock function
  return {
    default: {
      Pool: class MockPool {
        query = (globalThis as Record<string, unknown>).__testMockQuery as typeof mockQuery
        end = (globalThis as Record<string, unknown>).__testMockEnd as typeof mockEnd
      },
    },
  }
})

// Set up the global mock functions before imports
;(globalThis as Record<string, unknown>).__testMockQuery = mockQuery
;(globalThis as Record<string, unknown>).__testMockEnd = mockEnd

// Import after mocking
import {
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
  markActorsDeceased,
} from "./db.js"

describe("Sync State Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  describe("getSyncState", () => {
    it("returns sync state when record exists", async () => {
      const mockSyncState = {
        sync_type: "person_changes",
        last_sync_date: "2024-03-15",
        last_run_at: new Date("2024-03-15T10:00:00Z"),
        items_processed: 100,
        new_deaths_found: 5,
        movies_updated: 10,
        errors_count: 2,
      }

      mockQuery.mockResolvedValueOnce({ rows: [mockSyncState] })

      const result = await getSyncState("person_changes")

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT sync_type"), [
        "person_changes",
      ])
      expect(result).toEqual(mockSyncState)
    })

    it("returns null when no record exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSyncState("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("updateSyncState", () => {
    it("inserts/updates sync state with all fields", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await updateSyncState({
        sync_type: "person_changes",
        last_sync_date: "2024-03-15",
        items_processed: 100,
        new_deaths_found: 5,
        movies_updated: 0,
        errors_count: 2,
      })

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO sync_state"), [
        "person_changes",
        "2024-03-15",
        100,
        5,
        0,
        2,
      ])
    })

    it("handles partial updates with null for missing fields", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await updateSyncState({
        sync_type: "movie_changes",
        last_sync_date: "2024-03-15",
      })

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO sync_state"), [
        "movie_changes",
        "2024-03-15",
        null,
        null,
        null,
        null,
      ])
    })

    it("preserves existing values when fields are undefined (via COALESCE)", async () => {
      // This tests that undefined fields become null in the query,
      // which lets COALESCE preserve existing DB values
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await updateSyncState({
        sync_type: "person_changes",
        items_processed: 50,
        // other fields intentionally omitted
      })

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("COALESCE"), [
        "person_changes",
        null,
        50,
        null,
        null,
        null,
      ])
    })
  })

  describe("getAllActorTmdbIds", () => {
    it("returns a Set of all actor TMDB IDs", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ actor_tmdb_id: 123 }, { actor_tmdb_id: 456 }, { actor_tmdb_id: 789 }],
      })

      const result = await getAllActorTmdbIds()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT DISTINCT actor_tmdb_id")
      )
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(3)
      expect(result.has(123)).toBe(true)
      expect(result.has(456)).toBe(true)
      expect(result.has(789)).toBe(true)
    })

    it("returns empty Set when no actors exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllActorTmdbIds()

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })
  })

  describe("getDeceasedTmdbIds", () => {
    it("returns a Set of all deceased person TMDB IDs", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tmdb_id: 111 }, { tmdb_id: 222 }],
      })

      const result = await getDeceasedTmdbIds()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT tmdb_id FROM deceased_persons")
      )
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(2)
      expect(result.has(111)).toBe(true)
      expect(result.has(222)).toBe(true)
    })

    it("returns empty Set when no deceased persons exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getDeceasedTmdbIds()

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })
  })

  describe("getAllMovieTmdbIds", () => {
    it("returns a Set of all movie TMDB IDs", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tmdb_id: 1000 }, { tmdb_id: 2000 }, { tmdb_id: 3000 }],
      })

      const result = await getAllMovieTmdbIds()

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT tmdb_id FROM movies"))
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(3)
      expect(result.has(1000)).toBe(true)
      expect(result.has(2000)).toBe(true)
      expect(result.has(3000)).toBe(true)
    })
  })

  describe("markActorsDeceased", () => {
    it("updates is_deceased for given actor IDs", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 })

      await markActorsDeceased([123, 456, 789])

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        [123, 456, 789]
      )
      // Verify the IN clause has correct placeholders
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("IN ($1, $2, $3)"),
        [123, 456, 789]
      )
    })

    it("does nothing when given empty array", async () => {
      await markActorsDeceased([])

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("handles single actor ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await markActorsDeceased([123])

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("IN ($1)"), [123])
    })
  })
})
