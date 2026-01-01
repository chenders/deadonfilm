/**
 * Episode Data Source Cascade Utility
 *
 * Handles fallback logic for fetching TV show episode and cast data:
 * TMDB → TVmaze → TheTVDB → IMDb
 *
 * TMDB is always tried first (best data quality, existing actor IDs).
 * Fallback sources are used when TMDB lacks data (common for older soap operas).
 */

import * as tmdb from "./tmdb.js"
import * as tvmaze from "./tvmaze.js"
import * as thetvdb from "./thetvdb.js"
import * as imdb from "./imdb.js"
import { getPool, getShow } from "./db.js"

// ============================================================
// Types
// ============================================================

export type DataSource = "tmdb" | "tvmaze" | "thetvdb" | "imdb"

export interface NormalizedEpisode {
  seasonNumber: number
  episodeNumber: number
  name: string | null
  overview: string | null
  airDate: string | null
  runtime: number | null
  stillPath: string | null
  // External IDs for cast lookups
  tmdbEpisodeId?: number
  tvmazeEpisodeId?: number
  thetvdbEpisodeId?: number
  imdbEpisodeId?: string
}

export interface NormalizedCastMember {
  name: string
  characterName: string | null
  birthday: string | null
  deathday: string | null
  profilePath: string | null
  billingOrder: number
  appearanceType: "regular" | "guest"
  // Source-specific IDs
  tmdbPersonId?: number
  tvmazePersonId?: number
  thetvdbPersonId?: number
  imdbPersonId?: string
  // IMDb only has year, not full date
  birthYear?: number | null
  deathYear?: number | null
}

export interface ExternalShowIds {
  tvmazeId: number | null
  thetvdbId: number | null
  imdbId: string | null
}

export interface DataGapResult {
  hasGaps: boolean
  missingSeasons: number[]
  details: string[]
}

// ============================================================
// Gap Detection
// ============================================================

/**
 * Detect TMDB data gaps for a show.
 * A gap exists when a season has episode_count > 0 but TMDB API returns 0 episodes.
 */
export async function detectTmdbDataGaps(showTmdbId: number): Promise<DataGapResult> {
  const result: DataGapResult = {
    hasGaps: false,
    missingSeasons: [],
    details: [],
  }

  try {
    const showDetails = await tmdb.getTVShowDetails(showTmdbId)

    for (const season of showDetails.seasons) {
      // Skip season 0 (specials)
      if (season.season_number === 0) continue

      // If TMDB says the season has episodes...
      if (season.episode_count > 0) {
        try {
          const seasonDetails = await tmdb.getSeasonDetails(showTmdbId, season.season_number)

          // ...but the API returns no episodes, we have a gap
          if (!seasonDetails.episodes || seasonDetails.episodes.length === 0) {
            result.hasGaps = true
            result.missingSeasons.push(season.season_number)
            result.details.push(
              `Season ${season.season_number}: expected ${season.episode_count} episodes, got 0`
            )
          }
        } catch (error) {
          // Season fetch failed - might be a gap or API error
          result.hasGaps = true
          result.missingSeasons.push(season.season_number)
          result.details.push(
            `Season ${season.season_number}: fetch failed (${error instanceof Error ? error.message : "unknown error"})`
          )
        }
      }
    }
  } catch (error) {
    result.details.push(
      `Failed to get show details: ${error instanceof Error ? error.message : "unknown error"}`
    )
  }

  return result
}

/**
 * Count the number of episodes for a show in the database.
 */
export async function countEpisodesInDb(showTmdbId: number): Promise<number> {
  const db = getPool()
  const result = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM episodes WHERE show_tmdb_id = $1",
    [showTmdbId]
  )
  return parseInt(result.rows[0]?.count || "0", 10)
}

/**
 * Improved gap detection that compares show's number_of_episodes metadata
 * against actual episode count in database.
 *
 * This catches cases where TMDB's seasons array is empty but the show metadata
 * indicates many episodes exist (common for old soap operas like "All My Children").
 *
 * Also checks against IMDb episode count when an IMDb ID is available, since
 * IMDb often has more complete episode data for older shows.
 *
 * @param showTmdbId - TMDB show ID
 * @param imdbId - Optional IMDb ID to check against (if not provided, will be looked up from show)
 * @returns DataGapResult with hasGaps=true if database is missing episodes
 */
