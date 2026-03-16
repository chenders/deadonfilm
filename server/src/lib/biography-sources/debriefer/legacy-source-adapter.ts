/**
 * Adapts a deadonfilm BaseBiographySource to debriefer's BaseResearchSource interface.
 *
 * Allows biography-only sources (Britannica, Biography.com, TCM, AllMusic,
 * Smithsonian, History.com, IA Books, DuckDuckGo) to run inside debriefer's
 * ResearchOrchestrator alongside debriefer-sources.
 *
 * The adapter delegates lookup to the legacy source's existing `lookup()` method,
 * which retains its own PostgreSQL-backed caching, rate limiting, and timeout handling.
 */

import { BaseResearchSource, type ReliabilityTier as DebrieferTier } from "@debriefer/core"
import type { ResearchSubject, RawFinding } from "@debriefer/core"
import type { BaseBiographySource } from "../base-source.js"
import type { ActorForBiography } from "../types.js"

function mapTier(tier: string): DebrieferTier {
  return tier as DebrieferTier
}

export class BioLegacySourceAdapter extends BaseResearchSource<ResearchSubject> {
  readonly name: string
  readonly type: string
  readonly reliabilityTier: DebrieferTier
  readonly domain: string
  readonly isFree: boolean
  readonly estimatedCostPerQuery: number

  constructor(private legacySource: BaseBiographySource) {
    super({ ignoreCache: true })
    this.name = legacySource.name
    this.type = legacySource.type
    this.reliabilityTier = mapTier(legacySource.reliabilityTier)
    this.domain = legacySource.type
    this.isFree = legacySource.isFree
    this.estimatedCostPerQuery = legacySource.estimatedCostPerQuery
  }

  protected async fetchResult(
    subject: ResearchSubject,
    _signal: AbortSignal
  ): Promise<RawFinding | null> {
    const actor = subjectToActor(subject)
    let result
    try {
      result = await this.legacySource.lookup(actor)
    } catch {
      return null
    }

    if (!result.success || !result.data) {
      return null
    }

    const text = result.data.text?.trim()
    if (!text) {
      return null
    }

    return {
      text,
      url: result.source.url ?? undefined,
      confidence: result.source.confidence,
      costUsd: result.source.costUsd ?? 0,
    }
  }

  isAvailable(): boolean {
    return this.legacySource.isAvailable()
  }
}

function toActorId(id: string | number): number {
  if (typeof id === "number") return id
  const parsed = parseInt(id, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid actor ID in ResearchSubject: ${String(id)}`)
  }
  return parsed
}

function subjectToActor(subject: ResearchSubject): ActorForBiography {
  const ctx = (subject.context ?? {}) as Record<string, unknown>
  return {
    id: toActorId(subject.id),
    tmdb_id: (ctx.tmdbId as number) ?? null,
    imdb_person_id: (ctx.imdbPersonId as string) ?? null,
    name: subject.name,
    birthday: (ctx.birthday as string) ?? null,
    deathday: (ctx.deathday as string) ?? null,
    wikipedia_url: null,
    biography_raw_tmdb: null,
    biography: (ctx.biography as string) ?? null,
    place_of_birth: (ctx.placeOfBirth as string) ?? null,
  }
}

/**
 * Wraps an array of legacy biography sources as debriefer BaseResearchSource[].
 */
export function adaptBioLegacySources(
  sources: BaseBiographySource[]
): BaseResearchSource<ResearchSubject>[] {
  return sources.filter((s) => s.isAvailable()).map((s) => new BioLegacySourceAdapter(s))
}
