// Actor/Person types

import type { PaginationInfo } from "./common"
import type { ProjectInfo, RelatedCelebrity } from "./death"

// Date precision for partial dates (year-only, year+month, full date)
export type DatePrecision = "year" | "month" | "day"

export interface CastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
}

export interface PersonDetails {
  id: number
  name: string
  birthday: string | null
  birthdayPrecision?: DatePrecision | null
  deathday: string | null
  deathdayPrecision?: DatePrecision | null
  biography: string
  profile_path: string | null
  place_of_birth: string | null
}

export interface DeceasedActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  birthdayPrecision?: DatePrecision | null
  deathday: string
  deathdayPrecision?: DatePrecision | null
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
  tmdbUrl: string
  // Mortality statistics
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface LivingActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  birthdayPrecision?: DatePrecision | null
  age: number | null
}

// Cursed Actors types
export interface CursedActor {
  rank: number
  id: number
  name: string
  isDeceased: boolean
  totalMovies: number
  totalActualDeaths: number
  totalExpectedDeaths: number
  curseScore: number
}

export interface CursedActorsResponse {
  actors: CursedActor[]
  pagination: PaginationInfo
}

// Actor Profile types
export interface ActorFilmographyMovie {
  movieId: number
  title: string
  releaseYear: number | null
  character: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
}

export interface ActorFilmographyShow {
  showId: number
  name: string
  firstAirYear: number | null
  lastAirYear: number | null
  character: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  episodeCount: number
}

export interface ActorDeathInfo {
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
  ageAtDeath: number | null
  yearsLost: number | null
  hasDetailedDeathInfo: boolean
  notableFactors: string[] | null
  career: {
    statusAtDeath: string | null
    lastProject: ProjectInfo | null
    posthumousReleases: ProjectInfo[] | null
  } | null
  relatedCelebrities: RelatedCelebrity[] | null
}

export interface BiographyDetails {
  narrativeTeaser: string | null
  narrative: string | null
  narrativeConfidence: "high" | "medium" | "low" | null
  lifeNotableFactors: string[]
  birthplaceDetails: string | null
  familyBackground: string | null
  education: string | null
  preFameLife: string | null
  fameCatalyst: string | null
  personalStruggles: string | null
  relationships: string | null
  lesserKnownFacts: string[]
  sources: Record<string, unknown> | null
}

export interface ActorProfileResponse {
  actor: {
    id: number
    name: string
    birthday: string | null
    birthdayPrecision?: DatePrecision | null
    deathday: string | null
    deathdayPrecision?: DatePrecision | null
    biography: string
    biographySourceUrl: string | null
    biographySourceType: "wikipedia" | "tmdb" | "imdb" | null
    profilePath: string | null
    placeOfBirth: string | null
  }
  analyzedFilmography: ActorFilmographyMovie[]
  analyzedTVFilmography: ActorFilmographyShow[]
  deathInfo: ActorDeathInfo | null
  biographyDetails: BiographyDetails | null
}

// Death Watch types
export interface DeathWatchActor {
  rank: number
  id: number
  name: string
  age: number
  birthday: string
  profilePath: string | null
  deathProbability: number // 0-1, probability of dying in next year
  yearsRemaining: number | null // Life expectancy - current age
  totalMovies: number
}

export interface DeathWatchResponse {
  actors: DeathWatchActor[]
  pagination: PaginationInfo
}
