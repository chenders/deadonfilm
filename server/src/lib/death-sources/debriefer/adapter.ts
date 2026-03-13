/**
 * Debriefer adapter for death enrichment.
 *
 * Creates a ResearchOrchestrator with:
 * - Standard sources from debriefer-sources (27 sources)
 * - Adapted legacy sources from deadonfilm (17 sources)
 * - Phase groups matching deadonfilm's existing 8-phase structure
 * - NoopSynthesizer (claude-cleanup runs separately as post-process)
 *
 * The adapter replaces DeathEnrichmentOrchestrator.enrichActor() and returns
 * RawSourceData[] ready for cleanupWithClaude().
 */

import { ResearchOrchestrator, NoopSynthesizer } from "debriefer"
import type {
  ResearchSubject,
  ScoredFinding,
  SourcePhaseGroup,
  ResearchConfig,
  MinimalSource,
} from "debriefer"

// Debriefer-sources: standard implementations
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

// Legacy deadonfilm-only sources (wrapped via LegacySourceAdapter)
import { adaptLegacySources } from "./legacy-source-adapter.js"
import { mapFindings } from "./finding-mapper.js"
import { createHaikuSectionFilter } from "./haiku-section-selector.js"
import { createPersonValidator } from "./person-validator.js"
import { createLifecycleHooks, LogEntryCollector } from "./lifecycle-hooks.js"
import type { RawSourceData, ActorForEnrichment } from "../types.js"

// Page fetching infrastructure for link following
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"
import { extractArticleContent } from "../../shared/readability-extract.js"

// Deadonfilm-only source classes (no debriefer-sources equivalents)
import { DuckDuckGoSource } from "../sources/duckduckgo.js"
import { BFISightSoundSource } from "../sources/bfi-sight-sound.js"
import { NewsAPISource } from "../sources/newsapi.js"
import { DeadlineSource } from "../sources/deadline.js"
import { VarietySource } from "../sources/variety.js"
import { HollywoodReporterSource } from "../sources/hollywood-reporter.js"
import { TMZSource } from "../sources/tmz.js"
import { GoogleNewsRSSSource } from "../sources/google-news-rss.js"
import { IABooksDeathSource } from "../sources/ia-books.js"
import { FamilySearchSource } from "../sources/familysearch.js"

// AI providers (all legacy, ordered by ascending cost)
import { GeminiFlashSource, GeminiProSource } from "../ai-providers/gemini.js"
import { GroqLlamaSource } from "../ai-providers/groq.js"
import { GPT4oMiniSource, GPT4oSource } from "../ai-providers/openai.js"
import { DeepSeekSource } from "../ai-providers/deepseek.js"
import { MistralSource } from "../ai-providers/mistral.js"
import { GrokSource } from "../ai-providers/grok.js"
import { PerplexitySource } from "../ai-providers/perplexity.js"

export interface DebrieferAdapterConfig {
  free?: boolean
  /** Enable paid API sources (Guardian API, NYTimes API, NewsAPI) */
  paid?: boolean
  ai?: boolean
  books?: boolean
  maxCostPerActor?: number
  maxTotalCost?: number
  earlyStopThreshold?: number
  confidenceThreshold?: number
  /** Set to a number to enforce reliability threshold, or undefined to disable */
  reliabilityThreshold?: number
  /** Use Gemini Flash AI for Wikipedia person date validation. Default: true. */
  useAIDateValidation?: boolean
}

export interface DebrieferAdapterResult {
  rawSources: RawSourceData[]
  totalCostUsd: number
  sourcesAttempted: number
  sourcesSucceeded: number
  durationMs: number
  stoppedAtPhase?: number
  logEntries: Array<{
    timestamp: string
    level: string
    message: string
    data?: Record<string, unknown>
  }>
}

/**
 * Creates a reusable orchestrator for a batch of actors.
 *
 * Call this once per enrichment run, then pass the returned function
 * to process each actor. This shares rate limiting and caching across actors.
 */
