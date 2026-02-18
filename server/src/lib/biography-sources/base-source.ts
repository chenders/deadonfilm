/**
 * Base class for all biography data source implementations.
 *
 * Provides common functionality like rate limiting, caching, and confidence
 * calculation adapted for biographical content (childhood, education, family, etc.).
 *
 * Forks the pattern from death-sources/base-source.ts but simplified:
 * - No link-follow config
 * - No require-sources settings
 * - No SourceAccessBlockedError/SourceTimeoutError re-throws
 * - Biography-specific keywords and query builder
 */

import newrelic from "newrelic"
import type {
  BiographySourceType,
  BiographySourceEntry,
  ActorForBiography,
  RawBiographySourceData,
} from "./types.js"
import type { ReliabilityTier } from "../death-sources/types.js"
import { RELIABILITY_SCORES } from "../death-sources/types.js"
import type { DataSourceType } from "../death-sources/types.js"
import { getCachedQuery, setCachedQuery } from "../death-sources/cache.js"

// ============================================================================
// Global Cache Configuration
// ============================================================================

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

// ============================================================================
// Biography Keywords
// ============================================================================

/**
 * Required keywords for biographical content.
 * At least one must be present for non-zero confidence.
 */
export const BIO_REQUIRED_KEYWORDS = [
  "childhood",
  "grew up",
  "born in",
  "early life",
  "parents",
  "family",
  "education",
  "school",
  "married",
  "personal",
]

/**
 * Bonus keywords that increase biographical confidence.
 */
export const BIO_BONUS_KEYWORDS = [
  "scholarship",
  "struggled",
  "poverty",
  "military",
  "served",
  "orphan",
  "adopted",
  "immigrant",
  "self-taught",
  "before fame",
  "first job",
  "siblings",
  "divorce",
  "children",
]

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result from a biography source lookup.
 */
export interface BiographyLookupResult {
  success: boolean
  source: BiographySourceEntry
  data: RawBiographySourceData | null
  error?: string
}

// ============================================================================
// Base Class
// ============================================================================

/**
 * Abstract base class for biography data sources.
 * Extend this class to implement new biography sources.
 */
export abstract class BaseBiographySource {
  abstract readonly name: string
  abstract readonly type: BiographySourceType
  abstract readonly isFree: boolean
  abstract readonly estimatedCostPerQuery: number
  abstract readonly reliabilityTier: ReliabilityTier

  /**
   * Numeric reliability score (0.0-1.0) derived from the tier.
   * Measures source trustworthiness, independent of content confidence.
   */
  get reliabilityScore(): number {
    return RELIABILITY_SCORES[this.reliabilityTier]
  }

  // Rate limiting
  protected lastRequestTime = 0
  protected minDelayMs = 1000 // Default 1 second between requests

  // Request timeout
  protected requestTimeoutMs = 30000

  /**
   * User agent for HTTP requests.
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
   * Check if this source is available (API key configured, etc.)
   * Override in subclasses that require configuration.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Generate the cache key for an actor lookup.
   * Override in subclasses that use different query formats.
   */
  protected getCacheKey(actor: ActorForBiography): string {
    return this.buildBiographyQuery(actor)
  }

  /**
   * Main lookup method - orchestrates caching, rate limiting, and error handling.
   */
  async lookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()
    const cacheKey = this.getCacheKey(actor)

    try {
      // Check cache first (unless ignoreCache is set)
      if (!globalIgnoreCache) {
        const cached = await getCachedQuery(this.type as unknown as DataSourceType, cacheKey)
        if (cached) {
          newrelic.recordCustomEvent("BioSourceCacheHit", {
            source: this.name,
            sourceType: this.type,
            actorId: actor.id,
            wasError: !!cached.errorMessage,
          })

          // Reconstruct result from cache
          if (cached.errorMessage) {
            return {
              success: false,
              source: this.createSourceEntry(startTime, 0, { queryUsed: cacheKey }),
              data: null,
              error: cached.errorMessage,
            }
          }

          // Return cached successful result
          const cachedResult = cached.responseRaw as BiographyLookupResult | null
          if (cachedResult) {
            return {
              ...cachedResult,
              source: {
                ...cachedResult.source,
                retrievedAt: new Date(),
              },
            }
          }
        } else {
          newrelic.recordCustomEvent("BioSourceCacheMiss", {
            source: this.name,
            sourceType: this.type,
            actorId: actor.id,
          })
        }
      }

      // Apply rate limiting
      await this.waitForRateLimit()

      // Perform the actual lookup
      const result = await this.performLookup(actor)
      const responseTimeMs = Date.now() - startTime

      // Store result in cache
      await setCachedQuery({
        sourceType: this.type as unknown as DataSourceType,
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      newrelic.recordCustomEvent("BioSourceLookupError", {
        source: this.name,
        sourceType: this.type,
        actorId: actor.id,
        error: errorMessage,
      })

      // Cache errors
      await setCachedQuery({
        sourceType: this.type as unknown as DataSourceType,
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
  protected abstract performLookup(actor: ActorForBiography): Promise<BiographyLookupResult>

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
   * Create a BiographySourceEntry for tracking.
   */
  protected createSourceEntry(
    startTime: number,
    confidence: number,
    options?: {
      url?: string
      queryUsed?: string
      rawData?: unknown
      publication?: string
      articleTitle?: string
      domain?: string
      contentType?: string
    }
  ): BiographySourceEntry {
    return {
      type: this.type,
      url: options?.url ?? null,
      retrievedAt: new Date(),
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      costUsd: this.isFree ? 0 : this.estimatedCostPerQuery,
      queryUsed: options?.queryUsed,
      rawData: options?.rawData,
      publication: options?.publication ?? null,
      articleTitle: options?.articleTitle ?? null,
      domain: options?.domain ?? null,
      contentType: options?.contentType ?? null,
    }
  }

  /**
   * Build a search query for an actor's biography.
   */
  protected buildBiographyQuery(actor: ActorForBiography): string {
    return `"${actor.name}" biography early life personal childhood`
  }

  /**
   * Calculate confidence based on biographical keyword matches.
   *
   * - 0 if no required keywords found
   * - Base: min(0.5, requiredFound * 0.25)
   * - Bonus: min(0.5, bonusFound * 0.1)
   * - Cap at 1.0
   */
  protected calculateBiographicalConfidence(text: string): number {
    return this.calculateConfidence(text, BIO_REQUIRED_KEYWORDS, BIO_BONUS_KEYWORDS)
  }

  /**
   * Calculate confidence based on keyword matches.
   * Generic version that can be used with any keyword lists.
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

    // Bonus confidence from bonus keywords
    const bonusFound = bonusKeywords.filter((kw) => lowerText.includes(kw.toLowerCase()))
    confidence += Math.min(0.5, bonusFound.length * 0.1)

    return Math.min(1.0, confidence)
  }
}
