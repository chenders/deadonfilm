import { describe, it, expect } from "vitest"
import {
  buildMovieRecord,
  calculateAgeAtFilming,
  buildActorMovieAppearanceRecord,
} from "./movie-cache.js"

describe("movie-cache", () => {
  describe("buildMovieRecord", () => {
    it("builds a complete movie record with all fields", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: "2020-06-15",
          poster_path: "/poster.jpg",
          genres: [
            { id: 1, name: "Action" },
            { id: 2, name: "Drama" },
          ],
        },
        deceasedCount: 3,
        livingCount: 7,
        expectedDeaths: 2.5,
        mortalitySurpriseScore: 0.2,
      })

      expect(result.tmdb_id).toBe(12345)
      expect(result.title).toBe("Test Movie")
      expect(result.release_date).toBe("2020-06-15")
      expect(result.release_year).toBe(2020)
      expect(result.poster_path).toBe("/poster.jpg")
      expect(result.genres).toEqual(["Action", "Drama"])
      expect(result.popularity).toBeNull()
      expect(result.vote_average).toBeNull()
      expect(result.cast_count).toBe(10)
      expect(result.deceased_count).toBe(3)
      expect(result.living_count).toBe(7)
      expect(result.expected_deaths).toBe(2.5)
      expect(result.mortality_surprise_score).toBe(0.2)
    })

    it("handles missing release date", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: null,
          poster_path: null,
          genres: [],
        },
        deceasedCount: 0,
        livingCount: 5,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.release_date).toBeNull()
      expect(result.release_year).toBeNull()
    })

    it("handles empty genres array", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: "2020-01-01",
          poster_path: null,
        },
        deceasedCount: 0,
        livingCount: 5,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.genres).toEqual([])
    })

    it("handles undefined genres", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: "2020-01-01",
          poster_path: null,
          genres: undefined,
        },
        deceasedCount: 0,
        livingCount: 5,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.genres).toEqual([])
    })

    it("extracts release year from release date", () => {
      const result = buildMovieRecord({
        movie: {
          id: 1,
          title: "Test",
          release_date: "1985-07-03",
          poster_path: null,
        },
        deceasedCount: 0,
        livingCount: 1,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.release_year).toBe(1985)
    })

    it("extracts production_countries ISO codes from TMDB format", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "International Film",
          release_date: "2020-01-01",
          poster_path: null,
          production_countries: [
            { iso_3166_1: "US", name: "United States of America" },
            { iso_3166_1: "GB", name: "United Kingdom" },
            { iso_3166_1: "CA", name: "Canada" },
          ],
        },
        deceasedCount: 1,
        livingCount: 9,
        expectedDeaths: 0.5,
        mortalitySurpriseScore: 1.0,
      })

      expect(result.production_countries).toEqual(["US", "GB", "CA"])
    })

    it("handles undefined production_countries", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: "2020-01-01",
          poster_path: null,
        },
        deceasedCount: 0,
        livingCount: 5,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.production_countries).toBeNull()
    })

    it("handles empty production_countries array", () => {
      const result = buildMovieRecord({
        movie: {
          id: 12345,
          title: "Test Movie",
          release_date: "2020-01-01",
          poster_path: null,
          production_countries: [],
        },
        deceasedCount: 0,
        livingCount: 5,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      })

      expect(result.production_countries).toEqual([])
    })
  })

  describe("calculateAgeAtFilming", () => {
    it("calculates age correctly", () => {
      expect(calculateAgeAtFilming("1980-05-15", 2020)).toBe(40)
      expect(calculateAgeAtFilming("1950-01-01", 2000)).toBe(50)
      expect(calculateAgeAtFilming("1999-12-31", 2024)).toBe(25)
    })

    it("returns null when birthday is null", () => {
      expect(calculateAgeAtFilming(null, 2020)).toBeNull()
    })

    it("returns null when release year is null", () => {
      expect(calculateAgeAtFilming("1980-05-15", null)).toBeNull()
    })

    it("returns null when both are null", () => {
      expect(calculateAgeAtFilming(null, null)).toBeNull()
    })

    it("handles invalid birthday format", () => {
      expect(calculateAgeAtFilming("invalid-date", 2020)).toBeNull()
    })

    it("handles negative age (future birthday)", () => {
      // This is an edge case - birthday after release year
      expect(calculateAgeAtFilming("2025-01-01", 2020)).toBe(-5)
    })
  })

  describe("buildActorMovieAppearanceRecord", () => {
    it("builds a complete actor movie appearance record", () => {
      const result = buildActorMovieAppearanceRecord({
        actorId: 999,
        character: "The Hero",
        movieId: 12345,
        billingOrder: 0,
        releaseYear: 2020,
        birthday: "1980-03-20",
      })

      expect(result.actor_id).toBe(999)
      expect(result.movie_tmdb_id).toBe(12345)
      expect(result.character_name).toBe("The Hero")
      expect(result.billing_order).toBe(0)
      expect(result.age_at_filming).toBe(40)
      expect(result.appearance_type).toBe("regular")
    })

    it("handles null character name", () => {
      const result = buildActorMovieAppearanceRecord({
        actorId: 999,
        character: null,
        movieId: 12345,
        billingOrder: 5,
        releaseYear: 2020,
        birthday: "1980-03-20",
      })

      expect(result.character_name).toBeNull()
    })

    it("handles missing birthday", () => {
      const result = buildActorMovieAppearanceRecord({
        actorId: 999,
        character: "Villain",
        movieId: 12345,
        billingOrder: 1,
        releaseYear: 2020,
        birthday: null,
      })

      expect(result.age_at_filming).toBeNull()
    })

    it("handles missing release year", () => {
      const result = buildActorMovieAppearanceRecord({
        actorId: 999,
        character: "Villain",
        movieId: 12345,
        billingOrder: 1,
        releaseYear: null,
        birthday: "1980-03-20",
      })

      expect(result.age_at_filming).toBeNull()
    })

    it("calculates age at filming correctly", () => {
      const result = buildActorMovieAppearanceRecord({
        actorId: 999,
        character: "Supporting",
        movieId: 12345,
        billingOrder: 3,
        releaseYear: 2010,
        birthday: "1930-05-10",
      })

      expect(result.age_at_filming).toBe(80)
    })
  })
})
