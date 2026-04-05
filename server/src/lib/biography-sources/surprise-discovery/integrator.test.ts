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
  integrateFindings,
  buildAppendOnlyPrompt,
  buildReSynthesizePrompt,
  calculateCost,
  parseSonnetResponse,
} from "./integrator.js"
import type { ResearchedAssociation } from "./types.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_NAME = "Helen Mirren"

const EXISTING_NARRATIVE =
  "Helen Mirren grew up in Leigh-on-Sea, Essex. Her father changed the family surname from Miroffe to Mirren. She attended drama school and became one of Britain's finest stage actresses before transitioning to film and television."

const EXISTING_FACTS = ["She is a trained dancer", "She speaks some Russian from her heritage"]

function makeResearchedAssociation(
  term: string,
  overrides: Partial<ResearchedAssociation> = {}
): ResearchedAssociation {
  return {
    term,
    incongruityScore: 8,
    redditThreads: [],
    claimExtracted: `Helen Mirren is associated with ${term}`,
    verificationAttempts: [
      { source: "theguardian.com", url: "https://theguardian.com/1", found: true },
    ],
    verified: true,
    verificationSource: "theguardian.com",
    verificationUrl: "https://theguardian.com/helen-mirren-article",
    verificationExcerpt: `Helen Mirren has a connection to ${term} as reported.`,
    ...overrides,
  }
}

function makeSonnetResponse(
  findings: Array<{
    term: string
    destination: "lesserKnownFacts" | "narrative" | "discarded"
    text: string
  }>,
  updatedNarrative: string | null = null,
  inputTokens = 500,
  outputTokens = 200
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ findings, updatedNarrative }),
      },
    ],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

// ── integrateFindings ─────────────────────────────────────────────────────────

