/**
 * End-to-end integration test for the biography enrichment pipeline.
 *
 * Tests the full flow:
 *   Orchestrator → WikidataBiographySource → fetch (mocked) → Wikidata SPARQL
 *   Orchestrator → WikipediaBiographySource → fetch (mocked) → Wikipedia API
 *   Orchestrator → synthesizeBiography → Anthropic SDK (mocked) → Claude
 *   writeBiographyToProduction → Pool (mocked) → SQL assertions
 *
 * Unlike the unit tests (orchestrator.test.ts), this test does NOT mock individual
 * source classes. It exercises the real Wikidata and Wikipedia source implementations,
 * mocking only external I/O boundaries (fetch, Anthropic SDK, database, cache).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Pool } from "pg"

// ============================================================================
// Mocks — must be declared before imports
// ============================================================================

// Shared mock function for Anthropic messages.create — lives outside vi.mock
// so vi.clearAllMocks() only clears call history, not the reference itself.
const anthropicMockCreate = vi.fn()

// Mock the death-sources cache (used by BaseBiographySource for query caching)
vi.mock("../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock the actor cache invalidation (used by DB writer)
vi.mock("../cache.js", () => ({
  invalidateActorCache: vi.fn().mockResolvedValue(undefined),
}))

// Mock the Anthropic SDK for Claude synthesis.
// The factory returns a constructor that always delegates to anthropicMockCreate.
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function Anthropic() {
      return {
        messages: {
          create: anthropicMockCreate,
        },
      }
    },
  }
})

// Mock wtf_wikipedia (used by WikipediaBiographySource)
vi.mock("wtf_wikipedia", () => {
  const mockFetch = vi.fn()
  return {
    default: {
      fetch: mockFetch,
      Document: class {},
      Section: class {},
    },
    __mockFetch: mockFetch,
  }
})

// Mock the database pool (used by saveRejectedFactors when invalid factors are stripped)
const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock("../db/pool.js", () => ({
  getPool: () => ({ query: mockPoolQuery }),
}))

// ============================================================================
// Imports — after mocks
// ============================================================================

import { BiographyEnrichmentOrchestrator } from "./orchestrator.js"
import { writeBiographyToProduction } from "../biography-enrichment-db-writer.js"
import { invalidateActorCache } from "../cache.js"
import type { ActorForBiography, BiographyData, BiographySourceEntry } from "./types.js"
import { BiographySourceType } from "./types.js"
import wtf from "wtf_wikipedia"

const mockWtfFetch = vi.mocked(wtf.fetch)

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 42,
  tmdb_id: 4724,
  imdb_person_id: "nm0000078",
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
  biography_raw_tmdb: "Famous actor known for westerns and war films.",
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

/**
 * Realistic Wikidata SPARQL response for John Wayne.
 */
const WIKIDATA_SPARQL_RESPONSE = {
  results: {
    bindings: [
      {
        person: { value: "http://www.wikidata.org/entity/Q40531" },
        personLabel: { value: "John Wayne" },
        education: { value: "University of Southern California" },
        spouses: { value: "Josephine Alicia Saenz, Esperanza Baur, Pilar Pallete" },
        children: { value: "Michael Wayne, Patrick Wayne, Ethan Wayne, Aissa Wayne" },
        fathers: { value: "Clyde Leonard Morrison" },
        mothers: { value: "Mary Alberta Brown" },
        siblings: { value: "Robert Emmet Morrison" },
        militaryService: { value: "" },
        religions: { value: "Catholic Church" },
        birthPlaces: { value: "Winterset" },
        citizenships: { value: "United States of America" },
        occupations: { value: "actor, film producer, film director" },
        awards: { value: "Congressional Gold Medal" },
        birthDate: { value: "1907-05-26T00:00:00Z" },
      },
    ],
  },
}

/**
 * Realistic Wikipedia sections list response.
 */
