import { describe, it, expect, vi, beforeEach } from "vitest"

// ============================================================================
// Shared state for mock source instances
// ============================================================================

/**
 * Registry of mock instances created during source initialization.
 * Each entry maps a source name to its mock instance, letting tests
 * control lookup behavior and verify interactions.
 */
const mockInstances: Map<string, Record<string, unknown>> = new Map()

/**
 * Create a mock class (constructor function) that the orchestrator can `new`.
 * Each call records the instance in mockInstances for later assertions.
 */
function makeMockSourceClass(sourceName: string, options?: { isWebSearch?: boolean }) {
  return vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    const instance: Record<string, unknown> = {
      name: sourceName,
      type: `mock-${sourceName}`,
      isFree: true,
      estimatedCostPerQuery: 0,
      reliabilityTier: "structured_data" as ReliabilityTier,
      reliabilityScore: 0.95,
      isAvailable: vi.fn().mockReturnValue(true),
      lookup: vi.fn().mockResolvedValue({
        success: false,
        source: {
          type: `mock-${sourceName}`,
          retrievedAt: new Date(),
          confidence: 0,
          costUsd: 0,
        },
        data: null,
        error: "No data",
      }),
      setConfig: vi.fn(),
    }

    // For instanceof checks in orchestrator
    if (options?.isWebSearch) {
      Object.setPrototypeOf(instance, BiographyWebSearchBase.prototype)
    }

    mockInstances.set(sourceName, instance)
    return instance
  })
}

/**
 * Re-apply the default constructor mock for a source class.
 * Used in beforeEach to undo any per-test mockImplementation overrides.
 */
function resetConstructorMock(
  ctor: unknown,
  sourceName: string,
  options?: { isWebSearch?: boolean }
) {
  vi.mocked(ctor as ReturnType<typeof vi.fn>).mockImplementation(function () {
    const instance: Record<string, unknown> = {
      name: sourceName,
      type: `mock-${sourceName}`,
      isFree: true,
      estimatedCostPerQuery: 0,
      reliabilityTier: "structured_data" as ReliabilityTier,
      reliabilityScore: 0.95,
      isAvailable: vi.fn().mockReturnValue(true),
      lookup: vi.fn().mockResolvedValue({
        success: false,
        source: {
          type: `mock-${sourceName}`,
          retrievedAt: new Date(),
          confidence: 0,
          costUsd: 0,
        },
        data: null,
        error: "No data",
      }),
      setConfig: vi.fn(),
    }

    if (options?.isWebSearch) {
      Object.setPrototypeOf(instance, BiographyWebSearchBase.prototype)
    }

    mockInstances.set(sourceName, instance)
    return instance
  })
}

// ============================================================================
// Mocks — must be defined before imports
// ============================================================================

vi.mock("./sources/wikidata.js", () => ({
  WikidataBiographySource: makeMockSourceClass("Wikidata"),
}))
vi.mock("./sources/wikipedia.js", () => ({
  WikipediaBiographySource: makeMockSourceClass("Wikipedia"),
}))
vi.mock("./sources/britannica.js", () => ({
  BritannicaBiographySource: makeMockSourceClass("Britannica"),
}))
vi.mock("./sources/biography-com.js", () => ({
  BiographyComSource: makeMockSourceClass("Biography.com"),
}))
vi.mock("./sources/google-search.js", () => ({
  GoogleBiographySearch: makeMockSourceClass("Google Search", { isWebSearch: true }),
}))
vi.mock("./sources/bing-search.js", () => ({
  BingBiographySearch: makeMockSourceClass("Bing Search", { isWebSearch: true }),
}))
vi.mock("./sources/duckduckgo.js", () => ({
  DuckDuckGoBiographySearch: makeMockSourceClass("DuckDuckGo", { isWebSearch: true }),
}))
vi.mock("./sources/brave-search.js", () => ({
  BraveBiographySearch: makeMockSourceClass("Brave Search", { isWebSearch: true }),
}))
vi.mock("./sources/guardian.js", () => ({
  GuardianBiographySource: makeMockSourceClass("Guardian"),
}))
vi.mock("./sources/nytimes.js", () => ({
  NYTimesBiographySource: makeMockSourceClass("NYTimes"),
}))
vi.mock("./sources/ap-news.js", () => ({
  APNewsBiographySource: makeMockSourceClass("AP News"),
}))
vi.mock("./sources/bbc-news.js", () => ({
  BBCNewsBiographySource: makeMockSourceClass("BBC News"),
}))
vi.mock("./sources/people.js", () => ({
  PeopleBiographySource: makeMockSourceClass("People"),
}))
vi.mock("./sources/legacy.js", () => ({
  LegacyBiographySource: makeMockSourceClass("Legacy"),
}))
vi.mock("./sources/findagrave.js", () => ({
  FindAGraveBiographySource: makeMockSourceClass("FindAGrave"),
}))
vi.mock("./sources/internet-archive.js", () => ({
  InternetArchiveBiographySource: makeMockSourceClass("Internet Archive"),
}))
vi.mock("./sources/chronicling-america.js", () => ({
  ChroniclingAmericaBiographySource: makeMockSourceClass("Chronicling America"),
}))
vi.mock("./sources/trove.js", () => ({
  TroveBiographySource: makeMockSourceClass("Trove"),
}))
vi.mock("./sources/europeana.js", () => ({
  EuropeanaBiographySource: makeMockSourceClass("Europeana"),
}))
vi.mock("./sources/google-books.js", () => ({
  GoogleBooksBiographySource: makeMockSourceClass("Google Books"),
}))
vi.mock("./sources/open-library.js", () => ({
  OpenLibraryBiographySource: makeMockSourceClass("Open Library"),
}))
vi.mock("./sources/ia-books.js", () => ({
  IABooksBiographySource: makeMockSourceClass("IA Books"),
}))