export function createDebriefOrchestrator(
  config: DebrieferAdapterConfig
): (actor: ActorForEnrichment) => Promise<DebrieferAdapterResult> {
  const phases = buildPhases(config)

  const orchestratorConfig: ResearchConfig = {
    earlyStopThreshold: config.earlyStopThreshold ?? 3,
    confidenceThreshold: config.confidenceThreshold ?? 0.5,
    reliabilityThreshold: config.reliabilityThreshold,
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

  return async (actor: ActorForEnrichment): Promise<DebrieferAdapterResult> => {
    // Create a fresh log collector per actor so entries don't mix across concurrent actors
    const logCollector = new LogEntryCollector()
    const hooks = createLifecycleHooks({ logCollector })

    const subject: ResearchSubject = {
      id: actor.id,
      name: actor.name,
      context: {
        tmdbId: actor.tmdbId,
        imdbPersonId: actor.imdbPersonId,
        birthday: actor.birthday,
        deathday: actor.deathday,
        causeOfDeath: actor.causeOfDeath,
        causeOfDeathDetails: actor.causeOfDeathDetails,
        popularity: actor.popularity,
      },
    }

    const result = await orchestrator.debrief(subject, { hooks })

    return {
      rawSources: mapFindings(result.findings),
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
 * Runs death enrichment for a single actor using debriefer's orchestrator.
 *
 * Convenience wrapper that creates a new orchestrator per call.
 * For batch processing, prefer createDebriefOrchestrator() to share
 * rate limiting and caching across actors.
 */
export async function debriefActor(
  actor: ActorForEnrichment,
  config: DebrieferAdapterConfig
): Promise<DebrieferAdapterResult> {
  const processActor = createDebriefOrchestrator(config)
  return processActor(actor)
}

/**
 * Builds source phase groups matching deadonfilm's 8-phase structure.
 *
 * Uses debriefer-sources for sources that have equivalents, and wraps
 * deadonfilm-only sources via LegacySourceAdapter.
 */
function buildPhases(config: DebrieferAdapterConfig): SourcePhaseGroup<ResearchSubject>[] {
  const phases: SourcePhaseGroup<ResearchSubject>[] = []

  // Free and paid source categories are gated independently so that
  // `free: false, paid: true` runs only paid API sources (Guardian, NYT, NewsAPI)
  if (config.free !== false) {
    // Phase 1: Structured Data (free)
    phases.push({
      phase: 1,
      name: "Structured Data",
      sources: [
        wikidata(),
        wikipedia({
          asyncSectionFilter: createHaikuSectionFilter(),
          validatePerson: createPersonValidator({
            useAIDateValidation: config.useAIDateValidation,
          }),
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
        ...adaptLegacySources([new BFISightSoundSource()]),
      ],
    })

    // Phase 2: Web Search (free)
    // fetchPage callback uses deadonfilm's full fallback chain:
    // direct fetch → archive.org → archive.is → browser + CAPTCHA solver
    const fetchPage = async (url: string, signal: AbortSignal): Promise<string | null> => {
      try {
        const result = await fetchPageWithFallbacks(url, { signal, timeoutMs: 15000 })
        if (!result.content || result.fetchMethod === "none") return null
        const article = extractArticleContent(result.content, result.url)
        return article?.textContent || null
      } catch {
        return null
      }
    }
    const webSearchConfig = { maxLinksToFollow: 3, fetchPage }

    // DuckDuckGo uses legacy source for CAPTCHA resilience (Playwright stealth + solver)
    // Other search engines use debriefer-sources with fetchPage for link following
    phases.push({
      phase: 2,
      name: "Web Search",
      sources: [
        googleSearch(webSearchConfig),
        bingSearch(webSearchConfig),
        ...adaptLegacySources([new DuckDuckGoSource()]),
        braveSearch(webSearchConfig),
      ],
    })

    // Phase 4: Obituary (free)
    phases.push({
      phase: 4,
      name: "Obituary",
      sources: [findAGrave(), legacy()],
    })

    // Phase 5: Books (free, conditional)
    if (config.books !== false) {
      phases.push({
        phase: 5,
        name: "Books",
        sources: [googleBooks(), openLibrary(), ...adaptLegacySources([new IABooksDeathSource()])],
      })
    }

    // Phase 6: Archives (free)
    phases.push({
      phase: 6,
      name: "Archives",
      sources: [trove(), europeana(), internetArchive(), chroniclingAmerica()],
    })

    // Phase 7: Genealogy (free, legacy only)
    const genealogySources = adaptLegacySources([new FamilySearchSource()])
    if (genealogySources.length > 0) {
      phases.push({
        phase: 7,
        name: "Genealogy",
        sources: genealogySources,
      })
    }
  }

  // Phase 3: News — free and paid sources gated independently
  const newsSources: MinimalSource<ResearchSubject>[] = []
  if (config.free !== false) {
    newsSources.push(
      apNews(),
      bbcNews(),
      reuters(),
      washingtonPost(),
      laTimes(),
      rollingStone(),
      telegraph(),
      independent(),
      npr(),
      time(),
      pbs(),
      newYorker(),
      nationalGeographic(),
      people(),
      ...adaptLegacySources([
        new DeadlineSource(),
        new VarietySource(),
        new HollywoodReporterSource(),
        new TMZSource(),
        new GoogleNewsRSSSource(),
      ])
    )
  }
  if (config.paid !== false) {
    newsSources.push(guardian(), nytimes())
    newsSources.push(...adaptLegacySources([new NewsAPISource()]))
  }
  if (newsSources.length > 0) {
    phases.push({ phase: 3, name: "News", sources: newsSources })
  }

  // Phase 8: AI Models (legacy only, if enabled)
  // Uses sequential: true so models run one at a time in cost order,
  // stopping at first success to minimize API costs.
  if (config.ai) {
    const aiSources = adaptLegacySources([
      new GeminiFlashSource(), // ~$0.0001
      new GroqLlamaSource(), // ~$0.0002
      new GPT4oMiniSource(), // ~$0.0003
      new DeepSeekSource(),
      new MistralSource(),
      new GeminiProSource(),
      new GrokSource(),
      new PerplexitySource(),
      new GPT4oSource(), // ~$0.01
    ])
    if (aiSources.length > 0) {
      phases.push({
        phase: 8,
        name: "AI Models",
        sources: aiSources,
        sequential: true,
      })
    }
  }

  // Sort by phase number — the orchestrator executes in array order
  return phases.sort((a, b) => a.phase - b.phase)
}
