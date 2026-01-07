/**
 * Shows route handlers barrel file.
 *
 * This file re-exports from the shows/ directory for backward compatibility.
 * New code should import directly from "./shows/index.js" or specific modules.
 */

export {
  getShow,
  searchShows,
  getShowSeasons,
  getSeason,
  getEpisode,
  getSeasonEpisodes,
} from "./shows/index.js"

// Re-export types for backward compatibility
export type {
  EpisodeAppearance,
  DeceasedActor,
  LivingActor,
  SeasonSummary,
  ShowResponse,
} from "./shows/index.js"
export { SHOW_CAST_LIMIT, ENDED_STATUSES } from "./shows/index.js"
