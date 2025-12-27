// TV Show types

import type { DeceasedActor, LivingActor } from "./actor"

export interface ShowSearchResult {
  id: number
  name: string
  first_air_date: string
  poster_path: string | null
  overview: string
}

export interface TVSearchResponse {
  results: ShowSearchResult[]
  page: number
  total_pages: number
  total_results: number
}

export interface ShowDetails {
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

export interface SeasonSummary {
  seasonNumber: number
  name: string
  airDate: string | null
  episodeCount: number
  posterPath: string | null
}

export interface EpisodeAppearance {
  seasonNumber: number
  episodeNumber: number
  episodeName: string
  character: string
}

export interface DeceasedShowActor extends DeceasedActor {
  totalEpisodes: number
  episodes: EpisodeAppearance[]
}

export interface LivingShowActor extends LivingActor {
  totalEpisodes: number
  episodes: EpisodeAppearance[]
}

export interface ShowResponse {
  show: ShowDetails
  seasons: SeasonSummary[]
  deceased: DeceasedShowActor[]
  living: LivingShowActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
    expectedDeaths: number
    mortalitySurpriseScore: number
  }
}

// Episode summary for season episode list
export interface EpisodeSummary {
  episodeNumber: number
  seasonNumber: number
  name: string
  airDate: string | null
}

export interface SeasonEpisodesResponse {
  episodes: EpisodeSummary[]
}

// Episode types
export interface EpisodeDetails {
  id: number
  seasonNumber: number
  episodeNumber: number
  name: string
  overview: string
  airDate: string | null
  runtime: number | null
  stillPath: string | null
}

export interface EpisodeShowInfo {
  id: number
  name: string
  posterPath: string | null
  firstAirDate: string | null
}

export interface EpisodeResponse {
  show: EpisodeShowInfo
  episode: EpisodeDetails
  deceased: DeceasedShowActor[]
  living: LivingShowActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
  }
}

// Season page types
export interface SeasonInfo {
  seasonNumber: number
  name: string
  airDate: string | null
  posterPath: string | null
  episodeCount: number
}

export interface SeasonEpisodeWithStats {
  episodeNumber: number
  seasonNumber: number
  name: string
  airDate: string | null
  runtime: number | null
  guestStarCount: number
  deceasedCount: number
}

export interface SeasonResponse {
  show: EpisodeShowInfo
  season: SeasonInfo
  episodes: SeasonEpisodeWithStats[]
  stats: {
    totalEpisodes: number
    totalGuestStars: number
    uniqueDeceasedGuestStars: number
  }
}
