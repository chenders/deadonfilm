/**
 * Lifecycle hooks for debriefer orchestrator observability.
 *
 * Wires debriefer's per-subject LifecycleHooks callbacks to:
 * - Pino structured logging (source attempts, completions, phases, early stops)
 * - New Relic custom events (EnrichmentSourceSuccess, EnrichmentActorComplete)
 *
 * Only per-subject and per-source hooks are wired here. Batch-level hooks
 * (onRunStart, onRunComplete, onRunFailed) are omitted because the adapter
 * calls orchestrator.debrief() per actor, not debriefBatch(). Batch-level
 * events should be emitted from the EnrichmentRunner.
 *
 * New Relic is optional — hooks degrade gracefully if the module is unavailable
 * (e.g., in test environments or when NEW_RELIC_LICENSE_KEY is not set).
 */

import type { LifecycleHooks, ResearchSubject, ScoredFinding } from "debriefer"
import { createRequire } from "module"
import { logger } from "../../logger.js"
import { cacheSourceFinding, cacheSourceFailure } from "./source-cache-bridge.js"

const log = logger.child({ module: "debriefer-hooks" })

/** Log entry format matching the admin UI's ActorLogEntry interface */
export interface LogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  data?: Record<string, unknown>
}

/**
 * Collects per-actor log entries for storage in enrichment_run_actors.log_entries.
 * Create one per actor call so entries don't mix across concurrent actors.
 */
export class LogEntryCollector {
  readonly entries: LogEntry[] = []

  add(level: LogEntry["level"], message: string, data?: Record<string, unknown>): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    })
  }
}

/** Minimal interface for New Relic agent (for dependency injection in tests) */
export interface NewRelicAgent {
  recordCustomEvent(eventType: string, attributes: Record<string, unknown>): void
  noticeError(error: Error, customAttributes?: Record<string, unknown>): void
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
  /** Collector for per-actor log entries. If provided, hooks write entries for DB storage. */
  logCollector?: LogEntryCollector
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
  const collector = options.logCollector

  // Note: onRunStart/onRunComplete/onRunFailed are omitted because the adapter
  // calls orchestrator.debrief() per actor (not debriefBatch), so run-level hooks
  // would fire once per actor instead of once per batch. Batch-level events should
  // be emitted from the EnrichmentRunner instead.

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
        nr?.recordCustomEvent("EnrichmentSourceSuccess", {
          actorId: subject.id,
          actorName: subject.name,
          source: sourceName,
          sourceType: sourceName,
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
          cacheSourceFailure(actorId, sourceName, "no result")
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
      nr?.recordCustomEvent("EnrichmentActorComplete", {
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
