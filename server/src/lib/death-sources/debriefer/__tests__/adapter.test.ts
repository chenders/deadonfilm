import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ActorForEnrichment } from "../../types.js"

// Mock debriefer to avoid real orchestrator instantiation.
// Use vi.hoisted so the mock class is available when vi.mock runs.
const { MockOrchestrator } = vi.hoisted(() => {
  const mockDebrief = vi.fn().mockResolvedValue({
    subject: { id: 123, name: "Test Actor" },
    data: null,
    findings: [
      {
        text: "The actor died of natural causes.",
        url: "https://en.wikipedia.org/wiki/Test_Actor",
        confidence: 0.9,
        costUsd: 0,
        sourceType: "wikipedia",
        sourceName: "Wikipedia",
        reliabilityTier: "secondary",
        reliabilityScore: 0.85,
      },
    ],
    totalCostUsd: 0.02,
    sourcesAttempted: 5,
    sourcesSucceeded: 1,
    durationMs: 1500,
    stoppedAtPhase: 3,
  })
  class MockOrchestrator {
    static _lastArgs: unknown[] = []
    debrief = mockDebrief
    constructor(...args: unknown[]) {
      MockOrchestrator._lastArgs = args
    }
  }
  return { MockOrchestrator }
})

vi.mock("@debriefer/core", async () => {
  const actual = await vi.importActual("@debriefer/core")
  return { ...actual, ResearchOrchestrator: MockOrchestrator }
})

// Mock all legacy source constructors to avoid side effects
vi.mock("../../sources/bfi-sight-sound.js", () => {
  class MockBFI {
    name = "BFI"
    type = "bfi_sight_sound"
    isFree = true
    estimatedCostPerQuery = 0
    reliabilityTier = "trade_press"
    reliabilityScore = 0.9
    domain = "bfi.org.uk"
    isAvailable() {
      return true
    }
    lookup = vi.fn()
  }
  return { BFISightSoundSource: MockBFI }
})

vi.mock("../../sources/newsapi.js", () => {
  class MockNewsAPI {
    name = "NewsAPI"
    type = "newsapi"
    isFree = false
    estimatedCostPerQuery = 0.005
    reliabilityTier = "search_aggregator"
    reliabilityScore = 0.7
    domain = "newsapi.org"
    isAvailable() {
      return false
    }
    lookup = vi.fn()
  }
  return { NewsAPISource: MockNewsAPI }
})

// Mock remaining legacy sources as unavailable to keep tests simple.
// Use vi.hoisted() so the class is available when vi.mock() runs (hoisted above imports).
const { MockUnavailableSource } = vi.hoisted(() => {
  class MockUnavailableSource {
    name = "Mock"
    type = "mock"
    isFree = true
    estimatedCostPerQuery = 0
    reliabilityTier = "unreliable_ugc"
    reliabilityScore = 0.35
    domain = "mock.com"
    isAvailable() {
      return false
    }
    lookup = vi.fn()
  }
  return { MockUnavailableSource }
})

vi.mock("../../sources/deadline.js", () => ({ DeadlineSource: MockUnavailableSource }))
vi.mock("../../sources/variety.js", () => ({ VarietySource: MockUnavailableSource }))
vi.mock("../../sources/hollywood-reporter.js", () => ({
  HollywoodReporterSource: MockUnavailableSource,
}))
vi.mock("../../sources/tmz.js", () => ({ TMZSource: MockUnavailableSource }))
vi.mock("../../sources/google-news-rss.js", () => ({ GoogleNewsRSSSource: MockUnavailableSource }))
vi.mock("../../sources/ia-books.js", () => ({ IABooksDeathSource: MockUnavailableSource }))
vi.mock("../../sources/familysearch.js", () => ({ FamilySearchSource: MockUnavailableSource }))
vi.mock("../../ai-providers/claude-haiku.js", () => ({
  ClaudeHaikuDeathSource: MockUnavailableSource,
}))
vi.mock("../../ai-providers/groq.js", () => ({ GroqLlamaSource: MockUnavailableSource }))
vi.mock("../../ai-providers/openai.js", () => ({
  GPT4oMiniSource: MockUnavailableSource,
  GPT4oSource: MockUnavailableSource,
}))
vi.mock("../../ai-providers/deepseek.js", () => ({ DeepSeekSource: MockUnavailableSource }))
vi.mock("../../ai-providers/mistral.js", () => ({ MistralSource: MockUnavailableSource }))
vi.mock("../../ai-providers/grok.js", () => ({ GrokSource: MockUnavailableSource }))
vi.mock("../../ai-providers/perplexity.js", () => ({ PerplexitySource: MockUnavailableSource }))

