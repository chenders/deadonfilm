/**
 * Adapts a deadonfilm BaseDataSource to debriefer's BaseResearchSource interface.
 *
 * This allows deadonfilm-only sources (AI providers, BFI, NewsAPI, Google News RSS,
 * trade press like Variety/Deadline/THR, TMZ, FamilySearch) to run inside
 * debriefer's ResearchOrchestrator alongside debriefer-sources.
 *
 * The adapter delegates lookup to the legacy source's existing `lookup()` method,
 * which retains its own PostgreSQL-backed caching, rate limiting, and timeout
 * handling. Debriefer's orchestrator handles phase coordination and early stopping.
 */

import { BaseResearchSource, type ReliabilityTier as DebrieferTier } from "debriefer"
import type { ResearchSubject, RawFinding } from "debriefer"
import type { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment } from "../types.js"

/** Maps deadonfilm ReliabilityTier string values to debriefer's enum (same values) */
function mapTier(tier: string): DebrieferTier {
  // Both enums use the same string values (e.g., "structured_data", "tier_1_news")
  return tier as DebrieferTier
}

/**
 * Wraps a deadonfilm BaseDataSource as a debriefer BaseResearchSource.
 *
 * The adapter:
 * 1. Reconstructs ActorForEnrichment from ResearchSubject.context
 * 2. Calls the legacy source's lookup() method (with its own caching/rate limiting)
 * 3. Extracts text from SourceLookupResult.data.circumstances
 * 4. Returns a flat RawFinding for debriefer's orchestrator
 */
export class LegacySourceAdapter extends BaseResearchSource<ResearchSubject> {
  readonly name: string
  readonly type: string
  readonly reliabilityTier: DebrieferTier
  readonly domain: string
  readonly isFree: boolean
  readonly estimatedCostPerQuery: number

  constructor(private legacySource: BaseDataSource) {
    // Skip debriefer's own caching/rate limiting since the legacy source handles both
    super({ ignoreCache: true })
    this.name = legacySource.name
    this.type = legacySource.type
    this.reliabilityTier = mapTier(legacySource.reliabilityTier)
    // Access the protected domain via the source's type as fallback
    this.domain = (legacySource as unknown as { domain: string }).domain ?? legacySource.type
    this.isFree = legacySource.isFree
    this.estimatedCostPerQuery = legacySource.estimatedCostPerQuery
  }

  protected async fetchResult(
    subject: ResearchSubject,
    _signal: AbortSignal
  ): Promise<RawFinding | null> {
    const actor = subjectToActor(subject)
    const result = await this.legacySource.lookup(actor)

    if (!result.success || !result.data) {
      return null
    }

    // Collect text from primary result and any additional results (multi-story sources
    // like Guardian/NYTimes return multiple articles per actor via additionalResults)
    const texts: string[] = []
    if (result.data.circumstances?.trim()) {
      texts.push(result.data.circumstances)
    }
    if (result.additionalResults) {
      for (const additional of result.additionalResults) {
        if (additional.data?.circumstances?.trim()) {
          texts.push(additional.data.circumstances)
        }
      }
    }

    if (texts.length === 0) {
      return null
    }

    return {
      text: texts.join("\n\n---\n\n"),
      url: result.source.url ?? undefined,
      confidence: result.source.confidence,
      costUsd: result.source.costUsd ?? 0,
    }
  }

  isAvailable(): boolean {
    return this.legacySource.isAvailable()
  }
}

/**
 * Reconstructs an ActorForEnrichment from a ResearchSubject.
 *
 * The enrichment runner passes actor-specific fields via subject.context.
 */
function subjectToActor(subject: ResearchSubject): ActorForEnrichment {
  const ctx = (subject.context ?? {}) as Record<string, unknown>
  return {
    id: typeof subject.id === "number" ? subject.id : parseInt(String(subject.id), 10) || 0,
    tmdbId: (ctx.tmdbId as number) ?? null,
    imdbPersonId: (ctx.imdbPersonId as string) ?? null,
    name: subject.name,
    birthday: (ctx.birthday as string) ?? null,
    deathday: (ctx.deathday as string) ?? null,
    causeOfDeath: (ctx.causeOfDeath as string) ?? null,
    causeOfDeathDetails: (ctx.causeOfDeathDetails as string) ?? null,
    popularity: (ctx.popularity as number) ?? null,
  }
}

/**
 * Wraps an array of legacy deadonfilm sources as debriefer BaseResearchSource[].
 */
export function adaptLegacySources(
  sources: BaseDataSource[]
): BaseResearchSource<ResearchSubject>[] {
  return sources.filter((s) => s.isAvailable()).map((s) => new LegacySourceAdapter(s))
}
