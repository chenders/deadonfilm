import { describe, it, expect, vi, beforeEach } from "vitest"

// Shared mock for Anthropic messages.create
const mockCreate = vi.fn()

// Mock @anthropic-ai/sdk before importing the module under test
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

// Mock logger to suppress output during tests
vi.mock("../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocking
import {
  scoreIncongruity,
  buildIncongruityPrompt,
  calculateCost,
  parseHaikuResponse,
} from "./incongruity-scorer.js"
import type { AutocompleteSuggestion } from "./types.js"

function makeSuggestion(term: string): AutocompleteSuggestion {
  return {
    fullText: `keanu reeves ${term}`,
    term,
    queryPattern: "quoted-letter",
    rawQuery: `"keanu reeves" ${term[0]}`,
  }
}

function makeHaikuResponse(items: Array<{ term: string; score: number; reasoning: string }>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items) }],
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

describe("scoreIncongruity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns scored candidates from a valid Haiku response", async () => {
    const suggestions = [
      makeSuggestion("speed chess grandmaster"),
      makeSuggestion("philosophy degree"),
    ]

    mockCreate.mockResolvedValue(
      makeHaikuResponse([
        {
          term: "speed chess grandmaster",
          score: 9,
          reasoning: "Completely unexpected for an action star",
        },
        { term: "philosophy degree", score: 7, reasoning: "Unusual but plausible" },
      ])
    )

    const result = await scoreIncongruity("Keanu Reeves", suggestions)

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        max_tokens: expect.any(Number),
        messages: expect.arrayContaining([expect.objectContaining({ role: "user" })]),
      })
    )

    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toEqual({
      term: "speed chess grandmaster",
      score: 9,
      reasoning: "Completely unexpected for an action star",
    })
    expect(result.candidates[1]).toEqual({
      term: "philosophy degree",
      score: 7,
      reasoning: "Unusual but plausible",
    })
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("returns empty array when no suggestions are provided (no API call)", async () => {
    const result = await scoreIncongruity("Keanu Reeves", [])

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.candidates).toEqual([])
    expect(result.costUsd).toBe(0)
  })

  it("handles malformed JSON response gracefully", async () => {
    const suggestions = [makeSuggestion("speed chess grandmaster")]

    mockCreate.mockResolvedValue({
      content: [{ type: "text" as const, text: "this is not valid json at all {{{" }],
      usage: { input_tokens: 150, output_tokens: 30 },
    })

    const result = await scoreIncongruity("Keanu Reeves", suggestions)

    expect(result.candidates).toEqual([])
    // Cost is still tracked even if parsing fails
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("strips markdown code fences from response", async () => {
    const suggestions = [makeSuggestion("speed chess grandmaster")]

    const rawJson = JSON.stringify([
      { term: "speed chess grandmaster", score: 9, reasoning: "Very unexpected" },
    ])
    mockCreate.mockResolvedValue({
      content: [{ type: "text" as const, text: "```json\n" + rawJson + "\n```" }],
      usage: { input_tokens: 200, output_tokens: 80 },
    })

    const result = await scoreIncongruity("Keanu Reeves", suggestions)

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].term).toBe("speed chess grandmaster")
    expect(result.candidates[0].score).toBe(9)
  })

  it("clamps scores to the 1-10 range", async () => {
    const suggestions = [
      makeSuggestion("speed chess grandmaster"),
      makeSuggestion("philosophy degree"),
    ]

    mockCreate.mockResolvedValue(
      makeHaikuResponse([
        { term: "speed chess grandmaster", score: 15, reasoning: "Way off the scale" },
        { term: "philosophy degree", score: -3, reasoning: "Also out of range" },
      ])
    )

    const result = await scoreIncongruity("Keanu Reeves", suggestions)

    expect(result.candidates[0].score).toBe(10)
    expect(result.candidates[1].score).toBe(1)
  })

  it("handles API errors gracefully", async () => {
    const suggestions = [makeSuggestion("speed chess grandmaster")]

    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"))

    const result = await scoreIncongruity("Keanu Reeves", suggestions)

    expect(result.candidates).toEqual([])
    expect(result.costUsd).toBe(0)
  })
})

describe("buildIncongruityPrompt", () => {
  it("includes actor name and all terms", () => {
    const prompt = buildIncongruityPrompt("John Wayne", ["karate black belt", "chess grandmaster"])

    expect(prompt).toContain("John Wayne")
    expect(prompt).toContain("- karate black belt")
    expect(prompt).toContain("- chess grandmaster")
  })

  it("includes instructions about scoring scale", () => {
    const prompt = buildIncongruityPrompt("John Wayne", ["karate"])

    expect(prompt).toContain("1-10")
    expect(prompt).toContain("SURPRISING")
    expect(prompt).toContain("JSON array")
  })
})

describe("calculateCost", () => {
  it("calculates cost correctly using Haiku pricing", () => {
    // 1M input tokens = $1.00, 1M output tokens = $5.00
    const cost = calculateCost(1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(6.0)
  })

  it("calculates small costs accurately", () => {
    // 200 input + 100 output
    const cost = calculateCost(200, 100)
    expect(cost).toBeCloseTo(200 / 1_000_000 + (100 / 1_000_000) * 5, 8)
  })
})

describe("parseHaikuResponse", () => {
  it("parses valid JSON array response", () => {
    const text = JSON.stringify([{ term: "karate", score: 8, reasoning: "Unexpected" }])
    const expectedTerms = new Set(["karate"])

    const result = parseHaikuResponse(text, expectedTerms)

    expect(result).toHaveLength(1)
    expect(result![0]).toEqual({ term: "karate", score: 8, reasoning: "Unexpected" })
  })

  it("returns null for non-JSON text", () => {
    const result = parseHaikuResponse("not json at all", new Set(["karate"]))
    expect(result).toBeNull()
  })

  it("returns null for non-array JSON", () => {
    const result = parseHaikuResponse('{"term": "karate", "score": 8}', new Set(["karate"]))
    expect(result).toBeNull()
  })

  it("skips items with unexpected terms", () => {
    const text = JSON.stringify([
      { term: "karate", score: 8, reasoning: "Expected" },
      { term: "unexpected-term", score: 9, reasoning: "Not in our list" },
    ])
    const result = parseHaikuResponse(text, new Set(["karate"]))

    expect(result).toHaveLength(1)
    expect(result![0].term).toBe("karate")
  })

  it("clamps scores outside 1-10 range", () => {
    const text = JSON.stringify([
      { term: "karate", score: 0, reasoning: "Too low" },
      { term: "chess", score: 11, reasoning: "Too high" },
    ])
    const result = parseHaikuResponse(text, new Set(["karate", "chess"]))

    expect(result![0].score).toBe(1)
    expect(result![1].score).toBe(10)
  })

  it("skips malformed items but returns valid ones", () => {
    const text = JSON.stringify([
      { term: "karate", score: 8, reasoning: "Valid" },
      { term: "chess" }, // missing score and reasoning
      { score: 7, reasoning: "Missing term" }, // missing term
    ])
    const result = parseHaikuResponse(text, new Set(["karate", "chess"]))

    // Only the fully valid item should be returned
    expect(result).toHaveLength(1)
    expect(result![0].term).toBe("karate")
  })
})