import { debriefActor } from "../adapter.js"
import type { ResearchConfig, ResearchSubject } from "@debriefer/core"
import { DataSourceType, ReliabilityTier } from "../../types.js"

const testActor: ActorForEnrichment = {
  id: 123,
  tmdbId: 456,
  imdbPersonId: "nm0000001",
  name: "Test Actor",
  birthday: "1940-01-01",
  deathday: "2020-06-15",
  causeOfDeath: null,
  causeOfDeathDetails: null,
  popularity: 50,
}

describe("debriefActor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns mapped findings from the orchestrator", async () => {
    const result = await debriefActor(testActor, { free: true })

    expect(result.rawSources).toHaveLength(1)
    expect(result.rawSources[0]).toEqual({
      sourceName: "Wikipedia",
      sourceType: DataSourceType.WIKIPEDIA,
      text: "The actor died of natural causes.",
      url: "https://en.wikipedia.org/wiki/Test_Actor",
      confidence: 0.9,
      reliabilityTier: ReliabilityTier.SECONDARY_COMPILATION,
      reliabilityScore: 0.85,
      costUsd: 0,
    })
  })

  it("passes cost and duration metadata through", async () => {
    const result = await debriefActor(testActor, { free: true })

    expect(result.totalCostUsd).toBe(0.02)
    expect(result.sourcesAttempted).toBe(5)
    expect(result.sourcesSucceeded).toBe(1)
    expect(result.durationMs).toBe(1500)
    expect(result.stoppedAtPhase).toBe(3)
  })

  it("creates orchestrator with NoopSynthesizer and config", async () => {
    await debriefActor(testActor, { free: true })

    const [_phases, synthesizer, config] = MockOrchestrator._lastArgs as [
      unknown,
      unknown,
      ResearchConfig,
    ]
    expect(synthesizer).toBeDefined()
    expect(config?.earlyStopThreshold).toBe(3)
  })

  it("passes actor context to the research subject", async () => {
    await debriefActor(testActor, { free: true })

    // The orchestrator instance was created via MockOrchestrator
    // Access its debrief mock to check the subject
    const instance = new MockOrchestrator() // just to get the type
    const debriefCalls = instance.debrief.mock.calls
    const lastCall = debriefCalls[debriefCalls.length - 1]![0] as ResearchSubject

    expect(lastCall.id).toBe(123)
    expect(lastCall.name).toBe("Test Actor")
    expect(lastCall.context?.tmdbId).toBe(456)
    expect(lastCall.context?.deathday).toBe("2020-06-15")
  })

  it("respects confidence and reliability thresholds", async () => {
    await debriefActor(testActor, {
      free: true,
      confidenceThreshold: 0.7,
      reliabilityThreshold: 0.8,
    })

    const [, , config] = MockOrchestrator._lastArgs as [unknown, unknown, ResearchConfig]
    expect(config?.confidenceThreshold).toBe(0.7)
    expect(config?.reliabilityThreshold).toBe(0.8)
  })

  it("passes cost limits to orchestrator config", async () => {
    await debriefActor(testActor, {
      free: true,
      maxCostPerActor: 0.5,
      maxTotalCost: 10,
    })

    const [, , config] = MockOrchestrator._lastArgs as [unknown, unknown, ResearchConfig]
    expect(config?.costLimits?.maxCostPerSubject).toBe(0.5)
    expect(config?.costLimits?.maxTotalCost).toBe(10)
  })
})
