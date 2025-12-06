import { describe, it, expect, vi, beforeEach } from "vitest"
import { getCauseOfDeath, getWikipediaDeathDetails, type DeathInfoSource } from "./wikidata.js"

// Mock the claude module
vi.mock("./claude.js", () => ({
  getCauseOfDeathFromClaude: vi.fn(),
  isVagueCause: vi.fn(),
}))

import { getCauseOfDeathFromClaude, isVagueCause } from "./claude.js"

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
