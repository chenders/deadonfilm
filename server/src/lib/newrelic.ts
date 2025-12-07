/**
 * New Relic APM conditional initialization.
 * Must be called before any other imports in the application entry point.
 */

type NewRelicAgent = typeof import("newrelic")

let newrelicAgent: NewRelicAgent | null = null

export function initNewRelic(): void {
  if (!process.env.NEW_RELIC_LICENSE_KEY) {
    console.log("NEW_RELIC_LICENSE_KEY not set - running without New Relic APM")
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    newrelicAgent = require("newrelic")
    console.log("New Relic APM initialized")
  } catch (error) {
    console.error("Failed to initialize New Relic:", error)
  }
}

export function getNewRelicAgent(): NewRelicAgent | null {
  return newrelicAgent
}

/**
 * Set custom transaction name for the current request.
 */
export function setTransactionName(name: string): void {
  if (newrelicAgent) {
    newrelicAgent.setTransactionName(name)
  }
}

/**
 * Add a custom attribute to the current transaction.
 */
export function addCustomAttribute(key: string, value: string | number | boolean): void {
  if (newrelicAgent) {
    newrelicAgent.addCustomAttribute(key, value)
  }
}

/**
 * Record a custom event in New Relic.
 */
export function recordCustomEvent(
  eventType: string,
  attributes: Record<string, string | number | boolean>
): void {
  if (newrelicAgent) {
    newrelicAgent.recordCustomEvent(eventType, attributes)
  }
}
