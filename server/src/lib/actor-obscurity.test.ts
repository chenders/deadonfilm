import { describe, it, expect } from "vitest"
import { OBSCURITY_THRESHOLDS } from "./actor-obscurity.js"

describe("OBSCURITY_THRESHOLDS", () => {
  it("exports threshold constants", () => {
    expect(OBSCURITY_THRESHOLDS).toEqual({
      HIT_MOVIE_POPULARITY: 20,
      HIT_SHOW_POPULARITY: 20,
      ENGLISH_CONTENT_POPULARITY: 5,
      MIN_ENGLISH_MOVIES: 3,
      MIN_ENGLISH_SHOWS: 3,
      MIN_TOTAL_MOVIES: 10,
      MIN_TOTAL_EPISODES: 50,
    })
  })

  it("thresholds match across all consumers", () => {
    // These values are used by multiple consumers:
    // - recalculateActorObscurity() in actor-obscurity.ts
    // - backfill-actor-obscure.ts
    // If you intentionally change any of these thresholds, update this test and review those consumers to ensure their behavior still makes sense.
    expect(OBSCURITY_THRESHOLDS.HIT_MOVIE_POPULARITY).toBe(20)
    expect(OBSCURITY_THRESHOLDS.MIN_TOTAL_MOVIES).toBe(10)
    expect(OBSCURITY_THRESHOLDS.MIN_TOTAL_EPISODES).toBe(50)
  })
})
