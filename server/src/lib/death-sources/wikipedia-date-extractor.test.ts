import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { extractDatesWithAI, isAIDateExtractionAvailable } from "./wikipedia-date-extractor.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("isAIDateExtractionAvailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns true when API key is set", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    expect(isAIDateExtractionAvailable()).toBe(true)
  })

  it("returns false when API key is not set", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "")
    expect(isAIDateExtractionAvailable()).toBe(false)
  })

  it("returns false when API key is undefined", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", undefined)
    expect(isAIDateExtractionAvailable()).toBe(false)
  })
})

describe("extractDatesWithAI", () => {
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
    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toContain("API key not configured")
    expect(result.costUsd).toBe(0)
  })

  it("returns error when intro text is empty", async () => {
    const result = await extractDatesWithAI("Test Actor", "")

    expect(result.usedAI).toBe(false)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toBe("No intro text provided")
    expect(result.costUsd).toBe(0)
  })

  it("extracts birth and death years from normal actor intro", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ birthYear: 1907, deathYear: 1979 }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI(
      "John Wayne",
      "Marion Robert Morrison (May 26, 1907 – June 11, 1979), known professionally as John Wayne, was an American actor."
    )

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1907)
    expect(result.deathYear).toBe(1979)
    expect(result.costUsd).toBe(0.0001)
    expect(result.error).toBeUndefined()
  })

  it("handles Stalin-like intro with confusing date ranges", async () => {
    // This is the motivating case: regex matched "(1953–1961)" from "Lenin's Mausoleum (1953–1961)"
    // instead of the actual birth/death years
    const stalinIntro = `Joseph Vissarionovich Stalin (born Ioseb Besarionis dze Jughashvili; 18 December [O.S. 6 December] 1878 – 5 March 1953) was a Soviet revolutionary and politician who was the leader of the Soviet Union from 1924 until his death in 1953. He held power as General Secretary of the Communist Party (1922–1952) and Chairman of the Council of Ministers (1941–1953). His body was preserved in Lenin's Mausoleum (1953–1961).`

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ birthYear: 1878, deathYear: 1953 }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI("Joseph Stalin", stalinIntro)

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1878)
    expect(result.deathYear).toBe(1953)
    expect(result.costUsd).toBe(0.0001)
  })

  it("handles HTTP errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
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

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.error).toContain("Rate limit exceeded")
    expect(result.costUsd).toBe(0)
  })

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.error).toBe("Network error")
    expect(result.costUsd).toBe(0)
  })

  it("handles timeout gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"))

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toContain("aborted")
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
                  text: "This is not valid JSON at all",
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toBe("AI returned no valid date response")
    expect(result.costUsd).toBe(0.0001)
  })

  it("treats out-of-range years as null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ birthYear: 500, deathYear: 2200 }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.costUsd).toBe(0.0001)
  })

  it("treats non-integer years as null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ birthYear: 1907.5, deathYear: "1979" }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
  })

  it("handles response with only birth year", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ birthYear: 1990, deathYear: null }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await extractDatesWithAI("Living Actor", "Born in 1990, still alive.")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1990)
    expect(result.deathYear).toBeNull()
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
                  text: JSON.stringify({ birthYear: 1907, deathYear: 1979 }),
                },
              ],
            },
          },
        ],
      }),
    })

    await extractDatesWithAI("John Wayne", "Some intro about John Wayne")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]

    // Check URL contains gemini model
    expect(url).toContain("gemini-2.0-flash")
    expect(url).toContain("generateContent")

    // Check request body
    const body = JSON.parse(options.body)
    expect(body.contents[0].parts[0].text).toContain("John Wayne")
    expect(body.contents[0].parts[0].text).toContain("birth year")
    expect(body.contents[0].parts[0].text).toContain("death year")
    expect(body.generationConfig.temperature).toBe(0.1)
    expect(body.generationConfig.maxOutputTokens).toBe(100)
  })
})
