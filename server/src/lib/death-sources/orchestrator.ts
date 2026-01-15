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
} from "./types.js"
import { DataSourceType, CostLimitExceededError } from "./types.js"
import { StatusBar } from "./status-bar.js"
import { WikidataSource } from "./sources/wikidata.js"
import { DuckDuckGoSource } from "./sources/duckduckgo.js"
import { FindAGraveSource } from "./sources/findagrave.js"
import { LegacySource } from "./sources/legacy.js"
import { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
import { PerplexitySource } from "./ai-providers/perplexity.js"
import { DeepSeekSource } from "./ai-providers/deepseek.js"

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
}

/**
 * Main orchestrator for death information enrichment.
 */
export class DeathEnrichmentOrchestrator {
  private config: EnrichmentConfig
  private sources: DataSource[] = []
  private stats: BatchEnrichmentStats
  private statusBar: StatusBar

  constructor(config: Partial<EnrichmentConfig> = {}, enableStatusBar = true) {
    this.config = { ...DEFAULT_CONFIG, ...config }
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
    const freeSources: DataSource[] = [
      new WikidataSource(),
      new DuckDuckGoSource(),
      new FindAGraveSource(),
      new LegacySource(),
      // Add more free sources as they are implemented:
      // new WikipediaSource(),
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
        new DeepSeekSource(), // ~$0.0005/query - cheapest AI option
        new GPT4oMiniSource(), // ~$0.0003/query
        new PerplexitySource(), // ~$0.005/query (but has web search!)
        new GPT4oSource(), // ~$0.01/query
        // Add more as implemented:
        // new GrokSource(),
      ]
      for (const source of aiSources) {
        if (source.isAvailable()) {
          this.sources.push(source)
        }
      }
    }

    console.log(`Initialized ${this.sources.length} data sources:`)
    for (const source of this.sources) {
      console.log(`  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`})`)
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
  async enrichActor(actor: ActorForEnrichment): Promise<EnrichmentResult> {
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

    const result: EnrichmentResult = {}

    // Try each source in order until we have enough data
    for (const source of this.sources) {
      const sourceStartTime = Date.now()

      this.statusBar.setCurrentSource(source.name)
      this.statusBar.log(`  Trying ${source.name}...`)
      const lookupResult = await source.lookup(actor)

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

      // Track cost breakdown by source
      this.addCostToBreakdown(costBreakdown, source.type, sourceCost)

      // Update status bar with new cost
      if (sourceCost > 0) {
        this.statusBar.addCost(sourceCost)
      }

      // Check per-actor cost limit
      if (this.config.costLimits?.maxCostPerActor !== undefined) {
        if (actorStats.totalCostUsd >= this.config.costLimits.maxCostPerActor) {
          this.statusBar.log(`    Cost limit reached for actor ($${actorStats.totalCostUsd.toFixed(4)} >= $${this.config.costLimits.maxCostPerActor})`)
          // Update stats before stopping
          actorStats.totalTimeMs = Date.now() - startTime
          actorStats.fieldsFilledAfter = this.getFilledFieldsFromResult(result)
          this.updateBatchStats(actorStats)
          // Return what we have so far
          return result
        }
      }

      if (!lookupResult.success || !lookupResult.data) {
        this.statusBar.log(`    Failed: ${lookupResult.error || "No data"}`)
        continue
      }

      this.statusBar.log(`    Success! Confidence: ${lookupResult.source.confidence.toFixed(2)}`)

      // Merge data into result
      this.mergeData(result, lookupResult.data, lookupResult.source)

      // Check if we have enough data
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

    actorStats.totalTimeMs = Date.now() - startTime
    actorStats.fieldsFilledAfter = this.getFilledFieldsFromResult(result)

    // Update batch stats
    this.updateBatchStats(actorStats)

    // Mark actor complete in status bar
    this.statusBar.completeActor()
    this.statusBar.log(`  Complete in ${actorStats.totalTimeMs}ms, cost: $${actorStats.totalCostUsd.toFixed(4)}`)
    this.statusBar.log(`  Fields filled: ${actorStats.fieldsFilledAfter.join(", ") || "none"}`)

    return result
  }

  /**
   * Enrich a batch of actors.
   * @throws {CostLimitExceededError} If total cost limit is exceeded
   */
  async enrichBatch(actors: ActorForEnrichment[]): Promise<Map<number, EnrichmentResult>> {
    const results = new Map<number, EnrichmentResult>()

    // Start the status bar
    this.statusBar.start(actors.length)

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
            console.log(`TOTAL COST LIMIT REACHED: $${this.stats.totalCostUsd.toFixed(4)} >= $${this.config.costLimits.maxTotalCost}`)
            console.log(`Processed ${i + 1} of ${actors.length} actors before limit`)
            console.log(`${"!".repeat(60)}`)

            // Print stats before throwing
            this.printBatchStats()

            throw new CostLimitExceededError(
              `Total cost limit of $${this.config.costLimits.maxTotalCost} exceeded`,
              "total",
              this.stats.totalCostUsd,
              this.config.costLimits.maxTotalCost
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

    return results
  }

  /**
   * Get current batch statistics.
   */
  getStats(): BatchEnrichmentStats {
    return { ...this.stats }
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
  }

  /**
   * Check if we have enough data to stop searching.
   */
  private hasEnoughData(result: EnrichmentResult): boolean {
    // We need at least circumstances or notable factors
    return !!(
      result.circumstances ||
      (result.notableFactors && result.notableFactors.length > 0)
    )
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
    if (result.relatedCelebrities && result.relatedCelebrities.length > 0) fields.push("relatedCelebrities")
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
        this.stats.actorsProcessed > 0
          ? ((count as number) / this.stats.actorsProcessed) * 100
          : 0
      console.log(`  ${source}: ${rate.toFixed(1)}%`)
    }

    // Print cost breakdown by source
    const costEntries = Object.entries(this.stats.costBySource).filter(([, cost]) => cost > 0)
    if (costEntries.length > 0) {
      console.log(`\nCost Breakdown by Source:`)
      // Sort by cost descending
      costEntries.sort((a, b) => (b[1] as number) - (a[1] as number))
      for (const [source, cost] of costEntries) {
        const percentage = this.stats.totalCostUsd > 0
          ? ((cost as number) / this.stats.totalCostUsd) * 100
          : 0
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
