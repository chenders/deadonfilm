import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ResearchSubject, ResearchConfig, DebriefResult, ScoredFinding } from "debriefer"
import { createLifecycleHooks, resetNewRelicCache } from "../lifecycle-hooks.js"
import type { NewRelicAgent } from "../lifecycle-hooks.js"

function makeSubject(overrides: Partial<ResearchSubject> = {}): ResearchSubject {
  return {
    id: 1,
    name: "John Wayne",
    context: { birthday: "1907-05-26", deathday: "1979-06-11" },
    ...overrides,
  }
}

function makeConfig(overrides: Partial<ResearchConfig> = {}): ResearchConfig {
  return {
    earlyStopThreshold: 3,
    confidenceThreshold: 0.5,
    costLimits: { maxCostPerSubject: 0.5, maxTotalCost: 10 },
    ...overrides,
  }
}

function makeDebriefResult(
  overrides: Partial<DebriefResult<ScoredFinding[]>> = {}
): DebriefResult<ScoredFinding[]> {
  return {
    subject: makeSubject(),
    data: [],
    findings: [],
    synthesisResult: undefined,
    totalCostUsd: 0.05,
    sourcesAttempted: 10,
    sourcesSucceeded: 3,
    durationMs: 2500,
    stoppedAtPhase: undefined,
    ...overrides,
  }
}

function makeMockNewRelic(): NewRelicAgent {
  return {
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  }
}

