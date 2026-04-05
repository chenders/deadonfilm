import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock all sub-modules before any imports
vi.mock("./autocomplete.js", () => ({
  fetchAutocompleteSuggestions: vi.fn().mockResolvedValue([]),
}))
vi.mock("./boring-filter.js", () => ({
  filterBoringSuggestions: vi.fn().mockReturnValue({ kept: [], dropped: 0, droppedByReason: {} }),
}))
vi.mock("./incongruity-scorer.js", () => ({
  scoreIncongruity: vi.fn().mockResolvedValue({ candidates: [], costUsd: 0 }),
}))
vi.mock("./reddit-researcher.js", () => ({
  researchOnReddit: vi.fn().mockResolvedValue({ threads: [], claimExtracted: "", costUsd: 0 }),
}))
vi.mock("./verifier.js", () => ({
  verifyClaim: vi.fn().mockResolvedValue({ verified: false, attempts: [] }),
}))
vi.mock("./integrator.js", () => ({
  integrateFindings: vi.fn().mockResolvedValue({
    updatedNarrative: null,
    newLesserKnownFacts: [],
    integrated: [],
    costUsd: 0,
  }),
}))
vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))
const mockPoolQuery = vi.fn()
vi.mock("../../db/pool.js", () => ({
  getPool: () => ({ query: mockPoolQuery }),
}))

// Import after mocking
import { runSurpriseDiscovery } from "./orchestrator.js"
import type { DiscoveryActor } from "./orchestrator.js"
import type { DiscoveryConfig } from "./types.js"
import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import { filterBoringSuggestions } from "./boring-filter.js"
import { scoreIncongruity } from "./incongruity-scorer.js"
import { researchOnReddit } from "./reddit-researcher.js"
import { verifyClaim } from "./verifier.js"
import { integrateFindings } from "./integrator.js"
import { logger } from "../../logger.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR: DiscoveryActor = {
  id: 42,
  name: "Helen Mirren",
  tmdb_id: 12345,
}

const EXISTING_NARRATIVE =
  "Helen Mirren grew up in Essex. She became one of Britain's finest actresses."

const EXISTING_FACTS = [{ text: "She is a trained dancer", sourceUrl: null, sourceName: null }]

const ENABLED_CONFIG: DiscoveryConfig = {
  enabled: true,
  integrationStrategy: "append-only",
  incongruityThreshold: 7,
  maxCostPerActorUsd: 0.1,
}

const DISABLED_CONFIG: DiscoveryConfig = {
  ...ENABLED_CONFIG,
  enabled: false,
}

