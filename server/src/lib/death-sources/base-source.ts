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
  LinkFollowConfig,
  SourceLookupResult,
} from "./types.js"
import { SourceAccessBlockedError, SourceTimeoutError } from "./types.js"
import { getCachedQuery, setCachedQuery } from "./cache.js"
import { getEnrichmentLogger } from "./logger.js"

/**
 * Global configuration for cache behavior.
 */
let globalIgnoreCache = false

/**
 * Set whether to ignore the cache globally.
 * When true, all sources will make fresh requests.
 */
export function setIgnoreCache(ignore: boolean): void {
  globalIgnoreCache = ignore
}

/**
 * Get the current cache ignore setting.
 */
export function getIgnoreCache(): boolean {
  return globalIgnoreCache
}

// Default timeout for fetch requests (30 seconds)
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000

// Shorter timeout for low-priority sources (10 seconds)
export const LOW_PRIORITY_TIMEOUT_MS = 10000

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

  // Request timeout (override in subclasses for different priorities)
  protected requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS

  // Link following configuration (set by orchestrator)
  protected linkFollowConfig?: LinkFollowConfig

  // AI prompt configuration - whether to require source URLs
  protected requireSources = true
  protected requireReliableSources = false

  /**
   * User agent for HTTP requests
   */
  protected readonly userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  /**
   * Create an AbortSignal with the configured timeout.
   */
  protected createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.requestTimeoutMs)
  }

  /**
   * Check if this source uses the high-priority (default) timeout.
   * High-priority sources have their timeouts stored for later review.
   */
  protected isHighPrioritySource(): boolean {
    return this.requestTimeoutMs === DEFAULT_REQUEST_TIMEOUT_MS
  }

  /**
   * Check if an error is an AbortError from a timeout.
   */
  protected isTimeoutError(error: unknown): boolean {
    return error instanceof Error && error.name === "TimeoutError"
  }

  /**
   * Check if this source is available (API key configured, etc.)
   * Override in subclasses that require configuration.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Set the link follow configuration for this source.
   * Called by the orchestrator to pass configuration to search sources.
   */
  setLinkFollowConfig(config: LinkFollowConfig): void {
    this.linkFollowConfig = config
  }

  /**
   * Set whether to require source URLs in AI prompts.
   * Used for A/B testing source requirement impact.
   */
  setRequireSources(require: boolean): void {
    this.requireSources = require
  }

  /**
   * Set whether to require "reliable" sources specifically.
   * Used for A/B testing the impact of the "reliable" qualifier.
   */
  setRequireReliableSources(require: boolean): void {
    this.requireReliableSources = require
  }

  /**
   * Get the current link follow configuration.
   */
  getLinkFollowConfig(): LinkFollowConfig | undefined {
    return this.linkFollowConfig
  }

  /**
   * Generate the cache key for an actor lookup.
   * Override in subclasses that use different query formats.
   */
  protected getCacheKey(actor: ActorForEnrichment): string {
    return this.buildDeathQuery(actor)
  }

  /**
   * Main lookup method - orchestrates caching, rate limiting, and error handling.
   */
  async lookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const cacheKey = this.getCacheKey(actor)
    const logger = getEnrichmentLogger()

    try {
      // Check cache first (unless ignoreCache is set)
      if (!globalIgnoreCache) {
        const cached = await getCachedQuery(this.type, cacheKey)
        if (cached) {
          logger.debug(`[CACHE_HIT] ${this.name}`, {
            actor: actor.name,
            source: this.type,
            cached_at: cached.queriedAt.toISOString(),
          })

          // Reconstruct result from cache
          if (cached.errorMessage) {
            return {
              success: false,
              source: this.createSourceEntry(startTime, 0, undefined, cacheKey, cached.responseRaw),
              data: null,
              error: cached.errorMessage,
            }
          }

          // Return cached successful result
          const cachedResult = cached.responseRaw as SourceLookupResult | null
          if (cachedResult) {
            // Update the source entry timestamp to now but keep cached data
            return {
              ...cachedResult,
              source: {
                ...cachedResult.source,
                retrievedAt: new Date(),
              },
            }
          }
        }
      }

      // Apply rate limiting
      await this.waitForRateLimit()

      // Perform the actual lookup
      const result = await this.performLookup(actor)
      const responseTimeMs = Date.now() - startTime

      // Store result in cache
      await setCachedQuery({
        sourceType: this.type,
        actorId: actor.id,
        queryString: cacheKey,
        responseStatus: result.success ? 200 : 500,
        responseData: result,
        errorMessage: result.error ?? null,
        responseTimeMs,
        costUsd: result.source.costUsd ?? null,
      })

      return result
    } catch (error) {
      const responseTimeMs = Date.now() - startTime

      // Re-throw SourceAccessBlockedError for special handling by orchestrator
      if (error instanceof SourceAccessBlockedError) {
        // Cache blocked errors too (403, etc.)
        await setCachedQuery({
          sourceType: this.type,
          actorId: actor.id,
          queryString: cacheKey,
          responseStatus: error.statusCode,
          errorMessage: error.message,
          responseTimeMs,
        })
        throw error
      }

      // Handle timeout errors specially
      if (this.isTimeoutError(error)) {
        const isHighPriority = this.isHighPrioritySource()
        const timeoutError = new SourceTimeoutError(
          `${this.name} request timed out after ${this.requestTimeoutMs}ms`,
          this.type,
          this.requestTimeoutMs,
          isHighPriority
        )

        // Cache timeout errors
        await setCachedQuery({
          sourceType: this.type,
          actorId: actor.id,
          queryString: cacheKey,
          responseStatus: 408, // Request Timeout
          errorMessage: timeoutError.message,
          responseTimeMs,
        })

        // Re-throw for orchestrator to handle (high-priority = store for review, low-priority = log and continue)
        throw timeoutError
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      // Cache other errors
      await setCachedQuery({
        sourceType: this.type,
        actorId: actor.id,
        queryString: cacheKey,
        responseStatus: null,
        errorMessage,
        responseTimeMs,
      })

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
