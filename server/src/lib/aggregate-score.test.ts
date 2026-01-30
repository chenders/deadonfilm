import { describe, it, expect } from "vitest"
import {
  normalizeRating,
  confidenceFactor,
  applyBayesianAdjustment,
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

  describe("applyBayesianAdjustment", () => {
    it("keeps high confidence scores close to raw score", () => {
      // With confidence 0.9 and minConfidence 0.4:
      // adjusted = (0.9 / 1.3) * 9.0 + (0.4 / 1.3) * 6.5 = 6.23 + 2.0 = 8.23
      const adjusted = applyBayesianAdjustment(9.0, 0.9)
      expect(adjusted).toBeGreaterThan(8.0)
      expect(adjusted).toBeLessThan(9.0)
    })

    it("pulls low confidence scores toward prior mean", () => {
      // With confidence 0.1 and minConfidence 0.4:
      // adjusted = (0.1 / 0.5) * 10.0 + (0.4 / 0.5) * 6.5 = 2.0 + 5.2 = 7.2
      const adjusted = applyBayesianAdjustment(10.0, 0.1)
      expect(adjusted).toBeCloseTo(7.2, 1)
    })

    it("produces intermediate result for medium confidence", () => {
      // With confidence 0.5 and minConfidence 0.4:
      // adjusted = (0.5 / 0.9) * 8.0 + (0.4 / 0.9) * 6.5 ≈ 4.44 + 2.89 = 7.33
      const adjusted = applyBayesianAdjustment(8.0, 0.5)
      expect(adjusted).toBeGreaterThan(7.0)
      expect(adjusted).toBeLessThan(8.0)
    })

    it("returns prior mean for zero confidence", () => {
      // With confidence 0 and minConfidence 0.4:
      // adjusted = (0 / 0.4) * 10.0 + (0.4 / 0.4) * 6.5 = 0 + 6.5 = 6.5
      const adjusted = applyBayesianAdjustment(10.0, 0)
      expect(adjusted).toBe(6.5)
    })

    it("returns raw score for very high confidence (1.0)", () => {
      // With confidence 1.0 and minConfidence 0.4:
      // adjusted = (1.0 / 1.4) * 8.0 + (0.4 / 1.4) * 6.5 ≈ 5.71 + 1.86 = 7.57
      const adjusted = applyBayesianAdjustment(8.0, 1.0)
      // Even at full confidence, there's slight regression
      expect(adjusted).toBeGreaterThan(7.5)
      expect(adjusted).toBeLessThan(8.0)
    })

    it("allows custom prior mean", () => {
      // With prior mean 5.0 instead of 6.5
      const adjusted = applyBayesianAdjustment(10.0, 0.1, 5.0)
      // Should pull toward 5.0 instead of 6.5
      expect(adjusted).toBeLessThan(applyBayesianAdjustment(10.0, 0.1, 6.5))
    })

    it("allows custom minConfidence threshold", () => {
      // Higher minConfidence = more aggressive regression
      const lessAggressive = applyBayesianAdjustment(10.0, 0.5, 6.5, 0.2)
      const moreAggressive = applyBayesianAdjustment(10.0, 0.5, 6.5, 0.8)
      expect(lessAggressive).toBeGreaterThan(moreAggressive)
    })

    it("rounds to 2 decimal places", () => {
      const adjusted = applyBayesianAdjustment(7.333333, 0.5)
      expect(adjusted.toString()).toMatch(/^\d+\.\d{1,2}$/)
    })

    it("pulls low ratings up toward prior mean", () => {
      // Low rating with low confidence should be pulled UP toward 6.5
      const adjusted = applyBayesianAdjustment(3.0, 0.1)
      expect(adjusted).toBeGreaterThan(3.0)
      expect(adjusted).toBeLessThan(6.5)
    })
  })

  describe("calculateAggregateScore", () => {
    it("returns null score when no ratings provided", () => {
      const result = calculateAggregateScore([])
      expect(result.score).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.sourcesUsed).toBe(0)
    })

    it("calculates score from single source with Bayesian adjustment", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 },
      ]
      const result = calculateAggregateScore(ratings)

      // With full confidence (1.0), Bayesian adjustment still pulls slightly toward 6.5
      // adjusted = (1.0 / 1.4) * 8.0 + (0.4 / 1.4) * 6.5 ≈ 7.57
      expect(result.score).toBeCloseTo(7.57, 1)
      expect(result.sourcesUsed).toBe(1)
      expect(result.confidence).toBe(1.0)
    })

    it("calculates weighted average from multiple sources with Bayesian adjustment", () => {
      const ratings: RatingInput[] = [
        { source: "imdb", rating: 8.0, scale: "decimal", votes: 10000 }, // weight 0.30
        { source: "rottenTomatoes", rating: 90, scale: "percent", votes: null }, // weight 0.25, normalized to 9.0
      ]
      const result = calculateAggregateScore(ratings)

      // Raw weighted = ~8.08, but confidence is ~0.56 (not all sources have votes)
      // Bayesian adjustment pulls toward 6.5, so final score is lower than raw
      expect(result.score).toBeGreaterThan(7.0)
      expect(result.score).toBeLessThan(8.0)
      expect(result.sourcesUsed).toBe(2)
    })

    it("penalizes sources with low vote counts via Bayesian adjustment", () => {
      const highVotesRating: RatingInput[] = [
        { source: "imdb", rating: 5.0, scale: "decimal", votes: 10000 },
      ]
      const lowVotesRating: RatingInput[] = [
        { source: "imdb", rating: 5.0, scale: "decimal", votes: 100 },
      ]

      const highVotesResult = calculateAggregateScore(highVotesRating)
      const lowVotesResult = calculateAggregateScore(lowVotesRating)

      // With Bayesian adjustment, lower confidence = score pulled more toward 6.5
      // A 5.0 rating is below the prior mean, so low confidence pulls it UP toward 6.5
      expect(lowVotesResult.score).toBeGreaterThan(highVotesResult.score!)
      expect(highVotesResult.confidence).toBeGreaterThan(lowVotesResult.confidence)
    })

    it("handles all sources with full confidence (Bayesian adjusted)", () => {
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
      // Raw weighted average = 7.5
      // With full confidence (1.0), Bayesian pulls slightly toward 6.5
      // adjusted = (1.0 / 1.4) * 7.5 + (0.4 / 1.4) * 6.5 ≈ 7.21
      expect(result.score).toBeCloseTo(7.21, 1)
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
      // Raw 8.0 with full confidence gets Bayesian adjusted to ~7.57
      expect(result.score).toBeCloseTo(7.57, 1)
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

      // Raw 7.33 with full confidence gets Bayesian adjusted
      // Result should still be rounded to 2 decimal places
      expect(result.score?.toString()).toMatch(/^\d+\.\d{1,2}$/)
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
    it("calculates score for a well-rated movie (with Bayesian adjustment)", () => {
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

      // Raw weighted average is high (~8.5), but confidence is only ~0.5
      // Bayesian adjustment pulls toward 6.5, resulting in score ~7.5-8.0
      expect(result.score).toBeGreaterThan(7.0)
      expect(result.score).toBeLessThan(8.5)
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
