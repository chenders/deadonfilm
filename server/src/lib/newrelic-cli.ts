/**
 * New Relic APM instrumentation for CLI scripts.
 *
 * This module provides background transaction support for CLI scripts,
 * enabling full transaction traces, database query tracking, and custom metrics.
 *
 * Usage:
 *   import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
 *
 *   async function main() {
 *     await withNewRelicTransaction("sync-tmdb", async (recordMetrics) => {
 *       // ... script logic ...
 *       recordMetrics({ recordsProcessed: 100, recordsUpdated: 5 })
 *     })
 *   }
 */

import { createRequire } from "module"

type NewRelicAgent = typeof import("newrelic")

export interface ScriptMetrics {
  recordsProcessed?: number
  recordsCreated?: number
  recordsUpdated?: number
  recordsDeleted?: number
  errorsEncountered?: number
  [key: string]: string | number | boolean | undefined
}

let newrelicAgent: NewRelicAgent | null = null
let isInitialized = false

/**
 * Initialize New Relic for CLI scripts.
 * Must be called before any database or HTTP operations.
 */
function initNewRelicCli(): NewRelicAgent | null {
  if (isInitialized) {
    return newrelicAgent
  }

  isInitialized = true

  if (!process.env.NEW_RELIC_LICENSE_KEY) {
    return null
  }

  try {
    const require = createRequire(import.meta.url)
    newrelicAgent = require("newrelic")
    return newrelicAgent
  } catch (error) {
    console.error("Failed to initialize New Relic for CLI:", error)
    return null
  }
}

/**
 * Add a custom attribute to the current transaction.
 */
export function addCliAttribute(key: string, value: string | number | boolean): void {
  if (newrelicAgent) {
    newrelicAgent.addCustomAttribute(key, value)
  }
}

/**
 * Record a custom event from a CLI script.
 */
export function recordCliEvent(
  eventType: string,
  attributes: Record<string, string | number | boolean>
): void {
  if (newrelicAgent) {
    newrelicAgent.recordCustomEvent(eventType, attributes)
  }
}

/**
 * Wraps a CLI script's main function in a New Relic background transaction.
 *
 * This provides:
 * - Full transaction traces visible in New Relic APM
 * - Database query tracking with explain plans
 * - Custom attribute recording
 * - Error tracking with stack traces
 *
 * @param scriptName - Name of the script (appears as transaction name)
 * @param fn - The async function to execute within the transaction
 */
export async function withNewRelicTransaction<T>(
  scriptName: string,
  fn: (recordMetrics: (metrics: ScriptMetrics) => void) => Promise<T>
): Promise<T> {
  const agent = initNewRelicCli()
  const startTime = Date.now()

  // Record metrics helper - adds attributes to current transaction
  const recordMetrics = (metrics: ScriptMetrics): void => {
    if (agent) {
      for (const [key, value] of Object.entries(metrics)) {
        if (value !== undefined) {
          agent.addCustomAttribute(key, value)
        }
      }
    }
  }

  // If no agent, just run the function directly
  if (!agent) {
    return fn(recordMetrics)
  }

  // Run within a background transaction
  return new Promise<T>((resolve, reject) => {
    agent.startBackgroundTransaction(`script/${scriptName}`, "CLI", async () => {
      const transaction = agent.getTransaction()

      // Add script metadata
      agent.addCustomAttribute("script.name", scriptName)
      agent.addCustomAttribute("script.startTime", new Date().toISOString())

      try {
        const result = await fn(recordMetrics)

        // Record success metrics
        const duration = Date.now() - startTime
        agent.addCustomAttribute("script.durationMs", duration)
        agent.addCustomAttribute("script.success", true)

        // Record a custom event for analytics
        agent.recordCustomEvent("CliScriptRun", {
          scriptName,
          durationMs: duration,
          success: true,
        })

        transaction?.end()
        resolve(result)
      } catch (error) {
        // Record failure metrics
        const duration = Date.now() - startTime
        agent.addCustomAttribute("script.durationMs", duration)
        agent.addCustomAttribute("script.success", false)

        if (error instanceof Error) {
          agent.addCustomAttribute("script.errorMessage", error.message)
          agent.noticeError(error)
        }

        agent.recordCustomEvent("CliScriptRun", {
          scriptName,
          durationMs: duration,
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        })

        transaction?.end()
        reject(error)
      }
    })
  })
}

/**
 * Convenience function for scripts that want manual transaction control.
 * Use withNewRelicTransaction for most cases.
 */
export function getCliAgent(): NewRelicAgent | null {
  return initNewRelicCli()
}
