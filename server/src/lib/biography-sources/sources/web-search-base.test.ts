import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock external dependencies before imports
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../death-sources/link-follower.js", () => ({
  fetchPages: vi.fn().mockResolvedValue([]),
  extractDomain: vi.fn((url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "")
    } catch {
      return ""
    }
  }),
}))

vi.mock("../content-cleaner.js", () => ({
  mechanicalPreClean: vi.fn().mockReturnValue({
    text: "",
    metadata: { title: null, publication: null, author: null, publishDate: null },
  }),
  aiExtractBiographicalContent: vi.fn().mockResolvedValue({
    extractedText: null,
    articleTitle: null,
    publication: null,
    author: null,
    publishDate: null,
    relevance: "none",
    contentType: "other",
    url: "",
    domain: "",
    originalBytes: 0,
    cleanedBytes: 0,
    costUsd: 0,
  }),
  shouldPassToSynthesis: vi.fn((relevance: string) => {
    return relevance === "high" || relevance === "medium"
  }),
}))

import {
  BiographyWebSearchBase,
  BIO_DOMAIN_SCORES,
  selectBiographyLinks,
  isCareerHeavyContent,
} from "./web-search-base.js"
import { BiographySourceType, type ActorForBiography } from "../types.js"
import { ReliabilityTier, DataSourceType } from "../../death-sources/types.js"
import type { SearchResult, FetchedPage } from "../../death-sources/types.js"
import { fetchPages } from "../../death-sources/link-follower.js"
import { mechanicalPreClean, aiExtractBiographicalContent } from "../content-cleaner.js"

// ============================================================================
// Concrete Test Subclass
// ============================================================================

/**
 * Concrete implementation for testing the abstract BiographyWebSearchBase.
 * Implements performSearch() with configurable canned results.
 */
class TestBiographyWebSearch extends BiographyWebSearchBase {
  readonly name = "Test Bio Search"
  readonly type = BiographySourceType.GOOGLE_SEARCH_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  /** Canned results returned by performSearch */
  searchResults: SearchResult[] = []
  searchError?: string

  protected async performSearch(): Promise<{
    results: SearchResult[]
    error?: string
  }> {
    return {
      results: this.searchResults,
      error: this.searchError,
    }
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 42,
  tmdb_id: 12345,
  imdb_person_id: "nm0001234",
  name: "Steve McQueen",
  birthday: "1930-03-24",
  deathday: "1980-11-07",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Beech Grove, Indiana, USA",
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: "Steve McQueen Biography",
    url: "https://www.biography.com/actors/steve-mcqueen",
    snippet: "Steve McQueen grew up in a troubled childhood...",
    source: DataSourceType.GOOGLE_SEARCH,
    domain: "biography.com",
    ...overrides,
  }
}

