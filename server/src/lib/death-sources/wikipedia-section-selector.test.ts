import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  selectRelevantSections,
  isAISectionSelectionAvailable,
  createSectionSelectionSourceEntry,
  type WikipediaSection,
} from "./wikipedia-section-selector.js"
import { DataSourceType } from "./types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("isAISectionSelectionAvailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns true when API key is set", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    expect(isAISectionSelectionAvailable()).toBe(true)
  })

  it("returns false when API key is not set", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "")
    expect(isAISectionSelectionAvailable()).toBe(false)
  })

  it("returns false when API key is undefined", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", undefined)
    expect(isAISectionSelectionAvailable()).toBe(false)
  })
})

describe("selectRelevantSections", () => {
  const mockSections: WikipediaSection[] = [
    { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
    { index: "2", line: "Career", level: "2", anchor: "Career" },
    { index: "3", line: "Health problems", level: "2", anchor: "Health_problems" },
    { index: "4", line: "Death and funeral", level: "2", anchor: "Death_and_funeral" },
    { index: "5", line: "Legacy", level: "2", anchor: "Legacy" },
    { index: "6", line: "Filmography", level: "2", anchor: "Filmography" },
    { index: "7", line: "Hunting and fishing", level: "2", anchor: "Hunting_and_fishing" },
    { index: "8", line: "Controversies", level: "2", anchor: "Controversies" },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns error when API key is not configured", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "")
    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toContain("API key not configured")
    expect(result.costUsd).toBe(0)
  })

  it("returns error when no sections provided", async () => {
    const result = await selectRelevantSections("Test Actor", [])

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("No sections provided")
    expect(result.costUsd).toBe(0)
  })

  it("selects relevant sections from Gemini response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["Health problems", "Death and funeral", "Controversies"],
                    reasoning: "These sections contain death and health-related information",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Dick Cheney", mockSections)

    expect(result.usedAI).toBe(true)
    expect(result.selectedSections).toEqual([
      "Health problems",
      "Death and funeral",
      "Controversies",
    ])
    expect(result.reasoning).toBe("These sections contain death and health-related information")
    expect(result.costUsd).toBe(0.0001)
    expect(result.error).toBeUndefined()
  })

  it("handles case-insensitive section matching", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["HEALTH PROBLEMS", "death and funeral"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(true)
    // Should normalize to original case
    expect(result.selectedSections).toEqual(["Health problems", "Death and funeral"])
  })

  it("filters out sections that do not exist in the original list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["Health problems", "Made Up Section", "Death and funeral"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.selectedSections).toEqual(["Health problems", "Death and funeral"])
    expect(result.selectedSections).not.toContain("Made Up Section")
  })

  it("respects maxSections option", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: [
                      "Early life",
                      "Career",
                      "Health problems",
                      "Death and funeral",
                      "Legacy",
                      "Controversies",
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections, { maxSections: 3 })

    expect(result.selectedSections).toHaveLength(3)
    expect(result.selectedSections).toEqual(["Early life", "Career", "Health problems"])
  })

  it("handles API HTTP errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toContain("Gemini API error: 500")
    expect(result.costUsd).toBe(0)
  })

  it("handles API error responses gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: {
          code: 429,
          message: "Rate limit exceeded",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toContain("Rate limit exceeded")
    expect(result.costUsd).toBe(0)
  })

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("Network error")
    expect(result.costUsd).toBe(0)
  })

  it("handles malformed JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "This is not valid JSON",
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(true)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("AI returned no valid sections")
    expect(result.costUsd).toBe(0.0001) // Still charges for the API call
  })

  it("handles empty sections array in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: [],
                    reasoning: "No relevant sections found",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectRelevantSections("Test Actor", mockSections)

    expect(result.usedAI).toBe(true)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("AI returned no valid sections")
    expect(result.costUsd).toBe(0.0001)
  })

  it("sends correct prompt structure to API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ sections: ["Death and funeral"] }),
                },
              ],
            },
          },
        ],
      }),
    })

    await selectRelevantSections("John Wayne", mockSections)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]

    // Check URL contains gemini model
    expect(url).toContain("gemini-2.0-flash")
    expect(url).toContain("generateContent")

    // Check request body
    const body = JSON.parse(options.body)
    expect(body.contents[0].parts[0].text).toContain("John Wayne")
    expect(body.contents[0].parts[0].text).toContain("Death and funeral")
    expect(body.contents[0].parts[0].text).toContain("Health problems")
    expect(body.generationConfig.temperature).toBe(0.1)
    expect(body.generationConfig.maxOutputTokens).toBe(500)
  })
})

describe("createSectionSelectionSourceEntry", () => {
  it("creates correct source entry for successful selection", () => {
    const result = {
      selectedSections: ["Health problems", "Death and funeral"],
      reasoning: "Selected health and death sections",
      costUsd: 0.0001,
      usedAI: true,
    }

    const entry = createSectionSelectionSourceEntry(result)

    expect(entry.type).toBe(DataSourceType.GEMINI_SECTION_SELECTOR)
    expect(entry.costUsd).toBe(0.0001)
    expect(entry.rawData.selectedSections).toEqual(["Health problems", "Death and funeral"])
    expect(entry.rawData.reasoning).toBe("Selected health and death sections")
    expect(entry.rawData.usedAI).toBe(true)
    expect(entry.rawData.error).toBeUndefined()
  })

  it("creates correct source entry for failed selection", () => {
    const result = {
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
      error: "API key not configured",
    }

    const entry = createSectionSelectionSourceEntry(result)

    expect(entry.type).toBe(DataSourceType.GEMINI_SECTION_SELECTOR)
    expect(entry.costUsd).toBe(0)
    expect(entry.rawData.selectedSections).toEqual([])
    expect(entry.rawData.usedAI).toBe(false)
    expect(entry.rawData.error).toBe("API key not configured")
  })
})