const WIKIPEDIA_SECTIONS_RESPONSE = {
  parse: {
    title: "John Wayne",
    pageid: 16043,
    sections: [
      { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
      { index: "2", line: "Career", level: "2", anchor: "Career" },
      { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
      { index: "4", line: "Political views", level: "2", anchor: "Political_views" },
      { index: "5", line: "Death", level: "2", anchor: "Death" },
      { index: "6", line: "Filmography", level: "2", anchor: "Filmography" },
      { index: "7", line: "Awards and nominations", level: "2", anchor: "Awards_and_nominations" },
      { index: "8", line: "References", level: "2", anchor: "References" },
    ],
  },
}

/**
 * Wikipedia intro section (section 0) HTML content.
 */
const WIKIPEDIA_INTRO_HTML = {
  parse: {
    title: "John Wayne",
    pageid: 16043,
    text: {
      "*": "<p><b>Marion Robert Morrison</b> (May 26, 1907 – June 11, 1979), known professionally as <b>John Wayne</b>, was an American actor who became one of the biggest box-office draws. Born in Winterset, Iowa, his family moved to Southern California early in his childhood. He grew up in Glendale, California, where he attended school and played football.</p>",
    },
  },
}

/**
 * Wikipedia "Early life" section HTML content.
 */
const WIKIPEDIA_EARLY_LIFE_HTML = {
  parse: {
    title: "John Wayne",
    pageid: 16043,
    text: {
      "*": "<p>Wayne was born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa, to Mary Alberta (Brown) and Clyde Leonard Morrison, a pharmacist. His parents changed his middle name to Mitchell. He had a younger brother, Robert Emmet Morrison. The family lived in Palmdale, California, before moving to Glendale, where his father worked at a drugstore. Wayne attended Glendale Union High School, where he was president of the Latin Society and played on the football team. He was educated at the University of Southern California on a football scholarship.</p>",
    },
  },
}

/**
 * Wikipedia "Personal life" section HTML content.
 */
const WIKIPEDIA_PERSONAL_LIFE_HTML = {
  parse: {
    title: "John Wayne",
    pageid: 16043,
    text: {
      "*": "<p>Wayne married three times: first to Josephine Alicia Saenz in 1933, then to Esperanza Baur in 1946, and finally to Pilar Pallete in 1954. He had seven children across his marriages. He struggled with alcoholism during the 1950s. Wayne was a self-described conservative and became a prominent supporter of the Republican Party. In 1964, he was diagnosed with lung cancer and had his entire left lung removed.</p>",
    },
  },
}

/**
 * Claude synthesis response with realistic biography JSON.
 */
const CLAUDE_SYNTHESIS_RESPONSE = {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        narrative:
          "The boy who would become John Wayne grew up far from Hollywood glamour. Born Marion Robert Morrison in a small Iowa farmhouse, he spent his earliest years watching his father struggle as a pharmacist in various small towns. When the family relocated to Southern California, young Marion found himself an outsider, a Midwestern kid in a sun-bleached California world. He threw himself into football at Glendale Union High School, where he also served as president of the Latin Society. A football scholarship took him to the University of Southern California, but a body-surfing injury ended his athletic career and, with it, his scholarship. Stranded without tuition money, he took odd jobs at the Fox Film lot — a decision that would reshape American cinema. Wayne married three times. His first marriage to Josephine Saenz produced four children but ended in 1945. His union with Esperanza Baur was turbulent, marked by jealousy and public arguments. His third marriage, to Peruvian actress Pilar Pallete, lasted until his death. He struggled with alcoholism during the 1950s. In 1964, doctors removed his entire left lung after discovering cancer — Wayne later became an advocate for cancer awareness.",
        narrative_confidence: "high",
        life_notable_factors: ["athlete", "rags_to_riches", "addiction_recovery"],
        birthplace_details:
          "Born in Winterset, Iowa, a small rural town. His family moved to Palmdale and then Glendale, California, during his childhood.",
        family_background:
          "Son of Clyde Leonard Morrison, a pharmacist, and Mary Alberta Brown. Had one younger brother, Robert Emmet Morrison.",
        education:
          "Attended Glendale Union High School, where he was president of the Latin Society and played football. Received a football scholarship to the University of Southern California but lost it after a body-surfing injury.",
        pre_fame_life:
          "After losing his scholarship, took odd jobs at the Fox Film lot to support himself.",
        fame_catalyst:
          "His work as a prop man at Fox Film studios led director John Ford to take notice, beginning a decades-long professional relationship.",
        personal_struggles:
          "Struggled with alcoholism in the 1950s. Diagnosed with lung cancer in 1964 and had his left lung removed.",
        relationships:
          "Married three times: Josephine Saenz (1933-1945), Esperanza Baur (1946-1954), Pilar Pallete (1954-1979). Seven children total.",
        lesser_known_facts: [
          "Was president of the Latin Society in high school",
          "Lost his football scholarship due to a body-surfing injury",
          "His birth name was Marion Robert Morrison",
          "His father was a pharmacist who struggled financially",
        ],
        has_substantive_content: true,
      }),
    },
  ],
  usage: {
    input_tokens: 2500,
    output_tokens: 800,
  },
}

