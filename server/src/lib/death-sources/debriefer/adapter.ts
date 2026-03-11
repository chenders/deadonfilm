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

import { ResearchOrchestrator, NoopSynthesizer, SourceRateLimiter } from "debriefer"
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
  paid?: boolean
  ai?: boolean
  books?: boolean
  maxCostPerActor?: number
  maxTotalCost?: number
  earlyStopThreshold?: number
  confidenceThreshold?: number
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
 * Runs death enrichment for a single actor using debriefer's orchestrator.
 *
 * Returns RawSourceData[] ready for deadonfilm's cleanupWithClaude().
 */
export async function debriefActor(
  actor: ActorForEnrichment,
  config: DebrieferAdapterConfig
): Promise<DebrieferAdapterResult> {
  const phases = buildPhases(config)

  const orchestratorConfig: ResearchConfig = {
    earlyStopThreshold: config.earlyStopThreshold ?? 3,
    confidenceThreshold: config.confidenceThreshold ?? 0.5,
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

/**
 * Builds source phase groups matching deadonfilm's 8-phase structure.
 *
 * Uses debriefer-sources for sources that have equivalents, and wraps
 * deadonfilm-only sources via LegacySourceAdapter.
 */
function buildPhases(config: DebrieferAdapterConfig): SourcePhaseGroup<ResearchSubject>[] {
  const phases: SourcePhaseGroup<ResearchSubject>[] = []

  if (config.free !== false) {
    // Phase 1: Structured Data
    phases.push({
      phase: 1,
      name: "Structured Data",
      sources: [wikidata(), wikipedia(), ...adaptLegacySources([new BFISightSoundSource()])],
    })

    // Phase 2: Web Search
    phases.push({
      phase: 2,
      name: "Web Search",
      sources: [googleSearch(), bingSearch(), duckduckgoSearch(), braveSearch()],
    })

    // Phase 3: News
    phases.push({
      phase: 3,
      name: "News",
      sources: [
        // Debriefer-sources (site-search based)
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
        // Debriefer-sources (API-based, may need keys)
        guardian(),
        nytimes(),
        // Legacy deadonfilm-only sources
        ...adaptLegacySources([
          new NewsAPISource(),
          new DeadlineSource(),
          new VarietySource(),
          new HollywoodReporterSource(),
          new TMZSource(),
          new GoogleNewsRSSSource(),
        ]),
      ],
    })

    // Phase 4: Obituary
    phases.push({
      phase: 4,
      name: "Obituary",
      sources: [findAGrave(), legacy()],
    })

    // Phase 5: Books (conditional)
    if (config.books !== false) {
      phases.push({
        phase: 5,
        name: "Books",
        sources: [googleBooks(), openLibrary(), ...adaptLegacySources([new IABooksDeathSource()])],
      })
    }

    // Phase 6: Archives
    phases.push({
      phase: 6,
      name: "Archives",
      sources: [trove(), europeana(), internetArchive(), chroniclingAmerica()],
    })

    // Phase 7: Genealogy (legacy only)
    const genealogySources = adaptLegacySources([new FamilySearchSource()])
    if (genealogySources.length > 0) {
      phases.push({
        phase: 7,
        name: "Genealogy",
        sources: genealogySources,
      })
    }
  }

  // Phase 8: AI Models (legacy only, if enabled)
  if (config.ai) {
    const aiSources = adaptLegacySources([
      new GeminiFlashSource(),
      new GroqLlamaSource(),
      new GPT4oMiniSource(),
      new DeepSeekSource(),
      new MistralSource(),
      new GeminiProSource(),
      new GrokSource(),
      new PerplexitySource(),
      new GPT4oSource(),
    ])
    if (aiSources.length > 0) {
      phases.push({
        phase: 8,
        name: "AI Models",
        sources: aiSources,
      })
    }
  }

  return phases
}
