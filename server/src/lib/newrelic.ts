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

/**
 * Start a background transaction for non-web operations.
 * Useful for CLI scripts and background jobs.
 */
export function startBackgroundTransaction<T>(
  name: string,
  group: string,
  handler: () => Promise<T>
): Promise<T> {
  if (newrelicAgent) {
    return newrelicAgent.startBackgroundTransaction(name, group, handler)
  }
  return handler()
}

/**
 * Start a segment within a transaction for measuring specific operations.
 */
export function startSegment<T>(
  name: string,
  record: boolean,
  handler: () => Promise<T>
): Promise<T> {
  if (newrelicAgent) {
    return newrelicAgent.startSegment(name, record, handler)
  }
  return handler()
}

/**
 * Sanitize custom attributes to only include New Relic-compatible primitive values.
 * Filters out objects, arrays, functions, null, and undefined.
 */
export function sanitizeCustomAttributes(
  customAttributes?: Record<string, unknown>
): Record<string, string | number | boolean> {
  if (!customAttributes) {
    return {}
  }

  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(customAttributes)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value
    }
  }
  return result
}

/**
 * Notice an error in New Relic.
 */
export function noticeError(error: Error, customAttributes?: Record<string, unknown>): void {
  if (newrelicAgent) {
    newrelicAgent.noticeError(error, sanitizeCustomAttributes(customAttributes))
  }
}

/**
 * Add multiple custom attributes to the current transaction.
 */
export function addCustomAttributes(attributes: Record<string, string | number | boolean>): void {
  if (newrelicAgent) {
    for (const [key, value] of Object.entries(attributes)) {
      newrelicAgent.addCustomAttribute(key, value)
    }
  }
}
