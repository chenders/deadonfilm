// Re-export all types from domain-specific modules for backward compatibility

// Common types
export type { ViewMode, PaginationInfo } from "./common"

// Actor types
export type {
  CastMember,
  PersonDetails,
  DeceasedActor,
  LivingActor,
  CursedActor,
  CursedActorsResponse,
  ActorFilmographyMovie,
  ActorDeathInfo,
  ActorProfileResponse,
  DeathWatchActor,
  DeathWatchResponse,
} from "./actor"

// Movie types
export type {
  MovieSearchResult,
  UnifiedSearchResult,
  SearchMediaType,
  UnifiedSearchResponse,
  MovieDetails,
  SearchResponse,
  MovieResponse,
  DeathInfoResponse,
  RandomMovieResponse,
  CursedMovie,
  CursedMoviesResponse,
  CursedMoviesFiltersResponse,
  FeaturedMovie,
  FeaturedMovieResponse,
  PopularMovie,
  PopularMoviesResponse,
  MovieByGenre,
  MoviesByGenreResponse,
} from "./movie"

// Death types
export type {
  OnThisDayResponse,
  RecentDeathsResponse,
  CovidDeath,
  CovidDeathsResponse,
  UnnaturalDeathCategory,
  UnnaturalDeathCategoryInfo,
  UnnaturalDeath,
  UnnaturalDeathsResponse,
  ThisWeekDeath,
  ThisWeekDeathsResponse,
  AllDeath,
  AllDeathsResponse,
  DeathByCause,
  DeathsByCauseResponse,
  DeathByDecade,
  DeathsByDecadeResponse,
} from "./death"

// Show types
export type {
  ShowSearchResult,
  TVSearchResponse,
  ShowDetails,
  SeasonSummary,
  EpisodeAppearance,
  DeceasedShowActor,
  LivingShowActor,
  ShowResponse,
  EpisodeDetails,
  EpisodeShowInfo,
  EpisodeResponse,
} from "./show"

// Discovery types
export type {
  ForeverYoungMovie,
  ForeverYoungResponse,
  SiteStatsResponse,
  TriviaFact,
  TriviaResponse,
  CauseCategory,
  CauseCategoriesResponse,
  DecadeCategory,
  DecadeCategoriesResponse,
  GenreCategory,
  GenreCategoriesResponse,
} from "./discovery"
