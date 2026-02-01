/**
 * Shows database functions.
 *
 * Functions for managing TV shows, seasons, and episodes in the database.
 */

import { getPool } from "./pool.js"
import type { ShowRecord, SeasonRecord, EpisodeRecord } from "./types.js"

// ============================================================================
// TV Shows CRUD functions
// ============================================================================

// Get a show by TMDB ID
export async function getShow(tmdbId: number): Promise<ShowRecord | null> {
  const db = getPool()
  const result = await db.query<ShowRecord>("SELECT * FROM shows WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Insert or update a show
export async function upsertShow(show: ShowRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, last_air_date, poster_path, backdrop_path,
       genres, status, number_of_seasons, number_of_episodes, tmdb_popularity, tmdb_vote_average,
       origin_country, original_language, cast_count, deceased_count, living_count,
       expected_deaths, mortality_surprise_score,
       omdb_imdb_rating, omdb_imdb_votes, omdb_rotten_tomatoes_score,
       omdb_rotten_tomatoes_audience, omdb_metacritic_score, omdb_updated_at,
       omdb_total_seasons, omdb_awards_wins, omdb_awards_nominations,
       trakt_rating, trakt_votes, trakt_watchers, trakt_plays,
       trakt_trending_rank, trakt_updated_at,
       thetvdb_score,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25,
       $26, $27, $28,
       $29, $30, $31, $32, $33, $34,
       $35,
       CURRENT_TIMESTAMP
     )
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       first_air_date = EXCLUDED.first_air_date,
       last_air_date = EXCLUDED.last_air_date,
       poster_path = EXCLUDED.poster_path,
       backdrop_path = EXCLUDED.backdrop_path,
       genres = EXCLUDED.genres,
       status = EXCLUDED.status,
       number_of_seasons = EXCLUDED.number_of_seasons,
       number_of_episodes = EXCLUDED.number_of_episodes,
       tmdb_popularity = EXCLUDED.tmdb_popularity,
       tmdb_vote_average = EXCLUDED.tmdb_vote_average,
       origin_country = EXCLUDED.origin_country,
       original_language = COALESCE(EXCLUDED.original_language, shows.original_language),
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       omdb_imdb_rating = COALESCE(EXCLUDED.omdb_imdb_rating, shows.omdb_imdb_rating),
       omdb_imdb_votes = COALESCE(EXCLUDED.omdb_imdb_votes, shows.omdb_imdb_votes),
       omdb_rotten_tomatoes_score = COALESCE(EXCLUDED.omdb_rotten_tomatoes_score, shows.omdb_rotten_tomatoes_score),
       omdb_rotten_tomatoes_audience = COALESCE(EXCLUDED.omdb_rotten_tomatoes_audience, shows.omdb_rotten_tomatoes_audience),
       omdb_metacritic_score = COALESCE(EXCLUDED.omdb_metacritic_score, shows.omdb_metacritic_score),
       omdb_updated_at = COALESCE(EXCLUDED.omdb_updated_at, shows.omdb_updated_at),
       omdb_total_seasons = COALESCE(EXCLUDED.omdb_total_seasons, shows.omdb_total_seasons),
       omdb_awards_wins = COALESCE(EXCLUDED.omdb_awards_wins, shows.omdb_awards_wins),
       omdb_awards_nominations = COALESCE(EXCLUDED.omdb_awards_nominations, shows.omdb_awards_nominations),
       trakt_rating = COALESCE(EXCLUDED.trakt_rating, shows.trakt_rating),
       trakt_votes = COALESCE(EXCLUDED.trakt_votes, shows.trakt_votes),
       trakt_watchers = COALESCE(EXCLUDED.trakt_watchers, shows.trakt_watchers),
       trakt_plays = COALESCE(EXCLUDED.trakt_plays, shows.trakt_plays),
       trakt_trending_rank = COALESCE(EXCLUDED.trakt_trending_rank, shows.trakt_trending_rank),
       trakt_updated_at = COALESCE(EXCLUDED.trakt_updated_at, shows.trakt_updated_at),
       thetvdb_score = COALESCE(EXCLUDED.thetvdb_score, shows.thetvdb_score),
       updated_at = CURRENT_TIMESTAMP`,
    [
      show.tmdb_id,
      show.name,
      show.first_air_date,
      show.last_air_date,
      show.poster_path,
      show.backdrop_path,
      show.genres,
      show.status,
      show.number_of_seasons,
      show.number_of_episodes,
      show.tmdb_popularity,
      show.tmdb_vote_average,
      show.origin_country,
      show.original_language,
      show.cast_count,
      show.deceased_count,
      show.living_count,
      show.expected_deaths,
      show.mortality_surprise_score,
      show.omdb_imdb_rating || null,
      show.omdb_imdb_votes || null,
      show.omdb_rotten_tomatoes_score || null,
      show.omdb_rotten_tomatoes_audience || null,
      show.omdb_metacritic_score || null,
      show.omdb_updated_at || null,
      show.omdb_total_seasons ?? null,
      show.omdb_awards_wins ?? null,
      show.omdb_awards_nominations ?? null,
      show.trakt_rating || null,
      show.trakt_votes || null,
      show.trakt_watchers || null,
      show.trakt_plays || null,
      show.trakt_trending_rank || null,
      show.trakt_updated_at || null,
      show.thetvdb_score || null,
    ]
  )
}

// Update external IDs for a show (TVmaze, TheTVDB, IMDb)
export async function updateShowExternalIds(
  tmdbId: number,
  tvmazeId: number | null,
  thetvdbId: number | null,
  imdbId?: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE shows
     SET tvmaze_id = COALESCE($2, tvmaze_id),
         thetvdb_id = COALESCE($3, thetvdb_id),
         imdb_id = COALESCE($4, imdb_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE tmdb_id = $1`,
    [tmdbId, tvmazeId, thetvdbId, imdbId ?? null]
  )
}