// Mock Claude synthesis
vi.mock("./claude-cleanup.js", () => ({
  synthesizeBiography: vi.fn(),
}))

// Import after mocks
import { BiographyEnrichmentOrchestrator } from "./orchestrator.js"
import { synthesizeBiography } from "./claude-cleanup.js"
import { BiographyWebSearchBase } from "./sources/web-search-base.js"
import { GoogleBiographySearch } from "./sources/google-search.js"
import { BingBiographySearch } from "./sources/bing-search.js"
import { WikidataBiographySource } from "./sources/wikidata.js"
import { WikipediaBiographySource } from "./sources/wikipedia.js"
import { BritannicaBiographySource } from "./sources/britannica.js"
import { BiographySourceType, type ActorForBiography } from "./types.js"
import type { BiographyLookupResult } from "./base-source.js"
import type { ReliabilityTier } from "../death-sources/types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 1,
  tmdb_id: 12345,
  imdb_person_id: "nm0001234",
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
  biography_raw_tmdb: "Famous actor known for westerns.",
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

const testActor2: ActorForBiography = {
  id: 2,
  tmdb_id: 67890,
  imdb_person_id: "nm0005678",
  name: "Audrey Hepburn",
  birthday: "1929-05-04",
  deathday: "1993-01-20",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Brussels, Belgium",
}

/**
 * Create a successful lookup result with raw biography data.
 */
function createSuccessfulLookup(options?: {
  confidence?: number
  reliabilityScore?: number
  cost?: number
  text?: string
  sourceName?: string
}): BiographyLookupResult {
  const sourceName = options?.sourceName || "TestSource"
  const confidence = options?.confidence ?? 0.8
  return {
    success: true,
    source: {
      type: BiographySourceType.WIKIDATA_BIO,
      retrievedAt: new Date(),
      confidence,
      reliabilityTier: "structured_data" as ReliabilityTier,
      reliabilityScore: options?.reliabilityScore ?? 0.95,
      costUsd: options?.cost ?? 0,
    },
    data: {
      sourceName,
      sourceType: BiographySourceType.WIKIDATA_BIO,
      text:
        options?.text ||
        "John Wayne grew up in a small town. His parents were hardworking people. He attended school in California.",
      url: "https://example.com",
      confidence,
      reliabilityTier: "structured_data" as ReliabilityTier,
      reliabilityScore: options?.reliabilityScore ?? 0.95,
    },
  }
}

/**
 * Helper to get a mock source instance by name.
 */
function getMock(name: string): Record<string, unknown> {
  const mock = mockInstances.get(name)
  if (!mock) {
    throw new Error(
      `Mock instance "${name}" not found. Available: ${Array.from(mockInstances.keys()).join(", ")}`
    )
  }
  return mock
}

/**
 * Create a standard synthesis result for tests.
 */
