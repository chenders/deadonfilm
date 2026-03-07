/**
 * Biography Enrichment Orchestrator
 *
 * Coordinates multiple biography data sources to enrich actor biographies with
 * personal life information (childhood, education, family, relationships,
 * pre-fame life). Sources are organized into sequential phases; within each
 * phase, sources run concurrently via Promise.allSettled. All raw source data
 * is accumulated and sent to Claude synthesis (Stage 3) for structured
 * narrative generation.
 *
 * Key differences from sequential approach:
 * - Sources within a phase run concurrently (Promise.allSettled)
 * - Shared SourceRateLimiter coordinates cross-actor rate limiting per domain
 * - ParallelBatchRunner processes multiple actors concurrently
 * - Early stopping checked between phases (not within)
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
import type { BiographyLookupResult } from "./base-source.js"
import { BiographyWebSearchBase } from "./sources/web-search-base.js"
import { synthesizeBiography } from "./claude-cleanup.js"
import { getCachedQueriesForActor } from "../death-sources/cache.js"
import {
  SourceRateLimiter,
  SourcePhase,
  ParallelBatchRunner,
  BatchCostTracker,
} from "../shared/concurrency.js"

// Source imports — Structured Data (free)
import { WikidataBiographySource } from "./sources/wikidata.js"
import { WikipediaBiographySource } from "./sources/wikipedia.js"

// Source imports — Reference Sites
import { BritannicaBiographySource } from "./sources/britannica.js"
import { BiographyComSource } from "./sources/biography-com.js"
import { TCMBiographySource } from "./sources/tcm.js"
import { AllMusicBiographySource } from "./sources/allmusic.js"

// Source imports — Web Search
import { GoogleBiographySearch } from "./sources/google-search.js"
import { BingBiographySearch } from "./sources/bing-search.js"
import { DuckDuckGoBiographySearch } from "./sources/duckduckgo.js"
import { BraveBiographySearch } from "./sources/brave-search.js"

// Source imports — News
import { GuardianBiographySource } from "./sources/guardian.js"
import { NYTimesBiographySource } from "./sources/nytimes.js"
import { APNewsBiographySource } from "./sources/ap-news.js"
import { ReutersBiographySource } from "./sources/reuters.js"
import { WashingtonPostBiographySource } from "./sources/washington-post.js"
import { BBCNewsBiographySource } from "./sources/bbc-news.js"
import { PeopleBiographySource } from "./sources/people.js"
import { LATimesBiographySource } from "./sources/la-times.js"
import { NPRBiographySource } from "./sources/npr.js"
import { IndependentBiographySource } from "./sources/independent.js"
import { TelegraphBiographySource } from "./sources/telegraph.js"
import { TimeBiographySource } from "./sources/time.js"
import { NewYorkerBiographySource } from "./sources/new-yorker.js"
import { PBSBiographySource } from "./sources/pbs.js"
import { RollingStoneBiographySource } from "./sources/rolling-stone.js"
import { NationalGeographicBiographySource } from "./sources/national-geographic.js"
import { SmithsonianBiographySource } from "./sources/smithsonian.js"
import { HistoryComBiographySource } from "./sources/history-com.js"

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
 * A group of sources that belong to the same execution phase.
 * Sources within a phase run concurrently via Promise.allSettled.
 */
interface SourcePhaseGroup {
  phase: SourcePhase
  sources: BaseBiographySource[]
}

/**
 * Main orchestrator for biography enrichment.
 *
 * Sources are organized into sequential phases. Within each phase, sources run
 * concurrently via Promise.allSettled. After all phases (or early stopping),
 * accumulated raw data is synthesized by Claude into structured BiographyData.
 */
