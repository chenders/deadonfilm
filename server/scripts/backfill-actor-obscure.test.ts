import { describe, it, expect } from "vitest"
import { THRESHOLDS } from "./backfill-actor-obscure.js"

describe("backfill-actor-obscure constants", () => {
  it("exports threshold constants", () => {
    expect(THRESHOLDS).toEqual({
      HIT_MOVIE_POPULARITY: 20,
      HIT_SHOW_POPULARITY: 20,
      ENGLISH_CONTENT_POPULARITY: 5,
      MIN_ENGLISH_MOVIES: 3,
      MIN_ENGLISH_SHOWS: 3,
      MIN_TOTAL_MOVIES: 10,
      MIN_TOTAL_EPISODES: 50,
    })
  })
})

describe("is_obscure calculation logic", () => {
  // Tests the logic used in the backfill script:
  // An actor is NOT obscure if ANY of these conditions are true:
  // - Has a movie with popularity >= 20 (hit film)
  // - Has a TV show with popularity >= 20 (hit show)
  // - Has 3+ English movies with popularity >= 5
  // - Has 3+ English TV shows with popularity >= 5
  // - Has 10+ movies total
  // - Has 50+ TV episodes total

  interface ActorMetrics {
    maxMoviePop: number
    maxShowPop: number
    enMoviesPop5: number
    enShowsPop5: number
    movieCount: number
    episodeCount: number
  }

  function isObscure(metrics: ActorMetrics): boolean {
    if (metrics.maxMoviePop >= THRESHOLDS.HIT_MOVIE_POPULARITY) return false
    if (metrics.maxShowPop >= THRESHOLDS.HIT_SHOW_POPULARITY) return false
    if (metrics.enMoviesPop5 >= THRESHOLDS.MIN_ENGLISH_MOVIES) return false
    if (metrics.enShowsPop5 >= THRESHOLDS.MIN_ENGLISH_SHOWS) return false
    if (metrics.movieCount >= THRESHOLDS.MIN_TOTAL_MOVIES) return false
    if (metrics.episodeCount >= THRESHOLDS.MIN_TOTAL_EPISODES) return false
    return true
  }

  const defaultMetrics: ActorMetrics = {
    maxMoviePop: 0,
    maxShowPop: 0,
    enMoviesPop5: 0,
    enShowsPop5: 0,
    movieCount: 0,
    episodeCount: 0,
  }

  describe("hit movie condition", () => {
    it("marks actor as NOT obscure when they have a hit movie (pop >= 20)", () => {
      expect(isObscure({ ...defaultMetrics, maxMoviePop: 20 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, maxMoviePop: 100 })).toBe(false)
    })

    it("does not satisfy condition with movie pop < 20", () => {
      expect(isObscure({ ...defaultMetrics, maxMoviePop: 19.9 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, maxMoviePop: 10 })).toBe(true)
    })
  })

  describe("hit TV show condition", () => {
    it("marks actor as NOT obscure when they have a hit TV show (pop >= 20)", () => {
      expect(isObscure({ ...defaultMetrics, maxShowPop: 20 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, maxShowPop: 144 })).toBe(false)
    })

    it("does not satisfy condition with show pop < 20", () => {
      expect(isObscure({ ...defaultMetrics, maxShowPop: 19.9 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, maxShowPop: 15 })).toBe(true)
    })
  })

  describe("English movies condition", () => {
    it("marks actor as NOT obscure with 3+ English movies (pop >= 5)", () => {
      expect(isObscure({ ...defaultMetrics, enMoviesPop5: 3 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, enMoviesPop5: 10 })).toBe(false)
    })

    it("does not satisfy condition with < 3 English movies", () => {
      expect(isObscure({ ...defaultMetrics, enMoviesPop5: 2 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, enMoviesPop5: 0 })).toBe(true)
    })
  })

  describe("English TV shows condition", () => {
    it("marks actor as NOT obscure with 3+ English TV shows (pop >= 5)", () => {
      expect(isObscure({ ...defaultMetrics, enShowsPop5: 3 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, enShowsPop5: 5 })).toBe(false)
    })

    it("does not satisfy condition with < 3 English TV shows", () => {
      expect(isObscure({ ...defaultMetrics, enShowsPop5: 2 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, enShowsPop5: 0 })).toBe(true)
    })
  })

  describe("prolific film actor condition", () => {
    it("marks actor as NOT obscure with 10+ movies total", () => {
      expect(isObscure({ ...defaultMetrics, movieCount: 10 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, movieCount: 50 })).toBe(false)
    })

    it("does not satisfy condition with < 10 movies", () => {
      expect(isObscure({ ...defaultMetrics, movieCount: 9 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, movieCount: 5 })).toBe(true)
    })
  })

  describe("prolific TV actor condition", () => {
    it("marks actor as NOT obscure with 50+ TV episodes", () => {
      expect(isObscure({ ...defaultMetrics, episodeCount: 50 })).toBe(false)
      expect(isObscure({ ...defaultMetrics, episodeCount: 200 })).toBe(false)
    })

    it("does not satisfy condition with < 50 episodes", () => {
      expect(isObscure({ ...defaultMetrics, episodeCount: 49 })).toBe(true)
      expect(isObscure({ ...defaultMetrics, episodeCount: 10 })).toBe(true)
    })
  })

  describe("combined conditions", () => {
    it("marks as NOT obscure when multiple conditions are met", () => {
      expect(
        isObscure({
          maxMoviePop: 30,
          maxShowPop: 50,
          enMoviesPop5: 5,
          enShowsPop5: 4,
          movieCount: 20,
          episodeCount: 100,
        })
      ).toBe(false)
    })

    it("marks as NOT obscure when only one condition is met", () => {
      // Only hit movie
      expect(isObscure({ ...defaultMetrics, maxMoviePop: 25 })).toBe(false)
      // Only prolific TV
      expect(isObscure({ ...defaultMetrics, episodeCount: 60 })).toBe(false)
    })

    it("marks as obscure when no conditions are met", () => {
      expect(
        isObscure({
          maxMoviePop: 10,
          maxShowPop: 10,
          enMoviesPop5: 2,
          enShowsPop5: 1,
          movieCount: 5,
          episodeCount: 20,
        })
      ).toBe(true)
    })
  })

  describe("real-world examples", () => {
    it("Marlon Brando would NOT be obscure (hit movie: The Godfather)", () => {
      expect(
        isObscure({
          maxMoviePop: 43, // The Godfather
          maxShowPop: 0,
          enMoviesPop5: 6,
          enShowsPop5: 0,
          movieCount: 101,
          episodeCount: 0,
        })
      ).toBe(false)
    })

    it("Stephen Hawking would NOT be obscure (hit TV show: The Simpsons)", () => {
      expect(
        isObscure({
          maxMoviePop: 10,
          maxShowPop: 144, // The Simpsons
          enMoviesPop5: 1,
          enShowsPop5: 2,
          movieCount: 6,
          episodeCount: 5,
        })
      ).toBe(false)
    })

    it("TV-only actor with 3+ popular English shows would NOT be obscure", () => {
      expect(
        isObscure({
          maxMoviePop: 0,
          maxShowPop: 8,
          enMoviesPop5: 0,
          enShowsPop5: 3,
          movieCount: 0,
          episodeCount: 15,
        })
      ).toBe(false)
    })

    it("Actor with only foreign films but 10+ movies would NOT be obscure", () => {
      expect(
        isObscure({
          maxMoviePop: 15,
          maxShowPop: 0,
          enMoviesPop5: 0,
          enShowsPop5: 0,
          movieCount: 12,
          episodeCount: 0,
        })
      ).toBe(false)
    })

    it("Actor with few appearances in unpopular content would be obscure", () => {
      expect(
        isObscure({
          maxMoviePop: 5,
          maxShowPop: 3,
          enMoviesPop5: 1,
          enShowsPop5: 0,
          movieCount: 3,
          episodeCount: 2,
        })
      ).toBe(true)
    })
  })
})
