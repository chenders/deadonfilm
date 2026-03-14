/**
 * Lifecycle hooks for debriefer orchestrator observability (biography enrichment).
 *
 * Wires debriefer's per-subject LifecycleHooks callbacks to:
 * - Pino structured logging (source attempts, completions, phases, early stops)
 * - New Relic custom events (BioEnrichmentSourceSuccess, BioEnrichmentActorComplete)
 *
 * Only per-subject and per-source hooks are wired here. Batch-level hooks
 * (onRunStart, onRunComplete, onRunFailed) are omitted because the adapter
 * calls orchestrator.debrief() per actor, not debriefBatch(). Batch-level
 * events should be emitted from the biography enrichment runner.
 *
 * New Relic is optional — hooks degrade gracefully if the module is unavailable
 * (e.g., in test environments or when NEW_RELIC_LICENSE_KEY is not set).
 */

import type { LifecycleHooks, ResearchSubject, ScoredFinding } from "debriefer"
import { createRequire } from "module"
import { logger } from "../../logger.js"
import { cacheSourceFinding, cacheSourceFailure, resolveSourceType } from "./source-cache-bridge.js"
import type { LogEntry, NewRelicAgent } from "../../death-sources/debriefer/lifecycle-hooks.js"
import { LogEntryCollector } from "../../death-sources/debriefer/lifecycle-hooks.js"

export { LogEntryCollector }
export type { LogEntry, NewRelicAgent }

const log = logger.child({ module: "bio-debriefer-hooks" })

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

export interface BioLifecycleHooksOptions {
  /** Inject a New Relic agent (for testing). If omitted, tries to load via require. */
  newRelicAgent?: NewRelicAgent | null
  /** Collector for per-actor log entries. If provided, hooks write entries for DB storage. */
  logCollector?: LogEntryCollector
}

/**
 * Creates LifecycleHooks wired to Pino logging and optional New Relic events
 * for biography enrichment.
 *
 * @param options - Optional configuration
 * @returns LifecycleHooks object for passing to orchestrator.debrief() or debriefBatch()
 */
export function createBioLifecycleHooks(
  options: BioLifecycleHooksOptions = {}
): LifecycleHooks<ResearchSubject, ScoredFinding[]> {
  const nr = options.newRelicAgent !== undefined ? options.newRelicAgent : tryLoadNewRelic()
  const collector = options.logCollector

  // Note: onRunStart/onRunComplete/onRunFailed are omitted because the adapter
  // calls orchestrator.debrief() per actor (not debriefBatch), so run-level hooks
  // would fire once per actor instead of once per batch. Batch-level events should
  // be emitted from the biography enrichment runner instead.

  return {
    onSubjectStart(subject, index, total) {
      log.info({ actorId: subject.id, actorName: subject.name, index, total }, "Processing actor")
    },

    onSourceAttempt(subject, sourceName, phase) {
      log.debug(
        { actorId: subject.id, actorName: subject.name, source: sourceName, phase },
        `Trying ${sourceName}`
      )
      collector?.add("debug", `Trying ${sourceName}`, { source: sourceName, phase })
    },

    onSourceComplete(subject, sourceName, finding, costUsd) {
      const actorId = typeof subject.id === "number" ? subject.id : parseInt(String(subject.id), 10)
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
        collector?.add("info", `${sourceName}: success`, {
          source: sourceName,
          confidence: finding.confidence,
          costUsd,
          textLength: finding.text.length,
          hasUrl: !!finding.url,
        })
        // Write to source_query_cache for admin visibility and deduplication
        if (!isNaN(actorId)) {
          cacheSourceFinding(actorId, sourceName, finding, costUsd)
        }
        nr?.recordCustomEvent("BioEnrichmentSourceSuccess", {
          actorId: subject.id,
          actorName: subject.name,
          source: sourceName,
          sourceType: resolveSourceType(sourceName) ?? sourceName,
          confidence: finding.confidence,
          costUsd,
        })
      } else {
        log.debug(
          { actorId: subject.id, actorName: subject.name, source: sourceName, costUsd },
          `${sourceName}: no result`
        )
        collector?.add("debug", `${sourceName}: no result`, { source: sourceName, costUsd })
        // Cache failures so admin can see which sources returned nothing
        if (!isNaN(actorId)) {
          cacheSourceFailure(actorId, sourceName, "no result", costUsd)
        }
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
      collector?.add("debug", `Phase ${phase} complete`, {
        phase,
        findingsCount: findingsInPhase.length,
      })
    },

    onEarlyStop(subject, phase, reason) {
      log.info({ actorId: subject.id, actorName: subject.name, phase, reason }, "Early stop")
      collector?.add("info", "Early stop", { phase, reason })
    },

    onCostLimitReached(subject, costUsd, limit) {
      log.warn(
        { actorId: subject.id, actorName: subject.name, costUsd, limit },
        "Per-actor cost limit reached"
      )
      collector?.add("warn", "Per-actor cost limit reached", { costUsd, limit })
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
      collector?.add("info", "Actor complete", {
        sourcesAttempted: result.sourcesAttempted,
        sourcesSucceeded: result.sourcesSucceeded,
        findingsCount: result.findings.length,
        totalCostUsd: result.totalCostUsd,
        durationMs: result.durationMs,
        stoppedAtPhase: result.stoppedAtPhase,
      })
      nr?.recordCustomEvent("BioEnrichmentActorComplete", {
        actorId: subject.id,
        actorName: subject.name,
        sourcesAttempted: result.sourcesAttempted,
        sourcesSucceeded: result.sourcesSucceeded,
        findingsCount: result.findings.length,
        totalCostUsd: result.totalCostUsd,
        totalTimeMs: result.durationMs,
      })
    },
  }
}
