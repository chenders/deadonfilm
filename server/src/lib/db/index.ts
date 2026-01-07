/**
 * Database module barrel file.
 *
 * This file provides a single entry point for database functionality.
 * For now, it re-exports from the main db.ts file.
 * As we split db.ts into domain modules, exports will be added here.
 *
 * Structure:
 * - ./pool.ts - Connection pool management
 * - ./types.ts - Type definitions (interfaces, type aliases)
 * - ./stats.ts - Site statistics and sync state functions
 * - ./trivia.ts - Trivia facts and popular/featured content
 * - ./actors.ts - Actor CRUD and filmography functions
 * - ./movies.ts - Movie CRUD and discovery functions
 * - ./shows.ts - Shows, seasons, and episodes CRUD functions
 * - ./appearances.ts - Actor movie and show appearances
 * - ./deaths-discovery.ts - Death discovery features (by decade, COVID, unnatural, etc.)
 */

// Re-export pool functions
export { getPool, resetPool, queryWithRetry, initDatabase } from "./pool.js"

// Re-export stats functions
export {
  getSiteStats,
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
} from "./stats.js"

// Re-export trivia functions
export {
  getMostCursedMovie,
  getTrivia,
  getDeathsThisWeek,
  getDeathsThisWeekSimple,
  getPopularMovies,
} from "./trivia.js"

// Re-export actor functions
export {
  getActor,
  getActors,
  upsertActor,
  batchUpsertActors,
  updateDeathInfo,
  updateDeathInfoByActorId,
  getActorById,
  getDeceasedByMonthDay,
  getActorFilmography,
  getActorShowFilmography,
} from "./actors.js"

// Re-export movie functions
export { getMovie, upsertMovie, getHighMortalityMovies, getMaxValidMinDeaths } from "./movies.js"

// Re-export show functions
export {
  getShow,
  upsertShow,
  updateShowExternalIds,
  getSeasons,
  upsertSeason,
  getEpisodes,
  getEpisodeCountsBySeasonFromDb,
  upsertEpisode,
} from "./shows.js"

// Re-export appearances functions
export {
  upsertActorMovieAppearance,
  batchUpsertActorMovieAppearances,
  getActorMovies,
  upsertShowActorAppearance,
  batchUpsertShowActorAppearances,
  getShowActors,
} from "./appearances.js"

// Re-export deaths-discovery functions
export {
  getDeathsByDecade,
  getRecentDeaths,
  getForeverYoungMovies,
  getForeverYoungMoviesPaginated,
  getCovidDeaths,
  UNNATURAL_DEATH_CATEGORIES,
  getUnnaturalDeaths,
  getAllDeaths,
  getDeathWatchActors,
} from "./deaths-discovery.js"

// Re-export all types
export type * from "./types.js"
