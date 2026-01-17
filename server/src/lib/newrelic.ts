/**
 * New Relic APM conditional initialization.
 * Must be called before any other imports in the application entry point.
 */

import { createRequire } from "module"

type NewRelicAgent = typeof import("newrelic")

let newrelicAgent: NewRelicAgent | null = null

export function initNewRelic(): void {
  if (!process.env.NEW_RELIC_LICENSE_KEY) {
    // Silent when not configured
    return
  }

  try {
    // New Relic is a CommonJS module, so we need createRequire in ESM
    const require = createRequire(import.meta.url)
    newrelicAgent = require("newrelic")
    // Silent on success - New Relic logs its own startup message
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

/**
 * Get the browser timing header script for injection into HTML.
 * This returns a complete <script> tag that should be placed in the <head>.
 * Returns empty string if New Relic is not initialized.
 */
export function getBrowserTimingHeader(): string {
  if (newrelicAgent) {
    return newrelicAgent.getBrowserTimingHeader()
  }
  return ""
}
