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
  getDeceasedActorsForShow,
  getLivingActorsForShow,
  updateDeathInfoByActorId,
  getActorById,
  getEpisodeCountsBySeasonFromDb,
  getCauseCategory,
  getSpecificCause,
  getSiteStats,
  clearSiteStatsCache,
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
        rows: [{ tmdb_id: 123 }, { tmdb_id: 456 }, { tmdb_id: 789 }],
      })

      const result = await getAllActorTmdbIds()

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT DISTINCT a.tmdb_id"))
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
      production_countries: null,
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

    it("applies search filter with ILIKE pattern", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ search: "Clint" })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("actor_name ILIKE")
      // Params: search pattern, limit, offset
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["%Clint%", 50, 0])
    })

    it("combines search with minAge filter", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ search: "Eastwood", minAge: 80 })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("age >= $1")
      expect(query).toContain("actor_name ILIKE $2")
      // Params order: minAge, search, limit, offset
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [80, "%Eastwood%", 50, 0])
    })

    it("combines search with includeObscure filter", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getDeathWatchActors({ search: "Actor", includeObscure: false })

      const query = mockQuery.mock.calls[0][0] as string
      expect(query).toContain("profile_path IS NOT NULL")
      expect(query).toContain("actor_name ILIKE")
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["%Actor%", 50, 0])
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

