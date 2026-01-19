/**
 * Database type definitions.
 *
 * All interfaces and types used by database functions are defined here
 * to allow importing just types without pulling in function implementations.
 */

// ============================================================================
// Core types
// ============================================================================

export type DeathInfoSource = "claude" | "wikipedia" | null

// Date precision for partial dates (year-only, year+month, full date)
export type DatePrecision = "year" | "month" | "day"

// ============================================================================
// Actor types
// ============================================================================

// Actor record - unified table for all actors (living and deceased)
export interface ActorRecord {
  id: number
  tmdb_id: number | null // null for non-TMDB actors (from TVmaze/TheTVDB)
  name: string
  birthday: string | null
  birthday_precision?: DatePrecision | null // null/undefined means 'day' (full precision)
  deathday: string | null // null for living actors
  deathday_precision?: DatePrecision | null // null/undefined means 'day' (full precision)
  profile_path: string | null
  popularity: number | null

  // Death-related fields (null for living actors)
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: number | null
  years_lost: number | null
  violent_death: boolean | null

  // External IDs for cross-platform matching
  tvmaze_person_id: number | null
  thetvdb_person_id: number | null
  imdb_person_id: string | null // IMDb uses string IDs like "nm0000001"

  // Death date verification (source-level confidence from TMDB vs Wikidata)
  deathday_confidence: "verified" | "unverified" | "conflicting" | null
  deathday_verification_source: string | null // e.g., 'wikidata'
  deathday_verified_at: string | null

  // Computed column
  is_obscure: boolean | null
}

// Input type for upserting actors - only name is required
// tmdb_id can be null for non-TMDB actors
export type ActorInput = Pick<ActorRecord, "name"> &
  Partial<Omit<ActorRecord, "name" | "is_obscure">>

// Simplified movie appearance record (junction table only)
export interface ActorMovieAppearanceRecord {
  actor_id: number
  movie_tmdb_id: number
  character_name: string | null
  billing_order: number | null
  age_at_filming: number | null
}

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

// ============================================================================
// Movie types
// ============================================================================

export interface MovieRecord {
  tmdb_id: number
  title: string
  release_date: string | null
  release_year: number | null
  poster_path: string | null
  genres: string[]
  original_language: string | null
  production_countries: string[] | null
  popularity: number | null
  vote_average: number | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface HighMortalityOptions {
  limit?: number
  offset?: number
  fromYear?: number
  toYear?: number
  minDeadActors?: number
  includeObscure?: boolean
}

export interface FeaturedMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number
  mortality_surprise_score: number
}

export interface PopularMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  popularity: number
}

// ============================================================================
// Show types
// ============================================================================

export interface ShowRecord {
  tmdb_id: number
  name: string
  first_air_date: string | null
  last_air_date: string | null
  poster_path: string | null
  backdrop_path: string | null
  genres: string[]
  status: string | null
  number_of_seasons: number | null
  number_of_episodes: number | null
  popularity: number | null
  vote_average: number | null
  origin_country: string[]
  original_language: string | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
  tvmaze_id: number | null
  thetvdb_id: number | null
  imdb_id: string | null
}

export interface SeasonRecord {
  show_tmdb_id: number
  season_number: number
  name: string | null
  air_date: string | null
  episode_count: number | null
  poster_path: string | null
  cast_count: number | null
  deceased_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface EpisodeRecord {
  show_tmdb_id: number
  season_number: number
  episode_number: number
  name: string | null
  air_date: string | null
  runtime: number | null
  cast_count: number | null
  deceased_count: number | null
  guest_star_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
  episode_data_source?: string | null
  cast_data_source?: string | null
  tvmaze_episode_id?: number | null
  thetvdb_episode_id?: number | null
  imdb_episode_id?: string | null
}

export interface ShowActorAppearanceRecord {
  actor_id: number
  show_tmdb_id: number
  season_number: number
  episode_number: number
  character_name: string | null
  appearance_type: string
  billing_order: number | null
  age_at_filming: number | null
}

export interface DeceasedShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  age_at_death: number | null
  years_lost: number | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

export interface LivingShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

// ============================================================================
// Death discovery types
// ============================================================================

export interface ThisWeekDeathRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  year_of_death: number
}

export interface CovidDeathOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

export interface UnnaturalDeathsOptions {
  limit?: number
  offset?: number
  category?: UnnaturalDeathCategory | "all"
  hideSuicides?: boolean // Deprecated - use showSelfInflicted instead
  showSelfInflicted?: boolean
  includeObscure?: boolean
}

export type UnnaturalDeathCategory = "suicide" | "accident" | "overdose" | "homicide" | "other"

export interface AllDeathsOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
  search?: string
}

export interface DeathWatchOptions {
  limit?: number
  offset?: number
  minAge?: number
  includeObscure?: boolean
  search?: string
}

export interface DeathWatchActorRecord {
  actor_id: number
  actor_tmdb_id: number | null
  actor_name: string
  birthday: string
  age: number
  profile_path: string | null
  popularity: number | null
  total_movies: number
  total_episodes: number
}

export interface ForeverYoungMovie {
  tmdb_id: number
  title: string
  release_date: string | null
  actor_name: string
  years_lost: number
}

