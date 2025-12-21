/**
 * Database module barrel file.
 *
 * This module provides pool management and type definitions.
 * Domain-specific functions remain in ../db.ts for now.
 *
 * Import pattern:
 *   import { getPool, DeceasedPersonRecord } from "./db/index.js"
 *   import * as db from "./db/index.js"
 */

// Pool management functions
export { getPool, resetPool, queryWithRetry, initDatabase } from "./pool.js"

// Type definitions
export type {
  DeathInfoSource,
  DeceasedPersonRecord,
  MovieRecord,
  HighMortalityOptions,
  FeaturedMovieRecord,
  TriviaFact,
  ThisWeekDeathRecord,
  PopularMovieRecord,
  CauseCategory,
  DeathByCauseRecord,
  DeathsByCauseOptions,
  DecadeCategory,
  DeathByDecadeRecord,
  DeathsByDecadeOptions,
  ActorAppearanceRecord,
  CursedActorsOptions,
  CursedActorRecord,
  SiteStats,
  SyncStateRecord,
  ForeverYoungMovie,
  ForeverYoungMovieRecord,
  ForeverYoungOptions,
  ActorFilmographyMovie,
  CovidDeathOptions,
  UnnaturalDeathCategory,
  UnnaturalDeathsOptions,
  AllDeathsOptions,
  DeathWatchOptions,
  DeathWatchActorRecord,
  GenreCategory,
  MovieByGenreRecord,
  MoviesByGenreOptions,
  ShowRecord,
  SeasonRecord,
  EpisodeRecord,
  ShowActorAppearanceRecord,
} from "./types.js"
