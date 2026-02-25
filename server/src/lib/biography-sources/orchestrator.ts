/**
 * Biography Enrichment Orchestrator
 *
 * Coordinates multiple biography data sources to enrich actor biographies with
 * personal life information (childhood, education, family, relationships,
 * pre-fame life). All raw source data is accumulated and sent to Claude
 * synthesis (Stage 3) for structured narrative generation.
 *
 * Simpler than the death enrichment orchestrator:
 * - No StatusBar
 * - No URL resolution
 * - No browser fetching
 * - No first-wins merge — all raw data goes to Claude synthesis
 */

import newrelic from "newrelic"
import { RunLogger } from "../run-logger.js"
import type {
  ActorForBiography,
  BiographyEnrichmentConfig,
  BiographyResult,
  RawBiographySourceData,
  BiographySourceEntry,
} from "./types.js"
import { DEFAULT_BIOGRAPHY_CONFIG, BiographySourceType } from "./types.js"
import { BaseBiographySource } from "./base-source.js"
import { BiographyWebSearchBase } from "./sources/web-search-base.js"
import { synthesizeBiography } from "./claude-cleanup.js"

// Source imports — Structured Data (free)
import { WikidataBiographySource } from "./sources/wikidata.js"
import { WikipediaBiographySource } from "./sources/wikipedia.js"

// Source imports — Reference Sites
import { BritannicaBiographySource } from "./sources/britannica.js"
import { BiographyComSource } from "./sources/biography-com.js"

// Source imports — Web Search
import { GoogleBiographySearch } from "./sources/google-search.js"
import { BingBiographySearch } from "./sources/bing-search.js"
import { DuckDuckGoBiographySearch } from "./sources/duckduckgo.js"
import { BraveBiographySearch } from "./sources/brave-search.js"

// Source imports — News
import { GuardianBiographySource } from "./sources/guardian.js"
import { NYTimesBiographySource } from "./sources/nytimes.js"
import { APNewsBiographySource } from "./sources/ap-news.js"
import { BBCNewsBiographySource } from "./sources/bbc-news.js"
import { PeopleBiographySource } from "./sources/people.js"

// Source imports — Obituary Sites
import { LegacyBiographySource } from "./sources/legacy.js"
import { FindAGraveBiographySource } from "./sources/findagrave.js"

// Source imports — Historical Archives
import { InternetArchiveBiographySource } from "./sources/internet-archive.js"
import { ChroniclingAmericaBiographySource } from "./sources/chronicling-america.js"
import { TroveBiographySource } from "./sources/trove.js"
import { EuropeanaBiographySource } from "./sources/europeana.js"

// Source imports — Books/Publications
import { GoogleBooksBiographySource } from "./sources/google-books.js"
import { OpenLibraryBiographySource } from "./sources/open-library.js"
import { IABooksBiographySource } from "./sources/ia-books.js"

/**
 * Book source types — these are always tried regardless of early stopping.
 * Books provide unique archival content not found in web sources.
 */
const BOOK_SOURCE_TYPES = new Set<BiographySourceType>([
  BiographySourceType.GOOGLE_BOOKS_BIO,
  BiographySourceType.OPEN_LIBRARY_BIO,
  BiographySourceType.IA_BOOKS_BIO,
])

/**
 * Source families that share the same upstream data. Sources within the same
 * family count as a single high-quality source for early-stopping purposes.
 * This prevents e.g. Wikidata + Wikipedia (both Wikimedia Foundation) from
 * counting as two distinct sources when they largely overlap.
 */
const SOURCE_FAMILIES: Record<string, BiographySourceType[]> = {
  wikimedia: [BiographySourceType.WIKIDATA_BIO, BiographySourceType.WIKIPEDIA_BIO],
  books: [
    BiographySourceType.GOOGLE_BOOKS_BIO,
    BiographySourceType.OPEN_LIBRARY_BIO,
    BiographySourceType.IA_BOOKS_BIO,
  ],
}

