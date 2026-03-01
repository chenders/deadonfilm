import { vi, describe, it, expect, beforeEach } from "vitest"
import type { Pool } from "pg"
import type { BiographyData, BiographySourceEntry } from "./biography-sources/types.js"
import { BiographySourceType } from "./biography-sources/types.js"

// Mock cache module
vi.mock("./cache.js", () => ({
  invalidateActorCache: vi.fn(),
}))

import {
  writeBiographyToProduction,
  writeBiographyToStaging,
} from "./biography-enrichment-db-writer.js"
import { invalidateActorCache } from "./cache.js"

const mockQuery = vi.fn()
const mockPool = { query: mockQuery } as unknown as Pool

function makeBiographyData(overrides: Partial<BiographyData> = {}): BiographyData {
  return {
    narrative: "A full narrative biography of the actor.",
    narrativeConfidence: "high",
    lifeNotableFactors: ["military_service", "rags_to_riches"],
    birthplaceDetails: "Born in a small town in Iowa.",
    familyBackground: "Son of a farmer and a schoolteacher.",
    education: "Attended the University of Iowa.",
    preFameLife: "Worked as a radio announcer before acting.",
    fameCatalyst: "Discovered by a talent scout in a school play.",
    personalStruggles: "Battled alcoholism throughout the 1960s.",
    relationships: "Married three times.",
    lesserKnownFacts: ["Played college football", "Was a chess champion"],
    hasSubstantiveContent: true,
    ...overrides,
  }
}

function makeSources(): BiographySourceEntry[] {
  return [
    {
      type: BiographySourceType.WIKIPEDIA_BIO,
      url: "https://en.wikipedia.org/wiki/Actor",
      retrievedAt: new Date("2026-02-17T00:00:00Z"),
      confidence: 0.85,
    },
  ]
}

