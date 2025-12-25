import { describe, it, expect } from "vitest"
import { OBSCURE_POPULARITY_THRESHOLD } from "./backfill-actor-obscure.js"

describe("backfill-actor-obscure constants", () => {
  it("uses popularity threshold of 5.0 (matches Death Watch feature)", () => {
    expect(OBSCURE_POPULARITY_THRESHOLD).toBe(5.0)
  })
})

describe("is_obscure calculation logic", () => {
  // This tests the logic that will be used in the computed column
  // is_obscure = profile_path IS NULL OR popularity < 5.0

  function isObscure(profilePath: string | null, popularity: number | null): boolean {
    return profilePath === null || (popularity ?? 0) < OBSCURE_POPULARITY_THRESHOLD
  }

  describe("profile_path conditions", () => {
    it("marks actor as obscure when profile_path is null", () => {
      expect(isObscure(null, 100)).toBe(true)
    })

    it("does not mark as obscure solely based on having a profile_path", () => {
      expect(isObscure("/path.jpg", 100)).toBe(false)
    })
  })

  describe("popularity conditions", () => {
    it("marks actor as obscure when popularity is below threshold", () => {
      expect(isObscure("/path.jpg", 4.9)).toBe(true)
      expect(isObscure("/path.jpg", 0)).toBe(true)
      expect(isObscure("/path.jpg", 1)).toBe(true)
    })

    it("does not mark as obscure when popularity is at or above threshold", () => {
      expect(isObscure("/path.jpg", 5.0)).toBe(false)
      expect(isObscure("/path.jpg", 5.1)).toBe(false)
      expect(isObscure("/path.jpg", 100)).toBe(false)
    })

    it("treats null popularity as 0 (obscure)", () => {
      expect(isObscure("/path.jpg", null)).toBe(true)
    })
  })

  describe("combined conditions", () => {
    it("marks as obscure when both profile_path is null AND popularity is low", () => {
      expect(isObscure(null, 2)).toBe(true)
    })

    it("marks as obscure when only profile_path is null", () => {
      expect(isObscure(null, 50)).toBe(true)
    })

    it("marks as obscure when only popularity is low", () => {
      expect(isObscure("/path.jpg", 3)).toBe(true)
    })

    it("does not mark as obscure when both conditions are met (has photo + high popularity)", () => {
      expect(isObscure("/path.jpg", 10)).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("handles exact threshold value", () => {
      // Exactly 5.0 should NOT be obscure (>= 5.0 is not obscure)
      expect(isObscure("/path.jpg", 5.0)).toBe(false)
    })

    it("handles very small popularity values", () => {
      expect(isObscure("/path.jpg", 0.001)).toBe(true)
    })

    it("handles very high popularity values", () => {
      expect(isObscure("/path.jpg", 1000)).toBe(false)
    })

    it("handles negative popularity (should not happen but handle gracefully)", () => {
      expect(isObscure("/path.jpg", -1)).toBe(true)
    })
  })
})

// Note: The script always fetches popularity from the TMDB API to ensure
// accurate, up-to-date values. Cached popularity from actor_appearances is not
// used because it may be stale or not available for all deceased actors.
