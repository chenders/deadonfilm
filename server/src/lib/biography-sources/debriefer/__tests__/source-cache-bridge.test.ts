import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the cache module before any imports that use it
vi.mock("../../../death-sources/cache.js", () => ({
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../../logger.js", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    }),
  },
}))

import {
  resolveSourceType,
  cacheSourceFinding,
  cacheSourceFailure,
} from "../source-cache-bridge.js"
import { BiographySourceType } from "../../types.js"
import { setCachedQuery } from "../../../death-sources/cache.js"

describe("resolveSourceType", () => {
  it("maps known display names to BiographySourceType values", () => {
    expect(resolveSourceType("Wikipedia")).toBe(BiographySourceType.WIKIPEDIA_BIO)
    expect(resolveSourceType("Wikidata")).toBe(BiographySourceType.WIKIDATA_BIO)
    expect(resolveSourceType("The Guardian")).toBe(BiographySourceType.GUARDIAN_BIO)
    expect(resolveSourceType("New York Times")).toBe(BiographySourceType.NYTIMES_BIO)
    expect(resolveSourceType("AP News")).toBe(BiographySourceType.AP_NEWS_BIO)
    expect(resolveSourceType("BBC News")).toBe(BiographySourceType.BBC_NEWS_BIO)
    expect(resolveSourceType("Reuters")).toBe(BiographySourceType.REUTERS_BIO)
    expect(resolveSourceType("Google Search")).toBe(BiographySourceType.GOOGLE_SEARCH_BIO)
    expect(resolveSourceType("Bing Search")).toBe(BiographySourceType.BING_SEARCH_BIO)
    expect(resolveSourceType("Brave Search")).toBe(BiographySourceType.BRAVE_SEARCH_BIO)
    expect(resolveSourceType("DuckDuckGo")).toBe(BiographySourceType.DUCKDUCKGO_BIO)
  })

  it("maps reference site display names", () => {
    expect(resolveSourceType("Britannica")).toBe(BiographySourceType.BRITANNICA)
    expect(resolveSourceType("Biography.com")).toBe(BiographySourceType.BIOGRAPHY_COM)
    expect(resolveSourceType("TCM")).toBe(BiographySourceType.TCM_BIO)
    expect(resolveSourceType("AllMusic")).toBe(BiographySourceType.ALLMUSIC_BIO)
  })

  it("maps news source display names", () => {
    expect(resolveSourceType("NPR")).toBe(BiographySourceType.NPR_BIO)
    expect(resolveSourceType("The Independent")).toBe(BiographySourceType.INDEPENDENT_BIO)
    expect(resolveSourceType("The Telegraph")).toBe(BiographySourceType.TELEGRAPH_BIO)
    expect(resolveSourceType("Washington Post")).toBe(BiographySourceType.WASHINGTON_POST_BIO)
    expect(resolveSourceType("Los Angeles Times")).toBe(BiographySourceType.LA_TIMES_BIO)
    expect(resolveSourceType("Time")).toBe(BiographySourceType.TIME_BIO)
    expect(resolveSourceType("The New Yorker")).toBe(BiographySourceType.NEW_YORKER_BIO)
    expect(resolveSourceType("PBS")).toBe(BiographySourceType.PBS_BIO)
    expect(resolveSourceType("Rolling Stone")).toBe(BiographySourceType.ROLLING_STONE_BIO)
    expect(resolveSourceType("National Geographic")).toBe(
      BiographySourceType.NATIONAL_GEOGRAPHIC_BIO
    )
    expect(resolveSourceType("People")).toBe(BiographySourceType.PEOPLE_BIO)
    expect(resolveSourceType("Smithsonian")).toBe(BiographySourceType.SMITHSONIAN_BIO)
    expect(resolveSourceType("History.com")).toBe(BiographySourceType.HISTORY_COM_BIO)
  })

  it("maps book and archive display names", () => {
    expect(resolveSourceType("Google Books")).toBe(BiographySourceType.GOOGLE_BOOKS_BIO)
    expect(resolveSourceType("Open Library")).toBe(BiographySourceType.OPEN_LIBRARY_BIO)
    expect(resolveSourceType("IA Books")).toBe(BiographySourceType.IA_BOOKS_BIO)
    expect(resolveSourceType("Find a Grave")).toBe(BiographySourceType.FINDAGRAVE_BIO)
    expect(resolveSourceType("Legacy.com")).toBe(BiographySourceType.LEGACY_BIO)
    expect(resolveSourceType("Chronicling America")).toBe(
      BiographySourceType.CHRONICLING_AMERICA_BIO
    )
    expect(resolveSourceType("Trove")).toBe(BiographySourceType.TROVE_BIO)
    expect(resolveSourceType("Europeana")).toBe(BiographySourceType.EUROPEANA_BIO)
    expect(resolveSourceType("Internet Archive")).toBe(BiographySourceType.INTERNET_ARCHIVE_BIO)
  })

  it("returns null for unknown source names", () => {
    expect(resolveSourceType("Unknown Source")).toBeNull()
    expect(resolveSourceType("SomeFutureSource")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(resolveSourceType("")).toBeNull()
  })
})

describe("cacheSourceFinding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes finding to cache in BiographyLookupResult format for resynthesizeFromCache", () => {
    const finding = {
      text: "Born in Iowa, he grew up on a farm.",
      confidence: 0.8,
      url: "https://example.com",
    }

    cacheSourceFinding(123, "Wikipedia", finding, 0)

    expect(setCachedQuery).toHaveBeenCalledWith({
      sourceType: BiographySourceType.WIKIPEDIA_BIO,
      actorId: 123,
      queryString: "debriefer-bio:Wikipedia:actor:123",
      responseStatus: 200,
      responseData: {
        success: true,
        source: {
          type: BiographySourceType.WIKIPEDIA_BIO,
          url: "https://example.com",
          retrievedAt: expect.any(Date),
          confidence: 0.8,
          costUsd: 0,
        },
        data: {
          sourceName: "Wikipedia",
          sourceType: BiographySourceType.WIKIPEDIA_BIO,
          text: "Born in Iowa, he grew up on a farm.",
          url: "https://example.com",
          confidence: 0.8,
        },
      },
      costUsd: 0,
    })
  })

  it("uses bio-prefixed query string to distinguish from death cache entries", () => {
    const finding = { text: "Content", confidence: 0.7 }

    cacheSourceFinding(456, "The Guardian", finding, 0.005)

    expect(setCachedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryString: "debriefer-bio:The Guardian:actor:456",
        sourceType: BiographySourceType.GUARDIAN_BIO,
        costUsd: 0.005,
      })
    )
  })

  it("does not call setCachedQuery for unknown source names", () => {
    const finding = { text: "Content", confidence: 0.5 }

    cacheSourceFinding(123, "Unknown Source", finding, 0)

    expect(setCachedQuery).not.toHaveBeenCalled()
  })
})

describe("cacheSourceFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes failure to cache with error message", () => {
    cacheSourceFailure(123, "Wikipedia", "no result", 0)

    expect(setCachedQuery).toHaveBeenCalledWith({
      sourceType: BiographySourceType.WIKIPEDIA_BIO,
      actorId: 123,
      queryString: "debriefer-bio:Wikipedia:actor:123",
      responseStatus: 500,
      errorMessage: "no result",
      costUsd: 0,
    })
  })

  it("handles undefined costUsd by defaulting to null", () => {
    cacheSourceFailure(123, "The Guardian", "timeout")

    expect(setCachedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        costUsd: null,
      })
    )
  })

  it("does not call setCachedQuery for unknown source names", () => {
    cacheSourceFailure(123, "Unknown Source", "error")

    expect(setCachedQuery).not.toHaveBeenCalled()
  })
})
