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
  getActorFilmography,
  queryWithRetry,
  resetPool,
  upsertMovie,
  getCovidDeaths,
  getDeathWatchActors,
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
        null, // current_phase
        null, // last_processed_id
        null, // phase_total
        null, // phase_completed
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
        null, // current_phase
        null, // last_processed_id
        null, // phase_total
        null, // phase_completed
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
        null, // current_phase
        null, // last_processed_id
        null, // phase_total
        null, // phase_completed
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
        expect.stringContaining("SELECT tmdb_id FROM actors WHERE deathday IS NOT NULL")
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
        expect.stringContaining("FROM actor_movie_appearances aa"),
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

  describe("getCovidDeaths", () => {
    it("returns persons with totalCount using window function", async () => {
      const mockRows = [
        {
          total_count: "10",
          tmdb_id: 1,
          name: "Actor One",
          birthday: "1950-01-01",
          deathday: "2021-03-15",
          cause_of_death: "COVID-19",
          cause_of_death_source: "claude",
          cause_of_death_details: "Complications",
          cause_of_death_details_source: "claude",
          wikipedia_url: "https://example.com",
          profile_path: "/path.jpg",
          age_at_death: 71,
          expected_lifespan: 78,
          years_lost: 7,
          popularity: 10.0,
          violent_death: false,
          is_obscure: false,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getCovidDeaths({ limit: 50, offset: 0 })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COUNT(*) OVER () as total_count"),
        [50, 0, false]
      )
      expect(result.totalCount).toBe(10)
      expect(result.persons).toHaveLength(1)
      // total_count should be stripped from persons
      expect(result.persons[0]).not.toHaveProperty("total_count")
    })

    it("searches cause_of_death and cause_of_death_details for COVID terms", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getCovidDeaths()

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("cause_of_death ILIKE '%covid%'")
      expect(query).toContain("cause_of_death ILIKE '%coronavirus%'")
      expect(query).toContain("cause_of_death ILIKE '%sars-cov-2%'")
      expect(query).toContain("cause_of_death_details ILIKE '%covid%'")
      expect(query).toContain("cause_of_death_details ILIKE '%coronavirus%'")
      expect(query).toContain("cause_of_death_details ILIKE '%sars-cov-2%'")
    })

    it("orders by deathday DESC", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getCovidDeaths()

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("ORDER BY deathday DESC")
    })

    it("uses default limit and offset when not provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getCovidDeaths()

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50, 0, false])
    })

    it("uses custom limit and offset", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getCovidDeaths({ limit: 25, offset: 50 })

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [25, 50, false])
    })

    it("returns 0 totalCount when no rows returned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getCovidDeaths()

      expect(result.totalCount).toBe(0)
      expect(result.persons).toEqual([])
    })

    it("strips total_count from returned persons", async () => {
      const mockRows = [
        {
          total_count: "5",
          tmdb_id: 1,
          name: "Test Actor",
          birthday: null,
          deathday: "2021-01-01",
          cause_of_death: "COVID-19",
          cause_of_death_source: null,
          cause_of_death_details: null,
          cause_of_death_details_source: null,
          wikipedia_url: null,
          profile_path: null,
          age_at_death: null,
          expected_lifespan: null,
          years_lost: null,
          popularity: null,
          violent_death: null,
          is_obscure: null,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getCovidDeaths()

      expect(result.persons[0]).toEqual({
        tmdb_id: 1,
        name: "Test Actor",
        birthday: null,
        deathday: "2021-01-01",
        cause_of_death: "COVID-19",
        cause_of_death_source: null,
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        profile_path: null,
        age_at_death: null,
        expected_lifespan: null,
        years_lost: null,
        popularity: null,
        violent_death: null,
        is_obscure: null,
      })
    })
  })
})