describe("getDeceasedActorsForShow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns empty array when no deceased actors exist for the show", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getDeceasedActorsForShow(18347)

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM actors a"), [18347])
    expect(result).toEqual([])
  })

  it("correctly aggregates episode appearances for deceased actors", async () => {
    const mockActors = [
      {
        tmdb_id: 20753,
        name: "Fred Willard",
        profile_path: "/profile.jpg",
        birthday: "1933-09-18",
        deathday: "2020-05-15",
        cause_of_death: "Cardiac arrest",
        cause_of_death_source: "claude",
        cause_of_death_details: "Died peacefully at home",
        cause_of_death_details_source: "claude",
        wikipedia_url: "https://en.wikipedia.org/wiki/Fred_Willard",
        age_at_death: 86,
        years_lost: -4,
        total_episodes: 3,
      },
    ]
    const mockEpisodes = [
      {
        actor_tmdb_id: 20753,
        season_number: 1,
        episode_number: 5,
        episode_name: "Advanced Criminal Law",
        character_name: "Pierce's Dad",
      },
      {
        actor_tmdb_id: 20753,
        season_number: 2,
        episode_number: 10,
        episode_name: "Mixology Certification",
        character_name: "Pierce's Dad",
      },
    ]

    mockQuery
      .mockResolvedValueOnce({ rows: mockActors })
      .mockResolvedValueOnce({ rows: mockEpisodes })

    const result = await getDeceasedActorsForShow(18347)

    expect(result).toHaveLength(1)
    expect(result[0].tmdb_id).toBe(20753)
    expect(result[0].name).toBe("Fred Willard")
    expect(result[0].total_episodes).toBe(3)
    expect(result[0].episodes).toHaveLength(2)
    expect(result[0].episodes[0]).toEqual({
      season_number: 1,
      episode_number: 5,
      episode_name: "Advanced Criminal Law",
      character_name: "Pierce's Dad",
    })
  })

  it("returns actors sorted by deathday DESC", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getDeceasedActorsForShow(1400)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("ORDER BY a.deathday DESC")
  })

  it("properly joins with episodes table to get episode names", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getDeceasedActorsForShow(1400)

    // Check the second query (episodes query) is issued
    // First query is for actors, no episodes query if no actors
    expect(mockQuery).toHaveBeenCalledTimes(1)

    // Now test with actors to verify episode join
    const mockActors = [
      {
        tmdb_id: 100,
        name: "Test Actor",
        profile_path: null,
        birthday: null,
        deathday: "2020-01-01",
        cause_of_death: null,
        cause_of_death_source: null,
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        age_at_death: null,
        years_lost: null,
        total_episodes: 1,
      },
    ]
    mockQuery.mockResolvedValueOnce({ rows: mockActors }).mockResolvedValueOnce({ rows: [] })

    await getDeceasedActorsForShow(1400)

    // Second call should be the episodes query with LEFT JOIN
    const episodesQuery = mockQuery.mock.calls[2][0] as string
    expect(episodesQuery).toContain("LEFT JOIN episodes e ON")
    expect(episodesQuery).toContain("e.name as episode_name")
  })

  it("handles actors with multiple episode appearances", async () => {
    const mockActors = [
      {
        id: 1,
        tmdb_id: 200,
        name: "Multi-Episode Actor",
        profile_path: null,
        birthday: "1950-01-01",
        deathday: "2021-06-15",
        cause_of_death: "Natural causes",
        cause_of_death_source: "wikidata",
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        age_at_death: 71,
        years_lost: 8,
        total_episodes: 5,
      },
    ]
    const mockEpisodes = [
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 1,
        episode_name: "Pilot",
        character_name: "Guest",
      },
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 2,
        episode_name: "Episode 2",
        character_name: "Guest",
      },
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 3,
        episode_name: "Episode 3",
        character_name: "Guest",
      },
      {
        actor_id: 1,
        season_number: 2,
        episode_number: 1,
        episode_name: "Season 2 Premiere",
        character_name: "Recurring",
      },
      {
        actor_id: 1,
        season_number: 2,
        episode_number: 2,
        episode_name: "Episode 2",
        character_name: "Recurring",
      },
    ]

    mockQuery
      .mockResolvedValueOnce({ rows: mockActors })
      .mockResolvedValueOnce({ rows: mockEpisodes })

    const result = await getDeceasedActorsForShow(5000)

    expect(result).toHaveLength(1)
    expect(result[0].episodes).toHaveLength(5)
    expect(result[0].episodes[0].season_number).toBe(1)
    expect(result[0].episodes[0].episode_number).toBe(1)
    expect(result[0].episodes[4].season_number).toBe(2)
    expect(result[0].episodes[4].episode_number).toBe(2)
  })

  it("handles multiple deceased actors with their respective episodes", async () => {
    const mockActors = [
      {
        id: 1,
        tmdb_id: 300,
        name: "Actor A",
        profile_path: null,
        birthday: null,
        deathday: "2022-01-01",
        cause_of_death: null,
        cause_of_death_source: null,
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        age_at_death: null,
        years_lost: null,
        total_episodes: 2,
      },
      {
        id: 2,
        tmdb_id: 400,
        name: "Actor B",
        profile_path: null,
        birthday: null,
        deathday: "2020-06-01",
        cause_of_death: null,
        cause_of_death_source: null,
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        age_at_death: null,
        years_lost: null,
        total_episodes: 1,
      },
    ]
    const mockEpisodes = [
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 1,
        episode_name: "Ep 1",
        character_name: "Char A",
      },
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 2,
        episode_name: "Ep 2",
        character_name: "Char A",
      },
      {
        actor_id: 2,
        season_number: 3,
        episode_number: 5,
        episode_name: "Ep 5",
        character_name: "Char B",
      },
    ]

    mockQuery
      .mockResolvedValueOnce({ rows: mockActors })
      .mockResolvedValueOnce({ rows: mockEpisodes })

    const result = await getDeceasedActorsForShow(9999)

    expect(result).toHaveLength(2)
    // Actor A (more recent death) should be first due to ORDER BY deathday DESC
    expect(result[0].tmdb_id).toBe(300)
    expect(result[0].episodes).toHaveLength(2)
    expect(result[1].tmdb_id).toBe(400)
    expect(result[1].episodes).toHaveLength(1)
  })

  it("uses actor_show_appearances table to find appearances", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getDeceasedActorsForShow(18347)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("JOIN actor_show_appearances asa ON asa.actor_id = a.id")
    expect(query).toContain("WHERE asa.show_tmdb_id = $1")
  })

  it("only returns actors with deathday IS NOT NULL", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getDeceasedActorsForShow(18347)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("AND a.deathday IS NOT NULL")
  })
})

