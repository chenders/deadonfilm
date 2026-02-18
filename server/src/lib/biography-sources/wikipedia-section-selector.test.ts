import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  selectBiographySections,
  regexFallbackSelection,
  isAISectionSelectionAvailable,
  type WikipediaSection,
} from "./wikipedia-section-selector.js"

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

describe("regexFallbackSelection", () => {
  it("selects biography-relevant sections", () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
      { index: "2", line: "Career", level: "2", anchor: "Career" },
      { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
      { index: "4", line: "Education", level: "2", anchor: "Education" },
      { index: "5", line: "Filmography", level: "2", anchor: "Filmography" },
      { index: "6", line: "Awards and nominations", level: "2", anchor: "Awards" },
      { index: "7", line: "References", level: "2", anchor: "References" },
      { index: "8", line: "External links", level: "2", anchor: "External_links" },
    ]

    const result = regexFallbackSelection(sections)

    expect(result).toContain("Early life")
    expect(result).toContain("Personal life")
    expect(result).toContain("Education")
    expect(result).not.toContain("Career")
    expect(result).not.toContain("Filmography")
    expect(result).not.toContain("Awards and nominations")
    expect(result).not.toContain("References")
    expect(result).not.toContain("External links")
  })

  it("skips Filmography, Awards, References, and External links", () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Filmography", level: "2", anchor: "Filmography" },
      { index: "2", line: "Awards and nominations", level: "2", anchor: "Awards" },
      { index: "3", line: "References", level: "2", anchor: "References" },
      { index: "4", line: "External links", level: "2", anchor: "External_links" },
      { index: "5", line: "See also", level: "2", anchor: "See_also" },
      { index: "6", line: "Selected works", level: "2", anchor: "Selected_works" },
      { index: "7", line: "Discography", level: "2", anchor: "Discography" },
      { index: "8", line: "Bibliography", level: "2", anchor: "Bibliography" },
      { index: "9", line: "Notes", level: "2", anchor: "Notes" },
      { index: "10", line: "Box office", level: "2", anchor: "Box_office" },
    ]

    const result = regexFallbackSelection(sections)

    expect(result).toEqual([])
  })

  it("handles non-standard section names", () => {
    const sections: WikipediaSection[] = [
      {
        index: "1",
        line: "Background and youth",
        level: "2",
        anchor: "Background_and_youth",
      },
      { index: "2", line: "Private life", level: "2", anchor: "Private_life" },
      { index: "3", line: "Military service", level: "2", anchor: "Military_service" },
      { index: "4", line: "Legacy", level: "2", anchor: "Legacy" },
    ]

    const result = regexFallbackSelection(sections)

    expect(result).toContain("Background and youth")
    expect(result).toContain("Private life")
    expect(result).toContain("Military service")
    expect(result).not.toContain("Legacy")
  })

  it("returns empty array when no sections match", () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Legacy", level: "2", anchor: "Legacy" },
      { index: "2", line: "Death", level: "2", anchor: "Death" },
      { index: "3", line: "Controversies", level: "2", anchor: "Controversies" },
    ]

    const result = regexFallbackSelection(sections)

    expect(result).toEqual([])
  })
})

