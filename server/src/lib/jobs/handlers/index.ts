/**
 * Job Handler Registry
 *
 * Central registry of all job handlers.
 * Maps job types to their handler implementations.
 */

import type { BaseJobHandler } from "./base.js"
import type { JobType } from "../types.js"

/**
 * Registry of job type to handler instance
 */
const handlerRegistry = new Map<JobType, BaseJobHandler>()

/**
 * Register a job handler
 */
export function registerHandler(handler: BaseJobHandler): void {
  if (handlerRegistry.has(handler.jobType)) {
    throw new Error(`Handler already registered for job type: ${handler.jobType}`)
  }

  handlerRegistry.set(handler.jobType, handler)
}

/**
 * Get handler for a job type
 */
export function getHandler(jobType: JobType): BaseJobHandler | undefined {
  return handlerRegistry.get(jobType)
}

/**
 * Get all registered handlers
 */
export function getAllHandlers(): BaseJobHandler[] {
  return Array.from(handlerRegistry.values())
}

/**
 * Clear all handlers (for testing)
 */
export function clearHandlers(): void {
  handlerRegistry.clear()
}

// Import and register all handlers here
// Example:
// import { FetchOMDbRatingsHandler } from './fetch-omdb-ratings.js'
// registerHandler(new FetchOMDbRatingsHandler())
//
// This will be populated in PR #3 when we implement specific handlers