export async function detectShowDataGaps(
  showTmdbId: number,
  imdbId?: string | null
): Promise<DataGapResult> {
  const result: DataGapResult = {
    hasGaps: false,
    missingSeasons: [],
    details: [],
  }

  try {
    // Get show from database to check number_of_episodes and imdb_id
    const show = await getShow(showTmdbId)
    if (!show) {
      result.details.push("Show not found in database")
      return result
    }

    // Use provided imdbId or fall back to show's imdb_id
    const showImdbId = imdbId ?? show.imdb_id

    const expectedEpisodes = show.number_of_episodes || 0
    const actualEpisodes = await countEpisodesInDb(showTmdbId)

    // Check against TMDB expected count
    if (expectedEpisodes > 0) {
      // Allow 10% tolerance for minor discrepancies
      const tolerance = Math.max(5, Math.floor(expectedEpisodes * 0.1))
      const missingCount = expectedEpisodes - actualEpisodes

      if (missingCount > tolerance) {
        result.hasGaps = true
        result.details.push(
          `Expected ${expectedEpisodes} episodes (TMDB), have ${actualEpisodes} (missing ${missingCount})`
        )
      }
    }

    // Also check for TMDB season-level gaps (episodes that exist in TMDB but failed to import)
    const tmdbGaps = await detectTmdbDataGaps(showTmdbId)
    if (tmdbGaps.hasGaps) {
      result.hasGaps = true
      result.missingSeasons = tmdbGaps.missingSeasons
      result.details.push(...tmdbGaps.details)
    }

    // Always check IMDb if we have an IMDb ID - it often has more complete data
    if (showImdbId) {
      try {
        const imdbEpisodes = await imdb.getShowEpisodes(showImdbId)
        if (imdbEpisodes.length > actualEpisodes) {
          result.hasGaps = true
          result.details.push(
            `IMDb has ${imdbEpisodes.length} episodes, database has ${actualEpisodes}`
          )

          // Get unique season numbers from IMDb
          const imdbSeasons = new Set(
            imdbEpisodes.filter((e) => e.seasonNumber !== null).map((e) => e.seasonNumber!)
          )
          // Add seasons that aren't already in missingSeasons
          for (const season of imdbSeasons) {
            if (!result.missingSeasons.includes(season)) {
              result.missingSeasons.push(season)
            }
          }
          result.missingSeasons.sort((a, b) => a - b)
        }
      } catch (error) {
        result.details.push(
          `IMDb check failed: ${error instanceof Error ? error.message : "unknown error"}`
        )
      }
    }

    // If expected episodes is 0 and no gaps found yet, fall back to TMDB gaps
    if (expectedEpisodes === 0 && !result.hasGaps) {
      return tmdbGaps
    }
  } catch (error) {
    result.details.push(
      `Failed to detect gaps: ${error instanceof Error ? error.message : "unknown error"}`
    )
  }

  return result
}

// ============================================================
// External ID Lookup
// ============================================================

/**
 * Get external IDs for a show from TMDB.
 */
export async function getExternalIds(showTmdbId: number): Promise<ExternalShowIds> {
  const result: ExternalShowIds = {
    tvmazeId: null,
    thetvdbId: null,
    imdbId: null,
  }

  try {
    const externalIds = await tmdb.getTVShowExternalIds(showTmdbId)
    result.thetvdbId = externalIds.tvdb_id
    result.imdbId = externalIds.imdb_id

    // TVmaze doesn't have a direct ID in TMDB, but we can look it up by TheTVDB ID
    if (result.thetvdbId) {
      const tvmazeShow = await tvmaze.lookupShowByTvdb(result.thetvdbId)
      if (tvmazeShow) {
        result.tvmazeId = tvmazeShow.id
      }
    }

    // If still no TVmaze ID, try by IMDb
    if (!result.tvmazeId && result.imdbId) {
      const tvmazeShow = await tvmaze.lookupShowByImdb(result.imdbId)
      if (tvmazeShow) {
        result.tvmazeId = tvmazeShow.id
      }
    }
  } catch (error) {
    console.error(`Failed to get external IDs for show ${showTmdbId}:`, error)
  }

  return result
}

// ============================================================
// Episode Fetching with Fallback
// ============================================================

/**
 * Normalize TMDB episode data to common format.
 */
