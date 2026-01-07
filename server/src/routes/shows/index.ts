/**
 * Shows route handlers barrel file.
 *
 * This file provides a single entry point for all show-related route handlers.
 */

// Re-export show details handler
export { getShow } from "./show-details.js"

// Re-export search handler
export { searchShows } from "./search.js"

// Re-export season handlers
export { getShowSeasons, getSeason } from "./season.js"

// Re-export episode handlers
export { getEpisode, getSeasonEpisodes } from "./episode.js"

// Re-export types for convenience
export type {
  EpisodeAppearance,
  DeceasedActor,
  LivingActor,
  SeasonSummary,
  ShowResponse,
} from "./types.js"
export { SHOW_CAST_LIMIT, ENDED_STATUSES } from "./types.js"
