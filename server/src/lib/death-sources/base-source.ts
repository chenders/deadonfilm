/**
 * Base class for all data source implementations.
 *
 * Provides common functionality like rate limiting, caching, and error handling.
 */

import type {
  ActorForEnrichment,
  DataSource,
  DataSourceType,
  EnrichmentSourceEntry,
  SourceLookupResult,
} from "./types.js"
import { SourceAccessBlockedError } from "./types.js"

/**
 * Abstract base class for data sources.
 * Extend this class to implement new data sources.
 */
export abstract class BaseDataSource implements DataSource {
  abstract readonly name: string
  abstract readonly type: DataSourceType
  abstract readonly isFree: boolean
  abstract readonly estimatedCostPerQuery: number

  // Rate limiting
  protected lastRequestTime = 0
  protected minDelayMs = 1000 // Default 1 second between requests

  /**
   * User agent for HTTP requests
   */
  protected readonly userAgent = "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)"

  /**
   * Check if this source is available (API key configured, etc.)
   * Override in subclasses that require configuration.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Main lookup method - orchestrates rate limiting and error handling.
   */
  async lookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      // Apply rate limiting
      await this.waitForRateLimit()

      // Perform the actual lookup
      const result = await this.performLookup(actor)

      return result
    } catch (error) {
      // Re-throw SourceAccessBlockedError for special handling by orchestrator
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: errorMessage,
      }
    }
  }

  /**
   * Implement this method in subclasses to perform the actual lookup.
   */
  protected abstract performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult>

  /**
   * Wait if necessary to respect rate limits.
   */
  protected async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const waitTime = Math.max(0, this.minDelayMs - timeSinceLastRequest)

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime = Date.now()
  }

  /**
   * Create a source entry for tracking.
   */
  protected createSourceEntry(
    startTime: number,
    confidence: number,
    url?: string,
    queryUsed?: string,
    rawData?: unknown
  ): EnrichmentSourceEntry {
    return {
      type: this.type,
      url: url ?? null,
      retrievedAt: new Date(),
      confidence,
      costUsd: this.isFree ? 0 : this.estimatedCostPerQuery,
      queryUsed,
      rawData,
    }
  }

  /**
   * Build a search query for an actor's death.
   */
  protected buildDeathQuery(actor: ActorForEnrichment): string {
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
    const yearStr = deathYear ? ` ${deathYear}` : ""
    return `"${actor.name}" death cause circumstances${yearStr}`
  }

  /**
   * Calculate confidence based on keyword matches.
   */
  protected calculateConfidence(
    text: string,
    requiredKeywords: string[],
    bonusKeywords: string[]
  ): number {
    const lowerText = text.toLowerCase()

    // Check for required keywords
    const requiredFound = requiredKeywords.filter((kw) => lowerText.includes(kw.toLowerCase()))
    if (requiredFound.length === 0) {
      return 0
    }

    // Base confidence from required keywords
    let confidence = Math.min(0.5, requiredFound.length * 0.25)

    // Bonus confidence from circumstance keywords
    const bonusFound = bonusKeywords.filter((kw) => lowerText.includes(kw.toLowerCase()))
    confidence += Math.min(0.5, bonusFound.length * 0.1)

    return Math.min(1.0, confidence)
  }
}

/**
 * Common keywords for death-related content.
 */
export const DEATH_KEYWORDS = [
  "died",
  "death",
  "passed away",
  "cause of death",
  "obituary",
  "deceased",
  "fatal",
  "killed",
]

/**
 * Keywords indicating specific circumstances.
 */
export const CIRCUMSTANCE_KEYWORDS = [
  "accident",
  "illness",
  "cancer",
  "heart",
  "cardiac",
  "stroke",
  "suicide",
  "overdose",
  "murder",
  "homicide",
  "drowning",
  "crash",
  "fire",
  "pneumonia",
  "covid",
  "coronavirus",
  "complications",
  "surgery",
  "hospital",
  "disease",
]

/**
 * Keywords suggesting notable or unusual circumstances.
 */
export const NOTABLE_FACTOR_KEYWORDS = [
  "mysterious",
  "disputed",
  "controversial",
  "on set",
  "during filming",
  "accident",
  "young",
  "unexpected",
  "sudden",
  "tragedy",
  "investigation",
  "ruled",
  "autopsy",
  "coroner",
  "inquest",
]
