import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ActorForBiography, RawBiographySourceData } from "./types.js"
import { BiographySourceType } from "./types.js"

// Shared mock create function accessible from all tests
const mockCreate = vi.fn()

// Mock Anthropic SDK with a proper class before importing code that uses it
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

// Import after mocking
import {
  buildBiographySynthesisPrompt,
  synthesizeBiography,
  estimateSynthesisCost,
} from "./claude-cleanup.js"

const mockActor: ActorForBiography = {
  id: 123,
  tmdb_id: 456,
  imdb_person_id: "nm0000078",
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

const mockSources: RawBiographySourceData[] = [
  {
    sourceName: "Wikipedia",
    sourceType: BiographySourceType.WIKIPEDIA_BIO,
    text: "Marion Robert Morrison, known as John Wayne, grew up in Southern California. His family moved to Glendale when he was young.",
    url: "https://en.wikipedia.org/wiki/John_Wayne",
    confidence: 0.85,
    reliabilityScore: 0.95,
    publication: "Wikipedia",
    domain: "en.wikipedia.org",
  },
  {
    sourceName: "The Guardian",
    sourceType: BiographySourceType.GUARDIAN_BIO,
    text: "Wayne's father was a pharmacist who struggled to make a living. The family moved from Iowa to California seeking better opportunities.",
    url: "https://theguardian.com/film/john-wayne",
    confidence: 0.7,
    reliabilityScore: 0.85,
    publication: "The Guardian",
    domain: "theguardian.com",
  },
  {
    sourceName: "Wikidata",
    sourceType: BiographySourceType.WIKIDATA_BIO,
    text: "- Birthplace: Winterset, Iowa\n- Education: University of Southern California\n- Spouse(s): Josephine Alicia Saenz (1933-1945), Esperanza Baur (1946-1954), Pilar Palette (1954-1979)\n- Children: 7\n- Military service: None",
    confidence: 0.9,
    reliabilityScore: 0.98,
    publication: "Wikidata",
    domain: "wikidata.org",
  },
]

function makeValidClaudeResponse(overrides: Record<string, unknown> = {}) {
  return {
    narrative_teaser:
      "Before he became the face of the American Western, Marion Morrison was a skinny kid from Iowa whose family could barely afford groceries.",
    narrative:
      "Growing up in Glendale, California, young Marion Morrison was a skinny, bookish kid who preferred reading to roughhousing. His father, a pharmacist who struggled to keep his business afloat, moved the family west from Winterset, Iowa, seeking better prospects.",
    life_notable_factors: ["poverty", "rags_to_riches", "multiple_careers"],
    birthplace_details:
      "Winterset, Iowa, a small town in Madison County known for its covered bridges.",
    family_background:
      "His father Clyde was a pharmacist; his mother Mary was demanding and often critical.",
    education:
      "Attended Glendale Union High School where he played football. Won a football scholarship to USC.",
    pre_fame_life:
      "Worked as a prop boy at Fox Film Corporation during summers. Lost his football scholarship after a bodysurfing accident.",
    fame_catalyst:
      "Director John Ford took an interest in him after seeing his work as a prop hand.",
    personal_struggles:
      "Three failed marriages. Struggled with alcohol. Diagnosed with lung cancer in 1964.",
    relationships:
      "Married three times: Josephine Saenz (1933-1945), Esperanza Baur (1946-1954), and Pilar Palette (1954-1979). Father of seven children.",
    lesser_known_facts: [
      "His real name was Marion Robert Morrison",
      "He lost a football scholarship due to a bodysurfing injury",
      "He was a champion chess player in college",
    ],
    narrative_confidence: "high",
    has_substantive_content: true,
    ...overrides,
  }
}

function makeMockApiResponse(
  jsonData: Record<string, unknown>,
  tokenOverrides?: { input?: number; output?: number }
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(jsonData),
      },
    ],
    usage: {
      input_tokens: tokenOverrides?.input ?? 2000,
      output_tokens: tokenOverrides?.output ?? 800,
    },
  }
}

function makeMockApiResponseRaw(
  text: string,
  tokenOverrides?: { input?: number; output?: number }
) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    usage: {
      input_tokens: tokenOverrides?.input ?? 2000,
      output_tokens: tokenOverrides?.output ?? 800,
    },
  }
}

