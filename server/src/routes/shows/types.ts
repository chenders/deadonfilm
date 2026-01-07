/**
 * Shared type definitions for show route handlers.
 */

import type { DeathInfoSource } from "../../lib/wikidata.js"

export interface EpisodeAppearance {
  seasonNumber: number
  episodeNumber: number
  episodeName: string
  character: string
}

export interface DeceasedActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  causeOfDeath: string | null
  causeOfDeathSource: DeathInfoSource
  causeOfDeathDetails: string | null
  causeOfDeathDetailsSource: DeathInfoSource
  wikipediaUrl: string | null
  tmdbUrl: string
  ageAtDeath: number | null
  yearsLost: number | null
  totalEpisodes: number
  episodes: EpisodeAppearance[]
}

export interface LivingActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  age: number | null
  totalEpisodes: number
  episodes: EpisodeAppearance[]
}

export interface SeasonSummary {
  seasonNumber: number
  name: string
  airDate: string | null
  episodeCount: number
  posterPath: string | null
}

export interface ShowResponse {
  show: {
    id: number
    name: string
    firstAirDate: string | null
    lastAirDate: string | null
    posterPath: string | null
    backdropPath: string | null
    overview: string
    status: string
    numberOfSeasons: number
    numberOfEpisodes: number
    genres: Array<{ id: number; name: string }>
  }
  seasons: SeasonSummary[]
  deceased: DeceasedActor[]
  living: LivingActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
    expectedDeaths: number
    mortalitySurpriseScore: number
  }
}

// Limit main cast to reduce API calls (movies use 30)
export const SHOW_CAST_LIMIT = 50

// Show statuses that indicate the show is finished and will never have new episodes
// Include both US spelling (Canceled) and UK spelling (Cancelled) for safety
export const ENDED_STATUSES = ["Ended", "Canceled", "Cancelled"]
