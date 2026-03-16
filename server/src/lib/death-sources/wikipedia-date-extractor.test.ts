import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock @anthropic-ai/sdk before importing the module under test
const mockCreate = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { extractDatesWithAI, isAIDateExtractionAvailable } from "./wikipedia-date-extractor.js"

describe("isAIDateExtractionAvailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns true when API key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    expect(isAIDateExtractionAvailable()).toBe(true)
  })

  it("returns false when API key is not set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    expect(isAIDateExtractionAvailable()).toBe(false)
  })

  it("returns false when API key is undefined", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined)
    expect(isAIDateExtractionAvailable()).toBe(false)
  })
})

describe("extractDatesWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    mockCreate.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns error when API key is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
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
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 1907, deathYear: 1979 }),
        },
      ],
    })

    const result = await extractDatesWithAI(
      "John Wayne",
      "Marion Robert Morrison (May 26, 1907 - June 11, 1979), known professionally as John Wayne, was an American actor."
    )

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1907)
    expect(result.deathYear).toBe(1979)
    expect(result.costUsd).toBe(0.0001)
    expect(result.error).toBeUndefined()
  })

  it("handles Stalin-like intro with confusing date ranges", async () => {
    const stalinIntro = `Joseph Vissarionovich Stalin (born Ioseb Besarionis dze Jughashvili; 18 December [O.S. 6 December] 1878 - 5 March 1953) was a Soviet revolutionary and politician who was the leader of the Soviet Union from 1924 until his death in 1953. He held power as General Secretary of the Communist Party (1922-1952) and Chairman of the Council of Ministers (1941-1953). His body was preserved in Lenin's Mausoleum (1953-1961).`

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 1878, deathYear: 1953 }),
        },
      ],
    })

    const result = await extractDatesWithAI("Joseph Stalin", stalinIntro)

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1878)
    expect(result.deathYear).toBe(1953)
    expect(result.costUsd).toBe(0.0001)
  })

  it("handles API errors gracefully", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API request failed"))

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(false)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toBe("API request failed")
    expect(result.costUsd).toBe(0)
  })

  it("handles malformed JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "This is not valid JSON at all",
        },
      ],
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.error).toBe("AI returned no valid date response")
    expect(result.costUsd).toBe(0.0001)
  })

  it("treats out-of-range years as null", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 500, deathYear: 2200 }),
        },
      ],
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
    expect(result.costUsd).toBe(0.0001)
  })

  it("treats non-integer years as null", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 1907.5, deathYear: "1979" }),
        },
      ],
    })

    const result = await extractDatesWithAI("Test Actor", "Some intro text")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBeNull()
    expect(result.deathYear).toBeNull()
  })

  it("handles response with only birth year", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 1990, deathYear: null }),
        },
      ],
    })

    const result = await extractDatesWithAI("Living Actor", "Born in 1990, still alive.")

    expect(result.usedAI).toBe(true)
    expect(result.birthYear).toBe(1990)
    expect(result.deathYear).toBeNull()
    expect(result.costUsd).toBe(0.0001)
  })

  it("sends correct parameters to Anthropic API", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ birthYear: 1907, deathYear: 1979 }),
        },
      ],
    })

    await extractDatesWithAI("John Wayne", "Some intro about John Wayne")

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockCreate.mock.calls[0][0]

    expect(callArgs.model).toBe("claude-haiku-4-5-20251001")
    expect(callArgs.max_tokens).toBe(100)
    expect(callArgs.messages[0].role).toBe("user")
    expect(callArgs.messages[0].content).toContain("John Wayne")
    expect(callArgs.messages[0].content).toContain("birth year")
    expect(callArgs.messages[0].content).toContain("death year")
  })
})
