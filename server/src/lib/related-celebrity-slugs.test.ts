import { describe, it, expect } from "vitest"
import { getCelebTmdbId } from "./related-celebrity-slugs.js"
import type { RelatedCelebrity } from "./db/types.js"

describe("getCelebTmdbId", () => {
  it("reads tmdb_id from new-format records", () => {
    const celeb: RelatedCelebrity = { name: "Actor", tmdb_id: 123, relationship: "co-star" }
    expect(getCelebTmdbId(celeb)).toBe(123)
  })

  it("falls back to legacy tmdbId for old JSONB entries", () => {
    // Simulates raw JSONB from database with legacy camelCase key
    const celeb = {
      name: "Actor",
      tmdbId: 456,
      relationship: "co-star",
    } as unknown as RelatedCelebrity
    expect(getCelebTmdbId(celeb)).toBe(456)
  })

  it("prefers tmdb_id over legacy tmdbId when both present", () => {
    const celeb = {
      name: "Actor",
      tmdb_id: 100,
      tmdbId: 200,
      relationship: "co-star",
    } as unknown as RelatedCelebrity
    expect(getCelebTmdbId(celeb)).toBe(100)
  })

  it("returns null when both fields are absent", () => {
    const celeb = { name: "Actor", relationship: "co-star" } as unknown as RelatedCelebrity
    expect(getCelebTmdbId(celeb)).toBeNull()
  })

  it("returns null when tmdb_id is explicitly null and no legacy field", () => {
    const celeb: RelatedCelebrity = { name: "Actor", tmdb_id: null, relationship: "co-star" }
    expect(getCelebTmdbId(celeb)).toBeNull()
  })
})
