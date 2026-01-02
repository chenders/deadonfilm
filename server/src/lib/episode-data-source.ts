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
import { getPool, getShow, getEpisodeCountsBySeasonFromDb } from "./db.js"

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
 * Improved gap detection that uses IMDb as the primary source of truth
 * when available, falling back to TMDB metadata.
 *
 * The key insight: For older soap operas like General Hospital (60+ seasons),
 * TMDB often only has a few seasons in its seasons array, but IMDb has complete
 * episode data. We need to compare each IMDb season against what's in our database.
 *
 * @param showTmdbId - TMDB show ID
 * @param imdbId - Optional IMDb ID (if not provided, will be looked up from show)
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
    // Get show from database to check imdb_id
    const show = await getShow(showTmdbId)
    if (!show) {
      result.details.push("Show not found in database")
      return result
    }

    // Use provided imdbId or fall back to show's imdb_id
    const showImdbId = imdbId ?? show.imdb_id

    // Get current episode counts per season from our database
    const dbSeasonCounts = await getEpisodeCountsBySeasonFromDb(showTmdbId)
    const totalDbEpisodes = Array.from(dbSeasonCounts.values()).reduce((a, b) => a + b, 0)

    // PRIMARY: Use IMDb as source of truth when available
    // IMDb has the most complete data for older shows
    if (showImdbId) {
      try {
        const imdbEpisodes = await imdb.getShowEpisodes(showImdbId)

        if (imdbEpisodes.length > 0) {
          // Group IMDb episodes by season
          const imdbSeasonCounts = new Map<number, number>()
          for (const ep of imdbEpisodes) {
            if (ep.seasonNumber !== null && ep.seasonNumber > 0) {
              imdbSeasonCounts.set(
                ep.seasonNumber,
                (imdbSeasonCounts.get(ep.seasonNumber) || 0) + 1
              )
            }
          }

          // Check if IMDb season data is reliable using shared helper
          const maxEpisodesInSeason = Math.max(...imdbSeasonCounts.values(), 0)
          const imdbSeasonCount = imdbSeasonCounts.size
          const tmdbSeasonCount = show.number_of_seasons || 0

          const imdbDataUnreliable = checkImdbSeasonDataUnreliable(
            maxEpisodesInSeason,
            imdbSeasonCount,
            tmdbSeasonCount
          )

          if (imdbDataUnreliable) {
            result.details.push(
              `IMDb season data unreliable (${imdbEpisodes.length} episodes in ${imdbSeasonCount} season(s), TMDB shows ${tmdbSeasonCount} seasons) - using TMDB for season structure`
            )
            // Fall through to TMDB check instead of returning
          } else {
            // Compare each IMDb season against our database
            for (const [seasonNum, imdbCount] of imdbSeasonCounts) {
              const dbCount = dbSeasonCounts.get(seasonNum) || 0

              // If IMDb has more episodes than our database, it's a gap
              if (imdbCount > dbCount) {
                result.hasGaps = true
                result.missingSeasons.push(seasonNum)
                result.details.push(
                  `Season ${seasonNum}: IMDb has ${imdbCount} episodes, database has ${dbCount}`
                )
              }
            }

            // Sort seasons numerically
            result.missingSeasons.sort((a, b) => a - b)

            // Add overall summary
            if (imdbEpisodes.length > totalDbEpisodes) {
              result.details.unshift(
                `Total: IMDb has ${imdbEpisodes.length} episodes, database has ${totalDbEpisodes}`
              )
            }

            // If we have reliable IMDb data, use it as source of truth
            return result
          }
        }
      } catch (error) {
        result.details.push(
          `IMDb check failed: ${error instanceof Error ? error.message : "unknown error"}`
        )
        // Fall through to TMDB check
      }
    }

    // FALLBACK: Check TMDB metadata if no IMDb or IMDb check failed
    const expectedEpisodes = show.number_of_episodes || 0

    if (expectedEpisodes > 0) {
      // Allow 10% tolerance for minor discrepancies
      const tolerance = Math.max(5, Math.floor(expectedEpisodes * 0.1))
      const missingCount = expectedEpisodes - totalDbEpisodes

      if (missingCount > tolerance) {
        result.hasGaps = true
        result.details.push(
          `Expected ${expectedEpisodes} episodes (TMDB), have ${totalDbEpisodes} (missing ${missingCount})`
        )
      }
    }

    // Also check for TMDB season-level gaps
    const tmdbGaps = await detectTmdbDataGaps(showTmdbId)
    if (tmdbGaps.hasGaps) {
      result.hasGaps = true
      // Add TMDB gap seasons that aren't already in missingSeasons
      for (const season of tmdbGaps.missingSeasons) {
        if (!result.missingSeasons.includes(season)) {
          result.missingSeasons.push(season)
        }
      }
      result.missingSeasons.sort((a, b) => a - b)
      result.details.push(...tmdbGaps.details)
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
// IMDb Season Data Reliability Check
// ============================================================

interface SeasonEpisodeCount {
  seasonNumber: number
  episodeCount: number
}

/**
 * Pure function to check if IMDb season data is unreliable based on computed counts.
 *
 * IMDb data is considered unreliable if:
 * 1. A single season has 500+ episodes (no normal show has this)
 * 2. IMDb shows 1 season but TMDB shows 10+ seasons
 *
 * This is a pure helper extracted for reuse across gap detection and episode fetching.
 *
 * @param maxEpisodesInSeason - Maximum episodes in any single IMDb season
 * @param imdbSeasonCount - Number of seasons in IMDb data
 * @param tmdbSeasonCount - Number of seasons in TMDB data
 * @returns true if IMDb season data should NOT be trusted
 */
export function checkImdbSeasonDataUnreliable(
  maxEpisodesInSeason: number,
  imdbSeasonCount: number,
  tmdbSeasonCount: number
): boolean {
  return maxEpisodesInSeason >= 500 || (imdbSeasonCount === 1 && tmdbSeasonCount >= 10)
}

/**
 * Check if IMDb's season structure is unreliable for a show.
 *
 * Soap operas and very long-running shows often have all episodes dumped into
 * "Season 1" in IMDb's data, which is incorrect. This function detects that
 * situation by comparing IMDb's season structure to TMDB's.
 *
 * @returns true if IMDb season data should NOT be trusted
 */
export async function isImdbSeasonDataUnreliable(
  imdbId: string,
  tmdbSeasonCount: number
): Promise<boolean> {
  const imdbEpisodes = await imdb.getShowEpisodes(imdbId)
  if (imdbEpisodes.length === 0) return false

  // Group by season and count
  const imdbSeasonCounts = new Map<number, number>()
  for (const ep of imdbEpisodes) {
    if (ep.seasonNumber !== null && ep.seasonNumber > 0) {
      imdbSeasonCounts.set(ep.seasonNumber, (imdbSeasonCounts.get(ep.seasonNumber) || 0) + 1)
    }
  }

  const maxEpisodesInSeason = Math.max(...imdbSeasonCounts.values(), 0)
  const imdbSeasonCount = imdbSeasonCounts.size

  return checkImdbSeasonDataUnreliable(maxEpisodesInSeason, imdbSeasonCount, tmdbSeasonCount)
}

/**
 * Get the episode count per season from TMDB for redistribution.
 */
async function getTmdbSeasonEpisodeCounts(showTmdbId: number): Promise<SeasonEpisodeCount[]> {
  try {
    const showDetails = await tmdb.getTVShowDetails(showTmdbId)
    return showDetails.seasons
      .filter((s) => s.season_number > 0) // Skip season 0 (specials)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
      }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
  } catch {
    return []
  }
}