describe("Movie Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  describe("upsertMovie", () => {
    const baseMovie = {
      tmdb_id: 289,
      title: "Casablanca",
      release_date: "1943-01-23",
      release_year: 1943,
      poster_path: "/poster.jpg",
      genres: ["Drama", "Romance"],
      original_language: null,
      popularity: null,
      vote_average: 8.1,
      cast_count: 30,
      deceased_count: 26,
      living_count: 4,
      expected_deaths: 9.72,
      mortality_surprise_score: 1.675,
    }

    it("preserves existing language when new value is NULL", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await upsertMovie(baseMovie)

      // The query should use COALESCE to preserve existing values
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("COALESCE(EXCLUDED.original_language, movies.original_language)"),
        expect.arrayContaining([289, "Casablanca"])
      )
    })

    it("preserves existing popularity when new value is NULL", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await upsertMovie(baseMovie)

      // The query should use COALESCE to preserve existing values
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("COALESCE(EXCLUDED.popularity, movies.popularity)"),
        expect.arrayContaining([289, "Casablanca"])
      )
    })

    it("updates language when new value is provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await upsertMovie({ ...baseMovie, original_language: "en" })

      // COALESCE will use the new value since it's not null
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("COALESCE(EXCLUDED.original_language, movies.original_language)"),
        expect.arrayContaining(["en"])
      )
    })
  })

  describe("getDeathWatchActors", () => {
    beforeEach(() => {
      vi.clearAllMocks()
      process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
    })

    afterEach(() => {
      delete process.env.DATABASE_URL
    })

    it("returns actors with totalCount using window function", async () => {
      const mockRows = [
        {
          total_count: "10",
          actor_tmdb_id: 1,
          actor_name: "Actor One",
          birthday: "1935-01-15",
          age: 89,
          profile_path: "/path1.jpg",
          popularity: "10.5",
          total_movies: 25,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getDeathWatchActors({ limit: 50, offset: 0 })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*) OVER() as total_count"),
        expect.any(Array)
      )
      expect(result.totalCount).toBe(10)
      expect(result.actors).toHaveLength(1)
      // total_count should be stripped from actors
      expect(result.actors[0]).not.toHaveProperty("total_count")
    })

    it("queries living actors with birthday not null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors()

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("a.deathday IS NULL")
      expect(query).toContain("a.birthday IS NOT NULL")
    })

    it("orders by age DESC, popularity DESC", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors()

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("ORDER BY age DESC, popularity DESC NULLS LAST")
    })

    it("uses default limit and offset when not provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors()

      // Default values: limit=50, offset=0
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50, 0])
    })

    it("uses custom limit and offset", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ limit: 25, offset: 50 })

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [25, 50])
    })

    it("applies minAge filter", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ minAge: 70 })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("age >= $1")
      // Params order: minAge, limit, offset
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [70, 50, 0])
    })

    it("requires 2+ movies OR 10+ episodes in HAVING clause", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors()

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("COUNT(DISTINCT ama.movie_tmdb_id) >= 2")
      expect(query).toContain(
        "COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10"
      )
    })

    it("excludes obscure actors by default", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ includeObscure: false })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("profile_path IS NOT NULL")
      expect(query).toContain("popularity >= 5.0")
    })

    it("includes obscure actors when includeObscure is true", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ includeObscure: true })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).not.toContain("profile_path IS NOT NULL")
      expect(query).not.toContain("popularity >= 5.0")
    })

    it("returns 0 totalCount when no rows returned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getDeathWatchActors()

      expect(result.totalCount).toBe(0)
      expect(result.actors).toEqual([])
    })

    it("strips total_count from returned actors", async () => {
      const mockRows = [
        {
          total_count: "5",
          actor_tmdb_id: 1,
          actor_name: "Test Actor",
          birthday: "1940-06-20",
          age: 84,
          profile_path: "/path.jpg",
          popularity: "8.2",
          total_movies: 15,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getDeathWatchActors()

      expect(result.actors[0]).not.toHaveProperty("total_count")
      expect(result.actors[0].actor_name).toBe("Test Actor")
    })

    it("parses popularity as float", async () => {
      const mockRows = [
        {
          total_count: "1",
          actor_tmdb_id: 1,
          actor_name: "Test Actor",
          birthday: "1940-06-20",
          age: 84,
          profile_path: "/path.jpg",
          popularity: "15.789",
          total_movies: 10,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getDeathWatchActors()

      expect(result.actors[0].popularity).toBe(15.789)
      expect(typeof result.actors[0].popularity).toBe("number")
    })

    it("handles null popularity", async () => {
      const mockRows = [
        {
          total_count: "1",
          actor_tmdb_id: 1,
          actor_name: "Test Actor",
          birthday: "1940-06-20",
          age: 84,
          profile_path: "/path.jpg",
          popularity: null,
          total_movies: 10,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const result = await getDeathWatchActors()

      expect(result.actors[0].popularity).toBeNull()
    })

    it("combines minAge filter with obscure filter", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ minAge: 70, includeObscure: false })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("age >= $1")
      expect(query).toContain("profile_path IS NOT NULL")
      expect(query).toContain("popularity >= 5.0")
      // Params: minAge, limit, offset
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [70, 50, 0])
    })
  })
})