describe("integrateFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns new lesser-known facts from append-only strategy", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue(
      makeSonnetResponse([
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          text: "She trained in karate before her acting career, earning a black belt.",
        },
      ])
    )

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    expect(result.newLesserKnownFacts).toHaveLength(1)
    expect(result.newLesserKnownFacts[0]).toContain("karate")
    expect(result.updatedNarrative).toBeNull()
    expect(result.integrated).toHaveLength(1)
    expect(result.integrated[0]).toMatchObject({
      term: "karate black belt",
      destination: "lesserKnownFacts",
      verificationSource: "theguardian.com",
    })
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("returns empty results when no verified findings (no API call)", async () => {
    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      [],
      "append-only"
    )

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.updatedNarrative).toBeNull()
    expect(result.newLesserKnownFacts).toEqual([])
    expect(result.integrated).toEqual([])
    expect(result.costUsd).toBe(0)
  })

  it("returns updated narrative from re-synthesize strategy", async () => {
    const updatedNarrative =
      "Helen Mirren grew up in Leigh-on-Sea, Essex. Before her acting career took off, she trained in karate. Her father changed the family surname from Miroffe to Mirren."

    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue(
      makeSonnetResponse(
        [
          {
            term: "karate black belt",
            destination: "narrative",
            text: "She trained in karate before her acting career.",
          },
        ],
        updatedNarrative
      )
    )

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "re-synthesize"
    )

    expect(result.updatedNarrative).toBe(updatedNarrative)
    expect(result.integrated).toHaveLength(1)
    expect(result.integrated[0]).toMatchObject({
      term: "karate black belt",
      destination: "narrative",
    })
    expect(result.newLesserKnownFacts).toEqual([])
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("handles malformed JSON response gracefully", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue({
      content: [{ type: "text" as const, text: "this is not valid json {{{ at all" }],
      usage: { input_tokens: 400, output_tokens: 80 },
    })

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    // Returns empty results but cost is still tracked
    expect(result.updatedNarrative).toBeNull()
    expect(result.newLesserKnownFacts).toEqual([])
    expect(result.integrated).toEqual([])
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("tracks cost correctly based on token usage", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    // 1M input = $3, 1M output = $15 → 500 input + 200 output = $0.0015 + $0.003 = $0.0045
    mockCreate.mockResolvedValue(
      makeSonnetResponse(
        [{ term: "karate black belt", destination: "discarded", text: "" }],
        null,
        500,
        200
      )
    )

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    const expectedCost = (500 / 1_000_000) * 3 + (200 / 1_000_000) * 15
    expect(result.costUsd).toBeCloseTo(expectedCost, 8)
  })

  it("handles API errors gracefully", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"))

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    expect(result.updatedNarrative).toBeNull()
    expect(result.newLesserKnownFacts).toEqual([])
    expect(result.integrated).toEqual([])
    expect(result.costUsd).toBe(0)
  })

  it("uses append-only strategy (updatedNarrative is null)", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue(
      makeSonnetResponse([
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          text: "She trained in karate.",
        },
      ])
    )

    await integrateFindings(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings, "append-only")

    const calledPrompt = mockCreate.mock.calls[0][0].messages[0].content as string
    // append-only prompt instructs not to rewrite, updatedNarrative should be null
    expect(calledPrompt).toContain("updatedNarrative")
    expect(calledPrompt).not.toContain("Rewrite the biography narrative")
  })

  it("uses re-synthesize strategy (updatedNarrative requested)", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue(
      makeSonnetResponse(
        [{ term: "karate black belt", destination: "narrative", text: "She trained in karate." }],
        "Updated narrative text here."
      )
    )

    await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "re-synthesize"
    )

    const calledPrompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(calledPrompt).toContain("Rewrite the biography narrative")
  })

  it("discarded findings appear in integrated list but not in newLesserKnownFacts", async () => {
    const findings = [
      makeResearchedAssociation("karate black belt"),
      makeResearchedAssociation("chess champion"),
    ]

    mockCreate.mockResolvedValue(
      makeSonnetResponse([
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          text: "She trained in karate.",
        },
        { term: "chess champion", destination: "discarded", text: "" },
      ])
    )

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    expect(result.newLesserKnownFacts).toHaveLength(1)
    expect(result.integrated).toHaveLength(2)
    expect(result.integrated.find((f) => f.term === "chess champion")?.destination).toBe(
      "discarded"
    )
  })

  it("uses the correct model (claude-sonnet-4-20250514)", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    mockCreate.mockResolvedValue(
      makeSonnetResponse([
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          text: "She trained in karate.",
        },
      ])
    )

    await integrateFindings(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings, "append-only")

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-20250514" })
    )
  })

  it("strips markdown code fences from response", async () => {
    const findings = [makeResearchedAssociation("karate black belt")]

    const rawJson = JSON.stringify({
      findings: [
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          text: "She trained in karate.",
        },
      ],
      updatedNarrative: null,
    })

    mockCreate.mockResolvedValue({
      content: [{ type: "text" as const, text: "```json\n" + rawJson + "\n```" }],
      usage: { input_tokens: 300, output_tokens: 100 },
    })

    const result = await integrateFindings(
      ACTOR_NAME,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      findings,
      "append-only"
    )

    expect(result.newLesserKnownFacts).toHaveLength(1)
    expect(result.newLesserKnownFacts[0]).toContain("karate")
  })
})

// ── calculateCost ─────────────────────────────────────────────────────────────

