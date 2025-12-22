/**
 * Database types and interfaces.
 * Shared type definitions used across database modules.
 */

export type DeathInfoSource = "claude" | "wikipedia" | null

export interface DeceasedPersonRecord {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  profile_path: string | null
  age_at_death: number | null
  expected_lifespan: number | null
  years_lost: number | null
}

export interface MovieRecord {
  tmdb_id: number
  title: string
  release_date: string | null
  release_year: number | null
  poster_path: string | null
  genres: string[]
  original_language: string | null
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
  minDeaths?: number
  decade?: string
  includeObscure?: boolean
}

export interface FeaturedMovieRecord {
  tmdb_id: number
  title: string
  release_year: number
  poster_path: string | null
  deceased_count: number
  expected_deaths: number
  mortality_surprise_score: number
}

export interface TriviaFact {
  label: string
  value: string
  linkTo?: string
}

export interface ThisWeekDeathRecord {
  tmdb_id: number
  name: string
  profile_path: string | null
  deathday: string
}

export interface PopularMovieRecord {
  tmdb_id: number
  title: string
  release_year: number
  poster_path: string | null
  deceased_count: number
  cast_count: number
  popularity: number
}

export interface CauseCategory {
  slug: string
  name: string
  count: number
}

export interface DeathByCauseRecord {
  tmdb_id: number
  name: string
  deathday: string
  cause_of_death: string | null
  cause_of_death_details: string | null
  profile_path: string | null
  age_at_death: number | null
}

export interface DeathsByCauseOptions {
  limit?: number
  offset?: number
}

export interface DecadeCategory {
  decade: string
  count: number
}

export interface DeathByDecadeRecord {
  tmdb_id: number
  name: string
  deathday: string
  cause_of_death: string | null
  cause_of_death_details: string | null
  profile_path: string | null
  age_at_death: number | null
}

export interface DeathsByDecadeOptions {
  limit?: number
  offset?: number
}

export interface ActorAppearanceRecord {
  actor_tmdb_id: number
  movie_tmdb_id: number
  actor_name: string
  character_name: string | null
  billing_order: number | null
  age_at_filming: number | null
  is_deceased: boolean
}

export interface CursedActorsOptions {
  limit?: number
  offset?: number
  minMovies?: number
  minScore?: number
  includeObscure?: boolean
}

export interface CursedActorRecord {
  actor_tmdb_id: number
  actor_name: string
  profile_path: string | null
  movie_count: number
  total_costar_deaths: number
  total_expected_deaths: number
  curse_score: number
}

export interface SiteStats {
  totalMovies: number
  totalShows: number
  totalDeceased: number
  totalLiving: number
  mostCursedMovie: {
    title: string
    tmdbId: number
    score: number
  } | null
  mostCursedActor: {
    name: string
    tmdbId: number
    score: number
  } | null
}

export interface SyncStateRecord {
  id: number
  sync_type: string
  last_sync_date: string
  last_run_at: string
  items_processed: number
  new_deaths_found: number
  movies_updated: number
  errors_count: number
}

export interface ForeverYoungMovie {
  tmdb_id: number
  name: string
  deathday: string
  age_at_death: number
  expected_lifespan: number
  years_lost: number
  profile_path: string | null
}

export interface ForeverYoungMovieRecord {
  tmdb_id: number
  name: string
  profile_path: string | null
  deathday: string
  age_at_death: number
  expected_lifespan: number
  years_lost: number
  cause_of_death: string | null
  cause_of_death_details: string | null
}

export interface ForeverYoungOptions {
  limit?: number
  offset?: number
}

export interface ActorFilmographyMovie {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  character_name: string | null
  billing_order: number | null
  deceased_count: number
  cast_count: number
  media_type: "movie" | "tv"
}

export interface CovidDeathOptions {
  limit?: number
  offset?: number
}

export type UnnaturalDeathCategory = "suicide" | "accident" | "overdose" | "homicide" | "other"

export interface UnnaturalDeathsOptions {
  limit?: number
  offset?: number
  category?: UnnaturalDeathCategory | "all"
  hideSuicides?: boolean
}

export interface AllDeathsOptions {
  limit?: number
  offset?: number
}

export interface DeathWatchOptions {
  limit?: number
  offset?: number
  minAge?: number
  minMovies?: number
  includeObscure?: boolean
}

export interface DeathWatchActorRecord {
  actor_tmdb_id: number
  actor_name: string
  profile_path: string | null
  birthday: string
  current_age: number
  death_probability: number
  movie_count: number
}

export interface GenreCategory {
  slug: string
  name: string
  count: number
}

export interface MovieByGenreRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  mortality_surprise_score: number
}

export interface MoviesByGenreOptions {
  limit?: number
  offset?: number
}

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
}

export interface SeasonRecord {
  show_tmdb_id: number
  season_number: number
  tmdb_id: number
  name: string
  air_date: string | null
  poster_path: string | null
  episode_count: number
  overview: string | null
}

export interface EpisodeRecord {
  show_tmdb_id: number
  season_number: number
  episode_number: number
  tmdb_id: number
  name: string
  air_date: string | null
  still_path: string | null
  overview: string | null
  vote_average: number
  cast_count: number
  deceased_count: number
  living_count: number
  expected_deaths: number
  mortality_surprise_score: number
}

export interface ShowActorAppearanceRecord {
  actor_tmdb_id: number
  show_tmdb_id: number
  season_number: number | null
  episode_number: number | null
  actor_name: string
  character_name: string | null
  billing_order: number | null
  age_at_filming: number | null
  is_deceased: boolean
}
