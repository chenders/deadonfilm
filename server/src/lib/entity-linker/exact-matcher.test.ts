import { describe, it, expect, vi, beforeEach } from "vitest"
import { findExactMatches, getLinkableEntities, overlapsExisting } from "./exact-matcher.js"

// Mock database
const mockQuery = vi.fn()
const mockDb = { query: mockQuery }

describe("exact-matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("overlapsExisting", () => {
    it("returns false for non-overlapping ranges", () => {
      const linkedRanges = [
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ]

      expect(overlapsExisting(12, 18, linkedRanges)).toBe(false)
    })

    it("returns true when start is inside existing range", () => {
      const linkedRanges = [{ start: 10, end: 20 }]

      expect(overlapsExisting(15, 25, linkedRanges)).toBe(true)
    })

    it("returns true when end is inside existing range", () => {
      const linkedRanges = [{ start: 10, end: 20 }]

      expect(overlapsExisting(5, 15, linkedRanges)).toBe(true)
    })

    it("returns true when new range contains existing range", () => {
      const linkedRanges = [{ start: 10, end: 20 }]

      expect(overlapsExisting(5, 25, linkedRanges)).toBe(true)
    })

    it("returns true when new range is inside existing range", () => {
      const linkedRanges = [{ start: 10, end: 30 }]

      expect(overlapsExisting(15, 25, linkedRanges)).toBe(true)
    })

    it("returns false for empty linked ranges", () => {
      expect(overlapsExisting(10, 20, [])).toBe(false)
    })
  })

  describe("getLinkableEntities", () => {
    it("returns actors, movies, and shows from database", async () => {
      // Mock actors query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tmdb_id: 100, name: "John Wayne" }],
      })
      // Mock movies query
      mockQuery.mockResolvedValueOnce({
        rows: [{ tmdb_id: 200, title: "The Godfather", release_year: 1972 }],
      })
      // Mock shows query
      mockQuery.mockResolvedValueOnce({
        rows: [{ tmdb_id: 300, name: "Breaking Bad", first_air_year: 2008 }],
      })

      const entities = await getLinkableEntities(mockDb as never)

      expect(entities).toHaveLength(3)
      expect(entities[0]).toEqual({
        type: "actor",
        id: 1,
        name: "John Wayne",
        tmdbId: 100,
        slug: "john-wayne-1",
      })
      expect(entities[1]).toEqual({
        type: "movie",
        name: "The Godfather",
        tmdbId: 200,
        slug: "the-godfather-1972-200",
        year: 1972,
      })
      expect(entities[2]).toEqual({
        type: "show",
        name: "Breaking Bad",
        tmdbId: 300,
        slug: "breaking-bad-2008-300",
        year: 2008,
      })
    })

    it("excludes specified actor ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getLinkableEntities(mockDb as never, 123)

      // First query should include actor ID exclusion
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining("id != $1"), [123])
    })
  })

  describe("findExactMatches", () => {
    it("finds exact name matches in text", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tmdb_id: 100, name: "Marlon Brando" }],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const text = "He worked with Marlon Brando in the film."
      const links = await findExactMatches(mockDb as never, text)

      expect(links).toHaveLength(1)
      expect(links[0]).toEqual({
        start: 15,
        end: 28,
        text: "Marlon Brando",
        entityType: "actor",
        entityId: 1, // Internal actor ID, not TMDB ID
        entitySlug: "marlon-brando-1",
        matchMethod: "exact",
        confidence: 1.0,
      })
    })

    it("matches case-insensitively", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tmdb_id: 100, name: "Marlon Brando" }],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const text = "He met MARLON BRANDO at the party."
      const links = await findExactMatches(mockDb as never, text)

      expect(links).toHaveLength(1)
      expect(links[0].text).toBe("MARLON BRANDO")
    })

    it("matches longest first to avoid partial matches", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          { tmdb_id: 200, title: "The Godfather", release_year: 1972 },
          { tmdb_id: 201, title: "The Godfather Part II", release_year: 1974 },
        ],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const text = 'He starred in "The Godfather Part II" later.'
      const links = await findExactMatches(mockDb as never, text)

      expect(links).toHaveLength(1)
      expect(links[0].text).toBe("The Godfather Part II")
      expect(links[0].entityId).toBe(201)
    })

    it("skips very short names", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tmdb_id: 100, name: "Al" }],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const text = "Al was there."
      const links = await findExactMatches(mockDb as never, text)

      // "Al" is too short (< 3 chars), should not match
      expect(links).toHaveLength(0)
    })

    it("respects word boundaries", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tmdb_id: 100, name: "Martin" }],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      // "Martin" should not match inside "Martinez"
      const text = "Martinez was directing."
      const links = await findExactMatches(mockDb as never, text)

      expect(links).toHaveLength(0)
    })

    it("returns empty array for empty text", async () => {
      const links = await findExactMatches(mockDb as never, "")

      expect(links).toHaveLength(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("prevents overlapping matches", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 100, name: "John" },
          { id: 2, tmdb_id: 101, name: "John Wayne" },
        ],
      })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const text = "John Wayne was there."
      const links = await findExactMatches(mockDb as never, text)

      // "John Wayne" should match first (sorted by length), blocking "John"
      expect(links).toHaveLength(1)
      expect(links[0].text).toBe("John Wayne")
    })
  })
})
