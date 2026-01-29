import { describe, it, expect } from "vitest"
import {
  normalizeRating,
  confidenceFactor,
  calculateAggregateScore,
  calculateControversy,
  buildMovieRatingInputs,
  buildShowRatingInputs,
  isControversial,
  type RatingInput,
} from "./aggregate-score.js"

describe("aggregate-score", () => {
  describe("normalizeRating", () => {
    it("keeps decimal scale ratings unchanged (0-10)", () => {
      expect(normalizeRating(7.5, "decimal")).toBe(7.5)
      expect(normalizeRating(10, "decimal")).toBe(10)
      expect(normalizeRating(0, "decimal")).toBe(0)
    })

    it("converts percent scale ratings to decimal (0-100 -> 0-10)", () => {
      expect(normalizeRating(75, "percent")).toBe(7.5)
      expect(normalizeRating(100, "percent")).toBe(10)
      expect(normalizeRating(0, "percent")).toBe(0)
      expect(normalizeRating(83, "percent")).toBe(8.3)
    })

    it("clamps values outside valid range", () => {
      expect(normalizeRating(-5, "decimal")).toBe(0)
      expect(normalizeRating(15, "decimal")).toBe(10)
      expect(normalizeRating(-10, "percent")).toBe(0)
      expect(normalizeRating(150, "percent")).toBe(10)
    })
  })

  describe("confidenceFactor", () => {
    it("returns minimal confidence for null votes", () => {
      expect(confidenceFactor(null)).toBe(0.1)
    })

    it("returns minimal confidence for zero votes", () => {
      expect(confidenceFactor(0)).toBe(0.1)
    })

    it("returns minimal confidence for negative votes", () => {
      expect(confidenceFactor(-100)).toBe(0.1)
    })

    it("returns proportional confidence for low vote counts", () => {
      expect(confidenceFactor(1000)).toBe(0.1)
      expect(confidenceFactor(5000)).toBe(0.5)
    })

    it("returns full confidence at threshold (10,000 votes)", () => {
      expect(confidenceFactor(10000)).toBe(1.0)
    })

    it("caps at 1.0 for high vote counts", () => {
      expect(confidenceFactor(50000)).toBe(1.0)
      expect(confidenceFactor(1000000)).toBe(1.0)
    })
  })

  describe("calculateAggregateScore", () => {
    it("returns null score when no ratings provided", () => {
      const result = calculateAggregateScore([])
      expect(result.score).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.sourcesUsed).toBe(0)
    })

    it("calculates score from single source", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 },
      ]
      const result = calculateAggregateScore(ratings)

      expect(result.score).toBe(8.0)
      expect(result.sourcesUsed).toBe(1)
      expect(result.confidence).toBe(1.0)
    })

    it("calculates weighted average from multiple sources", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 }, // weight 0.30
        { source: "rottenTomatoes", rating: 90, scale: "percent", votes: null }, // weight 0.25, normalized to 9.0
      ]
      const result = calculateAggregateScore(ratings)

      // With full confidence on IMDb (0.30) and minimal confidence on RT (0.25 * 0.1 = 0.025)
      // weighted = (8.0 * 0.30 + 9.0 * 0.025) / (0.30 + 0.025) = (2.4 + 0.225) / 0.325 ≈ 8.08
      expect(result.score).toBeGreaterThan(8.0)
      expect(result.score).toBeLessThan(8.2)
      expect(result.sourcesUsed).toBe(2)
    })

    it("penalizes sources with low vote counts", () => {
      const highVotesRating: RatingInput[] = [
        { source: "imdb", rating: 5.0, scale: "decimal", votes: 10000 },
      ]
      const lowVotesRating: RatingInput[] = [
        { source: "imdb", rating: 5.0, scale: "decimal", votes: 100 },
      ]

      const highVotesResult = calculateAggregateScore(highVotesRating)
      const lowVotesResult = calculateAggregateScore(lowVotesRating)

      // Same score, but different confidence
      expect(highVotesResult.score).toBe(lowVotesResult.score)
      expect(highVotesResult.confidence).toBeGreaterThan(lowVotesResult.confidence)
    })

    it("handles all sources with full confidence", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 },
        { source: "rottenTomatoes", rating: 75, scale: "percent", votes: 10000 },
        { source: "metacritic", rating: 70, scale: "percent", votes: 10000 },
        { source: "trakt", rating: 7.5, scale: "decimal", votes: 10000 },
        { source: "tmdb", rating: 7.0, scale: "decimal", votes: 10000 },
      ]
      const result = calculateAggregateScore(ratings)

      expect(result.sourcesUsed).toBe(5)
      expect(result.confidence).toBe(1.0)
      // Weighted average of: 8.0*0.30 + 7.5*0.25 + 7.0*0.20 + 7.5*0.15 + 7.0*0.10
      // = 2.4 + 1.875 + 1.4 + 1.125 + 0.7 = 7.5
      expect(result.score).toBeCloseTo(7.5, 1)
    })

    it("filters out null/undefined ratings", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 },
        {
          source: "rottenTomatoes",
          rating: null as unknown as number,
          scale: "percent",
          votes: null,
        },
        {
          source: "metacritic",
          rating: undefined as unknown as number,
          scale: "percent",
          votes: null,
        },
      ]
      const result = calculateAggregateScore(ratings)

      expect(result.sourcesUsed).toBe(1)
      expect(result.score).toBe(8.0)
    })

    it("filters out NaN ratings", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 },
        { source: "rottenTomatoes", rating: NaN, scale: "percent", votes: null },
      ]
      const result = calculateAggregateScore(ratings)

      expect(result.sourcesUsed).toBe(1)
    })

    it("rounds score to 2 decimal places", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 7.333333, scale: "decimal", votes: 10000 },
      ]
      const result = calculateAggregateScore(ratings)

      expect(result.score).toBe(7.33)
    })
  })

  describe("calculateControversy", () => {
    it("returns null for empty array", () => {
      expect(calculateControversy([])).toBeNull()
    })

    it("returns null for single rating", () => {
      expect(calculateControversy([8.0])).toBeNull()
    })

    it("returns 0 for identical ratings", () => {
      expect(calculateControversy([8.0, 8.0, 8.0])).toBe(0)
    })

    it("returns low controversy for similar ratings", () => {
      const controversy = calculateControversy([7.8, 8.0, 8.2])
      expect(controversy).toBeLessThan(0.5)
    })

    it("returns high controversy for divergent ratings", () => {
      // Critics love it (9.0), audience hates it (3.0)
      const controversy = calculateControversy([9.0, 3.0])
      expect(controversy).toBeGreaterThan(2.5)
    })

    it("rounds to 2 decimal places", () => {
      const controversy = calculateControversy([7.0, 8.0, 9.0])
      // Standard deviation of [7, 8, 9] = sqrt(2/3) ≈ 0.816
      expect(controversy).toBe(0.82)
    })
  })

  describe("buildMovieRatingInputs", () => {
    it("builds inputs from complete movie record", () => {
      const record = {
        vote_average: 7.5,
        omdb_imdb_rating: 8.0,
        omdb_imdb_votes: 50000,
        omdb_rotten_tomatoes_score: 85,
        omdb_metacritic_score: 75,
        trakt_rating: 7.8,
        trakt_votes: 10000,
      }

      const inputs = buildMovieRatingInputs(record)

      expect(inputs).toHaveLength(5)
      expect(inputs.find((i) => i.source === "tmdb")?.rating).toBe(7.5)
      expect(inputs.find((i) => i.source === "imdb")?.rating).toBe(8.0)
      expect(inputs.find((i) => i.source === "imdb")?.votes).toBe(50000)
      expect(inputs.find((i) => i.source === "rottenTomatoes")?.rating).toBe(85)
      expect(inputs.find((i) => i.source === "rottenTomatoes")?.scale).toBe("percent")
      expect(inputs.find((i) => i.source === "metacritic")?.rating).toBe(75)
      expect(inputs.find((i) => i.source === "trakt")?.rating).toBe(7.8)
    })

    it("skips null/undefined values", () => {
      const record = {
        vote_average: 7.5,
        omdb_imdb_rating: null,
        omdb_imdb_votes: null,
        omdb_rotten_tomatoes_score: undefined,
        omdb_metacritic_score: null,
        trakt_rating: null,
        trakt_votes: null,
      }

      const inputs = buildMovieRatingInputs(record)

      expect(inputs).toHaveLength(1)
      expect(inputs[0].source).toBe("tmdb")
    })

    it("handles empty record", () => {
      const record = {}
      const inputs = buildMovieRatingInputs(record)
      expect(inputs).toHaveLength(0)
    })
  })

  describe("buildShowRatingInputs", () => {
    it("includes TheTVDB score for shows", () => {
      const record = {
        vote_average: 7.5,
        omdb_imdb_rating: 8.0,
        omdb_imdb_votes: 50000,
        thetvdb_score: 8.5,
      }

      const inputs = buildShowRatingInputs(record)

      expect(inputs).toHaveLength(3)
      const thetvdbInput = inputs.find((i) => i.source === "thetvdb")
      expect(thetvdbInput).toBeDefined()
      expect(thetvdbInput?.rating).toBe(8.5)
      expect(thetvdbInput?.scale).toBe("decimal")
    })

    it("includes all movie ratings plus TheTVDB", () => {
      const record = {
        vote_average: 7.5,
        omdb_imdb_rating: 8.0,
        omdb_imdb_votes: 50000,
        omdb_rotten_tomatoes_score: 85,
        omdb_metacritic_score: 75,
        trakt_rating: 7.8,
        trakt_votes: 10000,
        thetvdb_score: 8.5,
      }

      const inputs = buildShowRatingInputs(record)

      expect(inputs).toHaveLength(6)
      expect(inputs.map((i) => i.source)).toContain("thetvdb")
    })
  })

  describe("isControversial", () => {
    it("returns false for null controversy", () => {
      expect(isControversial(null)).toBe(false)
    })

    it("returns false for low controversy", () => {
      expect(isControversial(0.5)).toBe(false)
      expect(isControversial(1.0)).toBe(false)
      expect(isControversial(1.4)).toBe(false)
    })

    it("returns true for high controversy (>= 1.5)", () => {
      expect(isControversial(1.5)).toBe(true)
      expect(isControversial(2.0)).toBe(true)
      expect(isControversial(3.0)).toBe(true)
    })
  })

  describe("integration: calculateAggregateScore with buildMovieRatingInputs", () => {
    it("calculates score for a well-rated movie", () => {
      const movie = {
        vote_average: 8.2,
        omdb_imdb_rating: 8.5,
        omdb_imdb_votes: 500000,
        omdb_rotten_tomatoes_score: 92,
        omdb_metacritic_score: 85,
        trakt_rating: 8.3,
        trakt_votes: 50000,
      }

      const inputs = buildMovieRatingInputs(movie)
      const result = calculateAggregateScore(inputs)

      expect(result.score).toBeGreaterThan(8.0)
      expect(result.score).toBeLessThan(9.0)
      expect(result.sourcesUsed).toBe(5)
      // Confidence is ~0.5 because RT, Metacritic, and TMDB don't have vote counts
      // Only IMDb (0.30) and Trakt (0.15) have full confidence
      expect(result.confidence).toBeGreaterThan(0.4)
      expect(result.confidence).toBeLessThan(0.6)
    })

    it("calculates score for a controversial movie", () => {
      // Critics hate it, audiences love it
      const movie = {
        vote_average: 7.0,
        omdb_imdb_rating: 7.5,
        omdb_imdb_votes: 100000,
        omdb_rotten_tomatoes_score: 25, // Critics: 2.5/10
        omdb_metacritic_score: 30, // Critics: 3.0/10
        trakt_rating: 7.8,
        trakt_votes: 20000,
      }

      const inputs = buildMovieRatingInputs(movie)
      const result = calculateAggregateScore(inputs)

      expect(result.controversy).toBeGreaterThan(1.5)
      expect(isControversial(result.controversy)).toBe(true)
    })

    it("calculates score for a movie with limited data", () => {
      const movie = {
        vote_average: 6.5,
        omdb_imdb_rating: null,
        omdb_imdb_votes: null,
      }

      const inputs = buildMovieRatingInputs(movie)
      const result = calculateAggregateScore(inputs)

      expect(result.score).toBe(6.5)
      expect(result.sourcesUsed).toBe(1)
      // Low confidence because only TMDB (weight 0.10) with unknown votes
      expect(result.confidence).toBeLessThan(0.2)
    })
  })
})
