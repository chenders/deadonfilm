import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the pool module before imports
vi.mock("./pool.js", () => ({
  getPool: vi.fn(),
}))

// Mock the cause-categories module for filterRedundantCauses
vi.mock("./cause-categories.js", () => ({
  filterRedundantCauses: vi.fn(
    (causes: Array<{ cause: string; count: number; slug: string }>) => causes
  ),
}))

// Mock the cause-categories slug utility (matches real apostrophe removal)
vi.mock("../cause-categories.js", () => ({
  createCauseSlug: vi.fn((cause: string) =>
    cause
      .toLowerCase()
      .replace(/['\u2019\u02BC]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  ),
}))

import { getGenreCategories } from "./genre-categories.js"
import { getPool } from "./pool.js"
import { filterRedundantCauses } from "./cause-categories.js"

describe("getGenreCategories", () => {
  const mockQuery = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns enriched genre categories with all data", async () => {
    // Query 1: Genre counts (ordered by count DESC as in production SQL)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { genre: "Drama", count: "200" },
        { genre: "Action", count: "150" },
      ],
    })

    // Query 2: Top movie candidates per genre (multiple per genre for dedup)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          genre: "Action",
          tmdb_id: 694,
          title: "Die Hard",
          release_year: 1988,
          backdrop_path: "/diehard.jpg",
        },
        {
          genre: "Drama",
          tmdb_id: 597,
          title: "Schindler's List",
          release_year: 1993,
          backdrop_path: "/schindlers.jpg",
        },
      ],
    })

    // Query 3: Top causes per genre
    mockQuery.mockResolvedValueOnce({
      rows: [
        { genre: "Action", cause: "Cancer", count: "50" },
        { genre: "Action", cause: "Heart Attack", count: "30" },
        { genre: "Drama", cause: "Natural Causes", count: "80" },
        { genre: "Drama", cause: "Cancer", count: "60" },
      ],
    })

    const result = await getGenreCategories()

    expect(result).toHaveLength(2)

    // Drama genre (highest count, first in results)
    expect(result[0]).toEqual({
      genre: "Drama",
      count: 200,
      slug: "drama",
      topCauses: [
        { cause: "Natural Causes", count: 80, slug: "natural-causes" },
        { cause: "Cancer", count: 60, slug: "cancer" },
      ],
      topMovie: {
        tmdbId: 597,
        title: "Schindler's List",
        releaseYear: 1993,
        backdropPath: "/schindlers.jpg",
      },
    })

    // Action genre (second by count)
    expect(result[1]).toEqual({
      genre: "Action",
      count: 150,
      slug: "action",
      topCauses: [
        { cause: "Cancer", count: 50, slug: "cancer" },
        { cause: "Heart Attack", count: 30, slug: "heart-attack" },
      ],
      topMovie: {
        tmdbId: 694,
        title: "Die Hard",
        releaseYear: 1988,
        backdropPath: "/diehard.jpg",
      },
    })
  })

  it("deduplicates movies across genres", async () => {
    // Query 1: Genre counts (Drama first = highest count, then Comedy)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { genre: "Drama", count: "200" },
        { genre: "Comedy", count: "150" },
      ],
    })

    // Query 2: Same movie (Titanic) is top candidate for both genres
    mockQuery.mockResolvedValueOnce({
      rows: [
        // Drama candidates
        {
          genre: "Drama",
          tmdb_id: 597,
          title: "Titanic",
          release_year: 1997,
          backdrop_path: "/titanic.jpg",
        },
        {
          genre: "Drama",
          tmdb_id: 100,
          title: "Drama Backup",
          release_year: 2000,
          backdrop_path: "/backup.jpg",
        },
        // Comedy candidates — Titanic also top here, but should be skipped
        {
          genre: "Comedy",
          tmdb_id: 597,
          title: "Titanic",
          release_year: 1997,
          backdrop_path: "/titanic.jpg",
        },
        {
          genre: "Comedy",
          tmdb_id: 200,
          title: "The Hangover",
          release_year: 2009,
          backdrop_path: "/hangover.jpg",
        },
      ],
    })

    // Query 3: Causes
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    // Drama (highest count) gets Titanic
    expect(result[0].topMovie?.title).toBe("Titanic")

    // Comedy gets the next available: The Hangover
    expect(result[1].topMovie?.title).toBe("The Hangover")
  })

  it("returns null for missing top movie", async () => {
    // Query 1: Genre counts
    mockQuery.mockResolvedValueOnce({
      rows: [{ genre: "Western", count: "10" }],
    })

    // Query 2: No top movie
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 3: No causes
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      genre: "Western",
      count: 10,
      slug: "western",
      topCauses: [],
      topMovie: null,
    })
  })

  it("applies filterRedundantCauses to cause lists", async () => {
    // Query 1: Genre counts
    mockQuery.mockResolvedValueOnce({
      rows: [{ genre: "Horror", count: "50" }],
    })

    // Query 2: Top movie
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 3: Causes
    mockQuery.mockResolvedValueOnce({
      rows: [
        { genre: "Horror", cause: "Cancer", count: "20" },
        { genre: "Horror", cause: "Lung Cancer", count: "15" },
        { genre: "Horror", cause: "Heart Attack", count: "10" },
      ],
    })

    await getGenreCategories()

    // filterRedundantCauses should have been called with Horror's causes
    expect(filterRedundantCauses).toHaveBeenCalledWith([
      { cause: "Cancer", count: 20, slug: "cancer" },
      { cause: "Lung Cancer", count: 15, slug: "lung-cancer" },
      { cause: "Heart Attack", count: 10, slug: "heart-attack" },
    ])
  })

  it("returns empty array when no genres meet threshold", async () => {
    // Query 1: No genres
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 2-3: Empty
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    expect(result).toEqual([])
  })

  it("generates correct slugs for genre names", async () => {
    // Query 1: Genre with special characters
    mockQuery.mockResolvedValueOnce({
      rows: [{ genre: "Science Fiction", count: "75" }],
    })

    // Query 2-3: Empty
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    expect(result[0].slug).toBe("science-fiction")
  })

  it("runs exactly 3 queries", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getGenreCategories()

    expect(mockQuery).toHaveBeenCalledTimes(3)
  })
})