// ============================================================================
// wtf_wikipedia Mock Helpers
// ============================================================================

function mockSection(sectionTitle: string, sectionText: string, sectionDepth = 0) {
  return {
    title: () => sectionTitle,
    text: () => sectionText,
    depth: () => sectionDepth,
  }
}

function mockDocument(
  docTitle: string,
  sectionList: ReturnType<typeof mockSection>[],
  options?: { isDisambig?: boolean }
) {
  return {
    title: () => docTitle,
    isDisambiguation: () => options?.isDisambig ?? false,
    sections: () => sectionList,
  }
}

/**
 * Realistic John Wayne Wikipedia document for wtf_wikipedia.
 */
function createJohnWayneWtfDoc() {
  return mockDocument("John Wayne", [
    mockSection(
      "",
      "Marion Robert Morrison (May 26, 1907 – June 11, 1979), known professionally as John Wayne, was an American actor who became one of the biggest box-office draws. Born in Winterset, Iowa, his family moved to Southern California early in his childhood. He grew up in Glendale, California, where he attended school and played football."
    ),
    mockSection(
      "Early life",
      "Wayne was born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa, to Mary Alberta (Brown) and Clyde Leonard Morrison, a pharmacist. His parents changed his middle name to Mitchell. He had a younger brother, Robert Emmet Morrison. The family lived in Palmdale, California, before moving to Glendale, where his father worked at a drugstore. Wayne attended Glendale Union High School, where he was president of the Latin Society and played on the football team. He was educated at the University of Southern California on a football scholarship."
    ),
    mockSection(
      "Career",
      "Wayne appeared in many westerns and war films throughout his lengthy career."
    ),
    mockSection(
      "Personal life",
      "Wayne married three times: first to Josephine Alicia Saenz in 1933, then to Esperanza Baur in 1946, and finally to Pilar Pallete in 1954. He had seven children across his marriages. He struggled with alcoholism during the 1950s. Wayne was a self-described conservative and became a prominent supporter of the Republican Party. In 1964, he was diagnosed with lung cancer and had his entire left lung removed."
    ),
    mockSection(
      "Political views",
      "Wayne was a conservative and supported the Republican Party throughout his life."
    ),
    mockSection(
      "Death",
      "Wayne died on June 11, 1979, at UCLA Medical Center from stomach cancer."
    ),
    mockSection("Filmography", "A comprehensive list of his film appearances and credits."),
    mockSection("Awards and nominations", "Wayne received various awards throughout his career."),
    mockSection("References", "External references and citations."),
  ])
}

// ============================================================================
// Fetch Mock Helpers
// ============================================================================

/**
 * Build a mock fetch that routes requests to realistic API responses.
 */
