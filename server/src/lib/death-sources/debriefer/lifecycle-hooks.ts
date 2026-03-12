/**
 * Lifecycle hooks for debriefer orchestrator observability.
 *
 * Wires debriefer's LifecycleHooks callbacks to:
 * - Pino structured logging (source attempts, completions, phases, early stops)
 * - New Relic custom events (per-actor completion, batch start/complete)
 *
 * New Relic is optional — hooks degrade gracefully if the module is unavailable
 * (e.g., in test environments or when NEW_RELIC_LICENSE_KEY is not set).
 */

import type { LifecycleHooks, ResearchSubject, ScoredFinding } from "debriefer"
import { createRequire } from "module"
import { logger } from "../../logger.js"

const log = logger.child({ module: "debriefer-hooks" })

/** Minimal interface for New Relic agent (for dependency injection in tests) */
export interface NewRelicAgent {
  recordCustomEvent(eventType: string, attributes: Record<string, unknown>): void
  noticeError(error: Error): void
}

/** Cached New Relic agent (loaded once) */
let cachedAgent: NewRelicAgent | null | undefined

/** Reset the cached New Relic agent (for testing only) */
export function resetNewRelicCache(): void {
  cachedAgent = undefined
}

/**
 * Try to load New Relic. Returns null if unavailable or license key not set.
 * Uses createRequire for ESM compatibility and caches the result.
 */
function tryLoadNewRelic(): NewRelicAgent | null {
  if (cachedAgent !== undefined) return cachedAgent

  if (!process.env.NEW_RELIC_LICENSE_KEY) {
    cachedAgent = null
    return null
  }

  try {
    const require = createRequire(import.meta.url)
    cachedAgent = require("newrelic") as NewRelicAgent
    return cachedAgent
  } catch (error) {
    log.warn(
      { err: error },
      "Failed to load New Relic agent despite NEW_RELIC_LICENSE_KEY being set"
    )
    cachedAgent = null
    return null
  }
}

export interface LifecycleHooksOptions {
  /** Inject a New Relic agent (for testing). If omitted, tries to load via require. */
  newRelicAgent?: NewRelicAgent | null
}

/**
 * Creates LifecycleHooks wired to Pino logging and optional New Relic events.
 *
 * @param options - Optional configuration
 * @returns LifecycleHooks object for passing to orchestrator.debrief() or debriefBatch()
 */
export function createLifecycleHooks(
  options: LifecycleHooksOptions = {}
): LifecycleHooks<ResearchSubject, ScoredFinding[]> {
  const nr = options.newRelicAgent !== undefined ? options.newRelicAgent : tryLoadNewRelic()

  return {
    onRunStart(subjectCount, config) {
      log.info(
        {
          subjectCount,
          earlyStopThreshold: config.earlyStopThreshold,
          confidenceThreshold: config.confidenceThreshold,
          maxCostPerSubject: config.costLimits?.maxCostPerSubject,
          maxTotalCost: config.costLimits?.maxTotalCost,
        },
        "Enrichment batch started"
      )
      nr?.recordCustomEvent("EnrichmentBatchStart", {
        totalActors: subjectCount,
        maxCostPerActor: config.costLimits?.maxCostPerSubject ?? 0,
        maxTotalCost: config.costLimits?.maxTotalCost ?? 0,
      })
    },

    onSubjectStart(subject, index, total) {
      log.info({ actorId: subject.id, actorName: subject.name, index, total }, "Processing actor")
    },

    onSourceAttempt(subject, sourceName, phase) {
      log.debug(
        { actorId: subject.id, actorName: subject.name, source: sourceName, phase },
        `Trying ${sourceName}`
      )
    },

    onSourceComplete(subject, sourceName, finding, costUsd) {
      if (finding) {
        log.debug(
          {
            actorId: subject.id,
            actorName: subject.name,
            source: sourceName,
            confidence: finding.confidence,
            costUsd,
            hasUrl: !!finding.url,
            textLength: finding.text.length,
          },
          `${sourceName}: success`
        )
        nr?.recordCustomEvent("EnrichmentSourceSuccess", {
          actorId: subject.id,
          actorName: subject.name,
          source: sourceName,
          confidence: finding.confidence,
          costUsd,
        })
      } else {
        log.debug(
          { actorId: subject.id, actorName: subject.name, source: sourceName, costUsd },
          `${sourceName}: no result`
        )
      }
    },

    onPhaseComplete(subject, phase, findingsInPhase) {
      log.debug(
        {
          actorId: subject.id,
          actorName: subject.name,
          phase,
          findingsCount: findingsInPhase.length,
        },
        `Phase ${phase} complete`
      )
    },

    onEarlyStop(subject, phase, reason) {
      log.info({ actorId: subject.id, actorName: subject.name, phase, reason }, "Early stop")
    },

    onCostLimitReached(subject, costUsd, limit) {
      log.warn(
        { actorId: subject.id, actorName: subject.name, costUsd, limit },
        "Per-actor cost limit reached"
      )
    },

    onSubjectComplete(subject, result) {
      log.info(
        {
          actorId: subject.id,
          actorName: subject.name,
          sourcesAttempted: result.sourcesAttempted,
          sourcesSucceeded: result.sourcesSucceeded,
          findingsCount: result.findings.length,
          totalCostUsd: result.totalCostUsd,
          durationMs: result.durationMs,
          stoppedAtPhase: result.stoppedAtPhase,
        },
        "Actor complete"
      )
      nr?.recordCustomEvent("EnrichmentActorComplete", {
        actorId: subject.id,
        actorName: subject.name,
        sourcesAttempted: result.sourcesAttempted,
        sourcesSucceeded: result.sourcesSucceeded,
        findingsCount: result.findings.length,
        totalCostUsd: result.totalCostUsd,
        durationMs: result.durationMs,
      })
    },

    onBatchProgress(stats) {
      log.debug(
        {
          completed: stats.completed,
          total: stats.total,
          costUsd: stats.costUsd,
          elapsedMs: stats.elapsedMs,
        },
        `Batch progress: ${stats.completed}/${stats.total}`
      )
    },

    onRunComplete(stats) {
      log.info(
        {
          completed: stats.completed,
          total: stats.total,
          succeeded: stats.succeeded,
          failed: stats.failed,
          costUsd: stats.costUsd,
          elapsedMs: stats.elapsedMs,
          avgCostPerSubject: stats.avgCostPerSubject,
          avgDurationMs: stats.avgDurationMs,
        },
        "Enrichment batch complete"
      )
      nr?.recordCustomEvent("EnrichmentBatchComplete", {
        actorsProcessed: stats.completed,
        actorsSucceeded: stats.succeeded,
        actorsFailed: stats.failed,
        totalCostUsd: stats.costUsd,
        totalTimeMs: stats.elapsedMs,
        avgCostPerActor: stats.avgCostPerSubject,
      })
    },

    onRunFailed(error) {
      log.error({ err: error }, "Enrichment batch failed")
      nr?.noticeError(error)
    },
  }
}