/** Build a reverse lookup from source type → family key */
function buildFamilyLookup(): Map<BiographySourceType, string> {
  const lookup = new Map<BiographySourceType, string>()
  for (const [family, types] of Object.entries(SOURCE_FAMILIES)) {
    for (const type of types) {
      lookup.set(type, family)
    }
  }
  return lookup
}

const SOURCE_FAMILY_LOOKUP = buildFamilyLookup()

/**
 * Main orchestrator for biography enrichment.
 *
 * Tries sources in priority order, accumulates raw data from all successful
 * sources, then runs Claude synthesis to produce structured BiographyData.
 */
export class BiographyEnrichmentOrchestrator {
  private config: BiographyEnrichmentConfig
  private sources: BaseBiographySource[]
  private runLogger: RunLogger | null = null

  /**
   * Set the RunLogger for capturing structured logs to the run_logs DB table.
   * Call this once the enrichment run_id is known (after creating the enrichment_runs record).
   */
  setRunLogger(runLogger: RunLogger): void {
    this.runLogger = runLogger
  }

  constructor(config?: Partial<BiographyEnrichmentConfig>) {
    this.config = {
      ...DEFAULT_BIOGRAPHY_CONFIG,
      ...config,
      // Deep-merge nested objects so that passing e.g. { sourceCategories: undefined }
      // doesn't overwrite the defaults with undefined
      sourceCategories: {
        ...DEFAULT_BIOGRAPHY_CONFIG.sourceCategories,
        ...(config?.sourceCategories ?? {}),
      },
      costLimits: {
        ...DEFAULT_BIOGRAPHY_CONFIG.costLimits,
        ...(config?.costLimits ?? {}),
      },
      contentCleaning: {
        ...DEFAULT_BIOGRAPHY_CONFIG.contentCleaning,
        ...(config?.contentCleaning ?? {}),
      },
    }
    // Clamp earlyStopSourceCount to a sane minimum
    const raw = this.config.earlyStopSourceCount
    if (!Number.isFinite(raw) || raw < 1) {
      this.config.earlyStopSourceCount = DEFAULT_BIOGRAPHY_CONFIG.earlyStopSourceCount
    } else {
      this.config.earlyStopSourceCount = Math.floor(raw)
    }
    this.sources = this.initializeSources()
  }

