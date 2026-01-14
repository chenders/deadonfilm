/**
 * Death Enrichment Orchestrator
 *
 * Coordinates multiple data sources to enrich actor death information.
 * Implements cost-optimized processing order: free sources first, then cheapest paid sources.
 */

import type {
  ActorForEnrichment,
  BatchEnrichmentStats,
  DataSource,
  EnrichmentConfig,
  EnrichmentData,
  EnrichmentResult,
  EnrichmentSourceEntry,
  EnrichmentStats,
  SourceAttemptStats,
} from "./types.js"
import { DataSourceType } from "./types.js"
import { WikidataSource } from "./sources/wikidata.js"
import { DuckDuckGoSource } from "./sources/duckduckgo.js"

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

  constructor(config: Partial<EnrichmentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initializeSources()
    this.stats = this.createEmptyStats()
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
      // Add more free sources as they are implemented:
      // new WikipediaSource(),
      // new FindAGraveSource(),
      // new LegacySource(),
    ]

    // Filter based on configuration
    if (this.config.sourceCategories.free) {
      for (const source of freeSources) {
        if (source.isAvailable()) {
          this.sources.push(source)
        }
      }
    }

    // Paid sources - ordered by cost (cheapest first)
    // if (this.config.sourceCategories.paid) {
    //   const paidSources: DataSource[] = [
    //     // Add paid sources as they are implemented
    //   ]
    //   for (const source of paidSources) {
    //     if (source.isAvailable()) {
    //       this.sources.push(source)
    //     }
    //   }
    // }

    // AI sources - ordered by cost (cheapest first)
    // if (this.config.sourceCategories.ai) {
    //   const aiSources: DataSource[] = [
    //     // Add AI sources as they are implemented:
    //     // new DeepSeekSource(),
    //     // new GPT4oMiniSource(),
    //     // new PerplexitySource(),
    //   ]
    //   for (const source of aiSources) {
    //     if (source.isAvailable()) {
    //       this.sources.push(source)
    //     }
    //   }
    // }

    console.log(`Initialized ${this.sources.length} data sources:`)
    for (const source of this.sources) {
      console.log(`  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`})`)
    }
  }

  /**
   * Enrich death information for a single actor.
   */
  async enrichActor(actor: ActorForEnrichment): Promise<EnrichmentResult> {
    const startTime = Date.now()
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
    }

    console.log(`\nEnriching: ${actor.name} (ID: ${actor.id})`)

    const result: EnrichmentResult = {}

    // Try each source in order until we have enough data
    for (const source of this.sources) {
      const sourceStartTime = Date.now()

      console.log(`  Trying ${source.name}...`)
      const lookupResult = await source.lookup(actor)

      // Record stats
      const attemptStats: SourceAttemptStats = {
        source: source.type,
        success: lookupResult.success,
        timeMs: Date.now() - sourceStartTime,
        costUsd: lookupResult.source.costUsd,
        error: lookupResult.error,
      }
      actorStats.sourcesAttempted.push(attemptStats)
      actorStats.totalCostUsd += attemptStats.costUsd || 0

      if (!lookupResult.success || !lookupResult.data) {
        console.log(`    Failed: ${lookupResult.error || "No data"}`)
        continue
      }

      console.log(`    Success! Confidence: ${lookupResult.source.confidence.toFixed(2)}`)

      // Merge data into result
      this.mergeData(result, lookupResult.data, lookupResult.source)

      // Check if we have enough data
      if (this.config.stopOnMatch && this.hasEnoughData(result)) {
        console.log(`    Stopping - sufficient data collected`)
        actorStats.finalSource = source.type
        actorStats.confidence = lookupResult.source.confidence
        break
      }

      // Check confidence threshold
      if (lookupResult.source.confidence >= this.config.confidenceThreshold) {
        actorStats.finalSource = source.type
        actorStats.confidence = lookupResult.source.confidence
        if (this.config.stopOnMatch) {
          console.log(`    Stopping - confidence threshold met`)
          break
        }
      }
    }

    actorStats.totalTimeMs = Date.now() - startTime
    actorStats.fieldsFilledAfter = this.getFilledFieldsFromResult(result)

    // Update batch stats
    this.updateBatchStats(actorStats)

    console.log(`  Complete in ${actorStats.totalTimeMs}ms, cost: $${actorStats.totalCostUsd.toFixed(4)}`)
    console.log(`  Fields filled: ${actorStats.fieldsFilledAfter.join(", ") || "none"}`)

    return result
  }

  /**
   * Enrich a batch of actors.
   */
  async enrichBatch(actors: ActorForEnrichment[]): Promise<Map<number, EnrichmentResult>> {
    const results = new Map<number, EnrichmentResult>()

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Starting batch enrichment for ${actors.length} actors`)
    console.log(`Sources: ${this.sources.map((s) => s.name).join(", ")}`)
    console.log(`${"=".repeat(60)}`)

    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i]
      console.log(`\n[${i + 1}/${actors.length}] Processing ${actor.name}`)

      const result = await this.enrichActor(actor)
      results.set(actor.id, result)

      // Add delay between actors to be respectful to APIs
      if (i < actors.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
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

    // Update source hit rates
    for (const attempt of actorStats.sourcesAttempted) {
      if (!this.stats.sourceHitRates[attempt.source]) {
        this.stats.sourceHitRates[attempt.source] = 0
      }
      if (attempt.success) {
        this.stats.sourceHitRates[attempt.source]++
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
