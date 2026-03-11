import { describe, it, expect, vi } from "vitest"
import { LegacySourceAdapter, adaptLegacySources } from "../legacy-source-adapter.js"
import { ReliabilityTier as DebrieferTier } from "debriefer"
import type { ResearchSubject } from "debriefer"
import { DataSourceType, ReliabilityTier } from "../../types.js"
import type { BaseDataSource } from "../../base-source.js"
import type { SourceLookupResult } from "../../types.js"

function makeLegacySource(overrides: Partial<BaseDataSource> = {}): BaseDataSource {
  return {
    name: "TestSource",
    type: DataSourceType.VARIETY,
    isFree: false,
    estimatedCostPerQuery: 0.01,
    reliabilityTier: ReliabilityTier.TRADE_PRESS,
    reliabilityScore: 0.9,
    domain: "variety.com",
    isAvailable: () => true,
    lookup: vi.fn().mockResolvedValue({
      success: true,
      source: {
        type: DataSourceType.VARIETY,
        url: "https://variety.com/obituary/actor",
        retrievedAt: new Date(),
        confidence: 0.8,
        costUsd: 0.01,
      },
      data: {
        circumstances: "The actor died of natural causes at age 85.",
      },
    } satisfies SourceLookupResult),
    ...overrides,
  } as unknown as BaseDataSource
}

function makeSubject(overrides: Partial<ResearchSubject> = {}): ResearchSubject {
  return {
    id: 123,
    name: "Test Actor",
    context: {
      tmdbId: 456,
      birthday: "1940-01-01",
      deathday: "2020-06-15",
    },
    ...overrides,
  }
}

describe("LegacySourceAdapter", () => {
  it("maps legacy source properties correctly", () => {
    const legacy = makeLegacySource()
    const adapter = new LegacySourceAdapter(legacy)

    expect(adapter.name).toBe("TestSource")
    expect(adapter.type).toBe(DataSourceType.VARIETY)
    expect(adapter.isFree).toBe(false)
    expect(adapter.estimatedCostPerQuery).toBe(0.01)
    // ReliabilityTier values are the same strings in both enums
    expect(adapter.reliabilityTier).toBe(DebrieferTier.TRADE_PRESS)
  })

  it("delegates lookup to legacy source and returns RawFinding", async () => {
    const legacy = makeLegacySource()
    const adapter = new LegacySourceAdapter(legacy)
    const subject = makeSubject()

    const result = await adapter.lookup(subject, AbortSignal.timeout(5000))

    expect(legacy.lookup).toHaveBeenCalledOnce()
    // Verify the actor was reconstructed correctly
    const calledWith = vi.mocked(legacy.lookup).mock.calls[0]![0]
    expect(calledWith.id).toBe(123)
    expect(calledWith.name).toBe("Test Actor")
    expect(calledWith.tmdbId).toBe(456)
    expect(calledWith.deathday).toBe("2020-06-15")

    expect(result).not.toBeNull()
    expect(result!.text).toBe("The actor died of natural causes at age 85.")
    expect(result!.url).toBe("https://variety.com/obituary/actor")
    expect(result!.confidence).toBe(0.8)
    expect(result!.costUsd).toBe(0.01)
  })

  it("returns null when legacy source fails", async () => {
    const legacy = makeLegacySource({
      lookup: vi.fn().mockResolvedValue({
        success: false,
        source: {
          type: DataSourceType.VARIETY,
          url: null,
          retrievedAt: new Date(),
          confidence: 0,
        },
        data: null,
        error: "Not found",
      }),
    } as unknown as Partial<BaseDataSource>)
    const adapter = new LegacySourceAdapter(legacy)

    const result = await adapter.lookup(makeSubject(), AbortSignal.timeout(5000))

    expect(result).toBeNull()
  })

  it("returns null when circumstances text is empty", async () => {
    const legacy = makeLegacySource({
      lookup: vi.fn().mockResolvedValue({
        success: true,
        source: {
          type: DataSourceType.VARIETY,
          url: null,
          retrievedAt: new Date(),
          confidence: 0.5,
        },
        data: { circumstances: "" },
      }),
    } as unknown as Partial<BaseDataSource>)
    const adapter = new LegacySourceAdapter(legacy)

    const result = await adapter.lookup(makeSubject(), AbortSignal.timeout(5000))

    expect(result).toBeNull()
  })

  it("delegates isAvailable to legacy source", () => {
    const available = makeLegacySource({ isAvailable: () => true } as Partial<BaseDataSource>)
    const unavailable = makeLegacySource({
      isAvailable: () => false,
    } as Partial<BaseDataSource>)

    expect(new LegacySourceAdapter(available).isAvailable()).toBe(true)
    expect(new LegacySourceAdapter(unavailable).isAvailable()).toBe(false)
  })

  it("handles subject with minimal context", async () => {
    const legacy = makeLegacySource()
    const adapter = new LegacySourceAdapter(legacy)
    const subject: ResearchSubject = { id: 1, name: "Minimal Actor" }

    await adapter.lookup(subject, AbortSignal.timeout(5000))

    const calledWith = vi.mocked(legacy.lookup).mock.calls[0]![0]
    expect(calledWith.tmdbId).toBeNull()
    expect(calledWith.birthday).toBeNull()
    expect(calledWith.deathday).toBeNull()
  })
})

describe("adaptLegacySources", () => {
  it("wraps available sources and filters unavailable ones", () => {
    const sources = [
      makeLegacySource({ name: "Available", isAvailable: () => true } as Partial<BaseDataSource>),
      makeLegacySource({
        name: "Unavailable",
        isAvailable: () => false,
      } as Partial<BaseDataSource>),
      makeLegacySource({ name: "AlsoAvail", isAvailable: () => true } as Partial<BaseDataSource>),
    ]

    const adapted = adaptLegacySources(sources as BaseDataSource[])

    expect(adapted).toHaveLength(2)
    expect(adapted[0]!.name).toBe("Available")
    expect(adapted[1]!.name).toBe("AlsoAvail")
  })

  it("returns empty array for no sources", () => {
    expect(adaptLegacySources([])).toEqual([])
  })
})
