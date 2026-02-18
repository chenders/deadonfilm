import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { WikidataBiographySource, isValidLabel } from "./wikidata.js"
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
 * Build a mock SPARQL response with the given binding overrides.
 */
function buildSparqlResponse(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string | undefined> = {
    person: "http://www.wikidata.org/entity/Q9588",
    personLabel: "Richard Nixon",
    education: "Whittier College, Duke University School of Law",
    spouses: "Pat Nixon",
    children: "Tricia Nixon Cox, Julie Nixon Eisenhower",
    fathers: "Francis A. Nixon",
    mothers: "Hannah Milhous Nixon",
    siblings: undefined,
    militaryService: "United States Navy",
    religions: "Quaker",
    birthPlaces: "Yorba Linda",
    citizenships: "United States of America",
    occupations: "politician, lawyer",
    awards: "Navy and Marine Corps Medal",
    birthDate: "1913-01-09T00:00:00Z",
  }

  const merged = { ...defaults, ...overrides }

  const binding: Record<string, { value: string }> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      binding[key] = { value }
    }
  }

  return {
    results: {
      bindings: [binding],
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("WikidataBiographySource", () => {
  let source: WikidataBiographySource
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    source = new WikidataBiographySource()
  })

  it("extracts structured biographical data from full SPARQL response", async () => {
    const sparqlResponse = buildSparqlResponse()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data).not.toBeNull()
    expect(result.data!.text).toContain("Education: Whittier College")
    expect(result.data!.text).toContain("Spouse: Pat Nixon")
    expect(result.data!.text).toContain("Children: Tricia Nixon Cox, Julie Nixon Eisenhower")
    expect(result.data!.text).toContain("Father: Francis A. Nixon")
    expect(result.data!.text).toContain("Mother: Hannah Milhous Nixon")
    expect(result.data!.text).toContain("Military service: United States Navy")
    expect(result.data!.text).toContain("Religion: Quaker")
    expect(result.data!.text).toContain("Place of birth: Yorba Linda")
    expect(result.data!.text).toContain("Citizenship: United States of America")
    expect(result.data!.text).toContain("Occupation: politician, lawyer")
    expect(result.data!.text).toContain("Awards: Navy and Marine Corps Medal")
    expect(result.data!.sourceType).toBe("wikidata-bio")
    expect(result.data!.publication).toBe("Wikidata")
  })

  it("returns structured data as formatted text with correct line format", async () => {
    const sparqlResponse = buildSparqlResponse()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    const lines = result.data!.text.split("\n")

    // Each line should be "Label: Value" format
    for (const line of lines) {
      expect(line).toMatch(/^[A-Za-z\s]+: .+$/)
    }
  })

  it("handles actors with no Wikidata entry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { bindings: [] },
      }),
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toBe("No matching person found in Wikidata")
  })

  it("handles actors with partial data", async () => {
    const sparqlResponse = buildSparqlResponse({
      education: "Harvard University",
      birthPlaces: "New York City",
      spouses: undefined,
      children: undefined,
      fathers: undefined,
      mothers: undefined,
      siblings: undefined,
      militaryService: undefined,
      religions: undefined,
      citizenships: undefined,
      occupations: undefined,
      awards: undefined,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    expect(result.data).not.toBeNull()
    expect(result.data!.text).toContain("Education: Harvard University")
    expect(result.data!.text).toContain("Place of birth: New York City")
    expect(result.data!.text).not.toContain("Spouse:")
    expect(result.data!.text).not.toContain("Children:")
    expect(result.data!.text).not.toContain("Military service:")

    // Confidence should be lower with fewer populated fields
    // 2 fields populated = 0.3 + 0.2 = 0.5
    expect(result.data!.confidence).toBe(0.5)
  })

  it("handles actors without birthday", async () => {
    const actorWithoutBirthday: ActorForBiography = {
      ...testActor,
      birthday: null,
    }

    const result = await source.lookup(actorWithoutBirthday)

    expect(result.success).toBe(false)
    expect(result.error).toBe("Missing birthday for Wikidata biography lookup")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rate limits at 500ms", () => {
    // Access protected minDelayMs via the source instance
    // We verify the source has the correct delay configured
    expect((source as unknown as { minDelayMs: number }).minDelayMs).toBe(500)
  })

  it("handles HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toBe("HTTP 500: Internal Server Error")
  })

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await source.lookup(testActor)

    expect(result.success).toBe(false)
    expect(result.error).toBe("Network timeout")
  })

  it("filters invalid labels (genid URLs and Q-IDs)", async () => {
    const sparqlResponse = buildSparqlResponse({
      education: "Harvard University, http://www.wikidata.org/.well-known/genid/abc123, Q99999",
      spouses: "Q12345",
      children: "https://example.com/invalid",
      fathers: "Valid Father Name",
      mothers: undefined,
      siblings: undefined,
      militaryService: undefined,
      religions: undefined,
      birthPlaces: undefined,
      citizenships: undefined,
      occupations: undefined,
      awards: undefined,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const result = await source.lookup(testActor)

    expect(result.success).toBe(true)
    // Education should only contain Harvard University, not the genid or Q-ID
    expect(result.data!.text).toContain("Education: Harvard University")
    expect(result.data!.text).not.toContain("genid")
    expect(result.data!.text).not.toContain("Q99999")
    // Spouses with only Q-ID should be filtered out entirely
    expect(result.data!.text).not.toContain("Spouse:")
    // Children with only URL should be filtered out entirely
    expect(result.data!.text).not.toContain("Children:")
    // Valid father name should remain
    expect(result.data!.text).toContain("Father: Valid Father Name")
  })

  it("escapes SPARQL special characters in names", async () => {
    const actorWithSpecialChars: ActorForBiography = {
      ...testActor,
      name: 'Michael "Mike" O\'Brien',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { bindings: [] },
      }),
    })

    await source.lookup(actorWithSpecialChars)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const calledUrl = mockFetch.mock.calls[0][0] as string
    const decodedUrl = decodeURIComponent(calledUrl)

    // Double quotes should be escaped in the SPARQL query
    expect(decodedUrl).toContain('Michael \\"Mike\\" O\'Brien')
    expect(decodedUrl).not.toContain('Michael "Mike"')
  })

  it("calculates confidence proportional to populated fields", async () => {
    // All 11 fields populated: 0.3 + 11*0.1 = 1.4 → capped at 0.8
    const fullResponse = buildSparqlResponse({
      siblings: "Edward Nixon",
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fullResponse,
    })

    const fullResult = await source.lookup(testActor)
    expect(fullResult.data!.confidence).toBe(0.8)

    // Only 1 field populated: 0.3 + 1*0.1 = 0.4
    const minimalResponse = buildSparqlResponse({
      education: undefined,
      spouses: undefined,
      children: undefined,
      fathers: undefined,
      mothers: undefined,
      siblings: undefined,
      militaryService: undefined,
      religions: undefined,
      birthPlaces: "Test City",
      citizenships: undefined,
      occupations: undefined,
      awards: undefined,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => minimalResponse,
    })

    const minResult = await source.lookup(testActor)
    expect(minResult.data!.confidence).toBe(0.4)
  })
})

describe("isValidLabel", () => {
  it("accepts normal text labels", () => {
    expect(isValidLabel("Harvard University")).toBe(true)
    expect(isValidLabel("United States Navy")).toBe(true)
    expect(isValidLabel("Pat Nixon")).toBe(true)
  })

  it("rejects HTTP URLs", () => {
    expect(isValidLabel("http://www.wikidata.org/entity/Q123")).toBe(false)
    expect(isValidLabel("https://example.com")).toBe(false)
  })

  it("rejects genid references", () => {
    expect(isValidLabel("http://www.wikidata.org/.well-known/genid/abc123")).toBe(false)
    expect(isValidLabel("some-genid-value")).toBe(false)
  })

  it("rejects raw Q-IDs", () => {
    expect(isValidLabel("Q12345")).toBe(false)
    expect(isValidLabel("Q1")).toBe(false)
  })

  it("rejects empty and undefined values", () => {
    expect(isValidLabel("")).toBe(false)
    expect(isValidLabel(undefined)).toBe(false)
  })
})
