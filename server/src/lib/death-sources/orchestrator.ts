/**
 * Death Enrichment Orchestrator
 *
 * Coordinates multiple data sources to enrich actor death information.
 * Implements cost-optimized processing order: free sources first, then cheapest paid sources.
 */

import type {
  ActorForEnrichment,
  BatchEnrichmentStats,
  CostBreakdown,
  DataSource,
  EnrichmentConfig,
  EnrichmentData,
  EnrichmentResult,
  EnrichmentSourceEntry,
  EnrichmentStats,
  SourceAttemptStats,
  RawSourceData,
  CleanedDeathInfo,
  LinkFollowConfig,
} from "./types.js"
import {
  DataSourceType,
  CostLimitExceededError,
  SourceAccessBlockedError,
  SourceTimeoutError,
  DEFAULT_BROWSER_FETCH_CONFIG,
} from "./types.js"
import { recordCustomEvent, startSegment, addCustomAttributes, noticeError } from "../newrelic.js"
import { cleanupWithClaude } from "./claude-cleanup.js"
import { StatusBar } from "./status-bar.js"
import { EnrichmentLogger, getEnrichmentLogger } from "./logger.js"
import { WikidataSource } from "./sources/wikidata.js"
import { DuckDuckGoSource } from "./sources/duckduckgo.js"
import { GoogleSearchSource } from "./sources/google.js"
import { BingSearchSource } from "./sources/bing.js"
import { WebSearchBase } from "./sources/web-search-base.js"
import { FindAGraveSource } from "./sources/findagrave.js"
// LegacySource disabled - 0% success rate
import { TelevisionAcademySource } from "./sources/television-academy.js"
// IBDBSource removed - consistently blocked by anti-scraping protection
import { BFISightSoundSource } from "./sources/bfi-sight-sound.js"
import { WikipediaSource } from "./sources/wikipedia.js"
import { IMDbSource } from "./sources/imdb.js"
import { VarietySource } from "./sources/variety.js"
import { DeadlineSource } from "./sources/deadline.js"
import { NewsAPISource } from "./sources/newsapi.js"
// Disabled sources (0% success rate) - AlloCineSource, DoubanSource, SoompiSource, ChroniclingAmericaSource, FilmiBeatSource
import { TroveSource } from "./sources/trove.js"
import { EuropeanaSource } from "./sources/europeana.js"
import { InternetArchiveSource } from "./sources/internet-archive.js"
import { GuardianSource } from "./sources/guardian.js"
import { NYTimesSource } from "./sources/nytimes.js"
import { APNewsSource } from "./sources/ap-news.js"
import { FamilySearchSource } from "./sources/familysearch.js"
import { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
import { PerplexitySource } from "./ai-providers/perplexity.js"
import { DeepSeekSource } from "./ai-providers/deepseek.js"
import { GrokSource } from "./ai-providers/grok.js"
import { GeminiFlashSource, GeminiProSource } from "./ai-providers/gemini.js"
import { MistralSource } from "./ai-providers/mistral.js"
import { GroqLlamaSource } from "./ai-providers/groq.js"

/**
 * Extended enrichment result that includes raw sources and Claude cleanup data.
 * Used when claudeCleanup is enabled.
 */
export interface ExtendedEnrichmentResult extends EnrichmentResult {
  /** Raw data gathered from all sources (for audit/debugging) */
  rawSources?: RawSourceData[]
  /** Cleaned death info from Claude Opus 4.5 */
  cleanedDeathInfo?: CleanedDeathInfo
  /** Cost of Claude cleanup call */
  cleanupCostUsd?: number
}

/**
 * Default link following configuration.
 * Link following is enabled by default with heuristic selection.
 */
export const DEFAULT_LINK_FOLLOW_CONFIG: LinkFollowConfig = {
  enabled: true,
  maxLinksPerActor: 3,
  maxCostPerActor: 0.01,
  aiLinkSelection: false,
  aiContentExtraction: false,
}

/**
 * Default enrichment configuration.
 */
export const DEFAULT_CONFIG: EnrichmentConfig = {
  limit: 100,
  minPopularity: 0,
  recentOnly: false,
  dryRun: false,
  sourceCategories: {
    free: true,
    paid: false,
    ai: false,
  },
  specificSources: {},
  aiModels: {},
  stopOnMatch: true,
  confidenceThreshold: 0.5,
  linkFollow: DEFAULT_LINK_FOLLOW_CONFIG,
}

/**
 * Main orchestrator for death information enrichment.
 */
export class DeathEnrichmentOrchestrator {
  private config: EnrichmentConfig
  private sources: DataSource[] = []
  private stats: BatchEnrichmentStats
  private statusBar: StatusBar
  private logger: EnrichmentLogger

  constructor(
    config: Partial<EnrichmentConfig> = {},
    enableStatusBar = true,
    logger?: EnrichmentLogger
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = logger || getEnrichmentLogger()
    this.initializeSources()
    this.stats = this.createEmptyStats()
    this.statusBar = new StatusBar(enableStatusBar)
  }

  /**
   * Initialize data sources based on configuration.
   */
  private initializeSources(): void {
    this.sources = []

    // Free sources - always available, ordered by expected quality
    // High-accuracy film industry archives first, then structured data, then search
    const freeSources: DataSource[] = [
      // Phase 1: Structured data and industry archives
      new WikidataSource(),
      new WikipediaSource(), // Wikipedia Death section extraction
      new IMDbSource(), // IMDb bio pages (scraped)
      new TelevisionAcademySource(), // Official TV industry deaths
      new BFISightSoundSource(), // International film obituaries

      // Phase 2: Web Search (with link following)
      // DuckDuckGo is free, Google and Bing have free tiers but may incur costs
      new DuckDuckGoSource(),
      new GoogleSearchSource(),
      new BingSearchSource(),

      // Phase 3: News sources (APIs and scraping)
      new GuardianSource(), // Guardian API - UK news (requires API key)
      new NYTimesSource(), // NYT Article Search API (requires API key)
      new APNewsSource(), // AP News (scraped)
      new NewsAPISource(), // NewsAPI - aggregates 80,000+ sources (requires API key)
      new DeadlineSource(), // Deadline Hollywood - entertainment news (scraped)
      new VarietySource(), // Variety - entertainment trade publication (scraped)

      // Phase 4: Obituary sites
      new FindAGraveSource(),
      // LegacySource disabled - 0% success rate

      // Phase 5: International sources (regional film databases)
      // AlloCineSource, DoubanSource, SoompiSource, ChroniclingAmericaSource disabled - 0% success rate
      // FilmiBeatSource removed - consistently blocked by anti-scraping protection (403)

      // Phase 6: Historical archives (for pre-internet deaths)
      new TroveSource(), // Australian newspapers (requires API key)
      new EuropeanaSource(), // European archives (requires API key)
      new InternetArchiveSource(), // Books, documents, historical media

      // Phase 7: Genealogical records (good for historical death dates/places)
      new FamilySearchSource(), // FamilySearch API (requires API key)
    ]

    // Filter based on configuration
    if (this.config.sourceCategories.free) {
      for (const source of freeSources) {
        if (source.isAvailable()) {
          this.sources.push(source)
        }
      }
    }

    // AI sources - ordered by cost (cheapest first)
    if (this.config.sourceCategories.ai) {
      const aiSources: DataSource[] = [
        // Cheapest first
        new GeminiFlashSource(), // ~$0.0001/query - cheapest
        new GroqLlamaSource(), // ~$0.0002/query - fast Llama inference
        new GPT4oMiniSource(), // ~$0.0003/query
        new DeepSeekSource(), // ~$0.0005/query
        new MistralSource(), // ~$0.001/query - European training data
        new GeminiProSource(), // ~$0.002/query (has search grounding!)
        new GrokSource(), // ~$0.005/query (has X/Twitter data!)
        new PerplexitySource(), // ~$0.005/query (has web search!)
        new GPT4oSource(), // ~$0.01/query - most capable
      ]
      for (const source of aiSources) {
        if (source.isAvailable()) {
          this.sources.push(source)
        }
      }
    }

    // Configure link following for web search sources
    if (this.config.linkFollow) {
      for (const source of this.sources) {
        if (source instanceof WebSearchBase) {
          source.setLinkFollowConfig(this.config.linkFollow)
        }
      }
    }

    console.log(`Initialized ${this.sources.length} data sources:`)
    for (const source of this.sources) {
      console.log(
        `  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`})`
      )
    }

    // Log link following configuration
    if (this.config.linkFollow?.enabled) {
      console.log(`\nLink following enabled:`)
      console.log(`  Max links per actor: ${this.config.linkFollow.maxLinksPerActor}`)
      console.log(`  Max cost per actor: $${this.config.linkFollow.maxCostPerActor}`)
      console.log(`  AI link selection: ${this.config.linkFollow.aiLinkSelection ? "yes" : "no"}`)
      console.log(
        `  AI content extraction: ${this.config.linkFollow.aiContentExtraction ? "yes" : "no"}`
      )

      // Log browser fetch configuration
      const browserConfig = this.config.linkFollow.browserFetch || DEFAULT_BROWSER_FETCH_CONFIG
      if (browserConfig.enabled) {
        console.log(`\nBrowser fetching enabled:`)
        console.log(`  Protected domains: ${browserConfig.browserProtectedDomains.join(", ")}`)
        console.log(`  Fallback on block: ${browserConfig.fallbackOnBlock ? "yes" : "no"}`)
        console.log(`  Page timeout: ${browserConfig.pageTimeoutMs}ms`)
        console.log(`  Idle timeout: ${browserConfig.idleTimeoutMs}ms`)
      }
    }
  }

  /**
   * Create an empty cost breakdown object.
   */
  private createEmptyCostBreakdown(): CostBreakdown {
    return {
      bySource: {} as Record<DataSourceType, number>,
      total: 0,
    }
  }

  /**
   * Add cost to the breakdown for a specific source.
   */
  private addCostToBreakdown(breakdown: CostBreakdown, source: DataSourceType, cost: number): void {
    if (!breakdown.bySource[source]) {
      breakdown.bySource[source] = 0
    }
    breakdown.bySource[source] += cost
    breakdown.total += cost
  }

  /**
   * Enrich death information for a single actor.
   * @throws {CostLimitExceededError} If cost limits are exceeded
   */
  async enrichActor(actor: ActorForEnrichment): Promise<ExtendedEnrichmentResult> {
    // Add New Relic attributes for this actor
    addCustomAttributes({
      "enrichment.actor.id": actor.id,
      "enrichment.actor.name": actor.name,
      "enrichment.actor.tmdbId": actor.tmdbId || 0,
    })

    const startTime = Date.now()
    const costBreakdown = this.createEmptyCostBreakdown()
    const actorStats: EnrichmentStats = {
      actorId: actor.id,
      actorName: actor.name,
      deathYear: actor.deathday ? new Date(actor.deathday).getFullYear() : null,
      fieldsFilledBefore: this.getFilledFields(actor),
      fieldsFilledAfter: [],
      sourcesAttempted: [],
      finalSource: null,
      confidence: 0,
      totalCostUsd: 0,
      totalTimeMs: 0,
      costBreakdown,
    }

    this.statusBar.log(`\nEnriching: ${actor.name} (ID: ${actor.id})`)

    const result: ExtendedEnrichmentResult = {}

    // Collect raw data when Claude cleanup is enabled
    const rawSources: RawSourceData[] = []
    const isCleanupMode = this.config.claudeCleanup?.enabled === true
    const gatherAll = isCleanupMode && this.config.claudeCleanup?.gatherAllSources === true

    if (isCleanupMode) {
      this.statusBar.log(
        `  Claude cleanup mode: ${gatherAll ? "gathering all sources" : "standard"}`
      )
    }

    // Try each source in order until we have enough data
    for (const source of this.sources) {
      // Skip sources that have hit rate limits
      if (this.statusBar.getExhaustedSources().includes(source.name)) {
        continue
      }

      const sourceStartTime = Date.now()

      this.statusBar.setCurrentSource(source.name)
      this.statusBar.log(`  Trying ${source.name}...`)

      let lookupResult
      try {
        this.logger.sourceAttempt(actor.name, source.type, source.name)
        // Wrap source lookup in New Relic segment
        lookupResult = await startSegment(`Source/${source.name}`, true, async () => {
          return source.lookup(actor)
        })
      } catch (error) {
        // Handle SourceAccessBlockedError specially
        if (error instanceof SourceAccessBlockedError) {
          this.logger.sourceBlocked(actor.name, source.type, error.statusCode, error.url)
          this.statusBar.log(`    BLOCKED (${error.statusCode}) - flagged for review`)
          // Continue to next source, don't fail the whole enrichment
          const attemptStats: SourceAttemptStats = {
            source: source.type,
            success: false,
            timeMs: Date.now() - sourceStartTime,
            costUsd: 0,
            error: `Blocked: ${error.statusCode}`,
          }
          actorStats.sourcesAttempted.push(attemptStats)
          continue
        }

        // Handle SourceTimeoutError specially
        if (error instanceof SourceTimeoutError) {
          if (error.isHighPriority) {
            // High-priority source timeout - flag for review
            this.logger.sourceBlocked(actor.name, source.type, 408, "timeout")
            this.statusBar.log(
              `    TIMEOUT (${error.timeoutMs}ms) - high-priority source, flagged for review`
            )
          } else {
            // Low-priority source timeout - just log and continue
            this.statusBar.log(`    TIMEOUT (${error.timeoutMs}ms) - low-priority source, skipping`)
          }

          const attemptStats: SourceAttemptStats = {
            source: source.type,
            success: false,
            timeMs: Date.now() - sourceStartTime,
            costUsd: 0,
            error: `Timeout: ${error.timeoutMs}ms`,
          }
          actorStats.sourcesAttempted.push(attemptStats)
          continue
        }

        throw error
      }

      // Record stats
      const sourceCost = lookupResult.source.costUsd || 0
      const attemptStats: SourceAttemptStats = {
        source: source.type,
        success: lookupResult.success,
        timeMs: Date.now() - sourceStartTime,
        costUsd: sourceCost,
        error: lookupResult.error,
      }
      actorStats.sourcesAttempted.push(attemptStats)
      actorStats.totalCostUsd += sourceCost

      // Track source attempt in status bar
      this.statusBar.recordSourceAttempt(source.name, lookupResult.success)

      // Track cost breakdown by source
      this.addCostToBreakdown(costBreakdown, source.type, sourceCost)

      // Update status bar with new cost
      if (sourceCost > 0) {
        this.statusBar.addCost(sourceCost)
      }

      // Check per-actor cost limit
      if (this.config.costLimits?.maxCostPerActor !== undefined) {
        if (actorStats.totalCostUsd >= this.config.costLimits.maxCostPerActor) {
          this.statusBar.log(
            `    Cost limit reached for actor ($${actorStats.totalCostUsd.toFixed(4)} >= $${this.config.costLimits.maxCostPerActor})`
          )
          // Update stats before stopping
          actorStats.totalTimeMs = Date.now() - startTime
          actorStats.fieldsFilledAfter = this.getFilledFieldsFromResult(result)
          this.updateBatchStats(actorStats)
          // Return what we have so far
          return result
        }
      }

      if (!lookupResult.success || !lookupResult.data) {
        this.logger.sourceFailed(actor.name, source.type, lookupResult.error || "No data")
        this.statusBar.log(`    Failed: ${lookupResult.error || "No data"}`)

        // Record source failure in New Relic
        recordCustomEvent("EnrichmentSourceFailed", {
          actorId: actor.id,
          actorName: actor.name,
          source: source.name,
          sourceType: source.type,
          error: lookupResult.error || "No data",
        })

        // Check for rate limit errors and mark source as exhausted
        const errorLower = (lookupResult.error || "").toLowerCase()
        if (errorLower.includes("rate limit") || errorLower.includes("quota exceeded")) {
          this.statusBar.markSourceExhausted(source.name)
        }

        continue
      }

      // Log successful fields found
      const fieldsFound = this.getFieldsFromData(lookupResult.data)
      this.logger.sourceSuccess(actor.name, source.type, fieldsFound)
      this.statusBar.log(`    Success! Confidence: ${lookupResult.source.confidence.toFixed(2)}`)

      // Record source success in New Relic
      recordCustomEvent("EnrichmentSourceSuccess", {
        actorId: actor.id,
        actorName: actor.name,
        source: source.name,
        sourceType: source.type,
        confidence: lookupResult.source.confidence,
        fieldsFound: fieldsFound.join(","),
        costUsd: sourceCost,
      })
      this.statusBar.setLastWinningSource(source.name)

      // In cleanup mode, collect raw data for later processing
      if (isCleanupMode && lookupResult.data.circumstances) {
        rawSources.push({
          sourceName: source.name,
          sourceType: source.type,
          text: lookupResult.data.circumstances,
          url: lookupResult.source.url || undefined,
          confidence: lookupResult.source.confidence,
        })
        this.statusBar.log(
          `    Collected ${lookupResult.data.circumstances.length} chars for cleanup`
        )
      }

      // Merge data into result (for non-cleanup mode or as fallback)
      this.mergeData(result, lookupResult.data, lookupResult.source)

      // Process additional results (for multi-story sources like Guardian, NYT)
      if (lookupResult.additionalResults && lookupResult.additionalResults.length > 0) {
        this.statusBar.log(`    + ${lookupResult.additionalResults.length} additional stories`)

        for (const additional of lookupResult.additionalResults) {
          if (additional.data) {
            // In cleanup mode, collect raw data for later processing
            if (isCleanupMode && additional.data.circumstances) {
              rawSources.push({
                sourceName: `${source.name} (additional)`,
                sourceType: source.type,
                text: additional.data.circumstances,
                url: additional.source.url || undefined,
                confidence: additional.source.confidence,
              })
            }

            // Merge additional context into result
            if (additional.data.additionalContext && !result.additionalContext) {
              result.additionalContext = additional.data.additionalContext
              result.additionalContextSource = additional.source
            }

            // Merge notable factors
            if (additional.data.notableFactors && additional.data.notableFactors.length > 0) {
              const existing = result.notableFactors || []
              const merged = [...new Set([...existing, ...additional.data.notableFactors])]
              result.notableFactors = merged.slice(0, 10)
              if (!result.notableFactorsSource) {
                result.notableFactorsSource = additional.source
              }
            }
          }
        }
      }

      // In gather-all mode, keep going through all sources
      if (gatherAll) {
        actorStats.finalSource = source.type
        actorStats.confidence = Math.max(actorStats.confidence, lookupResult.source.confidence)
        // Don't break - continue to gather from all sources
        continue
      }

      // Standard mode: Check if we have enough data
      if (this.config.stopOnMatch && this.hasEnoughData(result)) {
        this.statusBar.log(`    Stopping - sufficient data collected`)
        actorStats.finalSource = source.type
        actorStats.confidence = lookupResult.source.confidence
        break
      }

      // Check confidence threshold
      if (lookupResult.source.confidence >= this.config.confidenceThreshold) {
        actorStats.finalSource = source.type
        actorStats.confidence = lookupResult.source.confidence
        if (this.config.stopOnMatch) {
          this.statusBar.log(`    Stopping - confidence threshold met`)
          break
        }
      }
    }

    // After gathering, run Claude cleanup if enabled and we have raw data
    if (isCleanupMode && rawSources.length > 0) {
      this.statusBar.log(`  Running Claude Opus 4.5 cleanup on ${rawSources.length} sources...`)
      try {
        // Wrap Claude cleanup in New Relic segment
        const { cleaned, costUsd } = await startSegment("ClaudeCleanup", true, async () => {
          return cleanupWithClaude(actor, rawSources)
        })

        // Add cleanup cost to stats
        actorStats.totalCostUsd += costUsd
        this.addCostToBreakdown(costBreakdown, DataSourceType.CLAUDE, costUsd)
        this.statusBar.addCost(costUsd)

        // Store raw sources and cleaned data in result
        result.rawSources = rawSources
        result.cleanedDeathInfo = cleaned
        result.cleanupCostUsd = costUsd

        // Also update the main result fields with cleaned data
        if (cleaned.circumstances) {
          result.circumstances = cleaned.circumstances
        }
        if (cleaned.rumoredCircumstances) {
          result.rumoredCircumstances = cleaned.rumoredCircumstances
        }
        if (cleaned.notableFactors && cleaned.notableFactors.length > 0) {
          result.notableFactors = cleaned.notableFactors
        }
        if (cleaned.locationOfDeath) {
          result.locationOfDeath = cleaned.locationOfDeath
        }
        if (cleaned.additionalContext) {
          result.additionalContext = cleaned.additionalContext
        }

        this.statusBar.log(`    Cleanup complete, cost: $${costUsd.toFixed(4)}`)

        // Record Claude cleanup success in New Relic
        recordCustomEvent("EnrichmentClaudeCleanup", {
          actorId: actor.id,
          actorName: actor.name,
          sourceCount: rawSources.length,
          costUsd: costUsd,
          hasCircumstances: !!cleaned.circumstances,
          hasNotableFactors: (cleaned.notableFactors?.length || 0) > 0,
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown cleanup error"
        this.statusBar.log(`    Cleanup failed: ${errorMsg}`)

        // Record cleanup error in New Relic
        if (error instanceof Error) {
          noticeError(error, { actorId: actor.id, actorName: actor.name })
        }
        recordCustomEvent("EnrichmentClaudeCleanupError", {
          actorId: actor.id,
          actorName: actor.name,
          error: errorMsg,
        })

        // Continue with raw data as fallback
        result.rawSources = rawSources
      }
    }

    actorStats.totalTimeMs = Date.now() - startTime
    actorStats.fieldsFilledAfter = this.getFilledFieldsFromResult(result)

    // Update batch stats
    this.updateBatchStats(actorStats)

    // Mark actor complete in status bar
    this.statusBar.completeActor()
    this.statusBar.log(
      `  Complete in ${actorStats.totalTimeMs}ms, cost: $${actorStats.totalCostUsd.toFixed(4)}`
    )
    this.statusBar.log(`  Fields filled: ${actorStats.fieldsFilledAfter.join(", ") || "none"}`)

    // Log enrichment completion
    this.logger.enrichmentComplete(
      actor.id,
      actor.name,
      actorStats.sourcesAttempted.length,
      actorStats.sourcesAttempted.filter((s) => s.success).length,
      actorStats.totalCostUsd
    )

    // Record actor enrichment completion in New Relic
    recordCustomEvent("EnrichmentActorComplete", {
      actorId: actor.id,
      actorName: actor.name,
      sourcesAttempted: actorStats.sourcesAttempted.length,
      sourcesSucceeded: actorStats.sourcesAttempted.filter((s) => s.success).length,
      fieldsEnriched: actorStats.fieldsFilledAfter.length,
      totalCostUsd: actorStats.totalCostUsd,
      totalTimeMs: actorStats.totalTimeMs,
    })

    return result
  }

  /**
   * Get field names from enrichment data.
   */
  private getFieldsFromData(data: Partial<EnrichmentData>): string[] {
    const fields: string[] = []
    if (data.circumstances) fields.push("circumstances")
    if (data.rumoredCircumstances) fields.push("rumoredCircumstances")
    if (data.notableFactors && data.notableFactors.length > 0) fields.push("notableFactors")
    if (data.relatedCelebrities && data.relatedCelebrities.length > 0)
      fields.push("relatedCelebrities")
    if (data.locationOfDeath) fields.push("locationOfDeath")
    if (data.additionalContext) fields.push("additionalContext")
    return fields
  }

  /**
   * Enrich a batch of actors.
   * @throws {CostLimitExceededError} If total cost limit is exceeded
   */
  async enrichBatch(actors: ActorForEnrichment[]): Promise<Map<number, ExtendedEnrichmentResult>> {
    const results = new Map<number, ExtendedEnrichmentResult>()

    // Record batch start in New Relic
    addCustomAttributes({
      "enrichment.batch.totalActors": actors.length,
      "enrichment.batch.maxTotalCost": this.config.costLimits?.maxTotalCost || 0,
    })
    recordCustomEvent("EnrichmentBatchStart", {
      totalActors: actors.length,
      maxTotalCost: this.config.costLimits?.maxTotalCost || 0,
      maxCostPerActor: this.config.costLimits?.maxCostPerActor || 0,
      claudeCleanupEnabled: this.config.claudeCleanup?.enabled || false,
    })

    // Start the status bar and log batch start
    this.statusBar.start(actors.length)
    this.logger.batchStart(actors.length)

    this.statusBar.log(`\n${"=".repeat(60)}`)
    this.statusBar.log(`Starting batch enrichment for ${actors.length} actors`)
    this.statusBar.log(`Sources: ${this.sources.map((s) => s.name).join(", ")}`)
    if (this.config.costLimits?.maxTotalCost !== undefined) {
      this.statusBar.log(`Total cost limit: $${this.config.costLimits.maxTotalCost}`)
    }
    if (this.config.costLimits?.maxCostPerActor !== undefined) {
      this.statusBar.log(`Per-actor cost limit: $${this.config.costLimits.maxCostPerActor}`)
    }
    this.statusBar.log(`${"=".repeat(60)}`)

    try {
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i]
        this.statusBar.setCurrentActor(actor.name, i)
        this.statusBar.log(`\n[${i + 1}/${actors.length}] Processing ${actor.name}`)

        const result = await this.enrichActor(actor)
        results.set(actor.id, result)

        // Sync status bar total cost with batch stats
        this.statusBar.setTotalCost(this.stats.totalCostUsd)

        // Check total cost limit after each actor
        if (this.config.costLimits?.maxTotalCost !== undefined) {
          if (this.stats.totalCostUsd >= this.config.costLimits.maxTotalCost) {
            this.statusBar.stop()
            console.log(`\n${"!".repeat(60)}`)
            console.log(
              `TOTAL COST LIMIT REACHED: $${this.stats.totalCostUsd.toFixed(4)} >= $${this.config.costLimits.maxTotalCost}`
            )
            console.log(`Processed ${i + 1} of ${actors.length} actors before limit`)
            console.log(`${"!".repeat(60)}`)

            // Print stats before throwing
            this.printBatchStats()

            throw new CostLimitExceededError(
              `Total cost limit of $${this.config.costLimits.maxTotalCost} exceeded`,
              "total",
              this.stats.totalCostUsd,
              this.config.costLimits.maxTotalCost,
              undefined, // actorId
              undefined, // actorName
              results // partialResults - actors already processed before limit hit
            )
          }
        }

        // Add delay between actors to be respectful to APIs
        if (i < actors.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    } finally {
      // Always stop the status bar
      this.statusBar.stop()
    }

    console.log(`\n${"=".repeat(60)}`)
    console.log("Batch enrichment complete!")
    this.printBatchStats()
    console.log(`${"=".repeat(60)}`)

    // Log batch completion
    this.logger.batchComplete(
      this.stats.actorsProcessed,
      this.stats.actorsEnriched,
      this.stats.totalCostUsd,
      this.stats.totalTimeMs
    )

    // Record batch completion in New Relic
    recordCustomEvent("EnrichmentBatchComplete", {
      actorsProcessed: this.stats.actorsProcessed,
      actorsEnriched: this.stats.actorsEnriched,
      fillRate: this.stats.fillRate,
      totalCostUsd: this.stats.totalCostUsd,
      totalTimeMs: this.stats.totalTimeMs,
    })

    return results
  }

  /**
   * Get current batch statistics.
   */
  getStats(): BatchEnrichmentStats {
    return { ...this.stats }
  }

  /**
   * Get the status bar instance for direct access.
   */
  getStatusBar(): StatusBar {
    return this.statusBar
  }

  /**
   * Cleanup resources used by the orchestrator.
   * Currently a no-op, but available for future resource cleanup.
   */
  async cleanup(): Promise<void> {
    // No-op - browser cleanup not currently needed
  }

  /**
   * Merge enrichment data into result.
   */
  private mergeData(
    result: EnrichmentResult,
    data: Partial<EnrichmentData>,
    source: EnrichmentSourceEntry
  ): void {
    // Only merge non-null values that aren't already set
    if (data.circumstances && !result.circumstances) {
      result.circumstances = data.circumstances
      result.circumstancesSource = source
    }

    if (data.rumoredCircumstances && !result.rumoredCircumstances) {
      result.rumoredCircumstances = data.rumoredCircumstances
      result.rumoredCircumstancesSource = source
    }

    if (data.notableFactors && data.notableFactors.length > 0 && !result.notableFactors) {
      result.notableFactors = data.notableFactors
      result.notableFactorsSource = source
    }

    if (
      data.relatedCelebrities &&
      data.relatedCelebrities.length > 0 &&
      !result.relatedCelebrities
    ) {
      result.relatedCelebrities = data.relatedCelebrities
      result.relatedCelebritiesSource = source
    }

    if (data.locationOfDeath && !result.locationOfDeath) {
      result.locationOfDeath = data.locationOfDeath
      result.locationOfDeathSource = source
    }

    if (data.additionalContext && !result.additionalContext) {
      result.additionalContext = data.additionalContext
      result.additionalContextSource = source
    }
  }

  /**
   * Check if we have enough data to stop searching.
   */
  private hasEnoughData(result: EnrichmentResult): boolean {
    // We need at least circumstances or notable factors
    return !!(result.circumstances || (result.notableFactors && result.notableFactors.length > 0))
  }

  /**
   * Get list of already-filled fields from actor data.
   */
  private getFilledFields(actor: ActorForEnrichment): string[] {
    const fields: string[] = []
    if (actor.causeOfDeath) fields.push("causeOfDeath")
    if (actor.causeOfDeathDetails) fields.push("causeOfDeathDetails")
    return fields
  }

  /**
   * Get list of filled fields from enrichment result.
   */
  private getFilledFieldsFromResult(result: EnrichmentResult): string[] {
    const fields: string[] = []
    if (result.circumstances) fields.push("circumstances")
    if (result.rumoredCircumstances) fields.push("rumoredCircumstances")
    if (result.notableFactors && result.notableFactors.length > 0) fields.push("notableFactors")
    if (result.relatedCelebrities && result.relatedCelebrities.length > 0)
      fields.push("relatedCelebrities")
    if (result.locationOfDeath) fields.push("locationOfDeath")
    if (result.additionalContext) fields.push("additionalContext")
    return fields
  }

  /**
   * Create empty batch stats object.
   */
  private createEmptyStats(): BatchEnrichmentStats {
    return {
      actorsProcessed: 0,
      actorsEnriched: 0,
      fillRate: 0,
      totalCostUsd: 0,
      totalTimeMs: 0,
      sourceHitRates: {} as Record<DataSourceType, number>,
      costBySource: {} as Record<DataSourceType, number>,
      errors: [],
    }
  }

  /**
   * Update batch stats with individual actor stats.
   */
  private updateBatchStats(actorStats: EnrichmentStats): void {
    this.stats.actorsProcessed++
    this.stats.totalCostUsd += actorStats.totalCostUsd
    this.stats.totalTimeMs += actorStats.totalTimeMs

    if (actorStats.fieldsFilledAfter.length > 0) {
      this.stats.actorsEnriched++
      this.statusBar.incrementEnriched()
    }

    // Update source hit rates and cost by source
    for (const attempt of actorStats.sourcesAttempted) {
      if (!this.stats.sourceHitRates[attempt.source]) {
        this.stats.sourceHitRates[attempt.source] = 0
      }
      if (attempt.success) {
        this.stats.sourceHitRates[attempt.source]++
      }

      // Accumulate cost by source
      if (attempt.costUsd && attempt.costUsd > 0) {
        if (!this.stats.costBySource[attempt.source]) {
          this.stats.costBySource[attempt.source] = 0
        }
        this.stats.costBySource[attempt.source] += attempt.costUsd
      }
    }

    // Calculate fill rate
    this.stats.fillRate =
      this.stats.actorsProcessed > 0
        ? (this.stats.actorsEnriched / this.stats.actorsProcessed) * 100
        : 0
  }

  /**
   * Print batch statistics summary.
   */
  private printBatchStats(): void {
    console.log(`
Batch Statistics:
  Actors processed: ${this.stats.actorsProcessed}
  Actors enriched:  ${this.stats.actorsEnriched}
  Fill rate:        ${this.stats.fillRate.toFixed(1)}%
  Total cost:       $${this.stats.totalCostUsd.toFixed(4)}
  Total time:       ${(this.stats.totalTimeMs / 1000).toFixed(1)}s

Source Hit Rates:`)

    for (const [source, count] of Object.entries(this.stats.sourceHitRates)) {
      const rate =
        this.stats.actorsProcessed > 0 ? ((count as number) / this.stats.actorsProcessed) * 100 : 0
      console.log(`  ${source}: ${rate.toFixed(1)}%`)
    }

    // Print cost breakdown by source
    const costEntries = Object.entries(this.stats.costBySource).filter(([, cost]) => cost > 0)
    if (costEntries.length > 0) {
      console.log(`\nCost Breakdown by Source:`)
      // Sort by cost descending
      costEntries.sort((a, b) => (b[1] as number) - (a[1] as number))
      for (const [source, cost] of costEntries) {
        const percentage =
          this.stats.totalCostUsd > 0 ? ((cost as number) / this.stats.totalCostUsd) * 100 : 0
        console.log(`  ${source}: $${(cost as number).toFixed(4)} (${percentage.toFixed(1)}%)`)
      }
    }

    if (this.stats.errors.length > 0) {
      console.log(`\nErrors (${this.stats.errors.length}):`)
      for (const error of this.stats.errors.slice(0, 5)) {
        console.log(`  Actor ${error.actorId}: ${error.error}`)
      }
      if (this.stats.errors.length > 5) {
        console.log(`  ... and ${this.stats.errors.length - 5} more`)
      }
    }
  }
}