describe("writeBiographyToProduction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: actor exists with no biography
    mockQuery.mockResolvedValue({ rows: [{ biography: null, biography_legacy: null }] })
  })

  it("upserts to actor_biography_details with correct parameters", async () => {
    const data = makeBiographyData()
    const sources = makeSources()

    await writeBiographyToProduction(mockPool, 42, data, sources)

    // Second call is the INSERT...ON CONFLICT upsert
    const upsertCall = mockQuery.mock.calls[1]
    expect(upsertCall[0]).toContain("INSERT INTO actor_biography_details")
    expect(upsertCall[0]).toContain("ON CONFLICT (actor_id) DO UPDATE SET")

    const params = upsertCall[1]
    expect(params[0]).toBe(42) // actor_id
    expect(params[1]).toBe(data.narrative)
    expect(params[2]).toBe("high")
    expect(params[3]).toEqual(["military_service", "rags_to_riches"])
    expect(params[4]).toBe(data.birthplaceDetails)
    expect(params[5]).toBe(data.familyBackground)
    expect(params[6]).toBe(data.education)
    expect(params[7]).toBe(data.preFameLife)
    expect(params[8]).toBe(data.fameCatalyst)
    expect(params[9]).toBe(data.personalStruggles)
    expect(params[10]).toBe(data.relationships)
    expect(params[11]).toEqual(["Played college football", "Was a chess champion"])
    expect(params[12]).toBe(JSON.stringify(sources))
  })

  it("archives old biography on first enrichment", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biography: "Old bio text", biography_legacy: null }],
    })

    await writeBiographyToProduction(mockPool, 42, makeBiographyData(), makeSources())

    // First call: SELECT biography, biography_legacy
    expect(mockQuery.mock.calls[0][0]).toContain("SELECT biography, biography_legacy")

    // Second call: UPDATE biography_legacy
    const archiveCall = mockQuery.mock.calls[1]
    expect(archiveCall[0]).toContain("biography_legacy")
    expect(archiveCall[1]).toEqual(["Old bio text", 42])
  })

  it("does NOT archive if biography_legacy already set", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biography: "Old bio", biography_legacy: "Already archived" }],
    })

    await writeBiographyToProduction(mockPool, 42, makeBiographyData(), makeSources())

    // Should go directly to upsert (no archive UPDATE)
    // Calls: SELECT, INSERT upsert, UPDATE actors
    expect(mockQuery).toHaveBeenCalledTimes(3)
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO actor_biography_details")
  })

  it("does NOT archive if no existing biography", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biography: null, biography_legacy: null }],
    })

    await writeBiographyToProduction(mockPool, 42, makeBiographyData(), makeSources())

    // Should go directly to upsert (no archive UPDATE)
    // Calls: SELECT, INSERT upsert, UPDATE actors
    expect(mockQuery).toHaveBeenCalledTimes(3)
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO actor_biography_details")
  })

  it("updates actors table with narrative and sets biography_version", async () => {
    const data = makeBiographyData({ narrative: "Full narrative text" })

    await writeBiographyToProduction(mockPool, 42, data, makeSources())

    // Last db.query call before cache invalidation is the actors UPDATE
    // With no archive: calls are SELECT, INSERT upsert, UPDATE actors
    const updateCall = mockQuery.mock.calls[2]
    expect(updateCall[0]).toContain("biography = $1")
    expect(updateCall[0]).toContain("biography_version = $2")
    expect(updateCall[0]).toContain("biography_source_type = 'enriched'")
    expect(updateCall[0]).toContain("updated_at = NOW()")
    expect(updateCall[1]).toEqual(["Full narrative text", "5.0.0", 42])
  })

  it("skips actors table update when narrative is null", async () => {
    const data = makeBiographyData({ narrative: null })

    await writeBiographyToProduction(mockPool, 42, data, makeSources())

    // Should only have SELECT + UPSERT calls (no UPDATE actors)
    const allQueries = mockQuery.mock.calls.map((c: unknown[]) => c[0] as string)
    const updateActorsCall = allQueries.find(
      (q: string) => q.includes("biography = $1") && q.includes("biography_version")
    )
    expect(updateActorsCall).toBeUndefined()
  })

  it("invalidates actor cache after all writes", async () => {
    await writeBiographyToProduction(mockPool, 42, makeBiographyData(), makeSources())

    expect(invalidateActorCache).toHaveBeenCalledWith(42)
    expect(invalidateActorCache).toHaveBeenCalledTimes(1)
  })

  it("handles null BiographyData fields correctly", async () => {
    const data = makeBiographyData({
      narrative: null,
      narrativeConfidence: null,
      birthplaceDetails: null,
      familyBackground: null,
      education: null,
      preFameLife: null,
      fameCatalyst: null,
      personalStruggles: null,
      relationships: null,
      lifeNotableFactors: [],
      lesserKnownFacts: [],
    })

    await writeBiographyToProduction(mockPool, 42, data, makeSources())

    const upsertParams = mockQuery.mock.calls[1][1]
    expect(upsertParams[1]).toBeNull() // narrative
    expect(upsertParams[2]).toBeNull() // narrativeConfidence
    expect(upsertParams[4]).toBeNull() // birthplaceDetails
    expect(upsertParams[5]).toBeNull() // familyBackground
    expect(upsertParams[6]).toBeNull() // education
    expect(upsertParams[7]).toBeNull() // preFameLife
    expect(upsertParams[8]).toBeNull() // fameCatalyst
    expect(upsertParams[9]).toBeNull() // personalStruggles
    expect(upsertParams[10]).toBeNull() // relationships
  })

  it("passes null for empty arrays", async () => {
    const data = makeBiographyData({
      lifeNotableFactors: [],
      lesserKnownFacts: [],
    })

    await writeBiographyToProduction(mockPool, 42, data, makeSources())

    const upsertParams = mockQuery.mock.calls[1][1]
    expect(upsertParams[3]).toBeNull() // lifeNotableFactors (empty → null)
    expect(upsertParams[11]).toBeNull() // lesserKnownFacts (empty → null)
  })
})

describe("writeBiographyToStaging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [{ biography: null, biography_legacy: null }] })
  })

  it("delegates to writeBiographyToProduction", async () => {
    const data = makeBiographyData()
    const sources = makeSources()

    await writeBiographyToStaging(mockPool, 42, data, sources)

    // Should have made the same calls as writeBiographyToProduction
    expect(mockQuery).toHaveBeenCalled()
    expect(mockQuery.mock.calls[0][0]).toContain("SELECT biography, biography_legacy")
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO actor_biography_details")
    expect(invalidateActorCache).toHaveBeenCalledWith(42)
  })
})
