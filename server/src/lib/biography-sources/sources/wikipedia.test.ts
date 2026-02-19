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

// Mock wtf_wikipedia
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

import { WikipediaBiographySource } from "./wikipedia.js"
import { selectBiographySections } from "../wikipedia-section-selector.js"
import type { ActorForBiography } from "../types.js"
import wtf from "wtf_wikipedia"

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
 * Create a mock wtf_wikipedia Section object.
 */
function mockSection(sectionTitle: string, sectionText: string, sectionDepth = 0) {
  return {
    title: () => sectionTitle,
    text: () => sectionText,
    depth: () => sectionDepth,
  }
}

/**
 * Create a mock wtf_wikipedia Document object.
 */
function mockDocument(
  docTitle: string,
  sectionList: ReturnType<typeof mockSection>[],
  options?: { isDisambig?: boolean }
) {
  return {
    title: () => docTitle,
    isDisambiguation: () => options?.isDisambig ?? false,
    isDisambig: () => options?.isDisambig ?? false,
    sections: () => sectionList,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("WikipediaBiographySource", () => {
  let source: WikipediaBiographySource
  const mockWtfFetch = vi.mocked(wtf.fetch)
  const mockSelectSections = vi.mocked(selectBiographySections)

  beforeEach(() => {
    vi.clearAllMocks()
    source = new WikipediaBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches section list and selects personal life sections", async () => {
    const doc = mockDocument("Richard Nixon", [
      mockSection(
        "",
        "Richard Milhous Nixon (January 9, 1913 – April 22, 1994) was an American politician. He grew up in a poor family in Yorba Linda, California."
      ),
      mockSection(
        "Early life and education",
        "Nixon was born in Yorba Linda, California, to Francis A. Nixon and Hannah Milhous Nixon. His childhood was marked by poverty and hardship. He attended Whittier College on a scholarship."
      ),
      mockSection("Career", "Nixon served as the 37th president of the United States."),
      mockSection(
        "Personal life",
        "Nixon married Patricia Ryan in 1940. They had two children: Tricia and Julie. Their family life was private despite his public career."
      ),
      mockSection("Filmography", "References section here."),
      mockSection("References", "External links."),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education", "Personal life"],
      costUsd: 0.0001,
      usedAI: true,
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
    const doc = mockDocument("Richard Nixon", [
      mockSection(
        "",
        "Richard Milhous Nixon (January 9, 1913 – April 22, 1994) was an American politician. He grew up in a poor family in Yorba Linda, California."
      ),
      mockSection("Career", "Nixon served as the 37th president."),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    // Return no personal sections to verify intro is still fetched
    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.text).toContain("[Introduction]")
    expect(result.data!.text).toContain("Richard Milhous Nixon")
  })

  it("adds section headers to output text", async () => {
    const doc = mockDocument("Richard Nixon", [
      mockSection("", "Richard Milhous Nixon was an American politician who served as president."),
      mockSection(
        "Early life and education",
        "Nixon was born in Yorba Linda, California, to parents Francis and Hannah. His childhood was marked by poverty."
      ),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life and education"],
      costUsd: 0,
      usedAI: false,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.text).toContain("[Introduction]")
    expect(result.data!.text).toContain("[Early life and education]")
  })

  it("handles disambiguation pages", async () => {
    // First request: disambiguation page
    const disambigDoc = mockDocument(
      "Richard Nixon",
      [
        mockSection("People", "List of people named Richard Nixon."),
        mockSection("Other uses", "Other uses for the name."),
      ],
      { isDisambig: true }
    )

    // Second request: real article via _(actor) suffix
    const realDoc = mockDocument("Richard Nixon (actor)", [
      mockSection("", "Richard Nixon is an actor known for various roles in film and television."),
      mockSection(
        "Early life",
        "Born and raised in Ohio, Nixon showed early talent for the performing arts."
      ),
    ])

    mockWtfFetch.mockResolvedValueOnce(disambigDoc as never).mockResolvedValueOnce(realDoc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life"],
      costUsd: 0,
      usedAI: false,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data).not.toBeNull()
    // Should have called wtf.fetch twice: once for disambig, once for _(actor)
    expect(mockWtfFetch).toHaveBeenCalledTimes(2)
  })

  it("handles Wikipedia article not found", async () => {
    mockWtfFetch.mockResolvedValueOnce(null as never)

    // Also return null for _(actor) and _(actress) suffixes
    mockWtfFetch.mockResolvedValueOnce(null as never)
    mockWtfFetch.mockResolvedValueOnce(null as never)

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Article not found")
  })

  it("handles network errors", async () => {
    mockWtfFetch.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Article not found")
  })

  it("text from wtf_wikipedia is clean (no HTML artifacts)", async () => {
    // wtf_wikipedia returns clean text — no HTML, no citation markers
    const doc = mockDocument("Richard Nixon", [
      mockSection(
        "",
        "Richard Milhous Nixon was an American politician who served as president. He grew up in Yorba Linda."
      ),
      mockSection(
        "Early life",
        "Nixon was born in Yorba Linda, California. His early life and childhood were shaped by poverty. He attended Whittier College on a scholarship."
      ),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    // Should not contain any HTML artifacts
    expect(result.data!.text).not.toContain("<")
    expect(result.data!.text).not.toContain("[edit]")
    expect(result.data!.text).not.toContain("[1]")
    // Biographical content should remain
    expect(result.data!.text).toContain("Yorba Linda")
  })

  it("sets correct publication metadata", async () => {
    const doc = mockDocument("Richard Nixon", [
      mockSection(
        "",
        "Richard Milhous Nixon was an American politician. He grew up in a poor family in Yorba Linda, California."
      ),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
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
    const doc = mockDocument("Richard Nixon", [
      mockSection(
        "",
        "He was born in a small town. His parents raised him in poverty. He grew up with siblings and attended school on a scholarship. His early life was marked by family struggles. He married young and had children."
      ),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data!.confidence).toBeGreaterThan(0)
    expect(result.source.confidence).toBeGreaterThan(0)
  })

  it("skips sections with less than 50 chars", async () => {
    const doc = mockDocument("Richard Nixon", [
      mockSection("", "Short."),
      mockSection("Early life", "Also short."),
    ])

    mockWtfFetch.mockResolvedValueOnce(doc as never)

    mockSelectSections.mockResolvedValueOnce({
      selectedSections: ["Early life"],
      costUsd: 0,
      usedAI: false,
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