describe("getLivingActorsForShow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns empty array when no living actors exist for the show", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getLivingActorsForShow(18347)

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM actors a"), [18347])
    expect(result).toEqual([])
  })

  it("correctly aggregates episode appearances for living actors", async () => {
    const mockActors = [
      {
        tmdb_id: 20753,
        name: "John Smith",
        profile_path: "/profile.jpg",
        birthday: "1960-05-15",
        total_episodes: 3,
      },
    ]
    const mockEpisodes = [
      {
        actor_tmdb_id: 20753,
        season_number: 1,
        episode_number: 5,
        episode_name: "The Pilot",
        character_name: "Doctor",
      },
      {
        actor_tmdb_id: 20753,
        season_number: 2,
        episode_number: 10,
        episode_name: "The Finale",
        character_name: "Doctor",
      },
    ]

    mockQuery
      .mockResolvedValueOnce({ rows: mockActors })
      .mockResolvedValueOnce({ rows: mockEpisodes })

    const result = await getLivingActorsForShow(18347)

    expect(result).toHaveLength(1)
    expect(result[0].tmdb_id).toBe(20753)
    expect(result[0].name).toBe("John Smith")
    expect(result[0].total_episodes).toBe(3)
    expect(result[0].episodes).toHaveLength(2)
    expect(result[0].episodes[0]).toEqual({
      season_number: 1,
      episode_number: 5,
      episode_name: "The Pilot",
      character_name: "Doctor",
    })
  })

  it("returns actors sorted by total_episodes DESC", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getLivingActorsForShow(1400)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("ORDER BY total_episodes DESC")
  })

  it("properly joins with episodes table to get episode names", async () => {
    const mockActors = [
      {
        tmdb_id: 100,
        name: "Test Actor",
        profile_path: null,
        birthday: null,
        total_episodes: 1,
      },
    ]
    mockQuery.mockResolvedValueOnce({ rows: mockActors }).mockResolvedValueOnce({ rows: [] })

    await getLivingActorsForShow(1400)

    // Second call should be the episodes query with LEFT JOIN
    const episodesQuery = mockQuery.mock.calls[1][0] as string
    expect(episodesQuery).toContain("LEFT JOIN episodes e ON")
    expect(episodesQuery).toContain("e.name as episode_name")
  })

  it("handles multiple living actors with their respective episodes", async () => {
    const mockActors = [
      {
        id: 1,
        tmdb_id: 300,
        name: "Actor A",
        profile_path: null,
        birthday: "1980-01-01",
        total_episodes: 5,
      },
      {
        id: 2,
        tmdb_id: 400,
        name: "Actor B",
        profile_path: null,
        birthday: "1990-06-01",
        total_episodes: 2,
      },
    ]
    const mockEpisodes = [
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 1,
        episode_name: "Ep 1",
        character_name: "Char A",
      },
      {
        actor_id: 1,
        season_number: 1,
        episode_number: 2,
        episode_name: "Ep 2",
        character_name: "Char A",
      },
      {
        actor_id: 2,
        season_number: 3,
        episode_number: 5,
        episode_name: "Ep 5",
        character_name: "Char B",
      },
    ]

    mockQuery
      .mockResolvedValueOnce({ rows: mockActors })
      .mockResolvedValueOnce({ rows: mockEpisodes })

    const result = await getLivingActorsForShow(9999)

    expect(result).toHaveLength(2)
    // Actor A (more episodes) should be first due to ORDER BY total_episodes DESC
    expect(result[0].tmdb_id).toBe(300)
    expect(result[0].episodes).toHaveLength(2)
    expect(result[1].tmdb_id).toBe(400)
    expect(result[1].episodes).toHaveLength(1)
  })

  it("uses actor_show_appearances table to find appearances", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getLivingActorsForShow(18347)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("JOIN actor_show_appearances asa ON asa.actor_id = a.id")
    expect(query).toContain("WHERE asa.show_tmdb_id = $1")
  })

  it("only returns actors with deathday IS NULL", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getLivingActorsForShow(18347)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("AND a.deathday IS NULL")
  })
})

describe("updateDeathInfoByActorId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("updates death info for an actor by id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await updateDeathInfoByActorId(
      123,
      "Heart attack",
      "claude",
      "Suffered cardiac arrest at home",
      "claude",
      "https://en.wikipedia.org/wiki/Test_Actor"
    )

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE actors"), [
      123,
      "Heart attack",
      "claude",
      "Suffered cardiac arrest at home",
      "claude",
      "https://en.wikipedia.org/wiki/Test_Actor",
    ])
  })

  it("uses COALESCE to preserve existing values when new values are null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await updateDeathInfoByActorId(456, null, null, null, null, null)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("COALESCE(cause_of_death, $2)")
    expect(query).toContain("COALESCE(cause_of_death_source, $3)")
    expect(query).toContain("COALESCE(cause_of_death_details, $4)")
    expect(query).toContain("COALESCE(cause_of_death_details_source, $5)")
    expect(query).toContain("COALESCE(wikipedia_url, $6)")
  })

  it("updates the updated_at timestamp", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await updateDeathInfoByActorId(789, "Cancer", "wikipedia", null, null, null)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("updated_at = CURRENT_TIMESTAMP")
  })

  it("targets the correct actor by id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await updateDeathInfoByActorId(999, "Natural causes", "wikipedia", null, null, null)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("WHERE id = $1")
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
      999,
      "Natural causes",
      "wikipedia",
      null,
      null,
      null,
    ])
  })
})

