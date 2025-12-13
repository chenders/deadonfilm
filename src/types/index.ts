// UI types
export type ViewMode = "list" | "timeline"

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
    // Mortality statistics
    expectedDeaths: number
    mortalitySurpriseScore: number
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

export interface RandomMovieResponse {
  id: number
  title: string
  release_date: string
}

export interface SiteStatsResponse {
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  avgMortalityPercentage: number | null
}

export interface RecentDeathsResponse {
  deaths: Array<{
    tmdb_id: number
    name: string
    deathday: string
    cause_of_death: string | null
    profile_path: string | null
  }>
}

export interface CursedMovie {
  rank: number
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

export interface PaginationInfo {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface CursedMoviesResponse {
  movies: CursedMovie[]
  pagination: PaginationInfo
}

export interface CursedMoviesFiltersResponse {
  maxMinDeaths: number
}

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

export interface ActorCostarStats {
  totalMoviesAnalyzed: number
  totalCostarDeaths: number
  totalExpectedDeaths: number
  curseScore: number
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
  costarStats: ActorCostarStats | null
  deathInfo: ActorDeathInfo | null
}