function normalizeTmdbEpisode(ep: tmdb.TMDBEpisodeSummary): NormalizedEpisode {
  return {
    seasonNumber: ep.season_number,
    episodeNumber: ep.episode_number,
    name: ep.name,
    overview: null, // Episode summary doesn't include overview, need details call
    airDate: ep.air_date,
    runtime: ep.runtime,
    stillPath: null, // Episode summary doesn't include still_path
    tmdbEpisodeId: ep.id,
  }
}

/**
 * Normalize TVmaze episode data to common format.
 */
function normalizeTvmazeEpisode(ep: tvmaze.TVmazeEpisode): NormalizedEpisode {
  return {
    seasonNumber: ep.season,
    episodeNumber: ep.number,
    name: ep.name,
    overview: ep.summary ? stripHtml(ep.summary) : null,
    airDate: ep.airdate,
    runtime: ep.runtime,
    stillPath: ep.image?.original ?? ep.image?.medium ?? null,
    tvmazeEpisodeId: ep.id,
  }
}

/**
 * Normalize TheTVDB episode data to common format.
 */
function normalizeThetvdbEpisode(ep: thetvdb.TheTVDBEpisode): NormalizedEpisode {
  return {
    seasonNumber: ep.seasonNumber,
    episodeNumber: ep.number,
    name: ep.name,
    overview: ep.overview,
    airDate: ep.aired,
    runtime: ep.runtime,
    stillPath: ep.image,
    thetvdbEpisodeId: ep.id,
  }
}

/**
 * Normalize IMDb episode data to common format.
 */
function normalizeImdbEpisode(ep: imdb.NormalizedImdbEpisode): NormalizedEpisode {
  return {
    seasonNumber: ep.seasonNumber,
    episodeNumber: ep.episodeNumber,
    name: ep.name,
    overview: ep.overview,
    airDate: ep.airDate,
    runtime: ep.runtime,
    stillPath: ep.stillPath,
    imdbEpisodeId: ep.imdbEpisodeId,
  }
}

/**
 * Strip HTML tags from a string (TVmaze includes HTML in summaries).
 * Uses iterative replacement to handle nested/malformed tags.
 */
function stripHtml(html: string): string {
  let result = html
  let previous = ""
  // Iteratively remove tags until no more are found (handles nested cases like "<scr<script>ipt>")
  while (result !== previous) {
    previous = result
    result = result.replace(/<[^>]*>/g, "")
  }
  return result.trim()
}

/**
 * Fetch episodes for a season with fallback through data sources.
 *
 * @param showTmdbId - TMDB show ID
 * @param seasonNumber - Season number to fetch
 * @param externalIds - Pre-fetched external IDs (optional, will be fetched if not provided)
 * @returns Episodes and the source they came from
 */
export async function fetchEpisodesWithFallback(
  showTmdbId: number,
  seasonNumber: number,
  externalIds?: ExternalShowIds
): Promise<{ episodes: NormalizedEpisode[]; source: DataSource }> {
  // Try TMDB first
  try {
    const seasonDetails = await tmdb.getSeasonDetails(showTmdbId, seasonNumber)
    if (seasonDetails.episodes && seasonDetails.episodes.length > 0) {
      return {
        episodes: seasonDetails.episodes.map(normalizeTmdbEpisode),
        source: "tmdb",
      }
    }
  } catch {
    // TMDB failed, continue to fallback
  }

  // Get external IDs if not provided
  const ids = externalIds ?? (await getExternalIds(showTmdbId))

  // Try TVmaze second
  if (ids.tvmazeId) {
    try {
      const episodes = await tvmaze.getSeasonEpisodes(ids.tvmazeId, seasonNumber)
      if (episodes.length > 0) {
        return {
          episodes: episodes.map(normalizeTvmazeEpisode),
          source: "tvmaze",
        }
      }
    } catch {
      // TVmaze failed, continue to TheTVDB
    }
  }

  // Try TheTVDB third
  if (ids.thetvdbId) {
    try {
      const episodes = await thetvdb.getSeasonEpisodes(ids.thetvdbId, seasonNumber)
      if (episodes.length > 0) {
        return {
          episodes: episodes.map(normalizeThetvdbEpisode),
          source: "thetvdb",
        }
      }
    } catch {
      // TheTVDB failed
    }
  }

  // Try IMDb fourth (requires downloading and parsing TSV files)
  if (ids.imdbId) {
    try {
      const episodes = await imdb.getSeasonEpisodesWithDetails(ids.imdbId, seasonNumber)
      if (episodes.length > 0) {
        return {
          episodes: episodes.map(normalizeImdbEpisode),
          source: "imdb",
        }
      }
    } catch {
      // IMDb failed
    }
  }

  // No data from any source
  return { episodes: [], source: "tmdb" }
}

