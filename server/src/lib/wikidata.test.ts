import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getCauseOfDeath,
  getWikipediaDeathDetails,
  verifyDeathDate,
  type DeathInfoSource,
} from "./wikidata.js"

// Mock the claude module
vi.mock("./claude.js", () => ({
  getCauseOfDeathFromClaude: vi.fn(),
  isVagueCause: vi.fn(),
}))

// Mock the newrelic module
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

import { getCauseOfDeathFromClaude, isVagueCause } from "./claude.js"
import newrelic from "newrelic"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("getCauseOfDeath", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: Claude returns non-vague cause
    vi.mocked(isVagueCause).mockReturnValue(false)
  })

  it("returns claude as source when Claude provides cause and details", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: "lung cancer",
      details: "He was diagnosed with lung cancer in 2015 and passed away in 2020.",
    })

    // Mock Wikidata fetch for Wikipedia URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "John Smith" },
                deathDate: { value: "2020-01-15" },
                article: { value: "https://en.wikipedia.org/wiki/John_Smith" },
              },
            ],
          },
        }),
    })

    const result = await getCauseOfDeath("John Smith", "1950-01-01", "2020-01-15")

    expect(result.causeOfDeath).toBe("lung cancer")
    expect(result.causeOfDeathSource).toBe("claude")
    expect(result.causeOfDeathDetails).toBe(
      "He was diagnosed with lung cancer in 2015 and passed away in 2020."
    )
    expect(result.causeOfDeathDetailsSource).toBe("claude")
  })

  it("returns claude for cause but wikipedia for details when Claude provides cause only", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: "heart attack",
      details: null,
    })

    // Mock Wikidata fetch for Wikipedia URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Jane Doe" },
                deathDate: { value: "2019-06-20" },
                article: { value: "https://en.wikipedia.org/wiki/Jane_Doe" },
              },
            ],
          },
        }),
    })

    // Mock Wikipedia API for death details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "123": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": "'''Jane Doe''' (1940-2019) was an actress.\n\n== Death ==\nShe died of a sudden heart attack at her home in Los Angeles.",
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getCauseOfDeath("Jane Doe", "1940-03-15", "2019-06-20")

    expect(result.causeOfDeath).toBe("heart attack")
    expect(result.causeOfDeathSource).toBe("claude")
    expect(result.causeOfDeathDetails).toBe(
      "She died of a sudden heart attack at her home in Los Angeles."
    )
    expect(result.causeOfDeathDetailsSource).toBe("wikipedia")
  })

  it("keeps Claude's vague cause but gets details from Wikipedia", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: "illness",
      details: null,
    })
    vi.mocked(isVagueCause).mockReturnValue(true)

    // Mock Wikidata fetch with cause of death
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Bob Actor" },
                deathDate: { value: "2018-03-10" },
                causeOfDeathLabel: { value: "pancreatic cancer" },
                article: { value: "https://en.wikipedia.org/wiki/Bob_Actor" },
              },
            ],
          },
        }),
    })

    // Mock Wikipedia API for death details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "456": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": "'''Bob Actor''' was a performer.\n\n== Death ==\nHe died from pancreatic cancer after a long battle with the disease.",
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getCauseOfDeath("Bob Actor", "1945-07-22", "2018-03-10")

    // Claude's vague cause is kept, but marked as claude source
    // The code prefers any Claude answer over Wikidata for consistency
    expect(result.causeOfDeath).toBe("illness")
    expect(result.causeOfDeathSource).toBe("claude")
    // Details come from Wikipedia since Claude didn't provide them
    expect(result.causeOfDeathDetails).toContain("pancreatic cancer")
    expect(result.causeOfDeathDetailsSource).toBe("wikipedia")
    expect(result.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Bob_Actor")
  })

  it("uses Wikidata cause when Claude returns nothing", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: null,
      details: null,
    })
    vi.mocked(isVagueCause).mockReturnValue(true)

    // Mock Wikidata fetch with cause of death
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Alice Star" },
                deathDate: { value: "2017-05-20" },
                causeOfDeathLabel: { value: "stroke" },
                article: { value: "https://en.wikipedia.org/wiki/Alice_Star" },
              },
            ],
          },
        }),
    })

    // Mock Wikipedia API for death details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "789": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": "'''Alice Star''' was an actress.\n\n== Death ==\nShe died of a stroke at age 82.",
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getCauseOfDeath("Alice Star", "1935-02-14", "2017-05-20")

    // Wikidata provided the cause since Claude returned nothing
    expect(result.causeOfDeath).toBe("stroke")
    expect(result.causeOfDeathSource).toBe("wikipedia")
    expect(result.causeOfDeathDetailsSource).toBe("wikipedia")
  })

  it("returns null sources when no information is available", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: null,
      details: null,
    })
    vi.mocked(isVagueCause).mockReturnValue(true)

    // Mock Wikidata fetch with no results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [],
          },
        }),
    })

    const result = await getCauseOfDeath("Unknown Person", "1930-01-01", "2000-01-01")

    expect(result.causeOfDeath).toBeNull()
    expect(result.causeOfDeathSource).toBeNull()
    expect(result.causeOfDeathDetails).toBeNull()
    expect(result.causeOfDeathDetailsSource).toBeNull()
  })

  it("handles missing birthday gracefully", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: "stroke",
      details: "Sudden stroke at home.",
    })

    const result = await getCauseOfDeath("Actor Name", null, "2021-05-01")

    expect(result.causeOfDeath).toBe("stroke")
    expect(result.causeOfDeathSource).toBe("claude")
    expect(result.causeOfDeathDetails).toBe("Sudden stroke at home.")
    expect(result.causeOfDeathDetailsSource).toBe("claude")
    // Wikipedia URL should be null without birthday for Wikidata query
    expect(result.wikipediaUrl).toBeNull()
  })

  it("handles API errors gracefully", async () => {
    vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
      causeOfDeath: "cancer",
      details: null,
    })

    // Mock Wikidata fetch failure
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await getCauseOfDeath("Error Case", "1960-01-01", "2022-01-01")

    // Should still return Claude result
    expect(result.causeOfDeath).toBe("cancer")
    expect(result.causeOfDeathSource).toBe("claude")
    expect(result.wikipediaUrl).toBeNull()
  })

  describe("recordCustomEvent tracking", () => {
    it("records CauseOfDeathLookup event when Claude successfully provides cause", async () => {
      vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
        causeOfDeath: "lung cancer",
        details: "Diagnosed in 2015.",
      })

      // Mock Wikidata fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              bindings: [
                {
                  personLabel: { value: "Test Actor" },
                  deathDate: { value: "2020-01-15" },
                  article: { value: "https://en.wikipedia.org/wiki/Test_Actor" },
                },
              ],
            },
          }),
      })

      await getCauseOfDeath("Test Actor", "1950-01-01", "2020-01-15")

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("CauseOfDeathLookup", {
        personName: "Test Actor",
        source: "claude",
        success: true,
        hasDetails: true,
      })
    })

    it("records CauseOfDeathLookup event when falling back to Wikidata", async () => {
      vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
        causeOfDeath: null,
        details: null,
      })
      vi.mocked(isVagueCause).mockReturnValue(true)

      // Mock Wikidata fetch with cause of death
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              bindings: [
                {
                  personLabel: { value: "Wikidata Actor" },
                  deathDate: { value: "2018-03-10" },
                  causeOfDeathLabel: { value: "stroke" },
                  article: { value: "https://en.wikipedia.org/wiki/Wikidata_Actor" },
                },
              ],
            },
          }),
      })

      // Mock Wikipedia API for death details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            query: {
              pages: {
                "123": {
                  revisions: [
                    {
                      slots: {
                        main: {
                          "*": "'''Wikidata Actor''' died.\n\n== Death ==\nDied of a stroke.",
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
      })

      await getCauseOfDeath("Wikidata Actor", "1945-07-22", "2018-03-10")

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("CauseOfDeathLookup", {
        personName: "Wikidata Actor",
        source: "wikipedia",
        success: true,
        hasDetails: true,
      })
    })

    it("records CauseOfDeathLookup event when no cause found", async () => {
      vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
        causeOfDeath: null,
        details: null,
      })
      vi.mocked(isVagueCause).mockReturnValue(true)

      // Mock Wikidata fetch with no results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              bindings: [],
            },
          }),
      })

      await getCauseOfDeath("Unknown Person", "1930-01-01", "2000-01-01")

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("CauseOfDeathLookup", {
        personName: "Unknown Person",
        source: "none",
        success: false,
        hasDetails: false,
      })
    })

    it("records CauseOfDeathLookup event when missing birthday falls back to Claude", async () => {
      vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
        causeOfDeath: "heart attack",
        details: "Sudden cardiac arrest.",
      })

      await getCauseOfDeath("No Birthday Actor", null, "2021-05-01")

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("CauseOfDeathLookup", {
        personName: "No Birthday Actor",
        source: "claude",
        success: true,
        hasDetails: true,
      })
    })

    it("records CauseOfDeathLookup event on API error", async () => {
      vi.mocked(getCauseOfDeathFromClaude).mockResolvedValue({
        causeOfDeath: null,
        details: null,
      })

      // Mock Wikidata fetch failure
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      await getCauseOfDeath("Error Actor", "1960-01-01", "2022-01-01")

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("CauseOfDeathLookup", {
        personName: "Error Actor",
        source: "none",
        success: false,
        hasDetails: false,
      })
    })
  })
})

