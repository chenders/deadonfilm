import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock wikipedia section selector
vi.mock("../wikipedia-section-selector.js", () => ({
  selectBiographySections: vi.fn(),
}))

import { WikipediaBiographySource } from "./wikipedia.js"
import { selectBiographySections } from "../wikipedia-section-selector.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 1,
  tmdb_id: 12345,
  imdb_person_id: "nm0001234",
  name: "Richard Nixon",
  birthday: "1913-01-09",
  deathday: "1994-04-22",
  wikipedia_url: "https://en.wikipedia.org/wiki/Richard_Nixon",
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Yorba Linda, California, USA",
}

/**
 * Build a mock Wikipedia sections API response.
 */
function buildSectionsResponse(
  title: string,
  sections: Array<{ index: string; line: string; level: string; anchor: string }>
) {
  return {
    parse: {
      title,
      pageid: 123,
      sections,
    },
  }
}

/**
 * Build a mock Wikipedia section content API response.
 */
function buildContentResponse(title: string, html: string) {
  return {
    parse: {
      title,
      pageid: 123,
      text: {
        "*": html,
      },
    },
  }
}

const standardSections = [
  { index: "1", line: "Early life and education", level: "2", anchor: "Early_life" },
  { index: "2", line: "Career", level: "2", anchor: "Career" },
  { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
  { index: "4", line: "Filmography", level: "2", anchor: "Filmography" },
  { index: "5", line: "References", level: "2", anchor: "References" },
]

const introHtml =
  "<p>Richard Milhous Nixon (January 9, 1913 &ndash; April 22, 1994) was an American politician who served as president. He grew up in a poor family in Yorba Linda, California.</p>"

const earlyLifeHtml =
  "<p>Nixon was born in Yorba Linda, California, to Francis A. Nixon and Hannah Milhous Nixon. His childhood was marked by poverty and hardship. He attended Whittier College on a scholarship and later studied at Duke University School of Law.</p>"

const personalLifeHtml =
  '<p>Nixon married Patricia Ryan in 1940. They had two children: Tricia and Julie. Their family life was private despite his public career.</p><span class="mw-editsection">[edit]</span>'

// ============================================================================
// Tests
// ============================================================================

describe("WikipediaBiographySource", () => {
  let source: WikipediaBiographySource
  const mockFetch = vi.fn()
  const mockSelectSections = vi.mocked(selectBiographySections)

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    source = new WikipediaBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches section list and selects personal life sections", async () => {
    // Mock sections response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    // Mock selectBiographySections to return personal life sections
    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education", "Personal life"],
      costUsd: 0.0001,
      usedAI: true,
    })

    // Mock intro content (section 0)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", introHtml),
    })

    // Mock Early life section content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", earlyLifeHtml),
    })

    // Mock Personal life section content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", personalLifeHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data).not.toBeNull()
    expect(result.data!.text).toContain("Yorba Linda")
    expect(result.data!.text).toContain("scholarship")
    expect(result.data!.text).toContain("married Patricia Ryan")
    expect(result.data!.sourceType).toBe("wikipedia-bio")
    expect(result.data!.publication).toBe("Wikipedia")
    expect(result.data!.domain).toBe("en.wikipedia.org")
    expect(result.data!.contentType).toBe("biography")
  })

  it("always includes intro (section 0)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    // Return no personal sections to verify intro is still fetched
    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    // Mock intro content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", introHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.text).toContain("[Introduction]")
    expect(result.data!.text).toContain("Richard Milhous Nixon")
  })

  it("adds section headers to output text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education"],
      costUsd: 0,
      usedAI: false,
    })

    // Intro
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", introHtml),
    })

    // Early life
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", earlyLifeHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.text).toContain("[Introduction]")
    expect(result.data!.text).toContain("[Early life and education]")
  })

  it("handles articles with no personal sections", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    // Intro still fetched
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", introHtml),
    })

    const result = await source.lookup(testActor)

    // Should still succeed with intro only
    expect(result.success).toBe(true)
    expect(result.data!.text).toContain("[Introduction]")
    // Should not have personal life section
    expect(result.data!.text).not.toContain("[Personal life]")
  })

  it("handles disambiguation pages", async () => {
    const disambigSections = [
      { index: "1", line: "People", level: "2", anchor: "People" },
      { index: "2", line: "Other uses", level: "2", anchor: "Other_uses" },
      { index: "3", line: "Given name", level: "2", anchor: "Given_name" },
    ]

    // First request: disambiguation page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", disambigSections),
    })

    // Second request with _(actor) suffix: real article
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon (actor)", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education"],
      costUsd: 0,
      usedAI: false,
    })

    // Intro
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon (actor)", introHtml),
    })

    // Early life
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon (actor)", earlyLifeHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data).not.toBeNull()
    // Should have tried disambiguation fallback
    expect(mockFetch).toHaveBeenCalledTimes(4) // sections + alt sections + intro + early life
  })

  it("handles Wikipedia API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Wikipedia API HTTP 500")
  })

  it("handles missing articles", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: {
          code: "missingtitle",
          info: "The page you specified doesn't exist.",
        },
      }),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Wikipedia API error")
  })

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toBe("Network timeout")
  })

  it("runs content through mechanicalPreClean", async () => {
    const noisyHtml =
      '<div class="advertisement">Buy now!</div><p>Nixon was born in Yorba Linda, California, to parents Francis and Hannah. His early life and childhood were shaped by poverty.</p><script>alert("x")</script>'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    // Intro with noisy HTML
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", noisyHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    // Script content should be stripped
    expect(result.data!.text).not.toContain("alert")
    // Biographical content should remain
    expect(result.data!.text).toContain("Yorba Linda")
  })

  it("sets correct publication metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", introHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.publication).toBe("Wikipedia")
    expect(result.data!.domain).toBe("en.wikipedia.org")
    expect(result.data!.contentType).toBe("biography")
    expect(result.data!.articleTitle).toBe("Richard Nixon")
    expect(result.data!.url).toContain("en.wikipedia.org/wiki/Richard")
    expect(result.source.publication).toBe("Wikipedia")
    expect(result.source.domain).toBe("en.wikipedia.org")
  })

  it("calculates biographical confidence from keywords", async () => {
    // HTML with many biographical keywords
    const richBioHtml =
      "<p>He was born in a small town. His parents raised him in poverty. He grew up with siblings and attended school on a scholarship. His early life was marked by family struggles. He married young and had children.</p>"

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", richBioHtml),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    // Text contains biographical keywords: "born in", "parents", "school", "early life", "family", "married", "children", "scholarship", "siblings", "poverty"
    // Required keywords hit: "born in", "parents", "school", "early life", "family", "married"
    // Bonus keywords hit: "scholarship", "siblings", "poverty", "children"
    // Confidence should be > 0
    expect(result.data!.confidence).toBeGreaterThan(0)
    expect(result.source.confidence).toBeGreaterThan(0)
  })

  it("skips sections with less than 50 chars", async () => {
    const shortHtml = "<p>Short text.</p>"

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildSectionsResponse("Richard Nixon", standardSections),
    })

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education"],
      costUsd: 0,
      usedAI: false,
    })

    // Short intro (below 50 char threshold)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", shortHtml),
    })

    // Short early life section (below 50 char threshold)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => buildContentResponse("Richard Nixon", shortHtml),
    })

    const result = await source.lookup(testActor)

    // Both sections are too short, so no substantial content
    expect(result.success).toBe(false)
    expect(result.error).toContain("No substantial biographical content")
  })

  it("rate limits at 500ms", () => {
    expect((source as unknown as { minDelayMs: number }).minDelayMs).toBe(500)
  })

  it("reports correct source type and name", () => {
    expect(source.name).toBe("Wikipedia Biography")
    expect(source.type).toBe("wikipedia-bio")
    expect(source.isFree).toBe(true)
    expect(source.estimatedCostPerQuery).toBe(0)
  })
})