// ============================================================
// Cast Fetching with Fallback
// ============================================================

/**
 * Normalize TMDB cast member data to common format.
 */
function normalizeTmdbCast(
  member: tmdb.TMDBCastMember,
  order: number,
  type: "regular" | "guest"
): NormalizedCastMember {
  return {
    name: member.name,
    characterName: member.character,
    birthday: null, // Need to fetch separately from person details
    deathday: null,
    profilePath: member.profile_path,
    billingOrder: order,
    appearanceType: type,
    tmdbPersonId: member.id,
  }
}

/**
 * Normalize TVmaze cast member data to common format.
 */
function normalizeTvmazeCast(
  member: tvmaze.TVmazeCastMember | tvmaze.TVmazeGuestCastMember,
  order: number,
  type: "regular" | "guest"
): NormalizedCastMember {
  return {
    name: member.person.name,
    characterName: member.character.name,
    birthday: member.person.birthday,
    deathday: member.person.deathday,
    profilePath: member.person.image?.original ?? member.person.image?.medium ?? null,
    billingOrder: order,
    appearanceType: type,
    tvmazePersonId: member.person.id,
  }
}

/**
 * Normalize TheTVDB actor data to common format.
 */
function normalizeThetvdbCast(
  actor: thetvdb.TheTVDBActor,
  personDetails: thetvdb.TheTVDBPerson | null
): NormalizedCastMember {
  return {
    name: actor.personName ?? actor.name,
    characterName: actor.name,
    birthday: personDetails?.birth ?? null,
    deathday: personDetails?.death ?? null,
    profilePath: personDetails?.image ?? actor.image,
    billingOrder: actor.sort,
    appearanceType: actor.isFeatured ? "regular" : "guest",
    thetvdbPersonId: actor.peopleId,
  }
}

/**
 * Normalize IMDb cast member data to common format.
 */
function normalizeImdbCast(member: imdb.NormalizedImdbCastMember): NormalizedCastMember {
  return {
    name: member.name,
    characterName: member.characterName,
    birthday: member.birthday, // null for IMDb (only has year)
    deathday: member.deathday, // null for IMDb (only has year)
    profilePath: member.profilePath,
    billingOrder: member.billingOrder,
    appearanceType: member.appearanceType,
    imdbPersonId: member.imdbPersonId,
    birthYear: member.birthYear,
    deathYear: member.deathYear,
  }
}

/**
 * Fetch cast for an episode with fallback through data sources.
 *
 * Always tries TMDB first (best data quality, existing actor IDs).
 * Uses fallback sources only when TMDB has no cast data.
 *
 * @param showTmdbId - TMDB show ID
 * @param seasonNumber - Season number
 * @param episodeNumber - Episode number
 * @param externalEpisodeIds - External episode IDs for fallback lookups
 * @returns Cast members and the source they came from
 */
export async function fetchEpisodeCastWithFallback(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  externalEpisodeIds?: {
    tvmazeEpisodeId?: number
    thetvdbEpisodeId?: number
    imdbEpisodeId?: string
  }
): Promise<{ cast: NormalizedCastMember[]; source: DataSource }> {
  // Always try TMDB first
  try {
    const credits = await tmdb.getEpisodeCredits(showTmdbId, seasonNumber, episodeNumber)
    const cast: NormalizedCastMember[] = []

    // Add regular cast
    if (credits.cast && credits.cast.length > 0) {
      cast.push(...credits.cast.map((m, i) => normalizeTmdbCast(m, i, "regular")))
    }

    // Add guest stars
    if (credits.guest_stars && credits.guest_stars.length > 0) {
      const guestStartOrder = cast.length
      cast.push(
        ...credits.guest_stars.map((m, i) => normalizeTmdbCast(m, guestStartOrder + i, "guest"))
      )
    }

    if (cast.length > 0) {
      return { cast, source: "tmdb" }
    }
  } catch {
    // TMDB failed, continue to fallback
  }

  // Try TVmaze if we have the episode ID
  if (externalEpisodeIds?.tvmazeEpisodeId) {
    try {
      const guestCast = await tvmaze.getEpisodeGuestCast(externalEpisodeIds.tvmazeEpisodeId)
      if (guestCast.length > 0) {
        return {
          cast: guestCast.map((m, i) => normalizeTvmazeCast(m, i, "guest")),
          source: "tvmaze",
        }
      }
    } catch {
      // TVmaze failed
    }
  }

  // TheTVDB doesn't have per-episode cast, only series-level cast
  // This is a limitation - we can't get guest stars per episode from TheTVDB

  // Try IMDb if we have the episode ID
  if (externalEpisodeIds?.imdbEpisodeId) {
    try {
      const imdbCast = await imdb.getEpisodeCastWithDetails(externalEpisodeIds.imdbEpisodeId)
      if (imdbCast.length > 0) {
        return {
          cast: imdbCast.map(normalizeImdbCast),
          source: "imdb",
        }
      }
    } catch {
      // IMDb failed
    }
  }

  return { cast: [], source: "tmdb" }
}