describe("getWikipediaDeathDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("extracts death details from Death section", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "1": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actor Name''' was an American actor.

== Early life ==
Born in New York.

== Death ==
He died of a heart attack at his home in Beverly Hills on January 15, 2020. He was 75 years old.

== Filmography ==
Many films.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actor_Name")

    expect(result).toContain("died of a heart attack")
    expect(result).toContain("Beverly Hills")
  })

  it("extracts death details from opening paragraph", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "2": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actress Name''' (1930-2015) was a British actress who died of cancer. She starred in many films.

== Career ==
Long career.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actress_Name")

    expect(result).toContain("died of cancer")
  })

  it("returns null for invalid URL", async () => {
    const result = await getWikipediaDeathDetails("not-a-valid-url")
    expect(result).toBeNull()
  })

  it("returns null when page not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "-1": {}, // Wikipedia returns -1 for not found
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Nonexistent")
    expect(result).toBeNull()
  })

  it("returns null when no death-related content found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "3": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Person Name''' is a living actor.

== Career ==
Still acting.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Living_Person")
    expect(result).toBeNull()
  })

  it("handles API errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Error_Case")
    expect(result).toBeNull()
  })

  it("handles non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Server_Error")
    expect(result).toBeNull()
  })

  it("truncates long details to 200 characters", async () => {
    const longText =
      "He died of complications from a very long and complicated medical condition that required extensive treatment over many years and eventually led to his passing at a hospital in Los Angeles after a prolonged battle with the illness that affected many aspects of his life."

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "4": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Long Name''' was an actor.

== Death ==
${longText}`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Long_Name")

    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(200)
    expect(result!.endsWith("...")).toBe(true)
  })
})

describe("DeathInfoSource type", () => {
  it("accepts valid source values", () => {
    const claudeSource: DeathInfoSource = "claude"
    const wikipediaSource: DeathInfoSource = "wikipedia"
    const nullSource: DeathInfoSource = null

    expect(claudeSource).toBe("claude")
    expect(wikipediaSource).toBe("wikipedia")
    expect(nullSource).toBeNull()
  })
})

describe("cleanWikiMarkup HTML entity decoding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("decodes &nbsp; entities in Wikipedia content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "1": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actor Name''' was an actor.

== Death ==
He&nbsp;died of a heart attack&nbsp;in Beverly Hills.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actor_Name")

    expect(result).not.toBeNull()
    // Should not contain &nbsp; - should be decoded to regular space
    expect(result).not.toContain("&nbsp;")
    expect(result).toContain("died of a heart attack")
  })

  it("decodes &ndash; and &mdash; entities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "2": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actress Name''' (1930&ndash;2015) was a British actress.

== Death ==
She died of cancer &mdash; a long battle that lasted years.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actress_Name")

    expect(result).not.toBeNull()
    // Should not contain HTML entity codes
    expect(result).not.toContain("&ndash;")
    expect(result).not.toContain("&mdash;")
    expect(result).toContain("died of cancer")
  })

  it("decodes &amp; entities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "3": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actor Name''' worked for M&amp;M Studios.

== Death ==
He died of natural causes at M&amp;M Memorial Hospital.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actor_Name")

    expect(result).not.toBeNull()
    // Should decode &amp; to &
    expect(result).not.toContain("&amp;")
    expect(result).toContain("M&M")
    expect(result).toContain("died of natural causes")
  })

  it("decodes numeric HTML entities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          query: {
            pages: {
              "4": {
                revisions: [
                  {
                    slots: {
                      main: {
                        "*": `'''Actor Name''' was an actor.

== Death ==
He died in Paris&#44; France on January 15&#44; 2020.`,
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
    })

    const result = await getWikipediaDeathDetails("https://en.wikipedia.org/wiki/Actor_Name")

    expect(result).not.toBeNull()
    // Should decode &#44; (comma)
    expect(result).not.toContain("&#44;")
    expect(result).toContain("died in Paris, France")
  })
})

describe("verifyDeathDate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns verified with high confidence when dates match within 30 days", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "John Smith" },
                deathDate: { value: "2024-09-26" },
              },
            ],
          },
        }),
    })

    const result = await verifyDeathDate("John Smith", 1950, "2024-09-28")

    expect(result.verified).toBe(true)
    expect(result.confidence).toBe("verified")
    expect(result.wikidataDeathDate).toBe("2024-09-26")
  })

  it("returns verified when dates are within same year but more than 30 days apart", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Jane Doe" },
                deathDate: { value: "2024-01-15" },
              },
            ],
          },
        }),
    })

    const result = await verifyDeathDate("Jane Doe", 1940, "2024-06-20")

    expect(result.verified).toBe(true)
    expect(result.confidence).toBe("verified")
    expect(result.conflictDetails).toContain("days apart")
  })

  it("returns conflicting when dates differ by more than a year", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Brigitte Bardot" },
                deathDate: { value: "2024-09-26" },
              },
            ],
          },
        }),
    })

    const result = await verifyDeathDate("Brigitte Bardot", 1934, "2025-12-28")

    expect(result.verified).toBe(false)
    expect(result.confidence).toBe("conflicting")
    expect(result.wikidataDeathDate).toBe("2024-09-26")
    expect(result.conflictDetails).toContain("years apart")
  })

  it("returns unverified when no Wikidata records found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [],
          },
        }),
    })

    const result = await verifyDeathDate("Unknown Person", 1970, "2024-01-01")

    expect(result.verified).toBe(false)
    expect(result.confidence).toBe("unverified")
    expect(result.wikidataDeathDate).toBeNull()
  })

  it("returns unverified when Wikidata API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await verifyDeathDate("Actor Name", 1960, "2024-05-15")

    expect(result.verified).toBe(false)
    expect(result.confidence).toBe("unverified")
  })

  it("returns unverified when name does not match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Someone Else" },
                deathDate: { value: "2024-09-26" },
              },
            ],
          },
        }),
    })

    const result = await verifyDeathDate("John Smith", 1950, "2024-09-26")

    expect(result.verified).toBe(false)
    expect(result.confidence).toBe("unverified")
  })

  it("works without birth year", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            bindings: [
              {
                personLabel: { value: "Actor Name" },
                deathDate: { value: "2024-03-15" },
              },
            ],
          },
        }),
    })

    const result = await verifyDeathDate("Actor Name", null, "2024-03-15")

    expect(result.verified).toBe(true)
    expect(result.confidence).toBe("verified")
  })
})
