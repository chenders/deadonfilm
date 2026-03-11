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
import type { ResearchSubject, ScoredFinding, SourcePhaseGroup, ResearchConfig } from "debriefer"

// Debriefer-sources: standard implementations
import {
  wikidata,
  wikipedia,
  googleSearch,
  bingSearch,
  braveSearch,
  duckduckgoSearch,
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
import type { RawSourceData, ActorForEnrichment } from "../types.js"

// Deadonfilm-only source classes (no debriefer-sources equivalents)
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
}

export interface DebrieferAdapterResult {
  rawSources: RawSourceData[]
  totalCostUsd: number
  sourcesAttempted: number
  sourcesSucceeded: number
  durationMs: number
  stoppedAtPhase?: number
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

    const result = await orchestrator.debrief(subject)

    return {
      rawSources: mapFindings(result.findings),
      totalCostUsd: result.totalCostUsd,
      sourcesAttempted: result.sourcesAttempted,
      sourcesSucceeded: result.sourcesSucceeded,
      durationMs: result.durationMs,
      stoppedAtPhase: result.stoppedAtPhase,
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
      sources: [wikidata(), wikipedia(), ...adaptLegacySources([new BFISightSoundSource()])],
    })

    // Phase 2: Web Search (free)
    phases.push({
      phase: 2,
      name: "Web Search",
      sources: [googleSearch(), bingSearch(), duckduckgoSearch(), braveSearch()],
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
  const newsSources: ReturnType<typeof apNews>[] = []
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

  // Phase 8+: AI Models (legacy only, if enabled)
  // Each AI model gets its own phase so they run SEQUENTIALLY (debriefer runs
  // sources within a phase concurrently). This matches the old orchestrator's
  // cost-ordered sequential behavior — stop at first success.
  if (config.ai) {
    const aiModelClasses = [
      new GeminiFlashSource(), // ~$0.0001
      new GroqLlamaSource(), // ~$0.0002
      new GPT4oMiniSource(), // ~$0.0003
      new DeepSeekSource(),
      new MistralSource(),
      new GeminiProSource(),
      new GrokSource(),
      new PerplexitySource(),
      new GPT4oSource(), // ~$0.01
    ]
    let aiPhase = 8
    for (const aiSource of aiModelClasses) {
      const adapted = adaptLegacySources([aiSource])
      if (adapted.length > 0) {
        phases.push({
          phase: aiPhase++,
          name: `AI: ${aiSource.name}`,
          sources: adapted,
        })
      }
    }
  }

  return phases
}
