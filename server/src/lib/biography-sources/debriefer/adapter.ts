/**
 * Debriefer adapter for biography enrichment.
 *
 * Creates a ResearchOrchestrator with:
 * - Standard sources from debriefer-sources (28 shared sources)
 * - Adapted legacy biography sources (9 biography-only sources)
 * - 7-phase structure matching the biography enrichment pipeline
 * - NoopSynthesizer (biography claude-cleanup runs separately as post-process)
 *
 * Includes all infrastructure fixes from death enrichment PR #574:
 * - Cache bridge writes per-source findings to source_query_cache
 * - fetchPage callback for link following with CAPTCHA fallback chain
 * - DuckDuckGo routed through legacy source for CAPTCHA resilience
 * - Per-source log entries via LogEntryCollector
 * - Per-source cost attribution via costUsd pass-through
 */

import { ResearchOrchestrator, NoopSynthesizer } from "debriefer"
import type { ResearchSubject, ScoredFinding, SourcePhaseGroup, ResearchConfig } from "debriefer"

// Debriefer-sources: standard implementations (28 shared with death enrichment)
import {
  wikidata,
  wikipedia,
  googleSearch,
  bingSearch,
  braveSearch,
  apNews,
  bbcNews,
  reuters,
  guardian,
  nytimes,
  npr,
  independent,
  telegraph,
  washingtonPost,
  laTimes,
  time,
  newYorker,
  pbs,
  rollingStone,
  nationalGeographic,
  people,
  findAGrave,
  legacy,
  googleBooks,
  openLibrary,
  chroniclingAmerica,
  trove,
  europeana,
  internetArchive,
} from "debriefer-sources"

// Biography-specific adapter components
import { adaptBioLegacySources } from "./legacy-source-adapter.js"
import { mapFindings as mapBioFindings } from "./finding-mapper.js"
import { createBioLifecycleHooks } from "./lifecycle-hooks.js"
import { LogEntryCollector, type LogEntry } from "../../death-sources/debriefer/lifecycle-hooks.js"
import type {
  RawBiographySourceData,
  ActorForBiography,
  BiographyResult,
  BiographySourceEntry,
} from "../types.js"
import { synthesizeBiography, type BiographySynthesisResult } from "../claude-cleanup.js"

// Logging
import { logger } from "../../logger.js"
const log = logger.child({ name: "bio-debriefer-adapter" })

// Page fetching infrastructure for link following
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"
import { extractArticleContent } from "../../shared/readability-extract.js"

// Haiku section selector and person validator (shared with death)
import { createHaikuSectionFilter } from "../../death-sources/debriefer/haiku-section-selector.js"
import { createPersonValidator } from "../../death-sources/debriefer/person-validator.js"

// Biography-only legacy source classes (no debriefer-sources equivalents)
import { BritannicaBiographySource } from "../sources/britannica.js"
import { BiographyComSource } from "../sources/biography-com.js"
import { TCMBiographySource } from "../sources/tcm.js"
import { AllMusicBiographySource } from "../sources/allmusic.js"
import { SmithsonianBiographySource } from "../sources/smithsonian.js"
import { HistoryComBiographySource } from "../sources/history-com.js"
import { IABooksBiographySource } from "../sources/ia-books.js"

// DuckDuckGo uses legacy source for CAPTCHA resilience
import { DuckDuckGoBiographySearch } from "../sources/duckduckgo.js"

export interface BioDebrieferAdapterConfig {
  free?: boolean
  paid?: boolean
  reference?: boolean
  books?: boolean
  webSearch?: boolean
  news?: boolean
  obituary?: boolean
  archives?: boolean
  maxCostPerActor?: number
  maxTotalCost?: number
  earlyStopThreshold?: number
  confidenceThreshold?: number
  reliabilityThreshold?: number
}

export interface BioDebrieferAdapterResult {
  rawSources: RawBiographySourceData[]
  totalCostUsd: number
  sourcesAttempted: number
  sourcesSucceeded: number
  durationMs: number
  stoppedAtPhase?: number
  logEntries: LogEntry[]
}

/**
 * Creates a reusable orchestrator for a batch of biography enrichment.
 *
 * Call this once per enrichment run, then pass the returned function
 * to process each actor. Shares rate limiting and caching across actors.
 */
