import { describe, it, expect, beforeEach, vi } from "vitest"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("calculate-aggregate-scores query building logic", () => {
  describe("movie query", () => {
    interface QueryOptions {
      limit?: number
    }

    function buildMovieQuery(options: QueryOptions): { query: string; params: number[] } {
      const baseQuery = `
        SELECT
          tmdb_id, title, vote_average,
          omdb_imdb_rating, omdb_imdb_votes,
          omdb_rotten_tomatoes_score, omdb_metacritic_score,
          trakt_rating, trakt_votes
        FROM movies
        WHERE vote_average IS NOT NULL
           OR omdb_imdb_rating IS NOT NULL
           OR omdb_rotten_tomatoes_score IS NOT NULL
           OR omdb_metacritic_score IS NOT NULL
           OR trakt_rating IS NOT NULL
        ORDER BY popularity DESC NULLS LAST
      `
      const query = options.limit ? `${baseQuery} LIMIT $1` : baseQuery
      const params = options.limit ? [options.limit] : []
      return { query, params }
    }

    it("builds basic query without limit", () => {
      const { query, params } = buildMovieQuery({})
      expect(query).toContain("SELECT")
      expect(query).toContain("FROM movies")
      expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
      expect(query).not.toContain("LIMIT")
      expect(params).toEqual([])
    })

    it("adds limit clause when limit is provided", () => {
      const { query, params } = buildMovieQuery({ limit: 100 })
      expect(query).toContain("LIMIT $1")
      expect(params).toEqual([100])
    })

    it("includes all rating source conditions in WHERE clause", () => {
      const { query } = buildMovieQuery({})
      expect(query).toContain("vote_average IS NOT NULL")
      expect(query).toContain("omdb_imdb_rating IS NOT NULL")
      expect(query).toContain("omdb_rotten_tomatoes_score IS NOT NULL")
      expect(query).toContain("omdb_metacritic_score IS NOT NULL")
      expect(query).toContain("trakt_rating IS NOT NULL")
    })

    it("selects all required rating columns", () => {
      const { query } = buildMovieQuery({})
      expect(query).toContain("tmdb_id")
      expect(query).toContain("title")
      expect(query).toContain("vote_average")
      expect(query).toContain("omdb_imdb_rating")
      expect(query).toContain("omdb_imdb_votes")
      expect(query).toContain("omdb_rotten_tomatoes_score")
      expect(query).toContain("omdb_metacritic_score")
      expect(query).toContain("trakt_rating")
      expect(query).toContain("trakt_votes")
    })
  })

  describe("show query", () => {
    interface QueryOptions {
      limit?: number
    }

    function buildShowQuery(options: QueryOptions): { query: string; params: number[] } {
      const baseQuery = `
        SELECT
          tmdb_id, name, vote_average,
          omdb_imdb_rating, omdb_imdb_votes,
          omdb_rotten_tomatoes_score, omdb_metacritic_score,
          trakt_rating, trakt_votes,
          thetvdb_score
        FROM shows
        WHERE vote_average IS NOT NULL
           OR omdb_imdb_rating IS NOT NULL
           OR omdb_rotten_tomatoes_score IS NOT NULL
           OR omdb_metacritic_score IS NOT NULL
           OR trakt_rating IS NOT NULL
           OR thetvdb_score IS NOT NULL
        ORDER BY popularity DESC NULLS LAST
      `
      const query = options.limit ? `${baseQuery} LIMIT $1` : baseQuery
      const params = options.limit ? [options.limit] : []
      return { query, params }
    }

    it("builds basic query without limit", () => {
      const { query, params } = buildShowQuery({})
      expect(query).toContain("SELECT")
      expect(query).toContain("FROM shows")
      expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
      expect(query).not.toContain("LIMIT")
      expect(params).toEqual([])
    })

    it("adds limit clause when limit is provided", () => {
      const { query, params } = buildShowQuery({ limit: 50 })
      expect(query).toContain("LIMIT $1")
      expect(params).toEqual([50])
    })

    it("includes thetvdb_score for shows", () => {
      const { query } = buildShowQuery({})
      expect(query).toContain("thetvdb_score")
      expect(query).toContain("thetvdb_score IS NOT NULL")
    })

    it("selects name column for shows instead of title", () => {
      const { query } = buildShowQuery({})
      expect(query).toContain("name")
      expect(query).not.toMatch(/\btitle\b/)
    })
  })
})

describe("calculate-aggregate-scores options validation", () => {
  it("does not allow both movies-only and shows-only", () => {
    interface Options {
      moviesOnly: boolean
      showsOnly: boolean
    }

    function validateOptions(options: Options): boolean {
      if (options.moviesOnly && options.showsOnly) {
        return false
      }
      return true
    }

    expect(validateOptions({ moviesOnly: true, showsOnly: false })).toBe(true)
    expect(validateOptions({ moviesOnly: false, showsOnly: true })).toBe(true)
    expect(validateOptions({ moviesOnly: false, showsOnly: false })).toBe(true)
    expect(validateOptions({ moviesOnly: true, showsOnly: true })).toBe(false)
  })
})
