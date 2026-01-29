import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  lookupProject,
  lookupActor,
  getProjectTmdbId,
  setProjectTmdbId,
  getCelebrityTmdbId,
  setCelebrityTmdbId,
  processProject,
  processCelebrity,
  backfillLinksForActors,
} from "./death-link-backfiller.js"

// Mock database pool/client
const mockQuery = vi.fn()
const mockDb = { query: mockQuery }

describe("death-link-backfiller", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("lookupProject", () => {
    it("finds movie by exact title match", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 238 }] })

      const result = await lookupProject(mockDb as never, "The Godfather", null, "movie")

      expect(result).toBe(238)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM movies"), [
        "The Godfather",
      ])
    })

    it("finds movie by title and year", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 238 }] })

      const result = await lookupProject(mockDb as never, "The Godfather", 1972, "movie")

      expect(result).toBe(238)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("release_year = $2"), [
        "The Godfather",
        1972,
      ])
    })

    it("finds show by exact title match", async () => {
      // First query for movies returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Second query for shows returns result
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 1396 }] })

      const result = await lookupProject(mockDb as never, "Breaking Bad", null, "unknown")

      expect(result).toBe(1396)
      expect(mockQuery).toHaveBeenCalledTimes(2)
    })

    it("finds show by title and year", async () => {
      // First query for movies returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Second query for shows returns result
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 1396 }] })

      const result = await lookupProject(mockDb as never, "Breaking Bad", 2008, "unknown")

      expect(result).toBe(1396)
    })

    it("returns null when no match found", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await lookupProject(mockDb as never, "Nonexistent Movie", null, "unknown")

      expect(result).toBeNull()
    })

    it("skips movie search when type is show", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 1396 }] })

      const result = await lookupProject(mockDb as never, "Breaking Bad", null, "show")

      expect(result).toBe(1396)
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM shows"),
        expect.any(Array)
      )
    })

    it("skips show search when type is movie", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 238 }] })

      const result = await lookupProject(mockDb as never, "The Godfather", null, "movie")

      expect(result).toBe(238)
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM movies"),
        expect.any(Array)
      )
    })
  })

  describe("lookupActor", () => {
    it("finds actor by exact name match", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 3084 }] })

      const result = await lookupActor(mockDb as never, "Marlon Brando")

      expect(result).toBe(3084)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("LOWER(name) = LOWER($1)"), [
        "Marlon Brando",
      ])
    })

    it("finds actor after removing middle initial", async () => {
      // First query returns empty (full name not found)
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Second query returns result (simplified name found)
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 12345 }] })

      const result = await lookupActor(mockDb as never, "John Q. Public")

      expect(result).toBe(12345)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      // Second call should be with simplified name
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LOWER(name) = LOWER($1)"),
        ["John Public"]
      )
    })

    it("returns null when no match found", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await lookupActor(mockDb as never, "Unknown Actor")

      expect(result).toBeNull()
    })

    it("skips simplified name search when no middle initial", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await lookupActor(mockDb as never, "John Smith")

      expect(result).toBeNull()
      // Only one query since name has no middle initial
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })
  })

  describe("getProjectTmdbId / setProjectTmdbId", () => {
    it("returns snake_case tmdb_id when present", () => {
      const project = {
        title: "Test",
        year: 2020,
        type: "movie" as const,
        tmdb_id: 123,
        imdb_id: null,
      }

      expect(getProjectTmdbId(project)).toBe(123)
    })

    it("returns camelCase tmdbId when snake_case is null", () => {
      const project = {
        title: "Test",
        year: 2020,
        type: "movie" as const,
        tmdb_id: null,
        imdb_id: null,
        tmdbId: 456,
      }

      expect(getProjectTmdbId(project)).toBe(456)
    })

    it("returns null when both are null/undefined", () => {
      const project = {
        title: "Test",
        year: 2020,
        type: "movie" as const,
        tmdb_id: null,
        imdb_id: null,
      }

      expect(getProjectTmdbId(project)).toBeNull()
    })

    it("sets both snake_case and camelCase", () => {
      const project = {
        title: "Test",
        year: 2020,
        type: "movie" as const,
        tmdb_id: null,
        imdb_id: null,
      }

      setProjectTmdbId(project, 789)

      expect(project.tmdb_id).toBe(789)
      expect((project as { tmdbId?: number }).tmdbId).toBe(789)
    })
  })

  describe("getCelebrityTmdbId / setCelebrityTmdbId", () => {
    it("returns snake_case tmdb_id when present", () => {
      const celebrity = { name: "Test", relationship: "friend", tmdb_id: 123 }

      expect(getCelebrityTmdbId(celebrity)).toBe(123)
    })

    it("returns camelCase tmdbId when snake_case is null", () => {
      const celebrity = { name: "Test", relationship: "friend", tmdb_id: null, tmdbId: 456 }

      expect(getCelebrityTmdbId(celebrity)).toBe(456)
    })

    it("returns null when both are null/undefined", () => {
      const celebrity = { name: "Test", relationship: "friend", tmdb_id: null }

      expect(getCelebrityTmdbId(celebrity)).toBeNull()
    })

    it("sets both snake_case and camelCase", () => {
      const celebrity = { name: "Test", relationship: "friend", tmdb_id: null }

      setCelebrityTmdbId(celebrity, 789)

      expect(celebrity.tmdb_id).toBe(789)
      expect((celebrity as { tmdbId?: number }).tmdbId).toBe(789)
    })
  })

  describe("processProject", () => {
    it("returns false when project already has tmdb_id", async () => {
      const project = {
        title: "Test",
        year: 2020,
        type: "movie" as const,
        tmdb_id: 123,
        imdb_id: null,
      }

      const result = await processProject(mockDb as never, project)

      expect(result).toBe(false)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("updates project and returns true when match found", async () => {
      const project = {
        title: "The Godfather",
        year: 1972,
        type: "movie" as const,
        tmdb_id: null,
        imdb_id: null,
      }
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 238 }] })

      const result = await processProject(mockDb as never, project)

      expect(result).toBe(true)
      expect(project.tmdb_id).toBe(238)
    })

    it("returns false when no match found", async () => {
      const project = {
        title: "Unknown Movie",
        year: null,
        type: "movie" as const,
        tmdb_id: null,
        imdb_id: null,
      }
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await processProject(mockDb as never, project)

      expect(result).toBe(false)
      expect(project.tmdb_id).toBeNull()
    })
  })

  describe("processCelebrity", () => {
    it("returns false when celebrity already has tmdb_id", async () => {
      const celebrity = { name: "Marlon Brando", relationship: "co-star", tmdb_id: 3084 }

      const result = await processCelebrity(mockDb as never, celebrity)

      expect(result).toBe(false)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("updates celebrity and returns true when match found", async () => {
      const celebrity = { name: "Marlon Brando", relationship: "co-star", tmdb_id: null }
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 3084 }] })

      const result = await processCelebrity(mockDb as never, celebrity)

      expect(result).toBe(true)
      expect(celebrity.tmdb_id).toBe(3084)
    })

    it("returns false when no match found", async () => {
      const celebrity = { name: "Unknown Person", relationship: "friend", tmdb_id: null }
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await processCelebrity(mockDb as never, celebrity)

      expect(result).toBe(false)
      expect(celebrity.tmdb_id).toBeNull()
    })
  })

  describe("backfillLinksForActors", () => {
    it("returns empty result when no actor IDs provided", async () => {
      const result = await backfillLinksForActors(mockDb as never, [])

      expect(result).toEqual({
        linksAdded: 0,
        actorsLinked: 0,
        projectsLinked: 0,
        celebritiesLinked: 0,
      })
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("processes records and updates database", async () => {
      // Query for death circumstances
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            actor_id: 100,
            last_project: {
              title: "The Godfather",
              year: 1972,
              type: "movie",
              tmdb_id: null,
              imdb_id: null,
            },
            posthumous_releases: null,
            related_celebrities: [
              { name: "Marlon Brando", relationship: "co-star", tmdb_id: null },
            ],
          },
        ],
      })

      // Lookup for movie
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 238 }] })

      // Lookup for actor
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 3084 }] })

      // Update query
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await backfillLinksForActors(mockDb as never, [100])

      expect(result).toEqual({
        linksAdded: 2,
        actorsLinked: 1,
        projectsLinked: 1,
        celebritiesLinked: 1,
      })
    })

    it("handles records with no linkable items", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            actor_id: 100,
            last_project: { title: "Test", year: 2020, type: "movie", tmdb_id: 123, imdb_id: null }, // Already has ID
            posthumous_releases: null,
            related_celebrities: null,
          },
        ],
      })

      const result = await backfillLinksForActors(mockDb as never, [100])

      expect(result).toEqual({
        linksAdded: 0,
        actorsLinked: 0,
        projectsLinked: 0,
        celebritiesLinked: 0,
      })
    })

    it("processes multiple posthumous releases", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            actor_id: 100,
            last_project: null,
            posthumous_releases: [
              { title: "Movie A", year: 2020, type: "movie", tmdb_id: null, imdb_id: null },
              { title: "Movie B", year: 2021, type: "movie", tmdb_id: null, imdb_id: null },
            ],
            related_celebrities: null,
          },
        ],
      })

      // Lookups for movies
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 111 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ tmdb_id: 222 }] })

      // Update query
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await backfillLinksForActors(mockDb as never, [100])

      expect(result).toEqual({
        linksAdded: 2,
        actorsLinked: 1,
        projectsLinked: 2,
        celebritiesLinked: 0,
      })
    })

    it("handles records with no death circumstances", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await backfillLinksForActors(mockDb as never, [100])

      expect(result).toEqual({
        linksAdded: 0,
        actorsLinked: 0,
        projectsLinked: 0,
        celebritiesLinked: 0,
      })
    })
  })
})