describe("claude-cleanup (biography)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = "test-key"
  })

  // =========================================================================
  // buildBiographySynthesisPrompt tests
  // =========================================================================

  describe("buildBiographySynthesisPrompt", () => {
    it("includes actor name in prompt", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("John Wayne")
    })

    it("includes birth year when available", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("born 1907")
    })

    it("includes death year when available", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("died 1979")
    })

    it("includes source material with reliability scores", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("reliability: 95%")
      expect(prompt).toContain("reliability: 85%")
      expect(prompt).toContain("grew up in Southern California")
      expect(prompt).toContain("pharmacist who struggled")
    })

    it("sorts sources by reliability (highest first)", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      // Wikipedia (95%) should appear before Guardian (85%)
      const wikiPos = prompt.indexOf("grew up in Southern California")
      const guardianPos = prompt.indexOf("pharmacist who struggled")
      expect(wikiPos).toBeLessThan(guardianPos)
    })

    it("extracts Wikidata structured data into separate section", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("STRUCTURED DATA (from Wikidata)")
      expect(prompt).toContain("Birthplace: Winterset, Iowa")
      expect(prompt).toContain("University of Southern California")
    })

    it("truncates sources when exceeding 50,000 chars", () => {
      const longSource: RawBiographySourceData = {
        sourceName: "Very Long Source",
        sourceType: BiographySourceType.GOOGLE_SEARCH_BIO,
        text: "A".repeat(60_000),
        confidence: 0.5,
        reliabilityScore: 0.3,
        publication: "Some Site",
      }
      const sources = [mockSources[0], longSource]
      const prompt = buildBiographySynthesisPrompt(mockActor, sources)

      // Should not contain all 60,000 A's
      const aCount = (prompt.match(/A/g) || []).length
      expect(aCount).toBeLessThan(60_000)
    })

    it("handles actor with no birth/death dates", () => {
      const actorNoDates: ActorForBiography = {
        ...mockActor,
        birthday: null,
        deathday: null,
      }
      const prompt = buildBiographySynthesisPrompt(actorNoDates, mockSources)
      expect(prompt).toContain("John Wayne")
      // Should not have date parenthetical like "(born 1907, died 1979)"
      expect(prompt).not.toContain("born 1907")
      expect(prompt).not.toContain("died 1979")
      // The header should just be the name with no date parenthetical
      expect(prompt).toContain("You are writing a biography for John Wayne.")
    })

    it("handles empty sources array", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, [])
      expect(prompt).toContain("John Wayne")
      expect(prompt).toContain("Return JSON only")
    })

    it("includes narrative structure guidelines", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("NARRATIVE STRUCTURE")
      expect(prompt).toContain("Open with childhood/family background")
      expect(prompt).toContain("VARY openings")
    })

    it("includes tone guidelines", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("TONE")
      expect(prompt).toContain("well-researched retrospective, not a magazine profile")
      expect(prompt).toContain("No superlatives")
    })

    it("includes teaser quality guidelines", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("TEASER QUALITY")
      expect(prompt).toContain("hook the reader")
    })

    it("includes valid life notable factors list", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("VALID LIFE NOTABLE FACTORS")
      expect(prompt).toContain("orphaned")
      expect(prompt).toContain("military_service")
      expect(prompt).toContain("philanthropist")
      expect(prompt).toContain("rags_to_riches")
    })

    it("includes source conflict guidance", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("WHEN SOURCES CONFLICT")
      expect(prompt).toContain("Prefer higher reliability sources")
    })

    it("includes critical instructions about filmography exclusion", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("Do NOT list filmography, awards, box office numbers")
      expect(prompt).toContain("Do NOT include birth/death dates")
    })

    it("includes instruction to exclude death circumstances from biography", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("Do NOT describe how or when the person died")
      expect(prompt).toContain("death circumstances have their own dedicated section")
    })

    it("includes has_substantive_content field in JSON spec", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain('"has_substantive_content"')
    })

    it("does not include Wikidata text in regular source section", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      // Wikidata content should only appear in the STRUCTURED DATA section
      const normalSourcePattern = /--- Wikidata \(/
      expect(normalSourcePattern.test(prompt)).toBe(false)
    })

    it("includes banned patterns section to suppress AI writing habits", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("BANNED PATTERNS")
      expect(prompt).toContain("that would [define/shape/become/later/eventually]")
      expect(prompt).toContain("marked by")
      expect(prompt).toContain("instilled in him/her")
    })

    it("includes factual threshold guidance against inferring motivations", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("Do NOT infer motivations, inner thoughts, or")
      expect(prompt).toContain("that is the writer's invention")
    })

    it("includes anti-thematic-arc guidance in CRITICAL section", () => {
      const prompt = buildBiographySynthesisPrompt(mockActor, mockSources)
      expect(prompt).toContain("Do NOT impose a thematic arc")
      expect(prompt).toContain("concrete, specific details over abstract characterization")
    })

    it("handles actor with birthday but no deathday", () => {
      const actorAlive: ActorForBiography = {
        ...mockActor,
        deathday: null,
      }
      const prompt = buildBiographySynthesisPrompt(actorAlive, mockSources)
      expect(prompt).toContain("born 1907")
      expect(prompt).not.toMatch(/\(born 1907, died \d{4}\)/)
    })
  })

  // =========================================================================
  // synthesizeBiography tests
  // =========================================================================

  describe("synthesizeBiography", () => {
    it("returns complete BiographyData from valid Claude response", async () => {
      const validResponse = makeValidClaudeResponse()
      mockCreate.mockResolvedValue(makeMockApiResponse(validResponse))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).not.toBeNull()
      expect(result.data!.narrativeTeaser).toContain("Marion Morrison")
      expect(result.data!.narrative).toContain("Glendale, California")
      expect(result.data!.birthplaceDetails).toContain("Winterset, Iowa")
      expect(result.data!.familyBackground).toContain("pharmacist")
      expect(result.data!.education).toContain("USC")
      expect(result.data!.preFameLife).toContain("prop boy")
      expect(result.data!.fameCatalyst).toContain("John Ford")
      expect(result.data!.personalStruggles).toContain("alcohol")
      expect(result.data!.relationships).toContain("Josephine Saenz")
      expect(result.data!.lesserKnownFacts).toHaveLength(3)
      expect(result.data!.hasSubstantiveContent).toBe(true)
      expect(result.data!.narrativeConfidence).toBe("high")
      expect(result.error).toBeUndefined()
    })

    it("validates life_notable_factors against VALID set (strips invalid)", async () => {
      const response = makeValidClaudeResponse({
        life_notable_factors: ["poverty", "invalid_tag", "rags_to_riches", "fake_factor"],
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data!.lifeNotableFactors).toEqual(["poverty", "rags_to_riches"])
    })

    it("returns has_substantive_content: false when Claude says so", async () => {
      const response = makeValidClaudeResponse({
        has_substantive_content: false,
        narrative: "Generic career summary with no personal details.",
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data!.hasSubstantiveContent).toBe(false)
    })

    it("handles malformed JSON (returns error)", async () => {
      mockCreate.mockResolvedValue(
        makeMockApiResponseRaw("This is not valid JSON at all {{{", { input: 100, output: 50 })
      )

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).toBeNull()
      expect(result.error).toContain("Failed to parse Claude response as JSON")
      expect(result.costUsd).toBeGreaterThan(0)
    })

    it("handles Claude API error (returns error)", async () => {
      mockCreate.mockRejectedValue(new Error("API rate limit exceeded"))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).toBeNull()
      expect(result.error).toContain("Claude API error")
      expect(result.error).toContain("API rate limit exceeded")
      expect(result.costUsd).toBe(0)
    })

    it("handles missing ANTHROPIC_API_KEY", async () => {
      delete process.env.ANTHROPIC_API_KEY

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).toBeNull()
      expect(result.error).toContain("ANTHROPIC_API_KEY")
    })

    it("tracks input/output tokens and cost", async () => {
      mockCreate.mockResolvedValue(
        makeMockApiResponse(makeValidClaudeResponse(), { input: 3000, output: 1200 })
      )

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.inputTokens).toBe(3000)
      expect(result.outputTokens).toBe(1200)
      // Cost: (3000 * 3 / 1_000_000) + (1200 * 15 / 1_000_000) = 0.009 + 0.018 = 0.027
      expect(result.costUsd).toBeCloseTo(0.027, 4)
    })

    it("uses default model when not specified", async () => {
      mockCreate.mockResolvedValue(makeMockApiResponse(makeValidClaudeResponse()))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.model).toBe("claude-sonnet-4-20250514")
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-sonnet-4-20250514" })
      )
    })

    it("uses custom model when specified", async () => {
      mockCreate.mockResolvedValue(makeMockApiResponse(makeValidClaudeResponse()))

      const result = await synthesizeBiography(mockActor, mockSources, {
        model: "claude-opus-4-20250514",
      })

      expect(result.model).toBe("claude-opus-4-20250514")
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-opus-4-20250514" })
      )
    })

    it("validates narrative_confidence against known values", async () => {
      const response = makeValidClaudeResponse({
        narrative_confidence: "super_high",
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      // Invalid confidence should default to "medium"
      expect(result.data!.narrativeConfidence).toBe("medium")
    })

    it("strips markdown fences from response", async () => {
      const validResponse = makeValidClaudeResponse()
      mockCreate.mockResolvedValue(
        makeMockApiResponseRaw("```json\n" + JSON.stringify(validResponse) + "\n```")
      )

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).not.toBeNull()
      expect(result.data!.narrativeTeaser).toContain("Marion Morrison")
      expect(result.error).toBeUndefined()
    })

    it("handles null fields gracefully", async () => {
      const response = makeValidClaudeResponse({
        narrative_teaser: null,
        narrative: null,
        birthplace_details: null,
        family_background: null,
        education: null,
        pre_fame_life: null,
        fame_catalyst: null,
        personal_struggles: null,
        relationships: null,
        lesser_known_facts: null,
        life_notable_factors: null,
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).not.toBeNull()
      expect(result.data!.narrativeTeaser).toBeNull()
      expect(result.data!.narrative).toBeNull()
      expect(result.data!.birthplaceDetails).toBeNull()
      expect(result.data!.familyBackground).toBeNull()
      expect(result.data!.education).toBeNull()
      expect(result.data!.preFameLife).toBeNull()
      expect(result.data!.fameCatalyst).toBeNull()
      expect(result.data!.personalStruggles).toBeNull()
      expect(result.data!.relationships).toBeNull()
      expect(result.data!.lesserKnownFacts).toEqual([])
      expect(result.data!.lifeNotableFactors).toEqual([])
    })

    it("handles missing text block in response", async () => {
      mockCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 100, output_tokens: 0 },
      })

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data).toBeNull()
      expect(result.error).toContain("No text response from Claude")
    })

    it("defaults has_substantive_content to false if not a boolean", async () => {
      const response = makeValidClaudeResponse({
        has_substantive_content: "yes",
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data!.hasSubstantiveContent).toBe(false)
    })

    it("filters non-string items from lesser_known_facts", async () => {
      const response = makeValidClaudeResponse({
        lesser_known_facts: ["Real fact", 42, null, "Another fact", true],
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data!.lesserKnownFacts).toEqual(["Real fact", "Another fact"])
    })

    it("filters non-string items from life_notable_factors", async () => {
      const response = makeValidClaudeResponse({
        life_notable_factors: ["poverty", 42, null, "military_service"],
      })
      mockCreate.mockResolvedValue(makeMockApiResponse(response))

      const result = await synthesizeBiography(mockActor, mockSources)

      expect(result.data!.lifeNotableFactors).toEqual(["poverty", "military_service"])
    })

    it("accepts all three valid confidence levels", async () => {
      for (const confidence of ["high", "medium", "low"]) {
        const response = makeValidClaudeResponse({ narrative_confidence: confidence })
        mockCreate.mockResolvedValue(makeMockApiResponse(response))

        const result = await synthesizeBiography(mockActor, mockSources)
        expect(result.data!.narrativeConfidence).toBe(confidence)
      }
    })
  })

  // =========================================================================
  // estimateSynthesisCost tests
  // =========================================================================

  describe("estimateSynthesisCost", () => {
    it("estimates based on source text length", () => {
      const cost = estimateSynthesisCost(mockSources)
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(1) // Should be well under $1 for short text
    })

    it("increases cost with longer source text", () => {
      const shortSources: RawBiographySourceData[] = [
        {
          sourceName: "Short",
          sourceType: BiographySourceType.WIKIPEDIA_BIO,
          text: "Born in Iowa. Grew up in California.",
          confidence: 0.5,
          reliabilityScore: 0.8,
        },
      ]
      const longSources: RawBiographySourceData[] = [
        {
          sourceName: "Long",
          sourceType: BiographySourceType.WIKIPEDIA_BIO,
          text: "A ".repeat(10000) + "long biography with extensive details.",
          confidence: 0.5,
          reliabilityScore: 0.8,
        },
      ]

      const shortCost = estimateSynthesisCost(shortSources)
      const longCost = estimateSynthesisCost(longSources)

      expect(longCost).toBeGreaterThan(shortCost)
    })

    it("returns baseline cost for empty sources", () => {
      const cost = estimateSynthesisCost([])

      // Even with no text, there's prompt overhead (1800 tokens) + output estimate (1500 tokens)
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.1)
    })

    it("returns a reasonable cost for typical sources", () => {
      // ~500 chars of source text
      const cost = estimateSynthesisCost(mockSources)

      // Input: ceil(~500/4) + 1800 = ~1925 tokens * $3/M = ~$0.00578
      // Output: 1500 tokens * $15/M = $0.0225
      // Total ~$0.027
      expect(cost).toBeGreaterThan(0.01)
      expect(cost).toBeLessThan(0.1)
    })
  })
})