// ============================================================================
// Seasons CRUD functions
// ============================================================================

// Get seasons for a show
export async function getSeasons(showTmdbId: number): Promise<SeasonRecord[]> {
  const db = getPool()
  const result = await db.query<SeasonRecord>(
    "SELECT * FROM seasons WHERE show_tmdb_id = $1 ORDER BY season_number",
    [showTmdbId]
  )
  return result.rows
}

// Insert or update a season
export async function upsertSeason(season: SeasonRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO seasons (
       show_tmdb_id, season_number, name, air_date, episode_count, poster_path,
       cast_count, deceased_count, expected_deaths, mortality_surprise_score
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (show_tmdb_id, season_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       episode_count = EXCLUDED.episode_count,
       poster_path = EXCLUDED.poster_path,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score`,
    [
      season.show_tmdb_id,
      season.season_number,
      season.name,
      season.air_date,
      season.episode_count,
      season.poster_path,
      season.cast_count,
      season.deceased_count,
      season.expected_deaths,
      season.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Episodes CRUD functions
// ============================================================================

// Get episodes for a season
export async function getEpisodes(
  showTmdbId: number,
  seasonNumber: number
): Promise<EpisodeRecord[]> {
  const db = getPool()
  const result = await db.query<EpisodeRecord>(
    "SELECT * FROM episodes WHERE show_tmdb_id = $1 AND season_number = $2 ORDER BY episode_number",
    [showTmdbId, seasonNumber]
  )
  return result.rows
}

// Get episode counts grouped by season for a show
export async function getEpisodeCountsBySeasonFromDb(
  showTmdbId: number
): Promise<Map<number, number>> {
  const db = getPool()
  const result = await db.query<{ season_number: number; count: string }>(
    "SELECT season_number, COUNT(*) as count FROM episodes WHERE show_tmdb_id = $1 GROUP BY season_number ORDER BY season_number",
    [showTmdbId]
  )
  const counts = new Map<number, number>()
  for (const row of result.rows) {
    counts.set(row.season_number, parseInt(row.count, 10))
  }
  return counts
}

// Insert or update an episode
export async function upsertEpisode(episode: EpisodeRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO episodes (
       show_tmdb_id, season_number, episode_number, name, air_date, runtime,
       cast_count, deceased_count, guest_star_count, expected_deaths, mortality_surprise_score,
       episode_data_source, cast_data_source, tvmaze_episode_id, thetvdb_episode_id, imdb_episode_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (show_tmdb_id, season_number, episode_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       runtime = EXCLUDED.runtime,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       guest_star_count = EXCLUDED.guest_star_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       episode_data_source = COALESCE(EXCLUDED.episode_data_source, episodes.episode_data_source),
       cast_data_source = COALESCE(EXCLUDED.cast_data_source, episodes.cast_data_source),
       tvmaze_episode_id = COALESCE(EXCLUDED.tvmaze_episode_id, episodes.tvmaze_episode_id),
       thetvdb_episode_id = COALESCE(EXCLUDED.thetvdb_episode_id, episodes.thetvdb_episode_id),
       imdb_episode_id = COALESCE(EXCLUDED.imdb_episode_id, episodes.imdb_episode_id)`,
    [
      episode.show_tmdb_id,
      episode.season_number,
      episode.episode_number,
      episode.name,
      episode.air_date,
      episode.runtime,
      episode.cast_count,
      episode.deceased_count,
      episode.guest_star_count,
      episode.expected_deaths,
      episode.mortality_surprise_score,
      episode.episode_data_source ?? "tmdb",
      episode.cast_data_source ?? "tmdb",
      episode.tvmaze_episode_id ?? null,
      episode.thetvdb_episode_id ?? null,
      episode.imdb_episode_id ?? null,
    ]
  )
}