describe("getActorById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns actor when found", async () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      name: "Test Actor",
      birthday: "1950-01-01",
      deathday: "2020-12-15",
      profile_path: "/path.jpg",
      cause_of_death: "Heart attack",
      cause_of_death_source: "claude",
      cause_of_death_details: "Detailed explanation",
      cause_of_death_details_source: "claude",
      wikipedia_url: "https://en.wikipedia.org/wiki/Test_Actor",
      age_at_death: 70,
      expected_lifespan: 78.5,
      years_lost: 8.5,
      violent_death: false,
      popularity: 15.5,
      is_obscure: false,
      imdb_person_id: "nm0000001",
      created_at: new Date("2024-01-01"),
      updated_at: new Date("2024-01-15"),
    }
    mockQuery.mockResolvedValueOnce({ rows: [mockActor] })

    const result = await getActorById(123)

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM actors WHERE id = $1", [123])
    expect(result).toEqual(mockActor)
  })

  it("returns null when actor not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getActorById(999)

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM actors WHERE id = $1", [999])
    expect(result).toBeNull()
  })

  it("queries by internal id, not tmdb_id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getActorById(42)

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM actors WHERE id = $1", [42])
  })
})

describe("getEpisodeCountsBySeasonFromDb", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns a Map with episode counts per season", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { season_number: 1, count: "10" },
        { season_number: 2, count: "12" },
        { season_number: 3, count: "8" },
      ],
    })

    const result = await getEpisodeCountsBySeasonFromDb(987)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT season_number, COUNT(*) as count FROM episodes"),
      [987]
    )
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(3)
    expect(result.get(1)).toBe(10)
    expect(result.get(2)).toBe(12)
    expect(result.get(3)).toBe(8)
  })

  it("returns empty Map when show has no episodes", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getEpisodeCountsBySeasonFromDb(999)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it("correctly parses string count values to integers", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { season_number: 1, count: "250" },
        { season_number: 2, count: "312" },
      ],
    })

    const result = await getEpisodeCountsBySeasonFromDb(987)

    expect(result.get(1)).toBe(250)
    expect(result.get(2)).toBe(312)
    expect(typeof result.get(1)).toBe("number")
  })

  it("groups by season_number and orders by season_number", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getEpisodeCountsBySeasonFromDb(1234)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("GROUP BY season_number")
    expect(query).toContain("ORDER BY season_number")
  })

  it("filters by show_tmdb_id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getEpisodeCountsBySeasonFromDb(5678)

    const query = mockQuery.mock.calls[0][0] as string
    expect(query).toContain("WHERE show_tmdb_id = $1")
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [5678])
  })
})

describe("getCauseCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns null for unknown category", async () => {
    const result = await getCauseCategory("nonexistent-category")
    expect(result).toBeNull()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("calculates decades correctly as integers", async () => {
    // Set up mocks for all the queries getCauseCategory makes
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "10", avg_age: "65.5", avg_years_lost: "12.3" }],
      }) // stats
      .mockResolvedValueOnce({ rows: [{ total: "100" }] }) // total
      .mockResolvedValueOnce({ rows: [] }) // notable actors
      .mockResolvedValueOnce({
        rows: [
          { decade: "1950s", count: "3" },
          { decade: "1960s", count: "5" },
          { decade: "2020s", count: "2" },
        ],
      }) // decades
      .mockResolvedValueOnce({ rows: [] }) // causes
      .mockResolvedValueOnce({ rows: [] }) // actors

    const result = await getCauseCategory("cancer")

    expect(result).not.toBeNull()
    expect(result?.decadeBreakdown).toEqual([
      { decade: "1950s", count: 3 },
      { decade: "1960s", count: 5 },
      { decade: "2020s", count: 2 },
    ])
  })

  it("uses integer division for decade calculation in SQL", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0", avg_age: null, avg_years_lost: null }] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await getCauseCategory("cancer")

    // Find the decade query (4th query)
    const decadeQuery = mockQuery.mock.calls[3][0] as string
    expect(decadeQuery).toContain("EXTRACT(YEAR FROM deathday::date)::int / 10 * 10")
    expect(decadeQuery).toContain("'s' as decade")
  })
})