describe("selectBiographySections", () => {
  const mockSections: WikipediaSection[] = [
    { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
    { index: "2", line: "Career", level: "2", anchor: "Career" },
    { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
    { index: "4", line: "Education", level: "2", anchor: "Education" },
    { index: "5", line: "Filmography", level: "2", anchor: "Filmography" },
    { index: "6", line: "Awards and nominations", level: "2", anchor: "Awards" },
    { index: "7", line: "Marriage and family", level: "2", anchor: "Marriage_and_family" },
    { index: "8", line: "References", level: "2", anchor: "References" },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("selects biography sections from Gemini response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["Early life", "Personal life", "Education"],
                    reasoning: "These sections contain personal biography information",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Audrey Hepburn", mockSections)

    expect(result.usedAI).toBe(true)
    expect(result.selectedSections).toEqual(["Early life", "Personal life", "Education"])
    expect(result.reasoning).toBe("These sections contain personal biography information")
    expect(result.costUsd).toBe(0.0001)
    expect(result.error).toBeUndefined()
  })

  it("skips career/fame sections in Gemini response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["Early life", "Personal life", "Education", "Marriage and family"],
                    reasoning: "Selected personal life sections only",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.selectedSections).toContain("Early life")
    expect(result.selectedSections).toContain("Personal life")
    expect(result.selectedSections).not.toContain("Filmography")
    expect(result.selectedSections).not.toContain("Awards and nominations")
    expect(result.selectedSections).not.toContain("Career")
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
                    sections: ["EARLY LIFE", "personal life"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(true)
    // Should normalize to original case
    expect(result.selectedSections).toEqual(["Early life", "Personal life"])
  })

  it("strips number prefixes from AI-returned section titles", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: ["1. Early life", "3. Personal life", "4. Education"],
                    reasoning: "Selected personal sections",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(true)
    expect(result.selectedSections).toEqual(["Early life", "Personal life", "Education"])
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
                    sections: ["Early life", "Made Up Section", "Education"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.selectedSections).toEqual(["Early life", "Education"])
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
                      "Personal life",
                      "Education",
                      "Marriage and family",
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await selectBiographySections("Test Actor", mockSections, { maxSections: 2 })

    expect(result.selectedSections).toHaveLength(2)
    expect(result.selectedSections).toEqual(["Early life", "Career"])
  })

  it("falls back to regex on API HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    // Should have regex fallback sections, NOT empty array
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.selectedSections).toContain("Early life")
    expect(result.error).toContain("Gemini API error: 500")
    expect(result.costUsd).toBe(0)
  })

  it("falls back to regex on malformed JSON response", async () => {
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

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    // Should have regex fallback sections, NOT empty array
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.selectedSections).toContain("Early life")
    expect(result.error).toContain("fell back to regex")
    expect(result.costUsd).toBe(0.0001) // Still charges for the API call
  })

  it("falls back to regex on network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    // Should have regex fallback sections, NOT empty array
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.selectedSections).toContain("Early life")
    expect(result.error).toBe("Network error")
    expect(result.costUsd).toBe(0)
  })

  it("falls back to regex when API key is not configured", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "")

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    // Should have regex fallback sections, NOT empty array
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.selectedSections).toContain("Early life")
    expect(result.error).toContain("API key not configured")
    expect(result.costUsd).toBe(0)
  })

  it("handles empty sections array", async () => {
    const result = await selectBiographySections("Test Actor", [])

    expect(result.usedAI).toBe(false)
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("No sections provided")
    expect(result.costUsd).toBe(0)
  })

  it("returns error when no sections provided (empty input)", async () => {
    const result = await selectBiographySections("Test Actor", [])

    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("No sections provided")
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
                  text: JSON.stringify({ sections: ["Early life"] }),
                },
              ],
            },
          },
        ],
      }),
    })

    await selectBiographySections("John Wayne", mockSections)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]

    // Check URL contains gemini model
    expect(url).toContain("gemini-2.0-flash")
    expect(url).toContain("generateContent")

    // Check request body
    const body = JSON.parse(options.body)
    expect(body.contents[0].parts[0].text).toContain("John Wayne")
    expect(body.contents[0].parts[0].text).toContain("PERSONAL LIFE")
    expect(body.contents[0].parts[0].text).toContain("Childhood")
    expect(body.contents[0].parts[0].text).toContain("Education")
    expect(body.contents[0].parts[0].text).toContain("DO NOT select sections about")
    expect(body.contents[0].parts[0].text).toContain("Filmography")
    expect(body.generationConfig.temperature).toBe(0.1)
    expect(body.generationConfig.maxOutputTokens).toBe(500)
  })

  it("handles Gemini API error response in body", async () => {
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

    const result = await selectBiographySections("Test Actor", mockSections)

    expect(result.usedAI).toBe(false)
    // Should have regex fallback sections
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.error).toContain("Rate limit exceeded")
    expect(result.costUsd).toBe(0)
  })

  it("handles AI returning empty sections array", async () => {
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

    const result = await selectBiographySections("Test Actor", mockSections)

    // Should fall back to regex since AI returned nothing
    expect(result.usedAI).toBe(false)
    expect(result.selectedSections.length).toBeGreaterThan(0)
    expect(result.costUsd).toBe(0.0001) // Still charges for the API call
  })
})