  /**
   * Initialize data sources based on configuration.
   * Filters by source category and availability.
   */
  private initializeSources(): BaseBiographySource[] {
    const sources: BaseBiographySource[] = []

    // Phase 1: Free structured data (Wikidata, Wikipedia)
    if (this.config.sourceCategories.free) {
      const freeSources: BaseBiographySource[] = [
        new WikidataBiographySource(),
        new WikipediaBiographySource(),
      ]
      for (const source of freeSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 2: Reference sites (Britannica, Biography.com)
    if (this.config.sourceCategories.reference) {
      const referenceSources: BaseBiographySource[] = [
        new BritannicaBiographySource(),
        new BiographyComSource(),
      ]
      for (const source of referenceSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 2.5: Books/Publications (Google Books, Open Library, IA Books)
    if (this.config.sourceCategories.books) {
      const bookSources: BaseBiographySource[] = [
        new GoogleBooksBiographySource(),
        new OpenLibraryBiographySource(),
        new IABooksBiographySource(),
      ]
      for (const source of bookSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 3: Web search (Google, Bing, DuckDuckGo, Brave)
    if (this.config.sourceCategories.webSearch) {
      const webSearchSources: BaseBiographySource[] = [
        new GoogleBiographySearch(),
        new BingBiographySearch(),
        new DuckDuckGoBiographySearch(),
        new BraveBiographySearch(),
      ]
      for (const source of webSearchSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 4: News sources (Guardian, NYT, AP, BBC, People)
    if (this.config.sourceCategories.news) {
      const newsSources: BaseBiographySource[] = [
        new GuardianBiographySource(),
        new NYTimesBiographySource(),
        new APNewsBiographySource(),
        new BBCNewsBiographySource(),
        new PeopleBiographySource(),
      ]
      for (const source of newsSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 5: Obituary sites (Legacy, FindAGrave)
    if (this.config.sourceCategories.obituary) {
      const obituarySources: BaseBiographySource[] = [
        new LegacyBiographySource(),
        new FindAGraveBiographySource(),
      ]
      for (const source of obituarySources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Phase 6: Historical archives
    if (this.config.sourceCategories.archives) {
      const archiveSources: BaseBiographySource[] = [
        new InternetArchiveBiographySource(),
        new ChroniclingAmericaBiographySource(),
        new TroveBiographySource(),
        new EuropeanaBiographySource(),
      ]
      for (const source of archiveSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }

    // Configure web search AI cleaning if enabled
    if (this.config.contentCleaning.haikuEnabled && !this.config.contentCleaning.mechanicalOnly) {
      for (const source of sources) {
        if (source instanceof BiographyWebSearchBase) {
          source.setConfig({ useAiCleaning: true })
        }
      }
    }

    console.log(`Initialized ${sources.length} biography sources:`)
    for (const source of sources) {
      console.log(
        `  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`}, reliability: ${source.reliabilityScore.toFixed(2)})`
      )
    }
    this.runLogger?.info("Sources initialized", {
      sourceCount: sources.length,
      sourceNames: sources.map((s) => s.name),
    })

    return sources
  }

  /**
   * Enrich a single actor with biography data.
   *
   * Tries sources in priority order, accumulates raw data from successful lookups,
   * then runs Claude synthesis to produce structured BiographyData.
   */
  async enrichActor(actor: ActorForBiography): Promise<BiographyResult> {
    const startTime = Date.now()
    let totalCost = 0
    let totalSourceCost = 0
    let totalSynthesisCost = 0
    let sourcesAttempted = 0
    let sourcesSucceeded = 0
    const allSources: BiographySourceEntry[] = []
    const rawSources: RawBiographySourceData[] = []
    const highQualityFamilies = new Set<string>()

    // Find the last book source index so early stopping is deferred until after all books
    let lastBookSourceIndex = -1
    for (let i = this.sources.length - 1; i >= 0; i--) {
      if (BOOK_SOURCE_TYPES.has(this.sources[i].type)) {
        lastBookSourceIndex = i
        break
      }
    }

    // Add New Relic attributes for this actor
    for (const [key, value] of Object.entries({
      "bio.actor.id": actor.id,
      "bio.actor.name": actor.name,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    console.log(`\nEnriching biography: ${actor.name} (ID: ${actor.id})`)
    this.runLogger?.info("Processing actor", { actorId: actor.id, actorName: actor.name })

    // Try each source in order
    for (let sourceIndex = 0; sourceIndex < this.sources.length; sourceIndex++) {
      const source = this.sources[sourceIndex]

      // Early stopping gate: skip remaining non-book sources once threshold is met
      // and all book sources have been processed
      if (
        highQualityFamilies.size >= this.config.earlyStopSourceCount &&
        sourceIndex > lastBookSourceIndex &&
        !BOOK_SOURCE_TYPES.has(source.type)
      ) {
        console.log(
          `    ${highQualityFamilies.size} distinct high-quality source families collected, stopping early to save cost`
        )
        this.runLogger?.info("Early stop triggered", {
          actorId: actor.id,
          highQualityFamilies: highQualityFamilies.size,
          sourcesAttempted,
          costUsd: totalCost,
        })
        newrelic.recordCustomEvent("BioEarlyStop", {
          actorId: actor.id,
          actorName: actor.name,
          highQualityFamilyCount: highQualityFamilies.size,
          sourcesAttempted,
          totalCostUsd: totalCost,
        })
        break
      }

      sourcesAttempted++

      console.log(`  Trying ${source.name}...`)

      try {
        // Wrap source lookup in New Relic segment
        const lookupResult = await newrelic.startSegment(
          `BioSource/${source.name}`,
          true,
          async () => {
            return source.lookup(actor)
          }
        )

        // Track cost
        const sourceCost = lookupResult.source.costUsd || 0
        totalCost += sourceCost
        totalSourceCost += sourceCost

        // Record source attempt
        allSources.push(lookupResult.source)

        if (!lookupResult.success || !lookupResult.data) {
          console.log(`    Failed: ${lookupResult.error || "No data"}`)
          this.runLogger?.debug("Source failed", {
            actorId: actor.id,
            error: lookupResult.error || "No data",
          }, source.name)
          newrelic.recordCustomEvent("BioSourceFailed", {
            actorId: actor.id,
            actorName: actor.name,
            source: source.name,
            sourceType: source.type,
            error: lookupResult.error || "No data",
          })
          continue
        }

        // Successful lookup
        sourcesSucceeded++
        const srcReliability = source.reliabilityScore
        console.log(
          `    Success! Content: ${lookupResult.source.confidence.toFixed(2)} | Reliability: ${srcReliability.toFixed(2)}`
        )
        this.runLogger?.info("Source success", {
          actorId: actor.id,
          confidence: lookupResult.source.confidence,
          reliability: srcReliability,
          costUsd: sourceCost,
        }, source.name)

        // Accumulate raw data for synthesis
        rawSources.push(lookupResult.data)

        // Check dual threshold for high-quality source counting
        const contentMet = lookupResult.source.confidence >= this.config.confidenceThreshold
        const reliabilityMet =
          !this.config.useReliabilityThreshold || srcReliability >= this.config.reliabilityThreshold
        const isHighQuality = contentMet && reliabilityMet

        newrelic.recordCustomEvent("BioSourceSuccess", {
          actorId: actor.id,
          actorName: actor.name,
          source: source.name,
          sourceType: source.type,
          confidence: lookupResult.source.confidence,
          reliabilityScore: srcReliability,
          costUsd: sourceCost,
          isFree: source.isFree,
          isHighQuality,
        })

        if (isHighQuality) {
          // Use source family key if available, otherwise the source type itself
          const familyKey = SOURCE_FAMILY_LOOKUP.get(source.type) ?? source.type
          highQualityFamilies.add(familyKey)
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.log(`    Error: ${errorMsg}`)
        this.runLogger?.error("Source error", {
          actorId: actor.id,
          error: errorMsg,
        }, source.name)
        newrelic.recordCustomEvent("BioSourceFailed", {
          actorId: actor.id,
          actorName: actor.name,
          source: source.name,
          sourceType: source.type,
          error: errorMsg,
        })
        // Continue to next source
        continue
      }

      // Check per-actor cost limit
      if (totalCost >= this.config.costLimits.maxCostPerActor) {
        console.log(
          `    Per-actor cost limit reached ($${totalCost.toFixed(4)} >= $${this.config.costLimits.maxCostPerActor})`
        )
        this.runLogger?.warn("Per-actor cost limit reached", {
          actorId: actor.id,
          actorName: actor.name,
          costUsd: totalCost,
          limit: this.config.costLimits.maxCostPerActor,
        })
        newrelic.recordCustomEvent("BioCostLimitPerActor", {
          actorId: actor.id,
          actorName: actor.name,
          totalCostUsd: totalCost,
          costLimit: this.config.costLimits.maxCostPerActor,
        })
        break
      }
    }

    // Run Claude synthesis if we have raw sources
    let synthesisData = null
    if (rawSources.length > 0) {
      console.log(`  Running Claude synthesis on ${rawSources.length} sources...`)
      try {
        // Wrap Claude synthesis in New Relic segment
        const synthesisResult = await newrelic.startSegment(
          "BioClaudeSynthesis",
          true,
          async () => {
            return synthesizeBiography(actor, rawSources, {
              model: this.config.synthesisModel,
            })
          }
        )

        totalCost += synthesisResult.costUsd
        totalSynthesisCost += synthesisResult.costUsd
        synthesisData = synthesisResult.data

        if (synthesisResult.error) {
          console.log(`    Synthesis error: ${synthesisResult.error}`)
          this.runLogger?.error("Claude synthesis error", {
            actorId: actor.id,
            error: synthesisResult.error,
            sourceCount: rawSources.length,
          })
          newrelic.recordCustomEvent("BioSynthesisError", {
            actorId: actor.id,
            actorName: actor.name,
            error: synthesisResult.error,
            sourceCount: rawSources.length,
          })
        } else {
          console.log(`    Synthesis complete, cost: $${synthesisResult.costUsd.toFixed(4)}`)
          this.runLogger?.info("Claude synthesis complete", {
            actorId: actor.id,
            sourceCount: rawSources.length,
            costUsd: synthesisResult.costUsd,
            hasNarrative: !!synthesisData?.narrative,
            narrativeConfidence: synthesisData?.narrativeConfidence || "unknown",
          })
          newrelic.recordCustomEvent("BioSynthesisSuccess", {
            actorId: actor.id,
            actorName: actor.name,
            sourceCount: rawSources.length,
            costUsd: synthesisResult.costUsd,
            hasNarrative: !!synthesisData?.narrative,
            narrativeConfidence: synthesisData?.narrativeConfidence || "unknown",
            factorCount: synthesisData?.lifeNotableFactors?.length || 0,
            lesserKnownFactCount: synthesisData?.lesserKnownFacts?.length || 0,
          })
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.log(`    Synthesis failed: ${errorMsg}`)
        this.runLogger?.error("Claude synthesis failed", {
          actorId: actor.id,
          error: errorMsg,
          sourceCount: rawSources.length,
        })
        newrelic.recordCustomEvent("BioSynthesisError", {
          actorId: actor.id,
          actorName: actor.name,
          error: errorMsg,
          sourceCount: rawSources.length,
        })
        if (error instanceof Error) {
          newrelic.noticeError(error, { actorId: actor.id, actorName: actor.name })
        }
      }
    } else {
      console.log(`  No source data collected, skipping synthesis`)
      this.runLogger?.warn("No source data collected", {
        actorId: actor.id,
        actorName: actor.name,
        sourcesAttempted,
      })
      newrelic.recordCustomEvent("BioNoSourceData", {
        actorId: actor.id,
        actorName: actor.name,
        sourcesAttempted,
      })
    }

    const processingTimeMs = Date.now() - startTime
    console.log(
      `  Complete in ${processingTimeMs}ms, cost: $${totalCost.toFixed(4)} (source: $${totalSourceCost.toFixed(4)}, synthesis: $${totalSynthesisCost.toFixed(4)}), sources: ${sourcesSucceeded}/${sourcesAttempted}`
    )
    this.runLogger?.info("Actor complete", {
      actorId: actor.id,
      actorName: actor.name,
      timeMs: processingTimeMs,
      costUsd: totalCost,
      sourceCostUsd: totalSourceCost,
      synthesisCostUsd: totalSynthesisCost,
      sourcesAttempted,
      sourcesSucceeded,
      hasSynthesisData: !!synthesisData,
    })

    // Record actor completion in New Relic
    newrelic.recordCustomEvent("BioActorComplete", {
      actorId: actor.id,
      actorName: actor.name,
      sourcesAttempted,
      sourcesSucceeded,
      highQualityFamilies: highQualityFamilies.size,
      hasSynthesisData: !!synthesisData,
      totalCostUsd: totalCost,
      totalTimeMs: processingTimeMs,
    })

    const result: BiographyResult = {
      actorId: actor.id,
      data: synthesisData,
      sources: allSources,
      rawSources,
      cleanedData: synthesisData ?? undefined,
      stats: {
        sourcesAttempted,
        sourcesSucceeded,
        totalCostUsd: totalCost,
        sourceCostUsd: totalSourceCost,
        synthesisCostUsd: totalSynthesisCost,
        processingTimeMs,
      },
    }

    // Set error if no data at all
    if (!synthesisData && rawSources.length === 0) {
      result.error = "No biographical data found from any source"
    } else if (!synthesisData && rawSources.length > 0) {
      result.error = "Sources collected but synthesis failed"
    }

    return result
  }

  /**
   * Enrich a batch of actors with biography data.
   *
   * Processes actors sequentially to avoid rate limits. Respects batch-level
   * total cost limit.
   */
  async enrichBatch(actors: ActorForBiography[]): Promise<Map<number, BiographyResult>> {
    const batchStartTime = Date.now()
    const results = new Map<number, BiographyResult>()
    let batchTotalCost = 0

    // Record batch start in New Relic
    for (const [key, value] of Object.entries({
      "bio.batch.totalActors": actors.length,
      "bio.batch.maxTotalCost": this.config.costLimits.maxTotalCost,
    })) {
      newrelic.addCustomAttribute(key, value)
    }
    newrelic.recordCustomEvent("BioEnrichmentBatchStart", {
      totalActors: actors.length,
      maxTotalCost: this.config.costLimits.maxTotalCost,
      maxCostPerActor: this.config.costLimits.maxCostPerActor,
      earlyStopSourceCount: this.config.earlyStopSourceCount,
      confidenceThreshold: this.config.confidenceThreshold,
      sourceCount: this.sources.length,
      sourceNames: this.sources.map((s) => s.name).join(","),
    })

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Starting biography batch enrichment for ${actors.length} actors`)
    console.log(`Sources: ${this.sources.map((s) => s.name).join(", ")}`)
    console.log(`Per-actor cost limit: $${this.config.costLimits.maxCostPerActor}`)
    console.log(`Total cost limit: $${this.config.costLimits.maxTotalCost}`)
    console.log(`${"=".repeat(60)}`)
    this.runLogger?.info("Batch started", {
      actorCount: actors.length,
      sourceCount: this.sources.length,
      maxTotalCost: this.config.costLimits.maxTotalCost,
      maxCostPerActor: this.config.costLimits.maxCostPerActor,
    })

    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i]
      console.log(`\n[${i + 1}/${actors.length}] Processing ${actor.name}`)

      const result = await this.enrichActor(actor)
      results.set(actor.id, result)

      batchTotalCost += result.stats.totalCostUsd

      // Check batch total cost limit
      if (batchTotalCost >= this.config.costLimits.maxTotalCost) {
        console.log(
          `\nBatch total cost limit reached ($${batchTotalCost.toFixed(4)} >= $${this.config.costLimits.maxTotalCost})`
        )
        console.log(`Processed ${i + 1} of ${actors.length} actors before limit`)
        this.runLogger?.warn("Total cost limit reached", {
          costUsd: batchTotalCost,
          limit: this.config.costLimits.maxTotalCost,
          actorsProcessed: i + 1,
          totalActors: actors.length,
        })
        newrelic.recordCustomEvent("BioEnrichmentBatchCostLimit", {
          actorsProcessed: i + 1,
          totalActors: actors.length,
          totalCostUsd: batchTotalCost,
          costLimit: this.config.costLimits.maxTotalCost,
        })
        await this.runLogger?.flush()
        break
      }

      // Add delay between actors to be respectful to APIs
      if (i < actors.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // Log batch summary
    const enrichedCount = Array.from(results.values()).filter((r) => r.data !== null).length
    const batchTotalTimeMs = Date.now() - batchStartTime
    const fillRate = results.size > 0 ? (enrichedCount / results.size) * 100 : 0

    // Record batch completion in New Relic
    newrelic.recordCustomEvent("BioEnrichmentBatchComplete", {
      actorsProcessed: results.size,
      actorsEnriched: enrichedCount,
      fillRate,
      totalCostUsd: batchTotalCost,
      totalTimeMs: batchTotalTimeMs,
    })

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Biography batch enrichment complete!`)
    console.log(`  Actors processed: ${results.size}`)
    console.log(`  Actors enriched:  ${enrichedCount}`)
    console.log(`  Fill rate:        ${fillRate.toFixed(1)}%`)
    console.log(`  Total cost:       $${batchTotalCost.toFixed(4)}`)
    console.log(`${"=".repeat(60)}`)
    this.runLogger?.info("Batch complete", {
      actorsProcessed: results.size,
      actorsEnriched: enrichedCount,
      fillRate,
      totalCostUsd: batchTotalCost,
      totalTimeMs: batchTotalTimeMs,
    })
    await this.runLogger?.flush()

    return results
  }

  /**
   * Get the number of initialized sources (for logging/testing).
   */
  getSourceCount(): number {
    return this.sources.length
  }

  /**
   * Get the names of initialized sources (for logging/testing).
   */
  getSourceNames(): string[] {
    return this.sources.map((s) => s.name)
  }
}
