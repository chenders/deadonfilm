// Movie types
export interface MovieSearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
}

export interface MovieDetails {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  runtime: number | null
  genres: Array<{ id: number; name: string }>
}

// Actor/Person types
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
}

export interface LivingActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  age: number | null
}

// API Response types
export interface SearchResponse {
  results: MovieSearchResult[]
  page: number
  total_pages: number
  total_results: number
}

export interface MovieResponse {
  movie: MovieDetails
  deceased: DeceasedActor[]
  living: LivingActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
  }
  lastSurvivor: LivingActor | null
  enrichmentPending?: boolean
}

export interface DeathInfoResponse {
  pending: boolean
  deathInfo: Record<
    number,
    { causeOfDeath: string | null; causeOfDeathDetails: string | null; wikipediaUrl: string | null }
  >
}

export interface OnThisDayResponse {
  date: string
  month: string
  day: string
  deaths: Array<{
    actor: {
      id: number
      name: string
      profile_path: string | null
      deathday: string
    }
    notableFilms: Array<{
      id: number
      title: string
      year: string
    }>
  }>
  message?: string
}