describe("createLifecycleHooks", () => {
  let hooks: ReturnType<typeof createLifecycleHooks>
  let mockNR: NewRelicAgent

  beforeEach(() => {
    vi.clearAllMocks()
    mockNR = makeMockNewRelic()
    hooks = createLifecycleHooks({ newRelicAgent: mockNR })
  })

  it("returns an object with all expected hook callbacks", () => {
    expect(hooks.onRunStart).toBeTypeOf("function")
    expect(hooks.onSubjectStart).toBeTypeOf("function")
    expect(hooks.onSourceAttempt).toBeTypeOf("function")
    expect(hooks.onSourceComplete).toBeTypeOf("function")
    expect(hooks.onPhaseComplete).toBeTypeOf("function")
    expect(hooks.onEarlyStop).toBeTypeOf("function")
    expect(hooks.onCostLimitReached).toBeTypeOf("function")
    expect(hooks.onSubjectComplete).toBeTypeOf("function")
    expect(hooks.onBatchProgress).toBeTypeOf("function")
    expect(hooks.onRunComplete).toBeTypeOf("function")
    expect(hooks.onRunFailed).toBeTypeOf("function")
  })

  describe("onRunStart", () => {
    it("fires New Relic EnrichmentBatchStart event", () => {
      hooks.onRunStart!(5, makeConfig())

      expect(mockNR.recordCustomEvent).toHaveBeenCalledWith(
        "EnrichmentBatchStart",
        expect.objectContaining({ totalActors: 5 })
      )
    })
  })

  describe("onSourceComplete", () => {
    it("fires New Relic event on source success", () => {
      const subject = makeSubject()
      const finding = { text: "He died of cancer.", confidence: 0.85, costUsd: 0 }

      hooks.onSourceComplete!(subject, "Wikipedia", finding, 0)

      expect(mockNR.recordCustomEvent).toHaveBeenCalledWith(
        "EnrichmentSourceSuccess",
        expect.objectContaining({
          actorId: 1,
          actorName: "John Wayne",
          source: "Wikipedia",
          confidence: 0.85,
        })
      )
    })

    it("does not fire New Relic event on source miss", () => {
      hooks.onSourceComplete!(makeSubject(), "Wikipedia", null, 0)

      expect(mockNR.recordCustomEvent).not.toHaveBeenCalled()
    })
  })

  describe("onSubjectComplete", () => {
    it("fires New Relic EnrichmentActorComplete event", () => {
      const subject = makeSubject()
      const result = makeDebriefResult()

      hooks.onSubjectComplete!(subject, result)

      expect(mockNR.recordCustomEvent).toHaveBeenCalledWith(
        "EnrichmentActorComplete",
        expect.objectContaining({
          actorId: 1,
          actorName: "John Wayne",
          sourcesAttempted: 10,
          sourcesSucceeded: 3,
          totalCostUsd: 0.05,
        })
      )
    })
  })

  describe("onRunComplete", () => {
    it("fires New Relic EnrichmentBatchComplete event", () => {
      hooks.onRunComplete!({
        completed: 10,
        total: 10,
        succeeded: 8,
        failed: 2,
        costUsd: 1.5,
        elapsedMs: 30000,
        avgCostPerSubject: 0.15,
        avgDurationMs: 3000,
      })

      expect(mockNR.recordCustomEvent).toHaveBeenCalledWith(
        "EnrichmentBatchComplete",
        expect.objectContaining({
          actorsProcessed: 10,
          actorsSucceeded: 8,
          totalCostUsd: 1.5,
        })
      )
    })
  })

  describe("onRunFailed", () => {
    it("reports error to New Relic", () => {
      const error = new Error("Database connection lost")
      hooks.onRunFailed!(error)

      expect(mockNR.noticeError).toHaveBeenCalledWith(error)
    })
  })

  describe("without New Relic", () => {
    it("all hooks work without throwing when New Relic is null", () => {
      const hooksNoNR = createLifecycleHooks({ newRelicAgent: null })
      const subject = makeSubject()
      const config = makeConfig()

      expect(() => hooksNoNR.onRunStart!(5, config)).not.toThrow()
      expect(() => hooksNoNR.onSubjectStart!(subject, 0, 5)).not.toThrow()
      expect(() => hooksNoNR.onSourceAttempt!(subject, "Wikipedia", 1)).not.toThrow()
      expect(() => hooksNoNR.onSourceComplete!(subject, "Wikipedia", null, 0)).not.toThrow()
      expect(() =>
        hooksNoNR.onSourceComplete!(
          subject,
          "Wikipedia",
          { text: "test", confidence: 0.5, costUsd: 0 },
          0
        )
      ).not.toThrow()
      expect(() => hooksNoNR.onPhaseComplete!(subject, 1, [])).not.toThrow()
      expect(() => hooksNoNR.onEarlyStop!(subject, 3, "3+ source families")).not.toThrow()
      expect(() => hooksNoNR.onCostLimitReached!(subject, 0.5, 0.5)).not.toThrow()
      expect(() => hooksNoNR.onSubjectComplete!(subject, makeDebriefResult())).not.toThrow()
      expect(() =>
        hooksNoNR.onBatchProgress!({ completed: 1, total: 5, costUsd: 0.1, elapsedMs: 1000 })
      ).not.toThrow()
      expect(() =>
        hooksNoNR.onRunComplete!({
          completed: 5,
          total: 5,
          succeeded: 5,
          failed: 0,
          costUsd: 0.5,
          elapsedMs: 5000,
          avgCostPerSubject: 0.1,
          avgDurationMs: 1000,
        })
      ).not.toThrow()
      expect(() => hooksNoNR.onRunFailed!(new Error("test"))).not.toThrow()
    })
  })

  describe("default path (no options, no license key)", () => {
    it("works as no-op when NEW_RELIC_LICENSE_KEY is not set", () => {
      const originalKey = process.env.NEW_RELIC_LICENSE_KEY
      delete process.env.NEW_RELIC_LICENSE_KEY
      resetNewRelicCache()

      try {
        const defaultHooks = createLifecycleHooks()
        const subject = makeSubject()

        expect(() => defaultHooks.onRunStart!(5, makeConfig())).not.toThrow()
        expect(() => defaultHooks.onSubjectStart!(subject, 0, 5)).not.toThrow()
        expect(() =>
          defaultHooks.onSourceComplete!(
            subject,
            "Wikipedia",
            { text: "test", confidence: 0.5, costUsd: 0 },
            0
          )
        ).not.toThrow()
        expect(() => defaultHooks.onSubjectComplete!(subject, makeDebriefResult())).not.toThrow()
      } finally {
        if (originalKey) process.env.NEW_RELIC_LICENSE_KEY = originalKey
        resetNewRelicCache()
      }
    })
  })
})