export function createBioDebriefOrchestrator(
  config: BioDebrieferAdapterConfig
): (actor: ActorForBiography) => Promise<BioDebrieferAdapterResult> {
  const phases = buildBioPhases(config)

  const orchestratorConfig: ResearchConfig = {
    // Dual threshold: both confidence AND reliability must be met
    earlyStopThreshold: config.earlyStopThreshold ?? 3,
    confidenceThreshold: config.confidenceThreshold ?? 0.6,
    reliabilityThreshold: config.reliabilityThreshold ?? 0.6,
    costLimits: {
      maxCostPerSubject: config.maxCostPerActor,
      maxTotalCost: config.maxTotalCost,
    },
  }

  const orchestrator = new ResearchOrchestrator<ResearchSubject, ScoredFinding[]>(
    phases,
    new NoopSynthesizer(),
    orchestratorConfig
  )

  return async (actor: ActorForBiography): Promise<BioDebrieferAdapterResult> => {
    // Create a fresh log collector per actor so entries don't mix across concurrent actors
    const logCollector = new LogEntryCollector()
    const hooks = createBioLifecycleHooks({ logCollector })

    const subject: ResearchSubject = {
      id: actor.id,
      name: actor.name,
      context: {
        tmdbId: actor.tmdb_id,
        imdbPersonId: actor.imdb_person_id,
        birthday: actor.birthday,
        deathday: actor.deathday,
        biography: actor.biography,
        placeOfBirth: actor.place_of_birth,
      },
    }

    const result = await orchestrator.debrief(subject, { hooks })

    return {
      rawSources: mapBioFindings(result.findings),
      totalCostUsd: result.totalCostUsd,
      sourcesAttempted: result.sourcesAttempted,
      sourcesSucceeded: result.sourcesSucceeded,
      durationMs: result.durationMs,
      stoppedAtPhase: result.stoppedAtPhase,
      logEntries: logCollector.entries,
    }
  }
}

/**
 * Runs biography enrichment for a single actor using debriefer's orchestrator.
 *
 * Convenience wrapper that creates a new orchestrator per call.
 * For batch processing, prefer createBioDebriefOrchestrator() to share
 * rate limiting and caching across actors.
 */
export async function debriefActorBio(
  actor: ActorForBiography,
  config: BioDebrieferAdapterConfig
): Promise<BioDebrieferAdapterResult> {
  const processActor = createBioDebriefOrchestrator(config)
  return processActor(actor)
}

/**
 * Creates a full-pipeline enrichment function that runs debriefer + Claude synthesis.
 *
 * Returns a BiographyResult-compatible shape so consumers (batch handler, admin routes)
 * can switch with minimal changes. Call this once per batch to share rate limiting.
 */
export function createBioEnrichmentPipeline(
  config: BioDebrieferAdapterConfig & { synthesisModel?: string }
): (actor: ActorForBiography) => Promise<BiographyResult> {
  const processActor = createBioDebriefOrchestrator(config)

  return async (actor: ActorForBiography): Promise<BiographyResult> => {
    const debriefResult = await processActor(actor)

    // Run Claude synthesis if we have raw sources
    let synthesisResult: BiographySynthesisResult | null = null
    if (debriefResult.rawSources.length > 0) {
      synthesisResult = await synthesizeBiography(actor, debriefResult.rawSources, {
        model: config.synthesisModel,
      })
    }

    // Map sources to BiographySourceEntry format
    const sources: BiographySourceEntry[] = debriefResult.rawSources.map((rs) => ({
      type: rs.sourceType,
      url: rs.url ?? null,
      retrievedAt: new Date(),
      confidence: rs.confidence,
      reliabilityTier: rs.reliabilityTier,
      reliabilityScore: rs.reliabilityScore,
      costUsd: rs.costUsd ?? 0,
    }))

    const sourceCostUsd = debriefResult.totalCostUsd
    const synthesisCostUsd = synthesisResult?.costUsd ?? 0

    return {
      actorId: actor.id,
      data: synthesisResult?.data ?? null,
      sources,
      rawSources: debriefResult.rawSources,
      cleanedData: synthesisResult?.data ?? undefined,
      stats: {
        sourcesAttempted: debriefResult.sourcesAttempted,
        sourcesSucceeded: debriefResult.sourcesSucceeded,
        totalCostUsd: sourceCostUsd + synthesisCostUsd,
        sourceCostUsd,
        synthesisCostUsd,
        processingTimeMs: debriefResult.durationMs,
      },
      error: synthesisResult?.error,
      logEntries: debriefResult.logEntries,
    }
  }
}

