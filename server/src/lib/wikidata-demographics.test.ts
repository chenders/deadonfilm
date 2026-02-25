import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  buildDemographicsSparqlQuery,
  parseDemographicsResults,
  _resetForTesting,
  fetchActorDemographics,
} from "./wikidata-demographics.js"

// ============================================================================
// SPARQL Query Building
// ============================================================================

describe("buildDemographicsSparqlQuery", () => {
  it("builds a valid SPARQL query with name and birth year", () => {
    const query = buildDemographicsSparqlQuery("James Dean", 1931)
    expect(query).toContain('rdfs:label "James Dean"@en')
    expect(query).toContain("YEAR(?birthDate) >= 1930")
    expect(query).toContain("YEAR(?birthDate) <= 1932")
    expect(query).toContain("wdt:P21") // gender
    expect(query).toContain("wdt:P172") // ethnicity
    expect(query).toContain("wdt:P19") // birthplace
    expect(query).toContain("wdt:P17") // country (of birthplace)
    expect(query).toContain("wdt:P27") // citizenship
    expect(query).toContain("wdt:P241") // military
    expect(query).toContain("wdt:P106") // occupation
    expect(query).toContain("GROUP_CONCAT")
    expect(query).toContain("LIMIT 5")
  })

  it("escapes special characters in names", () => {
    const query = buildDemographicsSparqlQuery('John "Johnny" O\'Brien', 1950)
    expect(query).toContain('John \\"Johnny\\" O\'Brien')
  })

  it("escapes backslashes before quotes", () => {
    const query = buildDemographicsSparqlQuery("Test\\Name", 1950)
    expect(query).toContain("Test\\\\Name")
  })
})

// ============================================================================
// Result Parsing
// ============================================================================