describe("getSpecificCause", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("calculates decades correctly as integers", async () => {
    // getSpecificCause calls getCauseFromSlugInCategory first (which queries for causes)
    // then makes stats, notable, decades, and actors queries
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cause: "Lung cancer" }] }) // getCauseFromSlugInCategory
      .mockResolvedValueOnce({
        rows: [{ count: "5", avg_age: "70.2", avg_years_lost: "9.8" }],
      }) // stats
      .mockResolvedValueOnce({ rows: [] }) // notable actors
      .mockResolvedValueOnce({
        rows: [
          { decade: "1970s", count: "2" },
          { decade: "1990s", count: "3" },
        ],
      }) // decades
      .mockResolvedValueOnce({ rows: [] }) // actors

    const result = await getSpecificCause("cancer", "lung-cancer")

    expect(result).not.toBeNull()
    expect(result?.decadeBreakdown).toEqual([
      { decade: "1970s", count: 2 },
      { decade: "1990s", count: 3 },
    ])
  })

  it("uses integer division for decade calculation in SQL", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cause: "Lung cancer" }] }) // getCauseFromSlugInCategory
      .mockResolvedValueOnce({ rows: [{ count: "0", avg_age: null, avg_years_lost: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await getSpecificCause("cancer", "lung-cancer")

    // Find the decade query (4th query, index 3)
    const decadeQuery = mockQuery.mock.calls[3][0] as string
    expect(decadeQuery).toContain("EXTRACT(YEAR FROM a.deathday::date)::int / 10 * 10")
    expect(decadeQuery).toContain("'s' as decade")
  })

  it("returns null for unknown category", async () => {
    const result = await getSpecificCause("nonexistent-category", "some-cause")
    expect(result).toBeNull()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("returns null when cause slug not found in category", async () => {
    // getCauseFromSlugInCategory returns null when no match found
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getSpecificCause("cancer", "nonexistent-cause")
    expect(result).toBeNull()
  })
})

describe("getSiteStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
    // Clear the site stats cache before each test
    clearSiteStatsCache()
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("returns correct topCauseOfDeathCategorySlug for cancer", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total_all_actors: "100000",
          total_deceased_actors: "5000",
          total_movies: "1000",
          top_cause: "Cancer",
          avg_mortality: "25.5",
          cause_pct: "30.0",
          cause_known_count: "1500",
        },
      ],
    })

    const result = await getSiteStats()

    expect(result.topCauseOfDeath).toBe("Cancer")
    expect(result.topCauseOfDeathCategorySlug).toBe("cancer")
  })

  it("returns correct topCauseOfDeathCategorySlug for heart-related causes", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total_all_actors: "100000",
          total_deceased_actors: "5000",
          total_movies: "1000",
          top_cause: "Heart Attack",
          avg_mortality: "25.5",
          cause_pct: "30.0",
          cause_known_count: "1500",
        },
      ],
    })

    const result = await getSiteStats()

    expect(result.topCauseOfDeath).toBe("Heart Attack")
    expect(result.topCauseOfDeathCategorySlug).toBe("heart-disease")
  })

  it("returns null topCauseOfDeathCategorySlug when top_cause is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total_all_actors: "100000",
          total_deceased_actors: "5000",
          total_movies: "1000",
          top_cause: null,
          avg_mortality: "25.5",
          cause_pct: "30.0",
          cause_known_count: "1500",
        },
      ],
    })

    const result = await getSiteStats()

    expect(result.topCauseOfDeath).toBeNull()
    expect(result.topCauseOfDeathCategorySlug).toBeNull()
  })

  it("returns null topCauseOfDeathCategorySlug for uncategorized causes", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total_all_actors: "100000",
          total_deceased_actors: "5000",
          total_movies: "1000",
          top_cause: "Some Unknown Condition XYZ",
          avg_mortality: "25.5",
          cause_pct: "30.0",
          cause_known_count: "1500",
        },
      ],
    })

    const result = await getSiteStats()

    expect(result.topCauseOfDeath).toBe("Some Unknown Condition XYZ")
    // Uncategorized causes should map to "other" category
    expect(result.topCauseOfDeathCategorySlug).toBe("other")
  })

  it("returns all expected stats fields", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total_all_actors: "100000",
          total_deceased_actors: "5000",
          total_movies: "1000",
          top_cause: "Cancer",
          avg_mortality: "25.5",
          cause_pct: "30.0",
          cause_known_count: "1500",
        },
      ],
    })

    const result = await getSiteStats()

    expect(result).toEqual({
      totalActors: 100000,
      totalDeceasedActors: 5000,
      totalMoviesAnalyzed: 1000,
      topCauseOfDeath: "Cancer",
      topCauseOfDeathCategorySlug: "cancer",
      avgMortalityPercentage: 25.5,
      causeOfDeathPercentage: 30.0,
      actorsWithCauseKnown: 1500,
    })
  })
})