export interface ForeverYoungMovieRecord {
  movie_tmdb_id: number
  movie_title: string
  movie_release_year: number | null
  movie_poster_path: string | null
  actor_id: number
  actor_tmdb_id: number | null
  actor_name: string
  actor_profile_path: string | null
  years_lost: number
  cause_of_death: string | null
  cause_of_death_details: string | null
}

export interface ForeverYoungOptions {
  limit?: number
  offset?: number
}

// ============================================================================
// Cause of death types
// ============================================================================

export interface CauseCategory {
  cause: string
  count: number
  slug: string
}

export interface DeathByCauseRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string
  cause_of_death_details: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByCauseOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

export interface DecadeCategory {
  decade: number
  count: number
}

export interface DeathByDecadeRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByDecadeOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

export interface CauseCategoryStats {
  slug: string
  label: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  topCauses: Array<{ cause: string; count: number; slug: string }>
}

export interface CauseCategoryIndexResponse {
  categories: CauseCategoryStats[]
  totalWithKnownCause: number
  overallAvgAge: number | null
  overallAvgYearsLost: number | null
  mostCommonCategory: string | null
}

export interface CauseCategoryDetailResponse {
  slug: string
  label: string
  count: number
  percentage: number
  avgAge: number | null
  avgYearsLost: number | null
  notableActors: Array<{
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeath: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
  }>
  decadeBreakdown: Array<{ decade: string; count: number }>
  specificCauses: Array<{ cause: string; slug: string; count: number }>
  actors: Array<{
    rank: number
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeath: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

export interface CauseCategoryOptions {
  page?: number
  pageSize?: number
  specificCause?: string | null
  includeObscure?: boolean
}

export interface SpecificCauseResponse {
  cause: string
  slug: string
  categorySlug: string
  categoryLabel: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  notableActors: Array<{
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
  }>
  decadeBreakdown: Array<{ decade: string; count: number }>
  actors: Array<{
    rank: number
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

export interface SpecificCauseOptions {
  page?: number
  pageSize?: number
  includeObscure?: boolean
}

// ============================================================================
// Death circumstances types
// ============================================================================

export interface ProjectInfo {
  title: string
  year: number | null
  tmdb_id: number | null
  imdb_id: string | null
  type: "movie" | "show" | "documentary" | "unknown"
}

export interface RelatedCelebrity {
  name: string
  tmdb_id: number | null
  relationship: string
}

export interface SourceEntry {
  url: string | null
  archive_url: string | null
  description: string
}

export interface DeathSources {
  cause?: SourceEntry[]
  birthday?: SourceEntry[]
  deathday?: SourceEntry[]
  circumstances?: SourceEntry[]
  rumored?: SourceEntry[]
}

export interface ActorDeathCircumstancesRecord {
  id: number
  actor_id: number
  circumstances: string | null
  circumstances_confidence: string | null
  rumored_circumstances: string | null
  cause_confidence: string | null
  details_confidence: string | null
  birthday_confidence: string | null
  deathday_confidence: string | null
  location_of_death: string | null
  last_project: ProjectInfo | null
  career_status_at_death: string | null
  posthumous_releases: ProjectInfo[] | null
  related_celebrity_ids: number[] | null
  related_celebrities: RelatedCelebrity[] | null
  related_deaths: string | null
  notable_factors: string[] | null
  sources: DeathSources | null
  additional_context: string | null
  raw_response: unknown | null
  created_at: string
  updated_at: string
  // Enrichment tracking
  enriched_at: string | null
  enrichment_source: string | null
  enrichment_version: string | null
}

export interface NotableDeathActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string
  ageAtDeath: number | null
  causeOfDeath: string | null
  deathManner: string | null
  strangeDeath: boolean
  notableFactors: string[] | null
  circumstancesConfidence: string | null
  slug: string
}

export interface NotableDeathsOptions {
  page?: number
  pageSize?: number
  filter?: "all" | "strange" | "disputed" | "controversial"
  includeObscure?: boolean
}

export interface NotableDeathsResponse {
  actors: NotableDeathActor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

// ============================================================================
// Cursed actors types
// ============================================================================

export interface CursedActorsOptions {
  limit?: number
  offset?: number
  minMovies?: number
  actorStatus?: "living" | "deceased" | "all"
  fromYear?: number
  toYear?: number
}

export interface CursedActorRecord {
  actor_id: number
  actor_tmdb_id: number | null
  actor_name: string
  is_deceased: boolean
  total_movies: number
  total_actual_deaths: number
  total_expected_deaths: number
  curse_score: number
}

// ============================================================================
// Genre types
// ============================================================================

export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export interface MovieByGenreRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface MoviesByGenreOptions {
  limit?: number
  offset?: number
}

// ============================================================================
// Stats and sync types
// ============================================================================

export interface SiteStats {
  totalActors: number
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  topCauseOfDeathCategorySlug: string | null
  avgMortalityPercentage: number | null
  causeOfDeathPercentage: number | null
  actorsWithCauseKnown: number | null
}

export interface SyncStateRecord {
  sync_type: string
  last_sync_date: string
  last_run_at: Date
  items_processed: number
  new_deaths_found: number
  movies_updated: number
  errors_count: number
  current_phase: string | null
  last_processed_id: number | null
  phase_total: number | null
  phase_completed: number | null
}

export interface TriviaFact {
  type: string
  title: string
  value: string
  link?: string
}