/**
 * Redistribute IMDb episodes to correct seasons using TMDB's season structure.
 *
 * When IMDb has all episodes dumped into "Season 1" (common for soap operas),
 * we use TMDB's season info to distribute episodes sequentially:
 * - Season 1 has 250 episodes → first 250 IMDb episodes
 * - Season 2 has 260 episodes → episodes 251-510
 * - etc.
 *
 * Episodes are sorted by their IMDb episode number and distributed in order.
 *
 * @param allImdbEpisodes - All episodes from IMDb (typically all in "Season 1")
 * @param tmdbSeasonCounts - Episode counts per season from TMDB
 * @param targetSeason - The season we want episodes for
 * @returns Episodes redistributed to the target season
 */
export function redistributeEpisodesToSeason(
  allImdbEpisodes: NormalizedEpisode[],
  tmdbSeasonCounts: SeasonEpisodeCount[],
  targetSeason: number
): NormalizedEpisode[] {
  if (allImdbEpisodes.length === 0 || tmdbSeasonCounts.length === 0) {
    return []
  }

  // Sort episodes by original episode number (since they're all in "Season 1")
  const sortedEpisodes = [...allImdbEpisodes].sort((a, b) => a.episodeNumber - b.episodeNumber)

  // Calculate which range of episodes belong to the target season
  let episodeOffset = 0
  for (const season of tmdbSeasonCounts) {
    if (season.seasonNumber === targetSeason) {
      // Extract episodes for this season
      const seasonEpisodes = sortedEpisodes.slice(
        episodeOffset,
        episodeOffset + season.episodeCount
      )

      // Re-number episodes for this season (1, 2, 3, ...)
      return seasonEpisodes.map((ep, idx) => ({
        ...ep,
        seasonNumber: targetSeason,
        episodeNumber: idx + 1,
      }))
    }
    episodeOffset += season.episodeCount
  }

  // Season not found in TMDB data
  return []
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
 * Fetch IMDb episodes with automatic redistribution for unreliable season data.
 *
 * For soap operas and long-running shows where IMDb has all episodes in "Season 1",
 * this function redistributes episodes using TMDB's season structure.
 */
async function fetchImdbEpisodesWithRedistribution(
  showTmdbId: number,
  seasonNumber: number,
  imdbId: string
): Promise<NormalizedEpisode[]> {
  // First, try the normal approach (season-filtered)
  const seasonEpisodes = await imdb.getSeasonEpisodesWithDetails(imdbId, seasonNumber)

  if (seasonEpisodes.length > 0) {
    // Normal case: IMDb has proper season structure
    return seasonEpisodes.map(normalizeImdbEpisode)
  }

  // No episodes for this season - check if IMDb data is unreliable
  // Get TMDB season count to check reliability
  const tmdbSeasonCounts = await getTmdbSeasonEpisodeCounts(showTmdbId)
  const tmdbSeasonCount = tmdbSeasonCounts.length

  // If TMDB has this season but IMDb doesn't, check for redistribution
  const hasTmdbSeason = tmdbSeasonCounts.some((s) => s.seasonNumber === seasonNumber)
  if (!hasTmdbSeason) {
    // Season doesn't exist in TMDB either
    return []
  }

  // Check if this is an unreliable IMDb data situation
  const allImdbEpisodes = await imdb.getShowEpisodes(imdbId)
  if (allImdbEpisodes.length === 0) {
    return []
  }

  // Check for unreliable patterns using shared helper
  const imdbSeasonCounts = new Map<number, number>()
  for (const ep of allImdbEpisodes) {
    if (ep.seasonNumber !== null && ep.seasonNumber > 0) {
      imdbSeasonCounts.set(ep.seasonNumber, (imdbSeasonCounts.get(ep.seasonNumber) || 0) + 1)
    }
  }

  const maxEpisodesInSeason = Math.max(...imdbSeasonCounts.values(), 0)
  const imdbSeasonCount = imdbSeasonCounts.size

  const isUnreliable = checkImdbSeasonDataUnreliable(
    maxEpisodesInSeason,
    imdbSeasonCount,
    tmdbSeasonCount
  )

  if (!isUnreliable) {
    // IMDb data is reliable but this season is just empty
    return []
  }

  // Use redistribution: fetch ALL episodes and redistribute to correct seasons
  console.log(
    `  IMDb season data unreliable (${allImdbEpisodes.length} eps in ${imdbSeasonCount} season(s), TMDB shows ${tmdbSeasonCount}), redistributing...`
  )

  const allWithDetails = await imdb.getAllShowEpisodesWithDetails(imdbId)
  const normalizedAll = allWithDetails.map(normalizeImdbEpisode)

  return redistributeEpisodesToSeason(normalizedAll, tmdbSeasonCounts, seasonNumber)
}

/**
 * Fetch episodes for a season with fallback through data sources.
 *
 * @param showTmdbId - TMDB show ID
 * @param seasonNumber - Season number to fetch
 * @param externalIds - Pre-fetched external IDs (optional, will be fetched if not provided)
 * @param preferredSource - If set, try this source first (or exclusively for imdb)
 * @returns Episodes and the source they came from
 */
export async function fetchEpisodesWithFallback(
  showTmdbId: number,
  seasonNumber: number,
  externalIds?: ExternalShowIds,
  preferredSource?: DataSource
): Promise<{ episodes: NormalizedEpisode[]; source: DataSource }> {
  // Get external IDs upfront if needed for non-TMDB sources
  const ids = externalIds ?? (await getExternalIds(showTmdbId))

  // If preferred source is IMDb, go directly to IMDb (skip cascade)
  if (preferredSource === "imdb") {
    if (ids.imdbId) {
      try {
        const episodes = await fetchImdbEpisodesWithRedistribution(
          showTmdbId,
          seasonNumber,
          ids.imdbId
        )
        if (episodes.length > 0) {
          return {
            episodes,
            source: "imdb",
          }
        }
      } catch {
        // IMDb failed
      }
    }
    // IMDb was requested but not available or failed
    return { episodes: [], source: "imdb" }
  }

  // If preferred source is TVmaze, try it first
  if (preferredSource === "tvmaze") {
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
        // TVmaze failed, fall through to normal cascade
      }
    }
  }

  // If preferred source is TheTVDB, try it first
  if (preferredSource === "thetvdb") {
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
        // TheTVDB failed, fall through to normal cascade
      }
    }
  }

  // Normal cascade: TMDB -> TVmaze -> TheTVDB -> IMDb

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

  // Try TVmaze second (skip if already tried as preferred)
  if (ids.tvmazeId && preferredSource !== "tvmaze") {
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

  // Try TheTVDB third (skip if already tried as preferred)
  if (ids.thetvdbId && preferredSource !== "thetvdb") {
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
  // Uses redistribution for unreliable season data (soap operas, etc.)
  if (ids.imdbId) {
    try {
      const episodes = await fetchImdbEpisodesWithRedistribution(
        showTmdbId,
        seasonNumber,
        ids.imdbId
      )
      if (episodes.length > 0) {
        return {
          episodes,
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