function makeFetchedPage(overrides: Partial<FetchedPage> = {}): FetchedPage {
  return {
    url: "https://www.biography.com/actors/steve-mcqueen",
    title: "Steve McQueen - Biography",
    content:
      "<html><body><article>Steve McQueen grew up in a troubled childhood in Beech Grove, Indiana. His parents divorced early and he was raised by his grandmother. He attended school intermittently and had a personal struggle with poverty before finding fame.</article></body></html>",
    contentLength: 300,
    fetchTimeMs: 500,
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("BiographyWebSearchBase", () => {
  let source: TestBiographyWebSearch

  beforeEach(() => {
    vi.clearAllMocks()
    source = new TestBiographyWebSearch()
  })

  // ==========================================================================
  // Query Building
  // ==========================================================================

  describe("getSearchQueries", () => {
    it("returns multiple biography-focused queries containing actor name", () => {
      const queries = source.getSearchQueries(testActor)

      expect(queries.length).toBeGreaterThanOrEqual(3)

      for (const query of queries) {
        expect(query).toContain('"Steve McQueen"')
      }
    })

    it("includes queries about childhood, family, and personal life", () => {
      const queries = source.getSearchQueries(testActor)
      const allQueries = queries.join(" ")

      expect(allQueries).toContain("childhood")
      expect(allQueries).toContain("family")
      expect(allQueries).toContain("personal life")
    })

    it("includes queries about early career and before fame", () => {
      const queries = source.getSearchQueries(testActor)
      const allQueries = queries.join(" ")

      expect(allQueries).toContain("before fame")
    })

    it("includes queries about lesser known facts", () => {
      const queries = source.getSearchQueries(testActor)
      const allQueries = queries.join(" ")

      expect(allQueries).toContain("lesser known")
    })
  })

  // ==========================================================================
  // Domain Scoring
  // ==========================================================================

  describe("BIO_DOMAIN_SCORES", () => {
    it("ranks biography.com highest", () => {
      expect(BIO_DOMAIN_SCORES["biography.com"]).toBe(95)
    })

    it("ranks britannica.com very high", () => {
      expect(BIO_DOMAIN_SCORES["britannica.com"]).toBe(90)
    })

    it("ranks imdb.com low", () => {
      expect(BIO_DOMAIN_SCORES["imdb.com"]).toBe(15)
    })

    it("ranks pinterest.com very low", () => {
      expect(BIO_DOMAIN_SCORES["pinterest.com"]).toBe(5)
    })

    it("ranks entertainment trade press lower than biography sites", () => {
      expect(BIO_DOMAIN_SCORES["variety.com"]).toBeLessThan(BIO_DOMAIN_SCORES["biography.com"])
      expect(BIO_DOMAIN_SCORES["hollywoodreporter.com"]).toBeLessThan(
        BIO_DOMAIN_SCORES["britannica.com"]
      )
      expect(BIO_DOMAIN_SCORES["deadline.com"]).toBeLessThan(BIO_DOMAIN_SCORES["people.com"])
    })

    it("ranks quality news sites higher than entertainment trade", () => {
      expect(BIO_DOMAIN_SCORES["theguardian.com"]).toBeGreaterThan(BIO_DOMAIN_SCORES["variety.com"])
      expect(BIO_DOMAIN_SCORES["nytimes.com"]).toBeGreaterThan(
        BIO_DOMAIN_SCORES["hollywoodreporter.com"]
      )
    })

    it("ranks social media low", () => {
      expect(BIO_DOMAIN_SCORES["twitter.com"]).toBeLessThanOrEqual(20)
      expect(BIO_DOMAIN_SCORES["facebook.com"]).toBeLessThanOrEqual(15)
      expect(BIO_DOMAIN_SCORES["instagram.com"]).toBeLessThanOrEqual(15)
    })
  })

  // ==========================================================================
  // Link Selection Heuristics
  // ==========================================================================

  describe("selectBiographyLinks", () => {
    it("ranks biography.com higher than imdb.com", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://www.imdb.com/name/nm0000537/",
          domain: "imdb.com",
          title: "Steve McQueen - IMDb",
          snippet: "Steve McQueen filmography",
        }),
        makeSearchResult({
          url: "https://www.biography.com/actors/steve-mcqueen",
          domain: "biography.com",
          title: "Steve McQueen Biography",
          snippet: "Steve McQueen grew up in childhood poverty...",
        }),
      ]

      const selected = selectBiographyLinks(results, 1)

      expect(selected).toHaveLength(1)
      expect(selected[0]).toContain("biography.com")
    })

    it("ranks britannica.com higher than variety.com", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://www.variety.com/article/steve-mcqueen",
          domain: "variety.com",
          title: "Steve McQueen Career",
          snippet: "filmography and awards...",
        }),
        makeSearchResult({
          url: "https://www.britannica.com/biography/steve-mcqueen",
          domain: "britannica.com",
          title: "Steve McQueen - Biography",
          snippet: "Steve McQueen early life and education...",
        }),
      ]

      const selected = selectBiographyLinks(results, 1)

      expect(selected).toHaveLength(1)
      expect(selected[0]).toContain("britannica.com")
    })

    it("filters out blocked domains", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://www.pinterest.com/pin/steve-mcqueen",
          domain: "pinterest.com",
          title: "Steve McQueen Photos",
        }),
        makeSearchResult({
          url: "https://www.amazon.com/dp/steve-mcqueen",
          domain: "amazon.com",
          title: "Steve McQueen DVD",
        }),
        makeSearchResult({
          url: "https://www.biography.com/actors/steve-mcqueen",
          domain: "biography.com",
          title: "Steve McQueen Biography",
        }),
      ]

      const selected = selectBiographyLinks(results, 5)

      expect(selected).toHaveLength(1)
      expect(selected[0]).toContain("biography.com")
    })

    it("respects maxLinks parameter", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://www.biography.com/actors/steve-mcqueen",
          domain: "biography.com",
        }),
        makeSearchResult({
          url: "https://www.britannica.com/biography/steve-mcqueen",
          domain: "britannica.com",
        }),
        makeSearchResult({
          url: "https://www.theguardian.com/film/steve-mcqueen",
          domain: "theguardian.com",
        }),
        makeSearchResult({
          url: "https://www.nytimes.com/topic/person/steve-mcqueen",
          domain: "nytimes.com",
        }),
      ]

      const selected = selectBiographyLinks(results, 2)

      expect(selected).toHaveLength(2)
    })

    it("boosts results with biography keywords in title/snippet", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://example.com/page1",
          domain: "example.com",
          title: "Steve McQueen filmography",
          snippet: "Complete list of movies...",
        }),
        makeSearchResult({
          url: "https://example.com/page2",
          domain: "example.com",
          title: "Steve McQueen early life and childhood",
          snippet: "Born in Indiana, his personal family background...",
        }),
      ]

      const selected = selectBiographyLinks(results, 1)

      expect(selected[0]).toContain("page2")
    })

    it("returns empty array when all results are blocked", () => {
      const results: SearchResult[] = [
        makeSearchResult({
          url: "https://www.pinterest.com/pin/1",
          domain: "pinterest.com",
        }),
        makeSearchResult({
          url: "https://www.amazon.com/dp/1",
          domain: "amazon.com",
        }),
      ]

      const selected = selectBiographyLinks(results, 5)

      expect(selected).toHaveLength(0)
    })
  })

  // ==========================================================================
  // Career Content Filter
  // ==========================================================================

  describe("isCareerHeavyContent", () => {
    it("identifies career-heavy content", () => {
      const careerText =
        "Awards: Academy Award for Best Picture. Nominations: " +
        "BAFTA, Golden Globe. Box office gross: $500 million. " +
        "Career highlights include filmography spanning decades. " +
        "Selected works and accolades include numerous awards."

      expect(isCareerHeavyContent(careerText)).toBe(true)
    })

    it("does not filter biographical content", () => {
      const bioText =
        "Steve McQueen grew up in a troubled childhood in Beech Grove, Indiana. " +
        "His parents divorced when he was young, and he was raised by his " +
        "grandmother on a farm. He attended school intermittently. Before fame, " +
        "he worked odd jobs and had a personal struggle with poverty. " +
        "His education was spotty, and he eventually found his way to acting."

      expect(isCareerHeavyContent(bioText)).toBe(false)
    })

    it("returns false for short text", () => {
      expect(isCareerHeavyContent("")).toBe(false)
      expect(isCareerHeavyContent("short")).toBe(false)
    })

    it("filters content with only career keywords and no bio keywords", () => {
      const pureCareer =
        "Awards nominations filmography career accolades selected works. " +
        "The actor received numerous awards for outstanding career achievements. " +
        "Box office returns were impressive and the filmography spans multiple decades."

      expect(isCareerHeavyContent(pureCareer)).toBe(true)
    })

    it("keeps mixed content where bio keywords are present", () => {
      const mixedText =
        "He grew up in poverty and had a difficult childhood with his parents. " +
        "His education was limited. After years of struggle, his career " +
        "took off with several awards and nominations."

      expect(isCareerHeavyContent(mixedText)).toBe(false)
    })
  })

  // ==========================================================================
  // Content Cleaning Integration
  // ==========================================================================

  describe("content cleaning integration", () => {
    it("runs fetched pages through mechanicalPreClean", async () => {
      const fetchedPage = makeFetchedPage()
      const bioText =
        "Steve McQueen grew up in a troubled childhood. His parents divorced early. " +
        "He was raised by his grandmother. He attended school intermittently."

      vi.mocked(fetchPages).mockResolvedValueOnce([fetchedPage])
      vi.mocked(mechanicalPreClean).mockReturnValueOnce({
        text: bioText,
        metadata: {
          title: "Steve McQueen Biography",
          publication: null,
          author: null,
          publishDate: null,
        },
      })

      source.searchResults = [makeSearchResult()]

      const result = await source.lookup(testActor)

      expect(mechanicalPreClean).toHaveBeenCalledWith(fetchedPage.content)
      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.text).toContain("childhood")
    })

    it("uses AI extraction when useAiCleaning is enabled", async () => {
      source.setConfig({ useAiCleaning: true })

      const fetchedPage = makeFetchedPage()
      const mechanicalText =
        "Steve McQueen grew up in childhood poverty with his parents. " +
        "He attended various schools and had a personal life marked by struggle. " +
        "His education was limited by the family circumstances."

      vi.mocked(fetchPages).mockResolvedValueOnce([fetchedPage])
      vi.mocked(mechanicalPreClean).mockReturnValueOnce({
        text: mechanicalText,
        metadata: {
          title: "Steve McQueen",
          publication: null,
          author: null,
          publishDate: null,
        },
      })
      vi.mocked(aiExtractBiographicalContent).mockResolvedValueOnce({
        extractedText:
          "Steve McQueen grew up in poverty in Indiana. His family struggled financially.",
        articleTitle: "Steve McQueen Profile",
        publication: "Biography.com",
        author: null,
        publishDate: null,
        relevance: "high",
        contentType: "biography",
        url: fetchedPage.url,
        domain: "biography.com",
        originalBytes: 100,
        cleanedBytes: 80,
        costUsd: 0.001,
      })

      source.searchResults = [makeSearchResult()]

      const result = await source.lookup(testActor)

      expect(aiExtractBiographicalContent).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data!.text).toContain("poverty")
    })

    it("skips pages when AI extraction finds low relevance", async () => {
      source.setConfig({ useAiCleaning: true })

      const fetchedPage = makeFetchedPage()

      vi.mocked(fetchPages).mockResolvedValueOnce([fetchedPage])
      vi.mocked(mechanicalPreClean).mockReturnValueOnce({
        text: "Some unrelated content about a completely different topic. This page discusses various unrelated topics at length without mentioning biographical details of any specific person.",
        metadata: {
          title: "Unrelated Page",
          publication: null,
          author: null,
          publishDate: null,
        },
      })
      vi.mocked(aiExtractBiographicalContent).mockResolvedValueOnce({
        extractedText: null,
        articleTitle: null,
        publication: null,
        author: null,
        publishDate: null,
        relevance: "none",
        contentType: "other",
        url: fetchedPage.url,
        domain: "biography.com",
        originalBytes: 100,
        cleanedBytes: 0,
        costUsd: 0.001,
      })

      source.searchResults = [makeSearchResult()]

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No biographical content")
    })
  })

  // ==========================================================================
  // Empty Results Handling
  // ==========================================================================

  describe("empty results handling", () => {
    it("returns failure when search returns no results", async () => {
      source.searchResults = []

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No search results found")
    })

    it("returns failure when search returns error", async () => {
      source.searchError = "API rate limit exceeded"
      source.searchResults = []

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("API rate limit exceeded")
    })

    it("returns failure when all pages fail to fetch", async () => {
      source.searchResults = [makeSearchResult()]

      vi.mocked(fetchPages).mockResolvedValueOnce([
        {
          url: "https://www.biography.com/actors/steve-mcqueen",
          title: "",
          content: "",
          contentLength: 0,
          fetchTimeMs: 500,
          error: "HTTP 403",
        },
      ])

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Failed to fetch any pages")
    })

    it("returns failure when all links are blocked domains", async () => {
      source.searchResults = [
        makeSearchResult({
          url: "https://www.pinterest.com/pin/steve-mcqueen",
          domain: "pinterest.com",
        }),
      ]

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No suitable links found after filtering")
    })
  })

  // ==========================================================================
  // Full performLookup Flow
  // ==========================================================================

  describe("performLookup flow", () => {
    it("completes the full flow with a concrete test subclass", async () => {
      const bioContent =
        "Steve McQueen was born in Beech Grove, Indiana. He had a troubled childhood " +
        "growing up in poverty. His parents divorced when he was young. He attended school " +
        "intermittently before eventually joining the Marines."

      source.searchResults = [
        makeSearchResult({
          url: "https://www.biography.com/actors/steve-mcqueen",
          domain: "biography.com",
          title: "Steve McQueen - Actor, Biography",
          snippet: "Growing up in Beech Grove, Indiana...",
        }),
        makeSearchResult({
          url: "https://www.people.com/movies/steve-mcqueen-profile",
          domain: "people.com",
          title: "Steve McQueen: The King of Cool",
          snippet: "His troubled childhood...",
        }),
      ]

      vi.mocked(fetchPages).mockResolvedValueOnce([
        makeFetchedPage({
          url: "https://www.biography.com/actors/steve-mcqueen",
          content: `<html><body><article>${bioContent}</article></body></html>`,
        }),
        makeFetchedPage({
          url: "https://www.people.com/movies/steve-mcqueen-profile",
          content:
            "<html><body><article>Another page about personal life and family background of the actor.</article></body></html>",
        }),
      ])

      vi.mocked(mechanicalPreClean)
        .mockReturnValueOnce({
          text: bioContent,
          metadata: {
            title: "Steve McQueen - Actor, Biography",
            publication: "Biography.com",
            author: null,
            publishDate: null,
          },
        })
        .mockReturnValueOnce({
          text: "Another page about personal life and family background of the actor.",
          metadata: {
            title: "Steve McQueen: The King of Cool",
            publication: "People",
            author: null,
            publishDate: null,
          },
        })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.text).toContain("childhood")
      expect(result.data!.text).toContain("poverty")
      expect(result.data!.sourceType).toBe(BiographySourceType.GOOGLE_SEARCH_BIO)
      expect(result.data!.domain).toBe("biography.com")
      expect(result.source.confidence).toBeGreaterThan(0)
    })

    it("filters out career-heavy pages from results", async () => {
      source.searchResults = [
        makeSearchResult({
          url: "https://example.com/career-page",
          domain: "example.com",
        }),
        makeSearchResult({
          url: "https://example.com/bio-page",
          domain: "example.com",
        }),
      ]

      vi.mocked(fetchPages).mockResolvedValueOnce([
        makeFetchedPage({
          url: "https://example.com/career-page",
          content:
            "Career filmography awards and nominations spanning decades of work in the entertainment industry with many selected works and accolades throughout the years.",
          contentLength: 160,
        }),
        makeFetchedPage({
          url: "https://example.com/bio-page",
          content:
            "Biographical childhood and parents information about personal life growing up in a small town. Education and early life details are documented here with family stories.",
          contentLength: 170,
        }),
      ])

      vi.mocked(mechanicalPreClean)
        .mockReturnValueOnce({
          text: "Awards: Academy Award for Best Picture. Nominations: BAFTA and Golden Globe. Career filmography spanning decades across many genres. Box office results were impressive. Selected works accolades and career milestones throughout the years.",
          metadata: { title: "Career Page", publication: null, author: null, publishDate: null },
        })
        .mockReturnValueOnce({
          text: "He grew up in a small town in the heartland of America. His childhood was shaped by his parents and extended family. He attended school and got his education locally. Before fame he worked odd jobs and struggled with personal issues.",
          metadata: { title: "Bio Page", publication: null, author: null, publishDate: null },
        })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.text).not.toContain("Academy Award")
      expect(result.data!.text).toContain("childhood")
    })

    it("sets correct source metadata on result", async () => {
      source.searchResults = [makeSearchResult()]

      vi.mocked(fetchPages).mockResolvedValueOnce([makeFetchedPage()])
      vi.mocked(mechanicalPreClean).mockReturnValueOnce({
        text: "A person who grew up in childhood with their parents and went to school in the local area. Personal life details are included here along with information about their family background and education history.",
        metadata: {
          title: "Steve McQueen - Biography",
          publication: "Biography.com",
          author: null,
          publishDate: null,
        },
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(BiographySourceType.GOOGLE_SEARCH_BIO)
      expect(result.source.domain).toBe("biography.com")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.retrievedAt).toBeInstanceOf(Date)
    })
  })

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe("configuration", () => {
    it("uses default config values", () => {
      const config = source.getConfig()

      expect(config.maxLinksToFollow).toBe(3)
      expect(config.useAiCleaning).toBe(false)
      expect(config.blockedDomains).toContain("pinterest.com")
      expect(config.blockedDomains).toContain("amazon.com")
    })

    it("allows overriding config", () => {
      source.setConfig({
        maxLinksToFollow: 5,
        useAiCleaning: true,
      })

      const config = source.getConfig()

      expect(config.maxLinksToFollow).toBe(5)
      expect(config.useAiCleaning).toBe(true)
      // Blocked domains should still have defaults
      expect(config.blockedDomains).toContain("pinterest.com")
    })

    it("allows overriding blocked domains", () => {
      source.setConfig({
        blockedDomains: ["custom-blocked.com"],
      })

      const config = source.getConfig()

      expect(config.blockedDomains).toEqual(["custom-blocked.com"])
      expect(config.blockedDomains).not.toContain("pinterest.com")
    })
  })
})