export class BiographyEnrichmentOrchestrator {
  private config: BiographyEnrichmentConfig
  private phases: SourcePhaseGroup[]
  private rateLimiter: SourceRateLimiter
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
    // Normalize earlyStopSourceCount: 0 = disable early stopping (Infinity internally)
    const raw = this.config.earlyStopSourceCount
    if (raw === 0 || raw === Infinity) {
      this.config.earlyStopSourceCount = Infinity
    } else if (!Number.isFinite(raw) || raw < 1) {
      this.config.earlyStopSourceCount = DEFAULT_BIOGRAPHY_CONFIG.earlyStopSourceCount
    } else {
      this.config.earlyStopSourceCount = Math.floor(raw)
    }
    this.rateLimiter = new SourceRateLimiter()
    this.phases = this.initializeSources()
  }

  /**
   * Flatten all phase groups into a single array of sources.
   * Used for logging, configuration injection, and public accessors.
   */
  private getAllSources(): BaseBiographySource[] {
    return this.phases.flatMap((p) => p.sources)
  }

  /**
   * Initialize data sources organized into phase groups.
   * Sources within each phase run concurrently; phases run sequentially.
   * Filters by source category and availability, injects shared rate limiter.
   */
  private initializeSources(): SourcePhaseGroup[] {
    const phases: SourcePhaseGroup[] = []

    // Helper: filter to available sources and inject shared rate limiter
    const prepare = (sources: BaseBiographySource[]): BaseBiographySource[] => {
      const available = sources.filter((s) => s.isAvailable())
      for (const s of available) {
        s.setRateLimiter(this.rateLimiter)
      }
      return available
    }

    // Phase 1: Free structured data (Wikidata, Wikipedia)
    if (this.config.sourceCategories.free) {
      const structuredSources = prepare([
        new WikidataBiographySource(),
        new WikipediaBiographySource(),
      ])
      if (structuredSources.length > 0) {
        phases.push({ phase: SourcePhase.STRUCTURED_DATA, sources: structuredSources })
      }
    }

    // Phase 2: Reference sites (Britannica, Biography.com, TCM, AllMusic)
    if (this.config.sourceCategories.reference) {
      const referenceSources = prepare([
        new BritannicaBiographySource(),
        new BiographyComSource(),
        new TCMBiographySource(),
        new AllMusicBiographySource(),
      ])
      if (referenceSources.length > 0) {
        phases.push({ phase: SourcePhase.REFERENCE, sources: referenceSources })
      }
    }

    // Phase 3: Books/Publications (Google Books, Open Library, IA Books)
    if (this.config.sourceCategories.books) {
      const bookSources = prepare([
        new GoogleBooksBiographySource(),
        new OpenLibraryBiographySource(),
        new IABooksBiographySource(),
      ])
      if (bookSources.length > 0) {
        phases.push({ phase: SourcePhase.BOOKS, sources: bookSources })
      }
    }

    // Phase 4: Web search (Google, Bing, DuckDuckGo, Brave)
    if (this.config.sourceCategories.webSearch) {
      const webSearchSources = prepare([
        new GoogleBiographySearch(),
        new BingBiographySearch(),
        new DuckDuckGoBiographySearch(),
        new BraveBiographySearch(),
      ])
      if (webSearchSources.length > 0) {
        phases.push({ phase: SourcePhase.WEB_SEARCH, sources: webSearchSources })
      }
    }

    // Phase 5: News sources
    if (this.config.sourceCategories.news) {
      const newsSources = prepare([
        new GuardianBiographySource(),
        new NYTimesBiographySource(),
        new APNewsBiographySource(),
        new ReutersBiographySource(),
        new WashingtonPostBiographySource(),
        new LATimesBiographySource(),
        new BBCNewsBiographySource(),
        new NPRBiographySource(),
        new PBSBiographySource(),
        new PeopleBiographySource(),
        new IndependentBiographySource(),
        new TelegraphBiographySource(),
        new TimeBiographySource(),
        new NewYorkerBiographySource(),
        new RollingStoneBiographySource(),
        new NationalGeographicBiographySource(),
        new SmithsonianBiographySource(),
        new HistoryComBiographySource(),
      ])
      if (newsSources.length > 0) {
        phases.push({ phase: SourcePhase.NEWS, sources: newsSources })
      }
    }

    // Phase 6: Obituary sites (Legacy, FindAGrave)
    if (this.config.sourceCategories.obituary) {
      const obituarySources = prepare([
        new LegacyBiographySource(),
        new FindAGraveBiographySource(),
      ])
      if (obituarySources.length > 0) {
        phases.push({ phase: SourcePhase.OBITUARY, sources: obituarySources })
      }
    }

    // Phase 7: Historical archives
    if (this.config.sourceCategories.archives) {
      const archiveSources = prepare([
        new InternetArchiveBiographySource(),
        new ChroniclingAmericaBiographySource(),
        new TroveBiographySource(),
        new EuropeanaBiographySource(),
      ])
      if (archiveSources.length > 0) {
        phases.push({ phase: SourcePhase.ARCHIVES, sources: archiveSources })
      }
    }

    // Configure web search AI cleaning if enabled
    const allSources = phases.flatMap((p) => p.sources)
    if (this.config.contentCleaning.haikuEnabled && !this.config.contentCleaning.mechanicalOnly) {
      for (const source of allSources) {
        if (source instanceof BiographyWebSearchBase) {
          source.setConfig({ useAiCleaning: true })
        }
      }
    }

    console.log(`Initialized ${allSources.length} biography sources:`)
    for (const source of allSources) {
      console.log(
        `  - ${source.name} (${source.isFree ? "free" : `$${source.estimatedCostPerQuery}/query`}, reliability: ${source.reliabilityScore.toFixed(2)})`
      )
    }
    this.runLogger?.info("Sources initialized", {
      sourceCount: allSources.length,
      sourceNames: allSources.map((s) => s.name),
    })

    return phases
  }

  /**
   * Enrich a single actor with biography data.
   *
   * Iterates through phases sequentially. Within each phase, all sources run
   * concurrently via Promise.allSettled. Accumulates raw data from successful
   * lookups, then runs Claude synthesis to produce structured BiographyData.
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

    // Track whether the BOOKS phase has been completed for early stopping logic.
    // If no BOOKS phase is configured (books category disabled), treat as already completed
    // so early stopping isn't permanently blocked.
    const hasBooksPhase = this.phases.some((p) => p.phase === SourcePhase.BOOKS)
    let booksPhaseCompleted = !hasBooksPhase

    // Add New Relic attributes for this actor
    for (const [key, value] of Object.entries({
      "bio.actor.id": actor.id,
      "bio.actor.name": actor.name,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    console.log(`\nEnriching biography: ${actor.name} (ID: ${actor.id})`)
    this.runLogger?.info("Processing actor", { actorId: actor.id, actorName: actor.name })

    // Iterate through phases sequentially
    for (const phaseGroup of this.phases) {
      // Early stopping gate: skip remaining non-BOOKS phases once threshold is met
      // and BOOKS phase has been completed (books are always tried for unique archival content)
      if (
        phaseGroup.phase !== SourcePhase.BOOKS &&
        highQualityFamilies.size >= this.config.earlyStopSourceCount &&
        booksPhaseCompleted
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

      // Check per-actor cost limit before starting a new phase
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

      console.log(`  Phase: ${phaseGroup.phase} (${phaseGroup.sources.length} sources)`)

      // Run all sources in this phase concurrently
      const results = await Promise.allSettled(
        phaseGroup.sources.map(async (source) => {
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

            // Record source attempt — attach error to source entry for DB tracking
            if (!lookupResult.success && lookupResult.error) {
              lookupResult.source.error = lookupResult.error
            }

            if (!lookupResult.success || !lookupResult.data) {
              console.log(`    Failed: ${lookupResult.error || "No data"}`)
              this.runLogger?.debug(
                "Source failed",
                {
                  actorId: actor.id,
                  error: lookupResult.error || "No data",
                },
                source.name
              )
              newrelic.recordCustomEvent("BioSourceFailed", {
                actorId: actor.id,
                actorName: actor.name,
                source: source.name,
                sourceType: source.type,
                error: lookupResult.error || "No data",
              })
              return { source, lookupResult, sourceCost, success: false as const }
            }

            // Successful lookup
            const srcReliability = source.reliabilityScore
            console.log(
              `    Success! Content: ${lookupResult.source.confidence.toFixed(2)} | Reliability: ${srcReliability.toFixed(2)}`
            )
            this.runLogger?.info(
              "Source success",
              {
                actorId: actor.id,
                confidence: lookupResult.source.confidence,
                reliability: srcReliability,
                costUsd: sourceCost,
              },
              source.name
            )

            // Check dual threshold for high-quality source counting
            const contentMet = lookupResult.source.confidence >= this.config.confidenceThreshold
            const reliabilityMet =
              !this.config.useReliabilityThreshold ||
              srcReliability >= this.config.reliabilityThreshold
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

            return {
              source,
              lookupResult,
              sourceCost,
              success: true as const,
              data: lookupResult.data,
              isHighQuality,
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            console.log(`    Error: ${errorMsg}`)
            this.runLogger?.error(
              "Source error",
              {
                actorId: actor.id,
                error: errorMsg,
              },
              source.name
            )
            newrelic.recordCustomEvent("BioSourceFailed", {
              actorId: actor.id,
              actorName: actor.name,
              source: source.name,
              sourceType: source.type,
              error: errorMsg,
            })
            return { source, lookupResult: null, sourceCost: 0, success: false as const }
          }
        })
      )

      // Aggregate results from settled promises
      for (const settled of results) {
        if (settled.status !== "fulfilled") {
          // Defensive: count rejected promises (shouldn't happen with broad inner catch)
          sourcesAttempted++
          continue
        }
        const result = settled.value

        sourcesAttempted++

        // Track cost
        totalCost += result.sourceCost
        totalSourceCost += result.sourceCost

        // Record source entry if we have a lookup result
        if (result.lookupResult) {
          allSources.push(result.lookupResult.source)
        }

        if (result.success && result.data) {
          sourcesSucceeded++
          rawSources.push(result.data)

          // Track high-quality source families for early stopping
          if (result.isHighQuality) {
            const familyKey = SOURCE_FAMILY_LOOKUP.get(result.source.type) ?? result.source.type
            highQualityFamilies.add(familyKey)
          }
        }
      }

      // Track BOOKS phase completion for early stopping logic
      if (phaseGroup.phase === SourcePhase.BOOKS) {
        booksPhaseCompleted = true
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
   * Uses ParallelBatchRunner for concurrent actor processing with shared rate
   * limiting and batch-level cost tracking. The shared SourceRateLimiter
   * coordinates per-domain delays across all concurrent actors.
   */
  async enrichBatch(actors: ActorForBiography[]): Promise<Map<number, BiographyResult>> {
    const batchStartTime = Date.now()
    const results = new Map<number, BiographyResult>()
    const allSources = this.getAllSources()

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
      earlyStopSourceCount: Number.isFinite(this.config.earlyStopSourceCount)
        ? this.config.earlyStopSourceCount
        : -1,
      confidenceThreshold: this.config.confidenceThreshold,
      sourceCount: allSources.length,
      sourceNames: allSources.map((s) => s.name).join(","),
    })

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Starting biography batch enrichment for ${actors.length} actors`)
    console.log(`Sources: ${allSources.map((s) => s.name).join(", ")}`)
    console.log(`Per-actor cost limit: $${this.config.costLimits.maxCostPerActor}`)
    console.log(`Total cost limit: $${this.config.costLimits.maxTotalCost}`)
    console.log(`Concurrency: ${this.config.concurrency ?? 5}`)
    console.log(`${"=".repeat(60)}`)
    this.runLogger?.info("Batch started", {
      actorCount: actors.length,
      sourceCount: allSources.length,
      maxTotalCost: this.config.costLimits.maxTotalCost,
      maxCostPerActor: this.config.costLimits.maxCostPerActor,
      concurrency: this.config.concurrency ?? 5,
    })

    const costTracker = new BatchCostTracker(this.config.costLimits.maxTotalCost)

    const runner = new ParallelBatchRunner<ActorForBiography, BiographyResult>({
      concurrency: this.config.concurrency ?? 5,
      costTracker,
      getCost: (result) => result.stats.totalCostUsd,
      onItemComplete: async (actor, result, progress) => {
        console.log(
          `\n[${progress.completed}/${progress.total}] Completed ${actor.name} ` +
            `(cost: $${result.stats.totalCostUsd.toFixed(4)}, ` +
            `sources: ${result.stats.sourcesSucceeded}/${result.stats.sourcesAttempted})`
        )
      },
    })

    await runner.run(actors, async (actor) => {
      const result = await this.enrichActor(actor)
      results.set(actor.id, result)
      return result
    })

    // Check if cost limit was hit
    if (costTracker.isLimitExceeded()) {
      console.log(
        `\nBatch total cost limit reached ($${costTracker.getTotalCost().toFixed(4)} >= $${this.config.costLimits.maxTotalCost})`
      )
      console.log(`Processed ${results.size} of ${actors.length} actors before limit`)
      this.runLogger?.warn("Total cost limit reached", {
        costUsd: costTracker.getTotalCost(),
        limit: this.config.costLimits.maxTotalCost,
        actorsProcessed: results.size,
        totalActors: actors.length,
      })
      newrelic.recordCustomEvent("BioEnrichmentBatchCostLimit", {
        actorsProcessed: results.size,
        totalActors: actors.length,
        totalCostUsd: costTracker.getTotalCost(),
        costLimit: this.config.costLimits.maxTotalCost,
      })
      await this.runLogger?.flush()
    }

    // Log batch summary
    const batchTotalCost = costTracker.getTotalCost()
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
   * Re-synthesize a biography from cached source data without re-fetching.
   *
   * Retrieves previously cached source query results for the actor, extracts
   * the raw biography text from each, and runs Claude synthesis with the
   * current prompt. This allows prompt improvements to be applied to existing
   * data without incurring source-fetching costs.
   *
   * @param actor - Actor to re-synthesize biography for
   * @returns BiographyResult with new synthesis, or error if no cached data
   */
  async resynthesizeFromCache(actor: ActorForBiography): Promise<BiographyResult> {
    const startTime = Date.now()

    // Build set of valid biography source types for filtering
    const bioSourceTypes = new Set(Object.values(BiographySourceType) as string[])

    // Retrieve all cached queries for this actor
    const cachedEntries = await getCachedQueriesForActor(actor.id)

    // Filter to biography sources with successful responses containing text.
    // Deduplicate by sourceType, keeping only the most recent entry per type
    // (cachedEntries are ordered newest-first by queried_at).
    const rawSources: RawBiographySourceData[] = []
    const sourceEntries: BiographySourceEntry[] = []
    const seenSourceTypes = new Set<string>()
    for (const entry of cachedEntries) {
      // Only include biography source types
      if (!bioSourceTypes.has(entry.sourceType as string)) continue
      // Skip errors
      if (entry.errorMessage) continue
      // Deduplicate: keep only the most recent entry per source type
      if (seenSourceTypes.has(entry.sourceType)) continue

      // Extract data from cached BiographyLookupResult
      const lookupResult = entry.responseRaw as BiographyLookupResult | null
      if (!lookupResult?.success || !lookupResult.data) continue
      if (!lookupResult.data.text || lookupResult.data.text.trim().length === 0) continue

      seenSourceTypes.add(entry.sourceType)
      rawSources.push(lookupResult.data)
      sourceEntries.push(lookupResult.source)
    }

    if (rawSources.length === 0) {
      return {
        actorId: actor.id,
        data: null,
        sources: [],
        rawSources: [],
        stats: {
          sourcesAttempted: 0,
          sourcesSucceeded: 0,
          totalCostUsd: 0,
          sourceCostUsd: 0,
          synthesisCostUsd: 0,
          processingTimeMs: Date.now() - startTime,
        },
        error: "No cached biography source data found for this actor",
      }
    }

    console.log(`  Re-synthesizing ${actor.name} from ${rawSources.length} cached sources...`)

    // Run Claude synthesis with current prompt
    const synthesisResult = await synthesizeBiography(actor, rawSources, {
      model: this.config.synthesisModel,
    })

    const processingTimeMs = Date.now() - startTime

    if (synthesisResult.error) {
      console.log(`    Re-synthesis error: ${synthesisResult.error}`)
      return {
        actorId: actor.id,
        data: null,
        sources: sourceEntries,
        rawSources,
        stats: {
          sourcesAttempted: rawSources.length,
          sourcesSucceeded: rawSources.length,
          totalCostUsd: synthesisResult.costUsd,
          sourceCostUsd: 0,
          synthesisCostUsd: synthesisResult.costUsd,
          processingTimeMs,
        },
        error: synthesisResult.error,
      }
    }

    console.log(`    Re-synthesis complete, cost: $${synthesisResult.costUsd.toFixed(4)}`)

    return {
      actorId: actor.id,
      data: synthesisResult.data,
      sources: sourceEntries,
      rawSources,
      cleanedData: synthesisResult.data ?? undefined,
      stats: {
        sourcesAttempted: rawSources.length,
        sourcesSucceeded: rawSources.length,
        totalCostUsd: synthesisResult.costUsd,
        sourceCostUsd: 0,
        synthesisCostUsd: synthesisResult.costUsd,
        processingTimeMs,
      },
    }
  }

  /**
   * Get the number of initialized sources (for logging/testing).
   */
  getSourceCount(): number {
    return this.getAllSources().length
  }

  /**
   * Get the names of initialized sources (for logging/testing).
   */
  getSourceNames(): string[] {
    return this.getAllSources().map((s) => s.name)
  }
}