/**
 * Builds source phase groups matching biography's 7-phase structure.
 */
function buildBioPhases(config: BioDebrieferAdapterConfig): SourcePhaseGroup<ResearchSubject>[] {
  const phases: SourcePhaseGroup<ResearchSubject>[] = []

  // fetchPage callback uses deadonfilm's full fallback chain:
  // direct fetch → archive.org → archive.is → browser + CAPTCHA solver
  const fetchPage = async (url: string, signal: AbortSignal): Promise<string | null> => {
    try {
      const result = await fetchPageWithFallbacks(url, { signal, timeoutMs: 15000 })
      if (!result.content || result.fetchMethod === "none") return null
      // Archive fallbacks may return already-extracted text, not HTML
      if (result.fetchMethod !== "direct") return result.content
      // Direct fetch returns HTML — extract article body with Readability
      const article = extractArticleContent(result.content, result.url)
      return article?.text || null
    } catch (error) {
      log.debug({ err: error, url }, "fetchPage failed (non-blocking)")
      return null
    }
  }
  const webSearchConfig = { maxLinksToFollow: 3, fetchPage }

  // Phase 1: Structured Data (free)
  if (config.free !== false) {
    phases.push({
      phase: 1,
      name: "Structured Data",
      sources: [
        wikidata(),
        wikipedia({
          asyncSectionFilter: createHaikuSectionFilter(),
          validatePerson: createPersonValidator({ useAIDateValidation: true }),
          disambiguationSuffixes: [
            "_(actor)",
            "_(actress)",
            "_(American_actor)",
            "_(Canadian_actor)",
            "_(British_actor)",
            "_(Australian_actor)",
            "_(film_actor)",
            "_(television_actor)",
          ],
        }),
      ],
    })
  }

  // Phase 2: Reference Sites (biography-only legacy sources)
  if (config.reference !== false) {
    const refSources = adaptBioLegacySources([
      new BritannicaBiographySource(),
      new BiographyComSource(),
      new TCMBiographySource(),
      new AllMusicBiographySource(),
    ])
    if (refSources.length > 0) {
      phases.push({ phase: 2, name: "Reference Sites", sources: refSources })
    }
  }

  // Phase 3: Books (always tried even after early stop for unique archival content)
  if (config.books !== false) {
    phases.push({
      phase: 3,
      name: "Books",
      sources: [
        googleBooks(),
        openLibrary(),
        ...adaptBioLegacySources([new IABooksBiographySource()]),
      ],
    })
  }

  // Phase 4: Web Search
  if (config.webSearch !== false) {
    // DuckDuckGo uses legacy source for CAPTCHA resilience (Playwright stealth + solver)
    phases.push({
      phase: 4,
      name: "Web Search",
      sources: [
        googleSearch(webSearchConfig),
        bingSearch(webSearchConfig),
        ...adaptBioLegacySources([new DuckDuckGoBiographySearch()]),
        braveSearch(webSearchConfig),
      ],
    })
  }

  // Phase 5: News Sources (18 sources)
  if (config.news !== false) {
    const freeSources = [
      apNews(),
      bbcNews(),
      reuters(),
      washingtonPost(),
      laTimes(),
      npr(),
      pbs(),
      independent(),
      telegraph(),
      time(),
      newYorker(),
      rollingStone(),
      nationalGeographic(),
      people(),
      ...adaptBioLegacySources([new SmithsonianBiographySource(), new HistoryComBiographySource()]),
    ]

    // Paid news sources gated independently
    const paidSources = config.paid !== false ? [guardian(), nytimes()] : []

    const allNewsSources = [...freeSources, ...paidSources]
    if (allNewsSources.length > 0) {
      phases.push({ phase: 5, name: "News", sources: allNewsSources })
    }
  }

  // Phase 6: Obituary Sites
  if (config.obituary !== false) {
    phases.push({
      phase: 6,
      name: "Obituary",
      sources: [findAGrave(), legacy()],
    })
  }

  // Phase 7: Historical Archives
  if (config.archives !== false) {
    phases.push({
      phase: 7,
      name: "Archives",
      sources: [internetArchive(), chroniclingAmerica(), trove(), europeana()],
    })
  }

  return phases
}