// DB mock: return empty rows for all three queries
function mockEmptyDb(): void {
  mockPoolQuery.mockResolvedValue({ rows: [] })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runSurpriseDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmptyDb()
  })

  it("returns early with empty result when discovery is disabled", async () => {
    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      DISABLED_CONFIG
    )

    expect(result.hasFindings).toBe(false)
    expect(result.updatedNarrative).toBeNull()
    expect(result.newLesserKnownFacts).toEqual([])
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled()
    expect(filterBoringSuggestions).not.toHaveBeenCalled()
    expect(scoreIncongruity).not.toHaveBeenCalled()
  })

  it("stops at Phase 1 when boring filter drops everything (no candidates)", async () => {
    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([
      {
        fullText: "helen mirren age",
        term: "age",
        queryPattern: "keyword",
        rawQuery: '"helen mirren" a',
      },
    ])

    // boring filter drops everything
    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [],
      dropped: 1,
      droppedByReason: { generic: 1 },
    })

    // incongruity returns no candidates
    vi.mocked(scoreIncongruity).mockResolvedValue({ candidates: [], costUsd: 0 })

    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      ENABLED_CONFIG
    )

    expect(result.hasFindings).toBe(false)
    expect(result.updatedNarrative).toBeNull()
    expect(result.newLesserKnownFacts).toEqual([])
    expect(researchOnReddit).not.toHaveBeenCalled()
    expect(integrateFindings).not.toHaveBeenCalled()

    // Phase 1 stats are present in the result
    expect(result.discoveryResults.boringFilter.dropped).toBe(1)
    expect(result.discoveryResults.boringFilter.droppedByReason).toEqual({ generic: 1 })
  })

  it("stops at Phase 1 when no candidates score above the threshold", async () => {
    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([
      {
        fullText: "helen mirren karate",
        term: "karate",
        queryPattern: "keyword",
        rawQuery: '"helen mirren" karate',
      },
    ])

    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [
        {
          fullText: "helen mirren karate",
          term: "karate",
          queryPattern: "keyword",
          rawQuery: '"helen mirren" karate',
        },
      ],
      dropped: 0,
      droppedByReason: {},
    })

    // Scored below threshold (threshold is 7)
    vi.mocked(scoreIncongruity).mockResolvedValue({
      candidates: [{ term: "karate", score: 4, reasoning: "Predictable for an actor" }],
      costUsd: 0.001,
    })

    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      ENABLED_CONFIG
    )

    expect(result.hasFindings).toBe(false)
    expect(researchOnReddit).not.toHaveBeenCalled()
    expect(integrateFindings).not.toHaveBeenCalled()

    // incongruity candidates recorded in results even if below threshold
    expect(result.discoveryResults.incongruityCandidates).toHaveLength(1)
    expect(result.discoveryResults.incongruityCandidates[0].score).toBe(4)
  })

  it("proceeds to Phase 2 when high-incongruity candidates are found", async () => {
    const suggestion = {
      fullText: "helen mirren karate black belt",
      term: "karate black belt",
      queryPattern: "keyword" as const,
      rawQuery: '"helen mirren" karate',
    }

    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([suggestion])

    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [suggestion],
      dropped: 0,
      droppedByReason: {},
    })

    vi.mocked(scoreIncongruity).mockResolvedValue({
      candidates: [
        {
          term: "karate black belt",
          score: 9,
          reasoning: "Unexpected connection for a classically trained actress",
        },
      ],
      costUsd: 0.001,
    })

    vi.mocked(researchOnReddit).mockResolvedValue({
      threads: [
        {
          url: "https://reddit.com/r/movies/123",
          subreddit: "movies",
          title: "Helen Mirren karate",
          upvotes: 0,
        },
      ],
      claimExtracted: "Helen Mirren holds a karate black belt",
      costUsd: 0,
    })

    vi.mocked(verifyClaim).mockResolvedValue({
      verified: true,
      attempts: [{ source: "theguardian.com", url: "https://theguardian.com/1", found: true }],
      verificationSource: "theguardian.com",
      verificationUrl: "https://theguardian.com/helen-mirren-karate",
      verificationExcerpt: "Mirren trained in karate",
    })

    vi.mocked(integrateFindings).mockResolvedValue({
      updatedNarrative: null,
      newLesserKnownFacts: [
        {
          text: "She holds a karate black belt.",
          sourceUrl: "https://theguardian.com/helen-mirren-karate",
          sourceName: "theguardian.com",
        },
      ],
      integrated: [
        {
          term: "karate black belt",
          destination: "lesserKnownFacts",
          verificationSource: "theguardian.com",
        },
      ],
      costUsd: 0.005,
    })

    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      ENABLED_CONFIG
    )

    expect(researchOnReddit).toHaveBeenCalledWith(ACTOR.name, "karate black belt")
    expect(verifyClaim).toHaveBeenCalledWith(
      ACTOR.name,
      "karate black belt",
      "Helen Mirren holds a karate black belt"
    )
    expect(integrateFindings).toHaveBeenCalledWith(
      ACTOR.name,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      expect.arrayContaining([
        expect.objectContaining({ term: "karate black belt", verified: true }),
      ]),
      ENABLED_CONFIG.integrationStrategy
    )

    expect(result.hasFindings).toBe(true)
    expect(result.newLesserKnownFacts).toEqual([
      {
        text: "She holds a karate black belt.",
        sourceUrl: "https://theguardian.com/helen-mirren-karate",
        sourceName: "theguardian.com",
      },
    ])
    expect(result.updatedNarrative).toBeNull()
  })

  it("stops research when cost limit is reached before processing all candidates", async () => {
    const makeSuggestion = (term: string) => ({
      fullText: `helen mirren ${term}`,
      term,
      queryPattern: "keyword" as const,
      rawQuery: `"helen mirren" ${term}`,
    })

    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([
      makeSuggestion("term-a"),
      makeSuggestion("term-b"),
    ])

    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [makeSuggestion("term-a"), makeSuggestion("term-b")],
      dropped: 0,
      droppedByReason: {},
    })

    vi.mocked(scoreIncongruity).mockResolvedValue({
      candidates: [
        { term: "term-a", score: 9, reasoning: "Surprising" },
        { term: "term-b", score: 8, reasoning: "Also surprising" },
      ],
      // Cost already at the limit after Phase 1 scoring
      costUsd: 0.1,
    })

    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      ENABLED_CONFIG // maxCostPerActorUsd: 0.1
    )

    // Cost is at the limit before Phase 2 loop starts, so no Reddit research
    expect(researchOnReddit).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ totalCost: 0.1 }),
      "discovery: cost limit reached, stopping research"
    )
    // No verified findings, so integrator not called
    expect(integrateFindings).not.toHaveBeenCalled()
  })

  it("builds correct DiscoveryResults record with all stats", async () => {
    const suggestion = {
      fullText: "helen mirren chess champion",
      term: "chess champion",
      queryPattern: "quoted-letter" as const,
      rawQuery: '"helen mirren" c',
    }

    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([suggestion])

    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [suggestion],
      dropped: 2,
      droppedByReason: { generic: 1, filmography: 1 },
    })

    vi.mocked(scoreIncongruity).mockResolvedValue({
      candidates: [{ term: "chess champion", score: 8, reasoning: "Unexpected" }],
      costUsd: 0.002,
    })

    vi.mocked(researchOnReddit).mockResolvedValue({
      threads: [],
      claimExtracted: "Helen Mirren is a chess champion",
      costUsd: 0,
    })

    vi.mocked(verifyClaim).mockResolvedValue({
      verified: true,
      attempts: [{ source: "bbc.com", url: "https://bbc.com/1", found: true }],
      verificationSource: "bbc.com",
      verificationUrl: "https://bbc.com/helen-mirren-chess",
      verificationExcerpt: "Mirren plays competitive chess",
    })

    vi.mocked(integrateFindings).mockResolvedValue({
      updatedNarrative: null,
      newLesserKnownFacts: [
        {
          text: "She is a chess champion.",
          sourceUrl: "https://bbc.com/helen-mirren-chess",
          sourceName: "bbc.com",
        },
      ],
      integrated: [
        { term: "chess champion", destination: "lesserKnownFacts", verificationSource: "bbc.com" },
      ],
      costUsd: 0.01,
    })

    const result = await runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      ENABLED_CONFIG
    )

    const dr = result.discoveryResults

    // Top-level fields
    expect(dr.discoveredAt).toBeTruthy()
    expect(new Date(dr.discoveredAt).getTime()).toBeGreaterThan(0)
    expect(dr.config.integrationStrategy).toBe("append-only")
    expect(dr.config.incongruityThreshold).toBe(7)

    // Autocomplete
    expect(dr.autocomplete.totalSuggestions).toBe(1)
    expect(dr.autocomplete.byPattern).toEqual({ "quoted-letter": 1 })

    // Boring filter
    expect(dr.boringFilter.dropped).toBe(2)
    expect(dr.boringFilter.remaining).toBe(1)
    expect(dr.boringFilter.droppedByReason).toEqual({ generic: 1, filmography: 1 })

    // Incongruity candidates
    expect(dr.incongruityCandidates).toHaveLength(1)
    expect(dr.incongruityCandidates[0].term).toBe("chess champion")
    expect(dr.incongruityCandidates[0].score).toBe(8)

    // Researched
    expect(dr.researched).toHaveLength(1)
    expect(dr.researched[0].term).toBe("chess champion")
    expect(dr.researched[0].verified).toBe(true)

    // Integrated
    expect(dr.integrated).toHaveLength(1)
    expect(dr.integrated[0].destination).toBe("lesserKnownFacts")

    // Total cost: 0.002 (scoring) + 0 (reddit) + 0.01 (integration) = 0.012
    expect(dr.costUsd).toBeCloseTo(0.012, 6)
  })
})
