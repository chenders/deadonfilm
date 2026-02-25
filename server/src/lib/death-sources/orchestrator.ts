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
import newrelic from "newrelic"
import { cleanupWithClaude } from "./claude-cleanup.js"
import { StatusBar } from "./status-bar.js"
import { EnrichmentLogger, getEnrichmentLogger, setActiveStatusBar } from "./logger.js"
import { resolveRedirectUrls, type ResolvedUrl } from "./url-resolver.js"
import { WikidataSource } from "./sources/wikidata.js"
import { DuckDuckGoSource } from "./sources/duckduckgo.js"
import { GoogleSearchSource } from "./sources/google.js"
import { BingSearchSource } from "./sources/bing.js"
import { WebSearchBase } from "./sources/web-search-base.js"
import { FindAGraveSource } from "./sources/findagrave.js"
import { LegacySource } from "./sources/legacy.js"
import { BFISightSoundSource } from "./sources/bfi-sight-sound.js"
import { WikipediaSource } from "./sources/wikipedia.js"
import { IMDbSource } from "./sources/imdb.js"
import { VarietySource } from "./sources/variety.js"
import { DeadlineSource } from "./sources/deadline.js"
import { NewsAPISource } from "./sources/newsapi.js"
import { ChroniclingAmericaSource } from "./sources/chronicling-america.js"
import { TroveSource } from "./sources/trove.js"
import { EuropeanaSource } from "./sources/europeana.js"
import { InternetArchiveSource } from "./sources/internet-archive.js"
import { GuardianSource } from "./sources/guardian.js"
import { NYTimesSource } from "./sources/nytimes.js"
import { APNewsSource } from "./sources/ap-news.js"
import { HollywoodReporterSource } from "./sources/hollywood-reporter.js"
import { TMZSource } from "./sources/tmz.js"
import { PeopleSource } from "./sources/people.js"
import { BBCNewsSource } from "./sources/bbc-news.js"
import { GoogleNewsRSSSource } from "./sources/google-news-rss.js"
import { BraveSearchSource } from "./sources/brave.js"
import { FamilySearchSource } from "./sources/familysearch.js"
import { GoogleBooksDeathSource } from "./sources/google-books.js"
import { OpenLibraryDeathSource } from "./sources/open-library.js"
import { IABooksDeathSource } from "./sources/ia-books.js"
import { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
import { PerplexitySource } from "./ai-providers/perplexity.js"
import { DeepSeekSource } from "./ai-providers/deepseek.js"
import { GrokSource } from "./ai-providers/grok.js"
import { GeminiFlashSource, GeminiProSource } from "./ai-providers/gemini.js"
import { MistralSource } from "./ai-providers/mistral.js"
import { GroqLlamaSource } from "./ai-providers/groq.js"

/**
 * Merge enrichment data into result using first-wins strategy.
 * Only merges non-null values that aren't already set in the result.
 * Exported for testing.
 */
export function mergeEnrichmentData(
  result: EnrichmentResult,
  data: Partial<EnrichmentData>,
  source: EnrichmentSourceEntry
): void {
  // Core fields
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

  if (data.relatedCelebrities && data.relatedCelebrities.length > 0 && !result.relatedCelebrities) {
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

  // Career context fields
  if (data.lastProject && !result.lastProject) {
    result.lastProject = data.lastProject
    result.lastProjectSource = source
  }

  if (data.careerStatusAtDeath && !result.careerStatusAtDeath) {
    result.careerStatusAtDeath = data.careerStatusAtDeath
    result.careerStatusAtDeathSource = source
  }

  if (data.posthumousReleases && data.posthumousReleases.length > 0 && !result.posthumousReleases) {
    result.posthumousReleases = data.posthumousReleases
    result.posthumousReleasesSource = source
  }

  if (data.relatedDeaths && !result.relatedDeaths) {
    result.relatedDeaths = data.relatedDeaths
    result.relatedDeathsSource = source
  }
}

/**
 * Structured log entry for per-actor enrichment tracking.
 * Stored as JSONB in enrichment_run_actors.log_entries.
 */
export interface ActorLogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  data?: Record<string, unknown>
}

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
  /** Per-actor statistics for tracking (all sources attempted, costs, timing) */
  actorStats?: EnrichmentStats
  /** Per-actor structured log entries for debugging/audit */
  logEntries?: ActorLogEntry[]
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
  confidenceThreshold: 0.5,
  linkFollow: DEFAULT_LINK_FOLLOW_CONFIG,
  reliabilityThreshold: 0.6,
  useReliabilityThreshold: true,
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
    // Set the active status bar so other modules can route console logs through it
    setActiveStatusBar(enableStatusBar ? this.statusBar : null)
  }

  /**
   * Initialize data sources based on configuration.
   */
  private initializeSources(): void {
    this.sources = []

    // Free sources - always available, ordered by expected quality
    // High-accuracy film industry archives first, then structured data, then search
    const freeSources: DataSource[] = [
      // Phase 1: Structured data
      new WikidataSource(),
      new WikipediaSource(), // Wikipedia Death section extraction
      new IMDbSource(), // IMDb bio pages (scraped)
      new BFISightSoundSource(), // International film obituaries (2015+ only)

      // Phase 2: Web Search (with link following)
      // Google first (best results), DuckDuckGo as free fallback
      new GoogleSearchSource(), // Requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX
      new BingSearchSource(), // Requires BING_SEARCH_API_KEY
      new DuckDuckGoSource(), // Free fallback, no API key needed
      new BraveSearchSource(), // Requires BRAVE_SEARCH_API_KEY, $0.005/query

      // Phase 3: News sources (APIs and scraping)
      new GuardianSource(), // Guardian API - UK news (requires API key)
      new NYTimesSource(), // NYT Article Search API (requires API key)
      new APNewsSource(), // AP News (scraped)
      new NewsAPISource(), // NewsAPI - aggregates 80,000+ sources (requires API key)
      new DeadlineSource(), // Deadline Hollywood - entertainment news (scraped)
      new VarietySource(), // Variety - entertainment trade publication (scraped)
      new HollywoodReporterSource(), // Hollywood Reporter - entertainment news (scraped)
      new TMZSource(), // TMZ - celebrity news (scraped)
      new PeopleSource(), // People Magazine - celebrity obituaries (scraped)
      new BBCNewsSource(), // BBC News - international news (scraped)
      new GoogleNewsRSSSource(), // Google News RSS - aggregated news feed

      // Phase 4: Obituary sites
      new FindAGraveSource(),
      new LegacySource(), // Legacy.com obituaries (via DuckDuckGo + archive.org)

      // Phase 5: Books/Publications
      ...(this.config.sourceCategories.books !== false
        ? [new GoogleBooksDeathSource(), new OpenLibraryDeathSource(), new IABooksDeathSource()]
        : []),

      // Phase 6: Historical archives (for pre-internet deaths)
      new TroveSource(), // Australian newspapers (requires API key)
      new EuropeanaSource(), // European archives (requires API key)
      new InternetArchiveSource(), // Books, documents, historical media
      new ChroniclingAmericaSource(), // Library of Congress newspapers (1756-1963)

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

    // Configure Wikipedia options (including AI section selection)
    if (this.config.wikipediaOptions) {
      for (const source of this.sources) {
        if (source instanceof WikipediaSource) {
          source.setWikipediaOptions(this.config.wikipediaOptions)
        }
      }
    }

    console.log(`Initialized ${this.sources.length} data sources:`)
    for (const source of this.sources) {
      console.log(
        `  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`}, reliability: ${source.reliabilityScore.toFixed(2)})`
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

    // Log Wikipedia options
    if (this.config.wikipediaOptions?.useAISectionSelection) {
      console.log(`\nWikipedia AI section selection enabled:`)
      console.log(
        `  Model: ${this.config.wikipediaOptions.sectionSelectionModel || "gemini-flash"}`
      )
      console.log(`  Max sections: ${this.config.wikipediaOptions.maxSections || 10}`)
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
    for (const [key, value] of Object.entries({
      "enrichment.actor.id": actor.id,
      "enrichment.actor.name": actor.name,
      "enrichment.actor.tmdbId": actor.tmdbId || 0,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    const startTime = Date.now()
    const logEntries: ActorLogEntry[] = []
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
        lookupResult = await newrelic.startSegment(`Source/${source.name}`, true, async () => {
          return source.lookup(actor)
        })
      } catch (error) {
        // Handle SourceAccessBlockedError specially
        if (error instanceof SourceAccessBlockedError) {
          this.logger.sourceBlocked(actor.name, source.type, error.statusCode, error.url)
          this.statusBar.log(`    BLOCKED (${error.statusCode}) - flagged for review`)
          logEntries.push({
            timestamp: new Date().toISOString(),
            level: "warn",
            message: "[BLOCKED]",
            data: { source: source.name, statusCode: error.statusCode, url: error.url },
          })
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
            this.logger.sourceBlocked(actor.name, source.type, 408, "timeout")
            this.statusBar.log(
              `    TIMEOUT (${error.timeoutMs}ms) - high-priority source, flagged for review`
            )
          } else {
            this.statusBar.log(`    TIMEOUT (${error.timeoutMs}ms) - low-priority source, skipping`)
          }
          logEntries.push({
            timestamp: new Date().toISOString(),
            level: "warn",
            message: "[TIMEOUT]",
            data: {
              source: source.name,
              timeoutMs: error.timeoutMs,
              highPriority: error.isHighPriority,
            },
          })

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
        logEntries.push({
          timestamp: new Date().toISOString(),
          level: "warn",
          message: "[FAILED]",
          data: { source: source.name, error: lookupResult.error || "No data" },
        })

        // Record source failure in New Relic
        newrelic.recordCustomEvent("EnrichmentSourceFailed", {
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
      const srcReliability = source.reliabilityScore
      this.statusBar.log(
        `    Success! Content: ${lookupResult.source.confidence.toFixed(2)} | Reliability: ${srcReliability.toFixed(2)}`
      )
      logEntries.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "[SUCCESS]",
        data: {
          source: source.name,
          confidence: lookupResult.source.confidence,
          reliabilityTier: source.reliabilityTier,
          reliabilityScore: srcReliability,
          fieldsFound,
          costUsd: sourceCost,
        },
      })

      // Record source success in New Relic
      newrelic.recordCustomEvent("EnrichmentSourceSuccess", {
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
        const rawData = lookupResult.source.rawData as
          | {
              resolvedSources?: ResolvedUrl[]
              parsed?: { sources?: string[] }
            }
          | undefined

        // Check if source already resolved URLs (e.g., Gemini does this)
        let resolvedSources = rawData?.resolvedSources
        let sourceName = source.name // Default to AI provider name

        // If already resolved, use those
        if (resolvedSources && resolvedSources.length > 0 && !resolvedSources[0].error) {
          sourceName = resolvedSources[0].sourceName
          this.statusBar.log(
            `    Using pre-resolved source: ${sourceName} (${resolvedSources.length} URLs)`
          )
        } else {
          // Otherwise, try to resolve URLs from parsed sources
          const sourceUrls: string[] = []
          if (rawData?.parsed?.sources && Array.isArray(rawData.parsed.sources)) {
            sourceUrls.push(
              ...rawData.parsed.sources.filter((url): url is string => typeof url === "string")
            )
          }

          if (sourceUrls.length > 0) {
            try {
              resolvedSources = await resolveRedirectUrls(sourceUrls)
              // Use the first successful resolved source name
              const firstSuccess = resolvedSources.find((r) => !r.error)
              if (firstSuccess) {
                sourceName = firstSuccess.sourceName
                this.statusBar.log(`    Resolved ${resolvedSources.length} URLs (${sourceName})`)
              }

              // Write resolved sources back to rawData so they persist
              if (resolvedSources && resolvedSources.length > 0) {
                lookupResult.source.rawData = {
                  ...(lookupResult.source.rawData || {}),
                  resolvedSources,
                }
              }
            } catch (error) {
              // On error, log warning and continue with AI provider name
              const errorMsg = error instanceof Error ? error.message : "Unknown error"
              this.statusBar.log(`    URL resolution failed: ${errorMsg} - using ${source.name}`)
            }
          }
        }

        rawSources.push({
          sourceName,
          sourceType: source.type,
          text: lookupResult.data.circumstances,
          url: lookupResult.source.url || undefined,
          confidence: lookupResult.source.confidence,
          reliabilityTier: source.reliabilityTier,
          reliabilityScore: source.reliabilityScore,
          resolvedSources,
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
              const additionalRawData = additional.source.rawData as
                | {
                    resolvedSources?: ResolvedUrl[]
                    parsed?: { sources?: string[] }
                  }
                | undefined

              // Check if source already resolved URLs (e.g., Gemini does this)
              let additionalResolvedSources = additionalRawData?.resolvedSources
              let additionalSourceName = `${source.name} (additional)`

              // If already resolved, use those
              if (
                additionalResolvedSources &&
                additionalResolvedSources.length > 0 &&
                !additionalResolvedSources[0].error
              ) {
                additionalSourceName = `${additionalResolvedSources[0].sourceName} (additional)`
              } else {
                // Otherwise, try to resolve URLs from parsed sources
                const additionalUrls: string[] = []
                if (
                  additionalRawData?.parsed?.sources &&
                  Array.isArray(additionalRawData.parsed.sources)
                ) {
                  additionalUrls.push(
                    ...additionalRawData.parsed.sources.filter(
                      (url): url is string => typeof url === "string"
                    )
                  )
                }

                if (additionalUrls.length > 0) {
                  try {
                    additionalResolvedSources = await resolveRedirectUrls(additionalUrls)
                    // Use the first successful resolved source name
                    const firstSuccess = additionalResolvedSources.find((r) => !r.error)
                    if (firstSuccess) {
                      additionalSourceName = `${firstSuccess.sourceName} (additional)`
                    }

                    // Write resolved sources back to rawData so they persist
                    if (additionalResolvedSources && additionalResolvedSources.length > 0) {
                      additional.source.rawData = {
                        ...(additional.source.rawData || {}),
                        resolvedSources: additionalResolvedSources,
                      }
                    }
                  } catch {
                    // Silently continue with AI provider name on error
                  }
                }
              }

              rawSources.push({
                sourceName: additionalSourceName,
                sourceType: source.type,
                text: additional.data.circumstances,
                url: additional.source.url || undefined,
                confidence: additional.source.confidence,
                reliabilityTier: source.reliabilityTier,
                reliabilityScore: source.reliabilityScore,
                resolvedSources: additionalResolvedSources,
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

      // Dual-threshold stopping logic:
      // Stop if content confidence meets threshold AND (reliability is disabled OR reliability meets threshold)
      const contentMet = lookupResult.source.confidence >= this.config.confidenceThreshold
      const reliabilityThreshold = this.config.reliabilityThreshold ?? 0.6
      const useReliability = this.config.useReliabilityThreshold !== false
      const reliabilityMet = !useReliability || srcReliability >= reliabilityThreshold

      if (contentMet && reliabilityMet) {
        actorStats.finalSource = source.type
        actorStats.confidence = lookupResult.source.confidence
        this.statusBar.log(`    Both thresholds met, accepting result`)
        break
      } else if (contentMet && !reliabilityMet) {
        this.statusBar.log(
          `    Below reliability threshold (${srcReliability.toFixed(2)} < ${reliabilityThreshold.toFixed(2)}), continuing...`
        )
        logEntries.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "[RELIABILITY_BELOW_THRESHOLD]",
          data: {
            source: source.name,
            contentConfidence: lookupResult.source.confidence,
            reliabilityScore: srcReliability,
            reliabilityThreshold,
          },
        })
        // Track this as best-so-far in case no better source is found
        if (!actorStats.finalSource || lookupResult.source.confidence > actorStats.confidence) {
          actorStats.finalSource = source.type
          actorStats.confidence = lookupResult.source.confidence
        }
      }
    }

    // After gathering, run Claude cleanup if enabled and we have raw data
    if (isCleanupMode && rawSources.length > 0) {
      this.statusBar.log(`  Running Claude Opus 4.5 cleanup on ${rawSources.length} sources...`)
      try {
        // Wrap Claude cleanup in New Relic segment
        const cleanupResult = await newrelic.startSegment("ClaudeCleanup", true, async () => {
          return cleanupWithClaude(actor, rawSources)
        })
        const { cleaned, costUsd, prompt, responseText, inputTokens, outputTokens } = cleanupResult

        // Log Claude request/response
        logEntries.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "[CLAUDE_REQUEST]",
          data: { sourceCount: rawSources.length, promptLength: prompt.length, prompt },
        })
        logEntries.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "[CLAUDE_RESPONSE]",
          data: { inputTokens, outputTokens, costUsd, response: responseText },
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
        newrelic.recordCustomEvent("EnrichmentClaudeCleanup", {
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
        logEntries.push({
          timestamp: new Date().toISOString(),
          level: "error",
          message: "[CLAUDE_ERROR]",
          data: { error: errorMsg },
        })

        // Record cleanup error in New Relic
        if (error instanceof Error) {
          newrelic.noticeError(error, { actorId: actor.id, actorName: actor.name })
        }
        newrelic.recordCustomEvent("EnrichmentClaudeCleanupError", {
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
    newrelic.recordCustomEvent("EnrichmentActorComplete", {
      actorId: actor.id,
      actorName: actor.name,
      sourcesAttempted: actorStats.sourcesAttempted.length,
      sourcesSucceeded: actorStats.sourcesAttempted.filter((s) => s.success).length,
      fieldsEnriched: actorStats.fieldsFilledAfter.length,
      totalCostUsd: actorStats.totalCostUsd,
      totalTimeMs: actorStats.totalTimeMs,
    })

    // Add completion entry
    logEntries.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message: "[COMPLETE]",
      data: {
        totalTimeMs: actorStats.totalTimeMs,
        totalCostUsd: actorStats.totalCostUsd,
        fieldsEnriched: actorStats.fieldsFilledAfter,
      },
    })

    // Attach actorStats and logEntries to result for callers to access full tracking data
    result.actorStats = actorStats
    result.logEntries = logEntries

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
    // Career context fields
    if (data.lastProject) fields.push("lastProject")
    if (data.careerStatusAtDeath) fields.push("careerStatusAtDeath")
    if (data.posthumousReleases && data.posthumousReleases.length > 0)
      fields.push("posthumousReleases")
    if (data.relatedDeaths) fields.push("relatedDeaths")
    return fields
  }

  /**
   * Enrich a batch of actors.
   * @throws {CostLimitExceededError} If total cost limit is exceeded
   */
  async enrichBatch(actors: ActorForEnrichment[]): Promise<Map<number, ExtendedEnrichmentResult>> {
    const results = new Map<number, ExtendedEnrichmentResult>()

    // Record batch start in New Relic
    for (const [key, value] of Object.entries({
      "enrichment.batch.totalActors": actors.length,
      "enrichment.batch.maxTotalCost": this.config.costLimits?.maxTotalCost || 0,
    })) {
      newrelic.addCustomAttribute(key, value)
    }
    newrelic.recordCustomEvent("EnrichmentBatchStart", {
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
            setActiveStatusBar(null)
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
      // Always stop the status bar and clear the global reference
      this.statusBar.stop()
      setActiveStatusBar(null)
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
    newrelic.recordCustomEvent("EnrichmentBatchComplete", {
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
    mergeEnrichmentData(result, data, source)
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
    // Career context fields
    if (result.lastProject) fields.push("lastProject")
    if (result.careerStatusAtDeath) fields.push("careerStatusAtDeath")
    if (result.posthumousReleases && result.posthumousReleases.length > 0)
      fields.push("posthumousReleases")
    if (result.relatedDeaths) fields.push("relatedDeaths")
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