/**
 * Fetch main cast for a show with fallback through data sources.
 * This is show-level cast, not episode-specific.
 */
export async function fetchShowCastWithFallback(
  showTmdbId: number,
  externalIds?: ExternalShowIds
): Promise<{ cast: NormalizedCastMember[]; source: DataSource }> {
  // Try TMDB first
  try {
    const credits = await tmdb.getTVShowAggregateCredits(showTmdbId)
    if (credits.cast && credits.cast.length > 0) {
      const cast = credits.cast.map(
        (m, i): NormalizedCastMember => ({
          name: m.name,
          characterName: m.roles?.[0]?.character ?? null,
          birthday: null,
          deathday: null,
          profilePath: m.profile_path,
          billingOrder: i,
          appearanceType: "regular",
          tmdbPersonId: m.id,
        })
      )
      return { cast, source: "tmdb" }
    }
  } catch {
    // TMDB failed
  }

  // Get external IDs if not provided
  const ids = externalIds ?? (await getExternalIds(showTmdbId))

  // Try TVmaze
  if (ids.tvmazeId) {
    try {
      const cast = await tvmaze.getShowCast(ids.tvmazeId)
      if (cast.length > 0) {
        return {
          cast: cast.map((m, i) => normalizeTvmazeCast(m, i, "regular")),
          source: "tvmaze",
        }
      }
    } catch {
      // TVmaze failed
    }
  }

  // Try TheTVDB
  if (ids.thetvdbId) {
    try {
      const actors = await thetvdb.getSeriesActors(ids.thetvdbId)
      if (actors.length > 0) {
        // Fetch person details for each actor to get birth/death dates
        const castWithDetails = await Promise.all(
          actors.map(async (actor) => {
            let personDetails: thetvdb.TheTVDBPerson | null = null
            if (actor.peopleId) {
              personDetails = await thetvdb.getPerson(actor.peopleId).catch(() => null)
            }
            return normalizeThetvdbCast(actor, personDetails)
          })
        )
        return { cast: castWithDetails, source: "thetvdb" }
      }
    } catch {
      // TheTVDB failed
    }
  }

  return { cast: [], source: "tmdb" }
}

// ============================================================
// Actor Matching Utility
// ============================================================

/**
 * Try to match a non-TMDB actor to a TMDB person by name and dates.
 * This helps link actors from TVmaze/TheTVDB to existing TMDB IDs.
 *
 * @param name - Actor name
 * @param birthday - Actor birthday (optional, for disambiguation)
 * @returns TMDB person ID if a good match is found
 */
export async function tryMatchToTmdb(
  name: string,
  birthday?: string | null
): Promise<number | null> {
  try {
    const results = await tmdb.searchPerson(name)

    if (results.results.length === 0) {
      return null
    }

    // If we have a birthday, try to find an exact match
    if (birthday) {
      for (const result of results.results) {
        const personDetails = await tmdb.getPersonDetails(result.id)
        if (personDetails.birthday === birthday) {
          return result.id
        }
      }
    }

    // If only one result and it's an actor, use it
    if (results.results.length === 1 && results.results[0].known_for_department === "Acting") {
      return results.results[0].id
    }

    // Multiple results without birthday - don't guess
    return null
  } catch {
    return null
  }
}
