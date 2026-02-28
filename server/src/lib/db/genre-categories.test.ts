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

    // Query 3: Featured actor candidates per genre (multiple per genre for dedup)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          genre: "Action",
          id: 1001,
          tmdb_id: 1001,
          name: "Bruce Willis",
          profile_path: "/bruce.jpg",
          fallback_profile_url: null,
          cause_of_death: "Frontotemporal dementia",
        },
        {
          genre: "Drama",
          id: 2002,
          tmdb_id: 2002,
          name: "Philip Seymour Hoffman",
          profile_path: "/philip.jpg",
          fallback_profile_url: "https://example.com/philip.jpg",
          cause_of_death: "Drug overdose",
        },
      ],
    })

    // Query 4: Top causes per genre
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
      featuredActor: {
        id: 2002,
        tmdbId: 2002,
        name: "Philip Seymour Hoffman",
        profilePath: "/philip.jpg",
        fallbackProfileUrl: "https://example.com/philip.jpg",
        causeOfDeath: "Drug overdose",
      },
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
      featuredActor: {
        id: 1001,
        tmdbId: 1001,
        name: "Bruce Willis",
        profilePath: "/bruce.jpg",
        fallbackProfileUrl: null,
        causeOfDeath: "Frontotemporal dementia",
      },
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

  it("deduplicates movies and actors across genres", async () => {
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

    // Query 3: Same actor (Robin Williams) is top candidate for both genres
    mockQuery.mockResolvedValueOnce({
      rows: [
        // Drama candidates
        {
          genre: "Drama",
          id: 7468,
          tmdb_id: 2157,
          name: "Robin Williams",
          profile_path: "/robin.jpg",
          fallback_profile_url: null,
          cause_of_death: "Suicide",
        },
        {
          genre: "Drama",
          id: 1001,
          tmdb_id: 1001,
          name: "Philip Seymour Hoffman",
          profile_path: "/philip.jpg",
          fallback_profile_url: null,
          cause_of_death: "Drug overdose",
        },
        // Comedy candidates — Robin Williams also top here
        {
          genre: "Comedy",
          id: 7468,
          tmdb_id: 2157,
          name: "Robin Williams",
          profile_path: "/robin.jpg",
          fallback_profile_url: null,
          cause_of_death: "Suicide",
        },
        {
          genre: "Comedy",
          id: 2002,
          tmdb_id: 2002,
          name: "John Candy",
          profile_path: "/candy.jpg",
          fallback_profile_url: null,
          cause_of_death: "Heart attack",
        },
      ],
    })

    // Query 4: Causes
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    // Drama (highest count) gets Titanic and Robin Williams
    expect(result[0].topMovie?.title).toBe("Titanic")
    expect(result[0].featuredActor?.name).toBe("Robin Williams")

    // Comedy gets the next available: The Hangover and John Candy
    expect(result[1].topMovie?.title).toBe("The Hangover")
    expect(result[1].featuredActor?.name).toBe("John Candy")
  })

  it("returns null for missing featured actor and top movie", async () => {
    // Query 1: Genre counts
    mockQuery.mockResolvedValueOnce({
      rows: [{ genre: "Western", count: "10" }],
    })

    // Query 2: No top movie
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 3: No featured actor
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 4: No causes
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      genre: "Western",
      count: 10,
      slug: "western",
      featuredActor: null,
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

    // Query 3: Featured actor
    mockQuery.mockResolvedValueOnce({ rows: [] })

    // Query 4: Causes
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

    // Query 2-4: Empty
    mockQuery.mockResolvedValueOnce({ rows: [] })
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

    // Query 2-4: Empty
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await getGenreCategories()

    expect(result[0].slug).toBe("science-fiction")
  })

  it("runs exactly 4 queries", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getGenreCategories()

    expect(mockQuery).toHaveBeenCalledTimes(4)
  })
})
