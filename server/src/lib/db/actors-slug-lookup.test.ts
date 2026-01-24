import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getActorByEitherIdWithSlug } from "./actors.js"
import type { ActorRecord } from "./types.js"

// Mock the database pool
const mockQuery = vi.fn()
vi.mock("./pool.js", () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}))

describe("getActorByEitherIdWithSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Helper to create mock actor
  const createMockActor = (id: number, tmdb_id: number | null, name: string): ActorRecord => ({
    id,
    tmdb_id,
    name,
    birthday: null,
    deathday: "2020-01-01",
    cause_of_death: null,
    cause_of_death_source: null,
    cause_of_death_details: null,
    cause_of_death_details_source: null,
    wikipedia_url: null,
    profile_path: null,
    popularity: 10,
    age_at_death: null,
    expected_lifespan: null,
    years_lost: null,
    violent_death: null,
    tvmaze_person_id: null,
    thetvdb_person_id: null,
    imdb_person_id: null,
    is_obscure: false,
    deathday_confidence: null,
    deathday_verification_source: null,
    deathday_verified_at: null,
  })

  describe("Single actor match", () => {
    it("returns actor matched by id with valid slug", async () => {
      const actor = createMockActor(100, 5000, "John Wayne")
      mockQuery.mockResolvedValue({ rows: [actor] })

      const result = await getActorByEitherIdWithSlug(100, "john-wayne-100")

      expect(result).toEqual({ actor, matchedBy: "id" })
      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT * FROM actors WHERE id = $1 OR tmdb_id = $1 LIMIT 2",
        [100]
      )
    })

    it("returns actor matched by tmdb_id with valid slug", async () => {
      const actor = createMockActor(100, 5000, "John Wayne")
      mockQuery.mockResolvedValue({ rows: [actor] })

      const result = await getActorByEitherIdWithSlug(5000, "john-wayne-5000")

      expect(result).toEqual({ actor, matchedBy: "tmdb_id" })
    })

    it("returns null when slug doesn't match actor name", async () => {
      const actor = createMockActor(100, null, "John Wayne")
      mockQuery.mockResolvedValue({ rows: [actor] })

      const result = await getActorByEitherIdWithSlug(100, "wrong-name-100")

      expect(result).toBeNull()
    })

    it("handles slug with special characters that get normalized", async () => {
      const actor = createMockActor(100, null, "Sinéad O'Connor")
      mockQuery.mockResolvedValue({ rows: [actor] })

      // createActorSlug removes apostrophe but doesn't normalize é → e
      // So "Sinéad O'Connor" becomes "sin-ad-oconnor-100"
      const result = await getActorByEitherIdWithSlug(100, "sin-ad-oconnor-100")

      expect(result).toEqual({ actor, matchedBy: "id" })
    })
  })

  describe("Overlap cases (two actors matched)", () => {
    it("returns actor.id match when slug matches id actor", async () => {
      const actorById = createMockActor(100, 5000, "John Smith")
      const actorByTmdbId = createMockActor(200, 100, "Jane Doe")
      mockQuery.mockResolvedValue({ rows: [actorById, actorByTmdbId] })

      // Slug matches "John Smith" with ID 100
      const result = await getActorByEitherIdWithSlug(100, "john-smith-100")

      expect(result).toEqual({ actor: actorById, matchedBy: "id" })
    })

    it("returns tmdb_id match when slug matches tmdb_id actor", async () => {
      const actorById = createMockActor(100, 5000, "John Smith")
      const actorByTmdbId = createMockActor(200, 100, "Jane Doe")
      mockQuery.mockResolvedValue({ rows: [actorById, actorByTmdbId] })

      // Slug matches "Jane Doe" with ID 100 (tmdb_id of second actor)
      const result = await getActorByEitherIdWithSlug(100, "jane-doe-100")

      expect(result).toEqual({ actor: actorByTmdbId, matchedBy: "tmdb_id" })
    })

    it("returns null when both slugs match (ambiguous)", async () => {
      // Edge case: two actors with same name (unlikely but possible)
      const actorById = createMockActor(100, 5000, "John Smith")
      const actorByTmdbId = createMockActor(200, 100, "John Smith")
      mockQuery.mockResolvedValue({ rows: [actorById, actorByTmdbId] })

      const result = await getActorByEitherIdWithSlug(100, "john-smith-100")

      expect(result).toBeNull()
    })

    it("returns null when neither slug matches (ambiguous)", async () => {
      const actorById = createMockActor(100, 5000, "John Smith")
      const actorByTmdbId = createMockActor(200, 100, "Jane Doe")
      mockQuery.mockResolvedValue({ rows: [actorById, actorByTmdbId] })

      // Slug doesn't match either actor
      const result = await getActorByEitherIdWithSlug(100, "wrong-name-100")

      expect(result).toBeNull()
    })
  })

  describe("Edge cases", () => {
    it("returns null when no actors found", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await getActorByEitherIdWithSlug(999, "nonexistent-999")

      expect(result).toBeNull()
    })

    it("handles slug without hyphen (single word)", async () => {
      const actor = createMockActor(100, null, "Cher")
      mockQuery.mockResolvedValue({ rows: [actor] })

      // Single-word name would create slug "cher-100"
      const result = await getActorByEitherIdWithSlug(100, "cher-100")

      expect(result).toEqual({ actor, matchedBy: "id" })
    })

    it("handles slug with multiple hyphens in name", async () => {
      const actor = createMockActor(100, null, "Mary-Kate Olsen")
      mockQuery.mockResolvedValue({ rows: [actor] })

      // Slug would be "mary-kate-olsen-100"
      // lastIndexOf("-") finds the last hyphen before ID
      const result = await getActorByEitherIdWithSlug(100, "mary-kate-olsen-100")

      expect(result).toEqual({ actor, matchedBy: "id" })
    })

    it("handles empty slug gracefully", async () => {
      const actor = createMockActor(100, null, "John Wayne")
      mockQuery.mockResolvedValue({ rows: [actor] })

      const result = await getActorByEitherIdWithSlug(100, "")

      expect(result).toBeNull()
    })

    it("handles case-insensitive slug matching", async () => {
      const actor = createMockActor(100, null, "John Wayne")
      mockQuery.mockResolvedValue({ rows: [actor] })

      // Slug is lowercase but should still match
      const result = await getActorByEitherIdWithSlug(100, "JOHN-WAYNE-100")

      expect(result).toEqual({ actor, matchedBy: "id" })
    })
  })

  describe("Real-world overlap scenarios", () => {
    it("handles actor.id=4165 / tmdb_id=4165 overlap", async () => {
      // Real case: Clint Eastwood (actor.id=4165) vs another actor (tmdb_id=4165)
      const clintEastwood = createMockActor(4165, 190, "Clint Eastwood")
      const otherActor = createMockActor(12345, 4165, "Other Actor")
      mockQuery.mockResolvedValue({ rows: [clintEastwood, otherActor] })

      // Slug matches Clint Eastwood
      const result = await getActorByEitherIdWithSlug(4165, "clint-eastwood-4165")

      expect(result).toEqual({ actor: clintEastwood, matchedBy: "id" })
    })

    it("redirects legacy tmdb_id URL for overlapping IDs", async () => {
      // Simulate legacy URL with tmdb_id in slug
      const actorById = createMockActor(100, 5000, "John Smith")
      const actorByTmdbId = createMockActor(200, 100, "Jane Doe")
      mockQuery.mockResolvedValue({ rows: [actorById, actorByTmdbId] })

      // Legacy URL used tmdb_id=100 which belongs to Jane Doe
      const result = await getActorByEitherIdWithSlug(100, "jane-doe-100")

      // Should match Jane Doe by tmdb_id (triggering redirect in route handler)
      expect(result).toEqual({ actor: actorByTmdbId, matchedBy: "tmdb_id" })
    })
  })
})
