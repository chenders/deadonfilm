import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ResearchSubject, DebriefResult, ScoredFinding } from "debriefer"
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

  it("returns per-subject and per-source hook callbacks (no batch-level hooks)", () => {
    expect(hooks.onSubjectStart).toBeTypeOf("function")
    expect(hooks.onSourceAttempt).toBeTypeOf("function")
    expect(hooks.onSourceComplete).toBeTypeOf("function")
    expect(hooks.onPhaseComplete).toBeTypeOf("function")
    expect(hooks.onEarlyStop).toBeTypeOf("function")
    expect(hooks.onCostLimitReached).toBeTypeOf("function")
    expect(hooks.onSubjectComplete).toBeTypeOf("function")
    // Batch-level hooks are omitted — adapter calls debrief() per actor, not debriefBatch()
    expect(hooks.onRunStart).toBeUndefined()
    expect(hooks.onRunComplete).toBeUndefined()
    expect(hooks.onRunFailed).toBeUndefined()
    expect(hooks.onBatchProgress).toBeUndefined()
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

  describe("without New Relic", () => {
    it("all hooks work without throwing when New Relic is null", () => {
      const hooksNoNR = createLifecycleHooks({ newRelicAgent: null })
      const subject = makeSubject()

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
    })
  })

  describe("default path (no options, no license key)", () => {
    it("works as no-op when NEW_RELIC_LICENSE_KEY is not set", () => {
      const originalKey = process.env.NEW_RELIC_LICENSE_KEY
      const hadKey = "NEW_RELIC_LICENSE_KEY" in process.env
      delete process.env.NEW_RELIC_LICENSE_KEY
      resetNewRelicCache()

      try {
        const defaultHooks = createLifecycleHooks()
        const subject = makeSubject()

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
        if (hadKey) {
          process.env.NEW_RELIC_LICENSE_KEY = originalKey
        } else {
          delete process.env.NEW_RELIC_LICENSE_KEY
        }
        resetNewRelicCache()
      }
    })
  })
})
