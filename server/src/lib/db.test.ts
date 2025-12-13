import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Create a shared mock query function that persists across imports
const mockQuery = vi.fn()
const mockEnd = vi.fn()
const mockOn = vi.fn()

// Mock the pg module
vi.mock("pg", async () => {
  // We need to get the outer scope's mockQuery via a workaround
  // Using globalThis to share the mock function
  return {
    default: {
      Pool: class MockPool {
        query = (globalThis as Record<string, unknown>).__testMockQuery as typeof mockQuery
        end = (globalThis as Record<string, unknown>).__testMockEnd as typeof mockEnd
        on = (globalThis as Record<string, unknown>).__testMockOn as typeof mockOn
      },
    },
  }
})

// Set up the global mock functions before imports
;(globalThis as Record<string, unknown>).__testMockQuery = mockQuery
;(globalThis as Record<string, unknown>).__testMockEnd = mockEnd
;(globalThis as Record<string, unknown>).__testMockOn = mockOn

// Import after mocking
import {
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
  markActorsDeceased,
  getActorFilmography,
  queryWithRetry,
  resetPool,
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

    // Batching tests for PostgreSQL parameter limit handling
    it("handles exactly 1000 elements in a single batch", async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1000 })

      await markActorsDeceased(ids)

      // Should result in exactly 1 query
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids
      )
    })

    it("batches 1001 elements into 2 queries", async () => {
      const ids = Array.from({ length: 1001 }, (_, i) => i + 1)
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1000 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await markActorsDeceased(ids)

      // Should result in 2 queries: batch of 1000 + batch of 1
      expect(mockQuery).toHaveBeenCalledTimes(2)

      // First batch: IDs 1-1000
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids.slice(0, 1000)
      )

      // Second batch: ID 1001
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids.slice(1000)
      )
    })

    it("batches 2500 elements into 3 queries (1000, 1000, 500)", async () => {
      const ids = Array.from({ length: 2500 }, (_, i) => i + 1)
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1000 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1000 })
        .mockResolvedValueOnce({ rows: [], rowCount: 500 })

      await markActorsDeceased(ids)

      // Should result in 3 queries
      expect(mockQuery).toHaveBeenCalledTimes(3)

      // First batch: IDs 1-1000
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids.slice(0, 1000)
      )

      // Second batch: IDs 1001-2000
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids.slice(1000, 2000)
      )

      // Third batch: IDs 2001-2500
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("UPDATE actor_appearances SET is_deceased = true"),
        ids.slice(2000)
      )
      expect(ids.slice(2000).length).toBe(500)
    })

    it("generates correct placeholders for each batch", async () => {
      const ids = Array.from({ length: 1001 }, (_, i) => i + 1)
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1000 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await markActorsDeceased(ids)

      // First batch should have $1 through $1000
      const firstCall = mockQuery.mock.calls[0][0] as string
      expect(firstCall).toContain("$1,")
      expect(firstCall).toContain("$1000")
      expect(firstCall).not.toContain("$1001")

      // Second batch should restart at $1 (not continue from $1001)
      const secondCall = mockQuery.mock.calls[1][0] as string
      expect(secondCall).toContain("$1)")
      expect(secondCall).not.toContain("$2")
    })
  })

  describe("getActorFilmography", () => {
    it("returns filmography with multiple movies ordered by release year DESC", async () => {
      const mockRows = [
        {
          movie_id: 100,
          title: "Recent Movie",
          release_year: 2020,
          character_name: "Lead Role",
          poster_path: "/poster1.jpg",
          deceased_count: 3,
          cast_count: 10,
        },
        {
          movie_id: 200,
          title: "Older Movie",
          release_year: 1995,
          character_name: "Supporting Role",
          poster_path: "/poster2.jpg",
          deceased_count: 5,
          cast_count: 15,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getActorFilmography(12345)

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM actor_appearances aa"),
        [12345]
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY m.release_year DESC NULLS LAST"),
        [12345]
      )
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        movieId: 100,
        title: "Recent Movie",
        releaseYear: 2020,
        character: "Lead Role",
        posterPath: "/poster1.jpg",
        deceasedCount: 3,
        castCount: 10,
      })
      expect(result[1]).toEqual({
        movieId: 200,
        title: "Older Movie",
        releaseYear: 1995,
        character: "Supporting Role",
        posterPath: "/poster2.jpg",
        deceasedCount: 5,
        castCount: 15,
      })
    })

    it("returns empty array for actor with no movies in database", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getActorFilmography(99999)

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it("handles null values correctly", async () => {
      const mockRows = [
        {
          movie_id: 300,
          title: "Movie With Nulls",
          release_year: null,
          character_name: null,
          poster_path: null,
          deceased_count: 0,
          cast_count: 5,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getActorFilmography(11111)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        movieId: 300,
        title: "Movie With Nulls",
        releaseYear: null,
        character: null,
        posterPath: null,
        deceasedCount: 0,
        castCount: 5,
      })
    })

    it("correctly maps database fields to return type", async () => {
      const mockRows = [
        {
          movie_id: 400,
          title: "Test Mapping",
          release_year: 2015,
          character_name: "Test Character",
          poster_path: "/test.jpg",
          deceased_count: 2,
          cast_count: 8,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getActorFilmography(22222)

      // Verify field name transformations
      expect(result[0]).toHaveProperty("movieId") // from movie_id
      expect(result[0]).toHaveProperty("releaseYear") // from release_year
      expect(result[0]).toHaveProperty("character") // from character_name
      expect(result[0]).toHaveProperty("posterPath") // from poster_path
      expect(result[0]).toHaveProperty("deceasedCount") // from deceased_count
      expect(result[0]).toHaveProperty("castCount") // from cast_count
    })
  })

  describe("queryWithRetry", () => {
    it("returns result on first successful query", async () => {
      const result = await queryWithRetry(async () => {
        return { data: "success" }
      })

      expect(result).toEqual({ data: "success" })
    })

    it("retries on connection error and succeeds", async () => {
      let attempts = 0
      const result = await queryWithRetry(async () => {
        attempts++
        if (attempts < 2) {
          throw new Error("Connection terminated unexpectedly")
        }
        return { data: "success after retry" }
      })

      expect(attempts).toBe(2)
      expect(result).toEqual({ data: "success after retry" })
    })

    it("retries multiple times on connection errors", async () => {
      let attempts = 0
      const result = await queryWithRetry(async () => {
        attempts++
        if (attempts < 3) {
          throw new Error("ECONNRESET")
        }
        return { data: "success after 3 tries" }
      })

      expect(attempts).toBe(3)
      expect(result).toEqual({ data: "success after 3 tries" })
    })

    it("throws after max retries on persistent connection error", async () => {
      let attempts = 0
      await expect(
        queryWithRetry(async () => {
          attempts++
          throw new Error("Connection terminated")
        }, 3)
      ).rejects.toThrow("Connection terminated")

      expect(attempts).toBe(3)
    })

    it("does not retry on non-connection errors", async () => {
      let attempts = 0
      await expect(
        queryWithRetry(async () => {
          attempts++
          throw new Error("Syntax error in SQL")
        })
      ).rejects.toThrow("Syntax error in SQL")

      expect(attempts).toBe(1)
    })

    it("recognizes various connection error patterns", async () => {
      const connectionErrors = [
        "Connection refused",
        "connection reset by peer",
        "ETIMEDOUT",
        "socket hang up",
        "network error occurred",
      ]

      for (const errorMsg of connectionErrors) {
        let attempts = 0
        const result = await queryWithRetry(async () => {
          attempts++
          if (attempts < 2) {
            throw new Error(errorMsg)
          }
          return { success: true }
        })

        expect(attempts).toBe(2)
        expect(result).toEqual({ success: true })
      }
    })
  })

  describe("resetPool", () => {
    it("ends and clears the pool", async () => {
      // First, ensure pool is created by doing a query
      mockQuery.mockResolvedValueOnce({ rows: [] })
      await getSyncState("test")

      // Reset the pool
      await resetPool()

      expect(mockEnd).toHaveBeenCalled()
    })

    it("handles errors during pool.end gracefully", async () => {
      // Create pool
      mockQuery.mockResolvedValueOnce({ rows: [] })
      await getSyncState("test")

      // Make end() throw
      mockEnd.mockRejectedValueOnce(new Error("End failed"))

      // Should not throw
      await expect(resetPool()).resolves.toBeUndefined()
    })
  })
})