describe("parseDemographicsResults", () => {
  it("returns null for empty bindings", () => {
    expect(parseDemographicsResults([], "James Dean")).toBeNull()
  })

  it("returns null when name doesn't match", () => {
    const bindings = [
      {
        personLabel: { value: "Totally Different Person" },
        genderLabel: { value: "male" },
      },
    ]
    expect(parseDemographicsResults(bindings, "James Dean")).toBeNull()
  })

  it("parses all demographic fields from matching result", () => {
    const bindings = [
      {
        person: { value: "http://www.wikidata.org/entity/Q83359" },
        personLabel: { value: "James Dean" },
        genderLabel: { value: "male" },
        ethnicities: { value: "German Americans, English Americans" },
        birthCountries: { value: "United States of America" },
        citizenships: { value: "United States of America" },
        militaryBranches: { value: "" },
        occupations: { value: "actor, film actor, television actor, model" },
        birthDate: { value: "1931-02-08T00:00:00Z" },
      },
    ]

    const result = parseDemographicsResults(bindings, "James Dean")
    expect(result).not.toBeNull()
    expect(result!.gender).toBe("male")
    expect(result!.ethnicity).toBe("German Americans, English Americans")
    expect(result!.birthplaceCountry).toBe("United States of America")
    expect(result!.citizenship).toBe("United States of America")
    expect(result!.militaryService).toBeNull() // empty string → null
    // Acting occupations filtered out, only "model" remains
    expect(result!.occupations).toBe("model")
  })

  it("filters out invalid labels (URLs, genids, Q-ids)", () => {
    const bindings = [
      {
        personLabel: { value: "Anna May Wong" },
        genderLabel: { value: "female" },
        ethnicities: { value: "http://www.wikidata.org/entity/Q1234, Chinese Americans" },
        birthCountries: { value: "Q30" },
        citizenships: { value: "genid-abc123" },
        occupations: { value: "actor, singer" },
      },
    ]

    const result = parseDemographicsResults(bindings, "Anna May Wong")
    expect(result).not.toBeNull()
    expect(result!.gender).toBe("female")
    expect(result!.ethnicity).toBe("Chinese Americans") // URL filtered
    expect(result!.birthplaceCountry).toBeNull() // Q-id filtered
    expect(result!.citizenship).toBeNull() // genid filtered
    expect(result!.occupations).toBe("singer") // "actor" filtered as acting occupation
  })

  it("filters all acting-related occupations", () => {
    const bindings = [
      {
        personLabel: { value: "Test Actor" },
        occupations: {
          value:
            "actor, actress, film actor, film actress, television actor, television actress, stage actor, voice actor, stunt performer",
        },
      },
    ]

    const result = parseDemographicsResults(bindings, "Test Actor")
    expect(result).not.toBeNull()
    expect(result!.occupations).toBeNull() // All acting occupations filtered
  })

  it("handles name matching with partial matches", () => {
    const bindings = [
      {
        personLabel: { value: "Christopher Frank Carandini Lee" },
        genderLabel: { value: "male" },
        militaryBranches: { value: "Royal Air Force" },
      },
    ]

    // Should match — "Lee" is the last name in both
    const result = parseDemographicsResults(bindings, "Christopher Lee")
    expect(result).not.toBeNull()
    expect(result!.militaryService).toBe("Royal Air Force")
  })

  it("handles undefined optional fields", () => {
    const bindings = [
      {
        personLabel: { value: "Test Actor" },
        // All optional fields undefined
      },
    ]

    const result = parseDemographicsResults(bindings, "Test Actor")
    expect(result).not.toBeNull()
    expect(result!.gender).toBeNull()
    expect(result!.ethnicity).toBeNull()
    expect(result!.birthplaceCountry).toBeNull()
    expect(result!.citizenship).toBeNull()
    expect(result!.militaryService).toBeNull()
    expect(result!.occupations).toBeNull()
  })

  it("skips non-matching results and finds the correct one", () => {
    const bindings = [
      {
        personLabel: { value: "Wrong Person" },
        genderLabel: { value: "female" },
      },
      {
        personLabel: { value: "Correct Actor" },
        genderLabel: { value: "male" },
        militaryBranches: { value: "United States Army" },
      },
    ]

    const result = parseDemographicsResults(bindings, "Correct Actor")
    expect(result).not.toBeNull()
    expect(result!.gender).toBe("male")
    expect(result!.militaryService).toBe("United States Army")
  })
})

// ============================================================================
// Fetch Integration (mocked)
// ============================================================================

describe("fetchActorDemographics", () => {
  beforeEach(() => {
    _resetForTesting()
    vi.restoreAllMocks()
  })

  it("returns demographics for a matched actor", async () => {
    const mockResponse = {
      results: {
        bindings: [
          {
            person: { value: "http://www.wikidata.org/entity/Q83359" },
            personLabel: { value: "James Dean" },
            genderLabel: { value: "male" },
            birthCountries: { value: "United States of America" },
            citizenships: { value: "United States of America" },
            occupations: { value: "actor, film actor" },
            birthDate: { value: "1931-02-08T00:00:00Z" },
          },
        ],
      },
    }

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchActorDemographics("James Dean", 1931)
    expect(result).not.toBeNull()
    expect(result!.gender).toBe("male")
    expect(result!.birthplaceCountry).toBe("United States of America")
    expect(result!.occupations).toBeNull() // all acting occupations filtered
  })

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    } as Response)

    await expect(fetchActorDemographics("Unknown Person", 1900)).rejects.toThrow(
      "Wikidata SPARQL error: 400 Bad Request"
    )
  })

  it("throws on network error after retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"))

    await expect(fetchActorDemographics("Unknown Person", 1900)).rejects.toThrow("Network error")
  })

  it("returns null when no bindings match the name", async () => {
    const mockResponse = {
      results: {
        bindings: [
          {
            personLabel: { value: "Completely Different Person" },
            genderLabel: { value: "female" },
          },
        ],
      },
    }

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchActorDemographics("James Dean", 1931)
    expect(result).toBeNull()
  })
})
