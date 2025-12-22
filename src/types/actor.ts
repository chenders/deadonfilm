// Actor/Person types

import type { PaginationInfo } from "./common"

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
  deathday: string | null
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
  deathday: string
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

export interface ActorDeathInfo {
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface ActorProfileResponse {
  actor: {
    id: number
    name: string
    birthday: string | null
    deathday: string | null
    biography: string
    profilePath: string | null
    placeOfBirth: string | null
  }
  analyzedFilmography: ActorFilmographyMovie[]
  deathInfo: ActorDeathInfo | null
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