function createSynthesisResult(
  overrides?: Partial<{
    narrative: string | null
    costUsd: number
    error: string
  }>
) {
  return {
    data:
      overrides?.narrative !== null
        ? {
            narrative: overrides?.narrative ?? "Full narrative",
            narrativeConfidence: "high" as const,
            lifeNotableFactors: [],
            birthplaceDetails: null,
            familyBackground: null,
            education: null,
            preFameLife: null,
            fameCatalyst: null,
            personalStruggles: null,
            relationships: null,
            lesserKnownFacts: [],
            hasSubstantiveContent: true,
          }
        : null,
    costUsd: overrides?.costUsd ?? 0.01,
    model: "claude-sonnet-4-20250514",
    inputTokens: 1000,
    outputTokens: 500,
    error: overrides?.error,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("BiographyEnrichmentOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstances.clear()

    // Restore any constructor implementations that individual tests may have overridden.
    // vi.clearAllMocks() clears call counts but does NOT restore mockImplementation.
    resetConstructorMock(WikidataBiographySource, "Wikidata")
    resetConstructorMock(WikipediaBiographySource, "Wikipedia")
    resetConstructorMock(BritannicaBiographySource, "Britannica")
    resetConstructorMock(GoogleBiographySearch, "Google Search", { isWebSearch: true })
    resetConstructorMock(BingBiographySearch, "Bing Search", { isWebSearch: true })

    // Silence console.log during tests
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  // --------------------------------------------------------------------------
  // Source initialization
  // --------------------------------------------------------------------------
  describe("source initialization", () => {
    it("initializes all source categories by default", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator()

      // All 22 sources should be initialized (all categories enabled except AI)
      expect(orchestrator.getSourceCount()).toBe(22)
    })

    it("initializes sources in correct priority order", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator()

      const names = orchestrator.getSourceNames()

      // Verify order: free -> reference -> books -> web search -> news -> obituary -> archives
      expect(names[0]).toBe("Wikidata")
      expect(names[1]).toBe("Wikipedia")
      expect(names[2]).toBe("Britannica")
      expect(names[3]).toBe("Biography.com")
      expect(names[4]).toBe("Google Books")
      expect(names[5]).toBe("Open Library")
      expect(names[6]).toBe("IA Books")
      expect(names[7]).toBe("Google Search")
      expect(names[8]).toBe("Bing Search")
      expect(names[9]).toBe("DuckDuckGo")
      expect(names[10]).toBe("Brave Search")
      expect(names[11]).toBe("Guardian")
      expect(names[12]).toBe("NYTimes")
      expect(names[13]).toBe("AP News")
      expect(names[14]).toBe("BBC News")
      expect(names[15]).toBe("People")
      expect(names[16]).toBe("Legacy")
      expect(names[17]).toBe("FindAGrave")
      expect(names[18]).toBe("Internet Archive")
      expect(names[19]).toBe("Chronicling America")
      expect(names[20]).toBe("Trove")
      expect(names[21]).toBe("Europeana")
    })

    it("filters out unavailable sources", () => {
      // Reconfigure Google and Bing mock classes to return unavailable
      vi.mocked(GoogleBiographySearch).mockImplementation(function () {
        const instance: Record<string, unknown> = {
          name: "Google Search",
          type: "mock-Google Search",
          isFree: true,
          estimatedCostPerQuery: 0,
          reliabilityTier: "structured_data" as ReliabilityTier,
          reliabilityScore: 0.95,
          isAvailable: vi.fn().mockReturnValue(false),
          lookup: vi.fn(),
          setConfig: vi.fn(),
        }
        Object.setPrototypeOf(instance, BiographyWebSearchBase.prototype)
        mockInstances.set("Google Search", instance)
        return instance
      } as unknown as () => void)

      vi.mocked(BingBiographySearch).mockImplementation(function () {
        const instance: Record<string, unknown> = {
          name: "Bing Search",
          type: "mock-Bing Search",
          isFree: true,
          estimatedCostPerQuery: 0,
          reliabilityTier: "structured_data" as ReliabilityTier,
          reliabilityScore: 0.95,
          isAvailable: vi.fn().mockReturnValue(false),
          lookup: vi.fn(),
          setConfig: vi.fn(),
        }
        Object.setPrototypeOf(instance, BiographyWebSearchBase.prototype)
        mockInstances.set("Bing Search", instance)
        return instance
      } as unknown as () => void)

      const orchestrator = new BiographyEnrichmentOrchestrator()

      expect(orchestrator.getSourceCount()).toBe(20)
      expect(orchestrator.getSourceNames()).not.toContain("Google Search")
      expect(orchestrator.getSourceNames()).not.toContain("Bing Search")
    })

    it("respects sourceCategories.free=false", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: false,
          reference: true,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Only reference sources (2)
      expect(orchestrator.getSourceCount()).toBe(2)
      expect(orchestrator.getSourceNames()).toContain("Britannica")
      expect(orchestrator.getSourceNames()).toContain("Biography.com")
      expect(orchestrator.getSourceNames()).not.toContain("Wikidata")
      expect(orchestrator.getSourceNames()).not.toContain("Wikipedia")
    })

    it("respects sourceCategories.webSearch=false", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Only free sources (2)
      expect(orchestrator.getSourceCount()).toBe(2)
      expect(orchestrator.getSourceNames()).not.toContain("Google Search")
      expect(orchestrator.getSourceNames()).not.toContain("Brave Search")
    })

    it("enables only selected categories", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: true,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Free (2) + News (5) = 7
      expect(orchestrator.getSourceCount()).toBe(7)
      expect(orchestrator.getSourceNames()).toContain("Wikidata")
      expect(orchestrator.getSourceNames()).toContain("Guardian")
      expect(orchestrator.getSourceNames()).not.toContain("Britannica")
      expect(orchestrator.getSourceNames()).not.toContain("Google Search")
    })

    it("configures AI cleaning on web search sources when enabled", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        contentCleaning: {
          haikuEnabled: true,
          mechanicalOnly: false,
        },
      })

      // Verify setConfig was called on web search sources
      const googleMock = getMock("Google Search")
      const bingMock = getMock("Bing Search")
      const ddgMock = getMock("DuckDuckGo")
      const braveMock = getMock("Brave Search")

      expect(googleMock.setConfig).toHaveBeenCalledWith({ useAiCleaning: true })
      expect(bingMock.setConfig).toHaveBeenCalledWith({ useAiCleaning: true })
      expect(ddgMock.setConfig).toHaveBeenCalledWith({ useAiCleaning: true })
      expect(braveMock.setConfig).toHaveBeenCalledWith({ useAiCleaning: true })
    })

    it("does not configure AI cleaning when mechanicalOnly is true", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        contentCleaning: {
          haikuEnabled: true,
          mechanicalOnly: true,
        },
      })

      const googleMock = getMock("Google Search")
      expect(googleMock.setConfig).not.toHaveBeenCalled()
    })

    it("does not configure AI cleaning when haikuEnabled is false", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        contentCleaning: {
          haikuEnabled: false,
          mechanicalOnly: false,
        },
      })

      const googleMock = getMock("Google Search")
      expect(googleMock.setConfig).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // earlyStopSourceCount validation
  // --------------------------------------------------------------------------
  describe("earlyStopSourceCount validation", () => {
    it("falls back to default for NaN", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: NaN })
      // Default is 5 — verify by checking the config was clamped
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(5)
    })

    it("falls back to default for Infinity", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: Infinity })
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(5)
    })

    it("falls back to default for negative numbers", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: -3 })
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(5)
    })

    it("falls back to default for zero", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 0 })
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(5)
    })

    it("floors non-integer values", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 3.7 })
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(3)
    })

    it("preserves valid positive integers", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 8 })
      expect(
        (orchestrator as unknown as { config: { earlyStopSourceCount: number } }).config
          .earlyStopSourceCount
      ).toBe(8)
    })
  })

  // --------------------------------------------------------------------------
  // enrichActor
  // --------------------------------------------------------------------------
  describe("enrichActor", () => {
    it("tries sources in priority order", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      await orchestrator.enrichActor(testActor)

      const wikidataMock = getMock("Wikidata")
      const wikipediaMock = getMock("Wikipedia")

      expect(wikidataMock.lookup).toHaveBeenCalledWith(testActor)
      expect(wikipediaMock.lookup).toHaveBeenCalledWith(testActor)

      // Wikidata should be called first
      const wikidataOrder = (wikidataMock.lookup as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0]
      const wikipediaOrder = (wikipediaMock.lookup as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0]
      expect(wikidataOrder).toBeLessThan(wikipediaOrder)
    })

    it("accumulates raw sources from successful lookups", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Configure mock sources to succeed
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata", confidence: 0.7 })
      )
      const wikipediaMock = getMock("Wikipedia")
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikipedia", confidence: 0.8 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      const result = await orchestrator.enrichActor(testActor)

      expect(result.rawSources).toHaveLength(2)
      expect(result.rawSources![0].sourceName).toBe("Wikidata")
      expect(result.rawSources![1].sourceName).toBe("Wikipedia")
    })

    it("calls Claude synthesis with accumulated raw sources", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
        synthesisModel: "claude-sonnet-4-20250514",
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata" })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(
        createSynthesisResult({ narrative: "Full narrative", costUsd: 0.02 })
      )

      const result = await orchestrator.enrichActor(testActor)

      expect(synthesizeBiography).toHaveBeenCalledWith(
        testActor,
        expect.arrayContaining([expect.objectContaining({ sourceName: "Wikidata" })]),
        { model: "claude-sonnet-4-20250514" }
      )
      expect(result.data).not.toBeNull()
      expect(result.data!.narrative).toBe("Full narrative")
    })

    it("stops collecting after reaching earlyStopSourceCount distinct source families", async () => {
      // earlyStopSourceCount=3: stop after 3 distinct high-quality sources
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 3 })

      // Make first 3 sources succeed with high confidence and reliability
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      const wikipediaMock = getMock("Wikipedia")
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      const britannicaMock = getMock("Britannica")
      ;(britannicaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      const result = await orchestrator.enrichActor(testActor)

      // After 3 distinct high-quality sources, remaining sources should NOT be called
      // (mock types are unique per source, so each counts as its own family)
      const biographyComMock = getMock("Biography.com")
      const googleMock = getMock("Google Search")
      const guardianMock = getMock("Guardian")

      expect(biographyComMock.lookup).not.toHaveBeenCalled()
      expect(googleMock.lookup).not.toHaveBeenCalled()
      expect(guardianMock.lookup).not.toHaveBeenCalled()

      expect(result.rawSources).toHaveLength(3)
    })

    it("groups Wikidata and Wikipedia as one source family for early stopping", async () => {
      // earlyStopSourceCount=2: need 2 distinct families
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 2 })

      // Wikidata + Wikipedia share the "wikimedia" family, so they count as 1
      const wikidataMock = getMock("Wikidata")
      // Set the real BiographySourceType so the family lookup works
      wikidataMock.type = BiographySourceType.WIKIDATA_BIO
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      const wikipediaMock = getMock("Wikipedia")
      wikipediaMock.type = BiographySourceType.WIKIPEDIA_BIO
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      // Britannica = 2nd distinct family → triggers early stop
      const britannicaMock = getMock("Britannica")
      ;(britannicaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      const result = await orchestrator.enrichActor(testActor)

      // Wikidata + Wikipedia = 1 family, Britannica = 2nd → stop
      const biographyComMock = getMock("Biography.com")
      expect(biographyComMock.lookup).not.toHaveBeenCalled()

      // All 3 sources were collected (Wikidata, Wikipedia, Britannica)
      expect(result.rawSources).toHaveLength(3)
    })

    it("always tries book sources even when early stop threshold is met", async () => {
      // earlyStopSourceCount=2: would normally stop after 2 distinct families
      const orchestrator = new BiographyEnrichmentOrchestrator({ earlyStopSourceCount: 2 })

      // Make Wikidata and Britannica succeed (2 distinct families → threshold met)
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      const britannicaMock = getMock("Britannica")
      ;(britannicaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )

      // Set real book source types so the exemption logic recognizes them
      const googleBooksMock = getMock("Google Books")
      googleBooksMock.type = BiographySourceType.GOOGLE_BOOKS_BIO
      const openLibraryMock = getMock("Open Library")
      openLibraryMock.type = BiographySourceType.OPEN_LIBRARY_BIO
      const iaBooksMock = getMock("IA Books")
      iaBooksMock.type = BiographySourceType.IA_BOOKS_BIO

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      await orchestrator.enrichActor(testActor)

      // Book sources should still be tried despite early stop threshold being met
      expect(googleBooksMock.lookup).toHaveBeenCalled()
      expect(openLibraryMock.lookup).toHaveBeenCalled()
      expect(iaBooksMock.lookup).toHaveBeenCalled()

      // But sources after books should NOT be tried (early stop fires after books)
      const googleSearchMock = getMock("Google Search")
      expect(googleSearchMock.lookup).not.toHaveBeenCalled()
    })

    it("does not stop early if sources do not meet both thresholds", async () => {
      // Reconfigure source constructors to have LOW reliability on the source object
      // (the orchestrator reads source.reliabilityScore, not the lookup result's)
      const constructors: [unknown, string][] = [
        [WikidataBiographySource, "Wikidata"],
        [WikipediaBiographySource, "Wikipedia"],
        [BritannicaBiographySource, "Britannica"],
      ]

      for (const [ctor, name] of constructors) {
        vi.mocked(ctor as ReturnType<typeof vi.fn>).mockImplementation(function () {
          const instance: Record<string, unknown> = {
            name,
            type: `mock-${name}`,
            isFree: true,
            estimatedCostPerQuery: 0,
            reliabilityTier: "tier_3_aggregator",
            reliabilityScore: 0.3, // LOW reliability on the source object
            isAvailable: vi.fn().mockReturnValue(true),
            lookup: vi
              .fn()
              .mockResolvedValue(
                createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.3 })
              ),
            setConfig: vi.fn(),
          }
          mockInstances.set(name, instance)
          return instance
        })
      }

      const orchestrator = new BiographyEnrichmentOrchestrator()

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ narrative: null }))

      await orchestrator.enrichActor(testActor)

      // Since reliability is below threshold, should continue trying more sources
      const biographyComMock = getMock("Biography.com")
      expect(biographyComMock.lookup).toHaveBeenCalled()
    })

    it("respects per-actor cost limits", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        costLimits: {
          maxCostPerActor: 0.4,
          maxTotalCost: 10.0,
        },
        sourceCategories: {
          free: true,
          reference: true,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Wikidata returns result with high cost
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ cost: 0.5 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ narrative: null }))

      const result = await orchestrator.enrichActor(testActor)

      // Wikipedia should NOT be called because cost limit hit after Wikidata
      const wikipediaMock = getMock("Wikipedia")
      expect(wikipediaMock.lookup).not.toHaveBeenCalled()

      expect(result.stats.totalCostUsd).toBeGreaterThanOrEqual(0.5)
    })

    it("returns correct stats in BiographyResult", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ cost: 0 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ costUsd: 0.015 }))

      const result = await orchestrator.enrichActor(testActor)

      expect(result.actorId).toBe(testActor.id)
      expect(result.stats.sourcesAttempted).toBe(2) // Wikidata + Wikipedia
      expect(result.stats.sourcesSucceeded).toBe(1) // Only Wikidata succeeded
      expect(result.stats.totalCostUsd).toBe(0.015) // Synthesis cost only
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.data).not.toBeNull()
      expect(result.error).toBeUndefined()
    })

    it("handles source errors gracefully and continues to next source", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Wikidata throws an error
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network timeout")
      )

      // Wikipedia succeeds
      const wikipediaMock = getMock("Wikipedia")
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikipedia" })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(
        createSynthesisResult({ narrative: "Narrative from Wikipedia" })
      )

      const result = await orchestrator.enrichActor(testActor)

      expect(wikipediaMock.lookup).toHaveBeenCalled()
      expect(result.rawSources).toHaveLength(1)
      expect(result.rawSources![0].sourceName).toBe("Wikipedia")
      expect(result.data).not.toBeNull()
    })

    it("returns error result when no sources succeed", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const result = await orchestrator.enrichActor(testActor)

      expect(result.data).toBeNull()
      expect(result.rawSources).toHaveLength(0)
      expect(result.error).toBe("No biographical data found from any source")
      expect(result.stats.sourcesSucceeded).toBe(0)
      expect(synthesizeBiography).not.toHaveBeenCalled()
    })

    it("returns error result when synthesis fails", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata" })
      )

      vi.mocked(synthesizeBiography).mockRejectedValue(new Error("API key missing"))

      const result = await orchestrator.enrichActor(testActor)

      expect(result.data).toBeNull()
      expect(result.rawSources).toHaveLength(1)
      expect(result.error).toBe("Sources collected but synthesis failed")
    })

    it("returns error result when synthesis returns null data", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata" })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(
        createSynthesisResult({ narrative: null, costUsd: 0.01, error: "No text response" })
      )

      const result = await orchestrator.enrichActor(testActor)

      expect(result.data).toBeNull()
      expect(result.error).toBe("Sources collected but synthesis failed")
      expect(result.stats.totalCostUsd).toBe(0.01)
    })

    it("includes synthesis cost in total cost", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ cost: 0.005 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ costUsd: 0.025 }))

      const result = await orchestrator.enrichActor(testActor)

      // Total cost = source cost + synthesis cost
      expect(result.stats.totalCostUsd).toBeCloseTo(0.03, 4)
    })

    it("records all sources in the result including failed ones", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // Wikidata fails
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        source: {
          type: "wikidata-bio",
          retrievedAt: new Date(),
          confidence: 0,
          costUsd: 0,
        },
        data: null,
        error: "SPARQL timeout",
      })

      // Wikipedia succeeds
      const wikipediaMock = getMock("Wikipedia")
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikipedia" })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      const result = await orchestrator.enrichActor(testActor)

      // sources array should include both attempted sources
      expect(result.sources).toHaveLength(2)
      // rawSources should only have the successful one
      expect(result.rawSources).toHaveLength(1)
    })

    it("does not count low-confidence sources toward early stop threshold", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator()

      // First and third sources meet both thresholds; second has low confidence
      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )
      const wikipediaMock = getMock("Wikipedia")
      ;(wikipediaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.3, reliabilityScore: 0.95 }) // Low confidence
      )
      const britannicaMock = getMock("Britannica")
      ;(britannicaMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ confidence: 0.8, reliabilityScore: 0.95 })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ narrative: null }))

      await orchestrator.enrichActor(testActor)

      // Only 2 distinct high-quality source families (wikimedia + britannica), not enough for early stop
      const biographyComMock = getMock("Biography.com")
      expect(biographyComMock.lookup).toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // enrichBatch
  // --------------------------------------------------------------------------
  describe("enrichBatch", () => {
    it("processes multiple actors and returns Map keyed by actor ID", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata" })
      )

      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult())

      const results = await orchestrator.enrichBatch([testActor, testActor2])

      expect(results).toBeInstanceOf(Map)
      expect(results.size).toBe(2)
      expect(results.has(testActor.id)).toBe(true)
      expect(results.has(testActor2.id)).toBe(true)

      const result1 = results.get(testActor.id)!
      expect(result1.actorId).toBe(testActor.id)
      expect(result1.data).not.toBeNull()

      const result2 = results.get(testActor2.id)!
      expect(result2.actorId).toBe(testActor2.id)
    })

    it("respects batch total cost limit", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        costLimits: {
          maxCostPerActor: 10.0,
          maxTotalCost: 10.0,
        },
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const wikidataMock = getMock("Wikidata")
      ;(wikidataMock.lookup as ReturnType<typeof vi.fn>).mockResolvedValue(
        createSuccessfulLookup({ sourceName: "Wikidata", cost: 0.001 })
      )

      // Synthesis costs $6 per call — exceeds $10 total after 2 actors
      vi.mocked(synthesizeBiography).mockResolvedValue(createSynthesisResult({ costUsd: 6.0 }))

      const actors = [testActor, testActor2, { ...testActor, id: 3, name: "Actor Three" }]
      const results = await orchestrator.enrichBatch(actors)

      // Should stop after 2 actors since total cost exceeds $10
      expect(results.size).toBe(2)
      expect(results.has(testActor.id)).toBe(true)
      expect(results.has(testActor2.id)).toBe(true)
      expect(results.has(3)).toBe(false)
    })

    it("processes all actors when under cost limit", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      // No sources succeed, so no synthesis cost
      const results = await orchestrator.enrichBatch([testActor, testActor2])

      expect(results.size).toBe(2)
    })

    it("returns empty Map for empty actor list", async () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      const results = await orchestrator.enrichBatch([])

      expect(results).toBeInstanceOf(Map)
      expect(results.size).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // getSourceCount / getSourceNames
  // --------------------------------------------------------------------------
  describe("getSourceCount / getSourceNames", () => {
    it("returns correct count after initialization", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: true,
          reference: true,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      expect(orchestrator.getSourceCount()).toBe(4) // 2 free + 2 reference
    })

    it("returns empty arrays when all categories disabled", () => {
      const orchestrator = new BiographyEnrichmentOrchestrator({
        sourceCategories: {
          free: false,
          reference: false,
          webSearch: false,
          news: false,
          obituary: false,
          archives: false,
          books: false,
          ai: false,
        },
      })

      expect(orchestrator.getSourceCount()).toBe(0)
      expect(orchestrator.getSourceNames()).toEqual([])
    })
  })
})