describe("calculateCost", () => {
  it("calculates cost correctly using Sonnet pricing ($3/$15 per M tokens)", () => {
    // 1M input = $3, 1M output = $15 → total $18
    const cost = calculateCost(1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(18.0)
  })

  it("calculates small costs accurately", () => {
    // 500 input + 200 output
    const cost = calculateCost(500, 200)
    expect(cost).toBeCloseTo((500 / 1_000_000) * 3 + (200 / 1_000_000) * 15, 8)
  })

  it("returns 0 for zero tokens", () => {
    expect(calculateCost(0, 0)).toBe(0)
  })
})

// ── parseSonnetResponse ───────────────────────────────────────────────────────

describe("parseSonnetResponse", () => {
  it("parses valid append-only response (updatedNarrative: null)", () => {
    const text = JSON.stringify({
      findings: [
        { term: "karate", destination: "lesserKnownFacts", text: "She trained in karate." },
      ],
      updatedNarrative: null,
    })

    const result = parseSonnetResponse(text)

    expect(result).not.toBeNull()
    expect(result!.findings).toHaveLength(1)
    expect(result!.findings[0]).toEqual({
      term: "karate",
      destination: "lesserKnownFacts",
      text: "She trained in karate.",
    })
    expect(result!.updatedNarrative).toBeNull()
  })

  it("parses valid re-synthesize response (updatedNarrative: string)", () => {
    const text = JSON.stringify({
      findings: [{ term: "karate", destination: "narrative", text: "She trained in karate." }],
      updatedNarrative: "Updated full biography text.",
    })

    const result = parseSonnetResponse(text)

    expect(result).not.toBeNull()
    expect(result!.updatedNarrative).toBe("Updated full biography text.")
  })

  it("returns null for non-JSON text", () => {
    const result = parseSonnetResponse("this is not json at all {{{")
    expect(result).toBeNull()
  })

  it("returns null when findings array is missing", () => {
    const result = parseSonnetResponse(JSON.stringify({ updatedNarrative: null }))
    expect(result).toBeNull()
  })

  it("skips malformed finding items but returns valid ones", () => {
    const text = JSON.stringify({
      findings: [
        { term: "karate", destination: "lesserKnownFacts", text: "She trained in karate." },
        { term: "chess" }, // missing destination and text
        { destination: "discarded", text: "" }, // missing term
      ],
      updatedNarrative: null,
    })

    const result = parseSonnetResponse(text)

    expect(result).not.toBeNull()
    expect(result!.findings).toHaveLength(1)
    expect(result!.findings[0].term).toBe("karate")
  })

  it("skips items with unknown destination values", () => {
    const text = JSON.stringify({
      findings: [
        { term: "karate", destination: "INVALID_DESTINATION", text: "text" },
        { term: "chess", destination: "lesserKnownFacts", text: "She plays chess." },
      ],
      updatedNarrative: null,
    })

    const result = parseSonnetResponse(text)

    expect(result).not.toBeNull()
    expect(result!.findings).toHaveLength(1)
    expect(result!.findings[0].term).toBe("chess")
  })

  it("handles updatedNarrative being absent (treated as null)", () => {
    const text = JSON.stringify({
      findings: [{ term: "karate", destination: "discarded", text: "" }],
    })

    const result = parseSonnetResponse(text)

    expect(result).not.toBeNull()
    expect(result!.updatedNarrative).toBeNull()
  })
})

// ── buildAppendOnlyPrompt ─────────────────────────────────────────────────────

describe("buildAppendOnlyPrompt", () => {
  it("includes actor name, narrative, and findings", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildAppendOnlyPrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain(ACTOR_NAME)
    expect(prompt).toContain(EXISTING_NARRATIVE)
    expect(prompt).toContain("karate black belt")
  })

  it("shows existing lesser-known facts", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildAppendOnlyPrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain("trained dancer")
    expect(prompt).toContain("speaks some Russian")
  })

  it("shows '(none yet)' when no existing facts", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildAppendOnlyPrompt(ACTOR_NAME, EXISTING_NARRATIVE, [], findings)

    expect(prompt).toContain("(none yet)")
  })

  it("requests null updatedNarrative (append-only, no rewrite)", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildAppendOnlyPrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain('"updatedNarrative": null')
    expect(prompt).not.toContain("Rewrite the biography narrative")
  })
})

// ── buildReSynthesizePrompt ───────────────────────────────────────────────────

describe("buildReSynthesizePrompt", () => {
  it("includes actor name, narrative, and findings", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildReSynthesizePrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain(ACTOR_NAME)
    expect(prompt).toContain(EXISTING_NARRATIVE)
    expect(prompt).toContain("karate black belt")
  })

  it("instructs Sonnet to rewrite the narrative", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildReSynthesizePrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain("Rewrite the biography narrative")
  })

  it("requests updatedNarrative as a full text field", () => {
    const findings = [makeResearchedAssociation("karate black belt")]
    const prompt = buildReSynthesizePrompt(ACTOR_NAME, EXISTING_NARRATIVE, EXISTING_FACTS, findings)

    expect(prompt).toContain('"updatedNarrative": "the complete rewritten biography text"')
  })
})