function createMockFetch() {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url

    // Wikidata SPARQL endpoint
    if (urlStr.includes("query.wikidata.org/sparql")) {
      return new Response(JSON.stringify(WIKIDATA_SPARQL_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/sparql-results+json" },
      })
    }

    // Wikipedia API — section list
    if (urlStr.includes("en.wikipedia.org/w/api.php") && urlStr.includes("prop=sections")) {
      return new Response(JSON.stringify(WIKIPEDIA_SECTIONS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Wikipedia API — section content (section=0 → intro)
    if (
      urlStr.includes("en.wikipedia.org/w/api.php") &&
      urlStr.includes("prop=text") &&
      urlStr.includes("section=0")
    ) {
      return new Response(JSON.stringify(WIKIPEDIA_INTRO_HTML), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Wikipedia API — section content for "Early life" (section=1)
    if (
      urlStr.includes("en.wikipedia.org/w/api.php") &&
      urlStr.includes("prop=text") &&
      urlStr.includes("section=1")
    ) {
      return new Response(JSON.stringify(WIKIPEDIA_EARLY_LIFE_HTML), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Wikipedia API — section content for "Personal life" (section=3)
    if (
      urlStr.includes("en.wikipedia.org/w/api.php") &&
      urlStr.includes("prop=text") &&
      urlStr.includes("section=3")
    ) {
      return new Response(JSON.stringify(WIKIPEDIA_PERSONAL_LIFE_HTML), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Wikipedia API — any other section content (return empty to avoid noise)
    if (urlStr.includes("en.wikipedia.org/w/api.php") && urlStr.includes("prop=text")) {
      return new Response(
        JSON.stringify({
          parse: {
            title: "John Wayne",
            pageid: 16043,
            text: { "*": "<p>Section content not relevant to biography.</p>" },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Gemini API (section selector) — should not be called since GOOGLE_AI_API_KEY
    // is not set, but handle it gracefully
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({ error: { message: "No API key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Default fallback — 404
    return new Response("Not Found", { status: 404 })
  })
}

// ============================================================================
// Tests
// ============================================================================

describe("Biography Enrichment Integration Test", () => {
  let originalFetch: typeof global.fetch
  let mockFetch: ReturnType<typeof createMockFetch>

  beforeEach(() => {
    vi.clearAllMocks()

    // Install mock fetch
    originalFetch = global.fetch
    mockFetch = createMockFetch()
    global.fetch = mockFetch

    // Configure Anthropic mock to return synthesis response
    anthropicMockCreate.mockResolvedValue(CLAUDE_SYNTHESIS_RESPONSE)

    // Configure wtf_wikipedia mock to return John Wayne document
    mockWtfFetch.mockResolvedValue(createJohnWayneWtfDoc() as never)

    // Ensure ANTHROPIC_API_KEY is set for synthesis
    process.env.ANTHROPIC_API_KEY = "test-key-for-integration-test"
    // Ensure GOOGLE_AI_API_KEY is NOT set (forces regex fallback for section selection)
    delete process.env.GOOGLE_AI_API_KEY

    // Silence console.log during tests
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.ANTHROPIC_API_KEY
  })

  // --------------------------------------------------------------------------
  // Full pipeline: Orchestrator → Sources → Claude → Result
  // --------------------------------------------------------------------------
  describe("full enrichment pipeline", () => {
    it("enriches an actor through Wikidata + Wikipedia sources and Claude synthesis", async () => {
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

      // Only free sources: Wikidata + Wikipedia
      expect(orchestrator.getSourceCount()).toBe(2)
      expect(orchestrator.getSourceNames()).toEqual(["Wikidata Biography", "Wikipedia Biography"])

      const result = await orchestrator.enrichActor(testActor)

      // -- Verify HTTP requests were made to expected endpoints --

      // Wikidata SPARQL request (still uses global.fetch)
      const wikidataCalls = mockFetch.mock.calls.filter(
        ([url]) => typeof url === "string" && url.includes("query.wikidata.org")
      )
      expect(wikidataCalls.length).toBe(1)
      const wikidataUrl = wikidataCalls[0][0] as string
      // URL-encoded SPARQL query contains the actor name and birth year
      const decodedQuery = decodeURIComponent(wikidataUrl)
      expect(decodedQuery).toContain("John Wayne")
      expect(decodedQuery).toContain("1907")

      // Wikipedia now uses wtf_wikipedia (not global.fetch)
      expect(mockWtfFetch).toHaveBeenCalled()

      // -- Verify orchestrator result structure --
      expect(result.actorId).toBe(42)
      expect(result.data).not.toBeNull()
      expect(result.error).toBeUndefined()

      // Stats
      expect(result.stats.sourcesAttempted).toBe(2)
      expect(result.stats.sourcesSucceeded).toBe(2)
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.stats.totalCostUsd).toBeGreaterThan(0) // At least synthesis cost

      // Source entries (both Wikidata and Wikipedia)
      expect(result.sources).toHaveLength(2)
      const sourceTypes = result.sources.map((s) => s.type)
      expect(sourceTypes).toContain(BiographySourceType.WIKIDATA_BIO)
      expect(sourceTypes).toContain(BiographySourceType.WIKIPEDIA_BIO)

      // Raw sources accumulated for synthesis
      expect(result.rawSources).toHaveLength(2)

      // -- Verify Wikidata raw data --
      const wikidataRaw = result.rawSources!.find(
        (s) => s.sourceType === BiographySourceType.WIKIDATA_BIO
      )
      expect(wikidataRaw).toBeDefined()
      expect(wikidataRaw!.text).toContain("Education: University of Southern California")
      expect(wikidataRaw!.text).toContain("Spouse: Josephine Alicia Saenz")
      expect(wikidataRaw!.text).toContain("Father: Clyde Leonard Morrison")
      expect(wikidataRaw!.confidence).toBeGreaterThan(0)

      // -- Verify Wikipedia raw data --
      const wikipediaRaw = result.rawSources!.find(
        (s) => s.sourceType === BiographySourceType.WIKIPEDIA_BIO
      )
      expect(wikipediaRaw).toBeDefined()
      expect(wikipediaRaw!.text).toContain("Winterset, Iowa")
      expect(wikipediaRaw!.text).toContain("football")
      expect(wikipediaRaw!.confidence).toBeGreaterThan(0)

      // -- Verify Claude synthesis was called --
      expect(anthropicMockCreate).toHaveBeenCalledTimes(1)
      const synthesisCallArgs = anthropicMockCreate.mock.calls[0][0]
      expect(synthesisCallArgs.model).toBe("claude-sonnet-4-20250514")
      expect(synthesisCallArgs.max_tokens).toBe(4096)
      expect(synthesisCallArgs.messages).toHaveLength(1)
      expect(synthesisCallArgs.messages[0].role).toBe("user")
      // Prompt should contain actor name and source material
      expect(synthesisCallArgs.messages[0].content).toContain("John Wayne")

      // -- Verify synthesized biography data --
      const data = result.data!
      expect(data.narrative).toContain("Glendale Union High School")
      expect(data.narrative).toContain("married three times")
      expect(data.narrativeConfidence).toBe("high")
      expect(data.lifeNotableFactors).toContain("athlete")
      expect(data.lifeNotableFactors).toContain("rags_to_riches")
      expect(data.lifeNotableFactors).toContain("addiction_recovery")
      expect(data.birthplaceDetails).toContain("Winterset, Iowa")
      expect(data.familyBackground).toContain("Clyde Leonard Morrison")
      expect(data.education).toContain("University of Southern California")
      expect(data.preFameLife).toContain("Fox Film")
      expect(data.personalStruggles).toContain("alcoholism")
      expect(data.relationships).toContain("Josephine Saenz")
      expect(data.lesserKnownFacts).toHaveLength(4)
      expect(data.hasSubstantiveContent).toBe(true)
    })

    it("handles Wikidata failure gracefully and still succeeds with Wikipedia alone", async () => {
      // Override fetch to return error for Wikidata but success for Wikipedia
      global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url

        if (urlStr.includes("query.wikidata.org")) {
          return new Response("Service Unavailable", { status: 503 })
        }

        // Fall through to default mock for Wikipedia
        return mockFetch(url, init)
      })

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

      // Wikidata failed, Wikipedia succeeded
      expect(result.stats.sourcesAttempted).toBe(2)
      expect(result.stats.sourcesSucceeded).toBe(1)

      // Should still have synthesis data from Wikipedia alone
      expect(result.data).not.toBeNull()
      expect(result.error).toBeUndefined()

      // Only Wikipedia raw source
      expect(result.rawSources).toHaveLength(1)
      expect(result.rawSources![0].sourceType).toBe(BiographySourceType.WIKIPEDIA_BIO)

      // Source entries include both (Wikidata failed + Wikipedia succeeded)
      expect(result.sources).toHaveLength(2)
    })

    it("returns error when all sources fail and no synthesis occurs", async () => {
      // Override fetch to return errors for everything (Wikidata)
      global.fetch = vi.fn(async () => {
        return new Response("Internal Server Error", { status: 500 })
      })
      // Override wtf.fetch to return null (Wikipedia)
      mockWtfFetch.mockResolvedValue(null as never)

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
      expect(result.error).toBe("No biographical data found from any source")
      expect(result.stats.sourcesSucceeded).toBe(0)
      expect(anthropicMockCreate).not.toHaveBeenCalled()
    })

    it("returns error when sources succeed but Claude synthesis fails", async () => {
      anthropicMockCreate.mockRejectedValue(new Error("Authentication failed"))

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

      // Sources succeeded but synthesis threw
      expect(result.rawSources!.length).toBeGreaterThan(0)
      expect(result.data).toBeNull()
      expect(result.error).toBe("Sources collected but synthesis failed")
    })

    it("filters invalid life_notable_factors from Claude response", async () => {
      // Return response with a mix of valid and invalid factors
      anthropicMockCreate.mockResolvedValue({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              narrative: "Full narrative about John Wayne's life.",
              narrative_confidence: "medium",
              life_notable_factors: ["military_service", "invented_factor", "athlete", "fake_tag"],
              birthplace_details: null,
              family_background: null,
              education: null,
              pre_fame_life: null,
              fame_catalyst: null,
              personal_struggles: null,
              relationships: null,
              lesser_known_facts: [],
              has_substantive_content: true,
            }),
          },
        ],
        usage: { input_tokens: 1000, output_tokens: 400 },
      })

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

      // Only valid factors should survive
      expect(result.data!.lifeNotableFactors).toEqual(["military_service", "athlete"])
      expect(result.data!.lifeNotableFactors).not.toContain("invented_factor")
      expect(result.data!.lifeNotableFactors).not.toContain("fake_tag")
    })

    it("includes correct cost calculation combining source and synthesis costs", async () => {
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

      // Synthesis cost from mock response: 2500 input + 800 output tokens
      // Cost = (2500 * 3 / 1_000_000) + (800 * 15 / 1_000_000) = 0.0075 + 0.012 = 0.0195
      const expectedSynthesisCost = (2500 * 3) / 1_000_000 + (800 * 15) / 1_000_000

      // Total includes synthesis cost + any source costs (free sources = 0)
      expect(result.stats.totalCostUsd).toBeCloseTo(expectedSynthesisCost, 4)
    })
  })

  // --------------------------------------------------------------------------
  // DB Writer integration
  // --------------------------------------------------------------------------
  describe("database writer", () => {
    it("writes enrichment result to production tables", async () => {
      // First, run enrichment to get a real result
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

      const enrichmentResult = await orchestrator.enrichActor(testActor)
      expect(enrichmentResult.data).not.toBeNull()

      // Now test the DB writer with the enrichment result
      const mockQuery = vi.fn()
      // First query: SELECT biography, biography_legacy
      mockQuery.mockResolvedValueOnce({
        rows: [{ biography: "Old TMDB bio text.", biography_legacy: null }],
      })
      // Subsequent queries: resolve successfully
      mockQuery.mockResolvedValue({ rows: [] })

      const mockPool = { query: mockQuery } as unknown as Pool

      await writeBiographyToProduction(
        mockPool,
        testActor.id,
        enrichmentResult.data!,
        enrichmentResult.sources
      )

      // -- Verify SQL operations --

      // Call 1: SELECT to check for existing biography
      expect(mockQuery.mock.calls[0][0]).toContain("SELECT biography, biography_legacy")
      expect(mockQuery.mock.calls[0][1]).toEqual([testActor.id])

      // Call 2: Archive old biography (because biography exists and biography_legacy is null)
      expect(mockQuery.mock.calls[1][0]).toContain("biography_legacy")
      expect(mockQuery.mock.calls[1][1]).toEqual(["Old TMDB bio text.", testActor.id])

      // Call 3: Upsert actor_biography_details
      const upsertCall = mockQuery.mock.calls[2]
      expect(upsertCall[0]).toContain("INSERT INTO actor_biography_details")
      expect(upsertCall[0]).toContain("ON CONFLICT (actor_id) DO UPDATE SET")

      const upsertParams = upsertCall[1]
      expect(upsertParams[0]).toBe(testActor.id) // actor_id
      expect(upsertParams[1]).toContain("Glendale Union High School") // narrative
      expect(upsertParams[2]).toBe("high") // narrativeConfidence
      expect(upsertParams[3]).toEqual(["athlete", "rags_to_riches", "addiction_recovery"]) // lifeNotableFactors
      expect(upsertParams[4]).toContain("Winterset, Iowa") // birthplaceDetails
      expect(upsertParams[5]).toContain("Clyde Leonard Morrison") // familyBackground
      expect(upsertParams[6]).toContain("University of Southern California") // education
      expect(upsertParams[7]).toContain("Fox Film") // preFameLife
      expect(upsertParams[8]).toContain("John Ford") // fameCatalyst
      expect(upsertParams[9]).toContain("alcoholism") // personalStruggles
      expect(upsertParams[10]).toContain("Josephine Saenz") // relationships
      expect(upsertParams[11]).toHaveLength(4) // lesserKnownFacts

      // Sources JSON
      const sourcesJson = upsertParams[12]
      const parsedSources = JSON.parse(sourcesJson) as BiographySourceEntry[]
      expect(parsedSources).toHaveLength(2)
      expect(parsedSources.map((s) => s.type)).toContain(BiographySourceType.WIKIDATA_BIO)
      expect(parsedSources.map((s) => s.type)).toContain(BiographySourceType.WIKIPEDIA_BIO)

      // Call 4: UPDATE actors table with narrative
      const updateCall = mockQuery.mock.calls[3]
      expect(updateCall[0]).toContain("biography = $1")
      expect(updateCall[0]).toContain("biography_version = $2")
      expect(updateCall[1][0]).toContain("Glendale Union High School") // narrative
      expect(updateCall[1][1]).toBe("5.0.0") // BIO_ENRICHMENT_VERSION
      expect(updateCall[1][2]).toBe(testActor.id)

      // Cache invalidated
      expect(invalidateActorCache).toHaveBeenCalledWith(testActor.id)
    })

    it("skips biography archival when no existing biography", async () => {
      const data: BiographyData = {
        narrative: "Full narrative.",
        narrativeConfidence: "medium",
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

      const sources: BiographySourceEntry[] = [
        {
          type: BiographySourceType.WIKIPEDIA_BIO,
          url: "https://en.wikipedia.org/wiki/Test",
          retrievedAt: new Date(),
          confidence: 0.8,
        },
      ]

      const mockQuery = vi.fn()
      // SELECT returns actor with no biography
      mockQuery.mockResolvedValueOnce({
        rows: [{ biography: null, biography_legacy: null }],
      })
      mockQuery.mockResolvedValue({ rows: [] })

      const mockPool = { query: mockQuery } as unknown as Pool

      await writeBiographyToProduction(mockPool, testActor.id, data, sources)

      // Should be 3 calls: SELECT, INSERT upsert, UPDATE actors (no archive step)
      expect(mockQuery).toHaveBeenCalledTimes(3)
      expect(mockQuery.mock.calls[0][0]).toContain("SELECT biography, biography_legacy")
      expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO actor_biography_details")
      expect(mockQuery.mock.calls[2][0]).toContain("biography = $1")
    })
  })
})
