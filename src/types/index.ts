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

// Unified search result (for mixed movie/TV search)
export interface UnifiedSearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  media_type: "movie" | "tv"
}

export type SearchMediaType = "movie" | "tv" | "all"

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[]
  page: number
  total_pages: number
  total_results: number
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

// Forever Young types - movies featuring actors who died tragically young
export interface ForeverYoungMovie {
  rank: number
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  actor: {
    id: number
    name: string
    profilePath: string | null
    yearsLost: number
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
  }
}

export interface ForeverYoungResponse {
  movies: ForeverYoungMovie[]
  pagination: PaginationInfo
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

// COVID-19 Deaths types
export interface CovidDeath {
  rank: number
  id: number
  name: string
  deathday: string
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  profilePath: string | null
  ageAtDeath: number | null
}

export interface CovidDeathsResponse {
  persons: CovidDeath[]
  pagination: PaginationInfo
}

// Unnatural Deaths types
export type UnnaturalDeathCategory = "suicide" | "accident" | "overdose" | "homicide" | "other"

export interface UnnaturalDeathCategoryInfo {
  id: UnnaturalDeathCategory
  label: string
  count: number
}

export interface UnnaturalDeath {
  rank: number
  id: number
  name: string
  deathday: string
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  profilePath: string | null
  ageAtDeath: number | null
}

export interface UnnaturalDeathsResponse {
  persons: UnnaturalDeath[]
  pagination: PaginationInfo
  categories: UnnaturalDeathCategoryInfo[]
  selectedCategory: UnnaturalDeathCategory | "all"
  hideSuicides: boolean
}

// Featured Movie types
export interface FeaturedMovie {
  tmdbId: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

export interface FeaturedMovieResponse {
  movie: FeaturedMovie | null
}

// Trivia types
export interface TriviaFact {
  type: string
  title: string
  value: string
  link?: string
}

export interface TriviaResponse {
  facts: TriviaFact[]
}

// This Week Deaths types
export interface ThisWeekDeath {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  ageAtDeath: number | null
  yearOfDeath: number
}

export interface ThisWeekDeathsResponse {
  deaths: ThisWeekDeath[]
  weekRange: {
    start: string
    end: string
  }
}

// Popular Movies types
export interface PopularMovie {
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  popularity: number
}

export interface PopularMoviesResponse {
  movies: PopularMovie[]
}

// Deaths by Cause types
export interface CauseCategory {
  cause: string
  count: number
  slug: string
}

export interface CauseCategoriesResponse {
  causes: CauseCategory[]
}

export interface DeathByCause {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface DeathsByCauseResponse {
  cause: string
  slug: string
  deaths: DeathByCause[]
  pagination: PaginationInfo
}

// Deaths by Decade types
export interface DecadeCategory {
  decade: number
  count: number
}

export interface DecadeCategoriesResponse {
  decades: DecadeCategory[]
}

export interface DeathByDecade {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface DeathsByDecadeResponse {
  decade: number
  decadeLabel: string
  deaths: DeathByDecade[]
  pagination: PaginationInfo
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

// All Deaths types
export interface AllDeath {
  rank: number
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  ageAtDeath: number | null
}

export interface AllDeathsResponse {
  deaths: AllDeath[]
  pagination: PaginationInfo
}

// Movies by Genre types
export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export interface GenreCategoriesResponse {
  genres: GenreCategory[]
}

export interface MovieByGenre {
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number | null
  mortalitySurpriseScore: number | null
}

export interface MoviesByGenreResponse {
  genre: string
  slug: string
  movies: MovieByGenre[]
  pagination: PaginationInfo
}

// TV Show types
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
