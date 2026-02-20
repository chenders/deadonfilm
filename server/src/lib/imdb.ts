/* eslint-disable security/detect-non-literal-fs-filename -- All filesystem paths are constructed from controlled config values */
/**
 * IMDb Datasets Client
 *
 * Fetches and parses IMDb non-commercial TSV datasets for TV episode data.
 * Files are downloaded on-demand and cached locally with 24-hour TTL.
 *
 * Dataset files: https://datasets.imdbws.com/
 * - title.episode.tsv.gz: Episode to show relationships
 * - title.basics.tsv.gz: Title metadata (names, runtime, etc.)
 * - title.principals.tsv.gz: Cast/crew for each title
 * - name.basics.tsv.gz: Person details (name, birth/death year)
 *
 * Note: IMDb uses string IDs (tconst like "tt0531270", nconst like "nm0000001")
 */

import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { createGunzip } from "zlib"
import readline from "readline"
import { pipeline } from "stream/promises"
import { Readable } from "stream"
import type { DatePrecision, MovieAppearanceType } from "./db.js"

// ============================================================
// Configuration
// ============================================================

const IMDB_DATASETS_BASE_URL = "https://datasets.imdbws.com"
const CACHE_DIR = path.join(process.cwd(), ".imdb-cache")
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Allowed IMDb dataset filenames - prevents path traversal attacks
const ALLOWED_FILENAMES = new Set([
  "title.episode.tsv.gz",
  "title.basics.tsv.gz",
  "title.principals.tsv.gz",
  "name.basics.tsv.gz",
])

/**
 * Validate a filename is an allowed IMDb dataset file.
 * Prevents path traversal by only allowing known filenames.
 */
function validateFilename(filename: string): string {
  if (!ALLOWED_FILENAMES.has(filename)) {
    throw new Error("Invalid IMDb dataset filename")
  }
  return filename
}

// ============================================================
// Types
// ============================================================

export interface ImdbEpisode {
  tconst: string // Episode ID (e.g., "tt0531270")
  parentTconst: string // Show ID (e.g., "tt0060316")
  seasonNumber: number | null
  episodeNumber: number | null
}

export interface ImdbTitle {
  tconst: string
  titleType: string // "tvSeries", "tvEpisode", "movie", etc.
  primaryTitle: string
  originalTitle: string
  isAdult: boolean
  startYear: number | null
  endYear: number | null
  runtimeMinutes: number | null
  genres: string[]
}

export interface ImdbPrincipal {
  tconst: string // Title ID
  ordering: number // Billing order (1-indexed)
  nconst: string // Person ID (e.g., "nm0000001")
  category: string // "actor", "actress", "director", etc.
  job: string | null
  characters: string[] | null
}

export interface ImdbMovieBasics {
  tconst: string // "tt0111161"
  primaryTitle: string // "The Shawshank Redemption"
  originalTitle: string // Same or foreign title
  startYear: number | null // 1994
  runtimeMinutes: number | null
}

export interface ImdbPerson {
  nconst: string // Person ID (e.g., "nm0000001")
  primaryName: string
  birthYear: number | null
  deathYear: number | null
  primaryProfession: string[]
  knownForTitles: string[]
}

// Normalized types for consistency with other data sources
export interface NormalizedImdbEpisode {
  seasonNumber: number
  episodeNumber: number
  name: string | null
  overview: string | null
  airDate: string | null
  runtime: number | null
  stillPath: string | null
  imdbEpisodeId: string
}

// Appearance type for TV show episodes
export type TvAppearanceType = "regular" | "guest"

// Re-export MovieAppearanceType from db/types.ts for backwards compatibility
export type { MovieAppearanceType } from "./db.js"

export interface NormalizedImdbCastMember {
  name: string
  characterName: string | null
  birthday: string | null
  birthdayPrecision: DatePrecision | null
  deathday: string | null
  deathdayPrecision: DatePrecision | null
  profilePath: string | null
  billingOrder: number
  appearanceType: TvAppearanceType
  imdbPersonId: string
  birthYear: number | null
  deathYear: number | null
}

// Movie-specific cast member with movie appearance types
export interface NormalizedImdbMovieCastMember {
  name: string
  characterName: string | null
  birthday: string | null
  birthdayPrecision: DatePrecision | null
  deathday: string | null
  deathdayPrecision: DatePrecision | null
  profilePath: string | null
  billingOrder: number
  appearanceType: MovieAppearanceType
  imdbPersonId: string
  birthYear: number | null
  deathYear: number | null
}

// ============================================================
// Cache Management
// ============================================================

interface CacheMetadata {
  downloadedAt: number
  size: number
}

async function ensureCacheDir(): Promise<void> {
  await fsp.mkdir(CACHE_DIR, { recursive: true })
}

async function getCacheMetadata(filename: string): Promise<CacheMetadata | null> {
  const safeFilename = validateFilename(filename)
  // nosemgrep: path-join-resolve-traversal - validated against allowlist
  const metaPath = path.join(CACHE_DIR, `${safeFilename}.meta.json`)
  try {
    const content = await fsp.readFile(metaPath, "utf-8")
    return JSON.parse(content) as CacheMetadata
  } catch {
    return null
  }
}

async function saveCacheMetadata(filename: string, metadata: CacheMetadata): Promise<void> {
  const safeFilename = validateFilename(filename)
  // nosemgrep: path-join-resolve-traversal - validated against allowlist
  const metaPath = path.join(CACHE_DIR, `${safeFilename}.meta.json`)
  await fsp.writeFile(metaPath, JSON.stringify(metadata), "utf-8")
}

function isCacheValid(metadata: CacheMetadata | null): boolean {
  if (!metadata) return false
  return Date.now() - metadata.downloadedAt < CACHE_TTL_MS
}

async function downloadFile(filename: string): Promise<string> {
  const safeFilename = validateFilename(filename)
  await ensureCacheDir()

  const url = `${IMDB_DATASETS_BASE_URL}/${safeFilename}`
  // nosemgrep: path-join-resolve-traversal - validated against allowlist
  const filePath = path.join(CACHE_DIR, safeFilename)

  console.log(`Downloading ${filename}...`)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error(`No response body for ${filename}`)
  }

  // Get content length for progress reporting
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
  const contentLengthMB = (contentLength / 1024 / 1024).toFixed(1)

  // Track download progress
  let downloadedBytes = 0
  let lastProgressReport = 0
  const progressInterval = 10 * 1024 * 1024 // Report every 10MB

  const progressStream = new (await import("stream")).Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.length
      // Report progress periodically
      if (downloadedBytes - lastProgressReport >= progressInterval) {
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1)
        if (contentLength > 0) {
          const percent = ((downloadedBytes / contentLength) * 100).toFixed(0)
          process.stdout.write(
            `\r  Downloading: ${downloadedMB}/${contentLengthMB} MB (${percent}%)`
          )
        } else {
          process.stdout.write(`\r  Downloading: ${downloadedMB} MB`)
        }
        lastProgressReport = downloadedBytes
      }
      callback(null, chunk)
    },
  })

  // Use pipeline with progress tracking
  const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream)
  const fileStream = fs.createWriteStream(filePath)
  await pipeline(nodeStream, progressStream, fileStream)

  // Clear the progress line and print completion
  if (lastProgressReport > 0) {
    process.stdout.write("\r" + " ".repeat(60) + "\r")
  }

  const stats = await fsp.stat(filePath)
  await saveCacheMetadata(filename, {
    downloadedAt: Date.now(),
    size: stats.size,
  })

  console.log(`Downloaded ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
  return filePath
}

async function ensureFileDownloaded(filename: string): Promise<string> {
  const safeFilename = validateFilename(filename)
  // nosemgrep: path-join-resolve-traversal - validated against allowlist
  const filePath = path.join(CACHE_DIR, safeFilename)
  const metadata = await getCacheMetadata(safeFilename)

  if (isCacheValid(metadata) && fs.existsSync(filePath)) {
    return filePath
  }

  return downloadFile(safeFilename)
}

// ============================================================
// TSV Parsing
// ============================================================

/**
 * Parse a gzipped TSV file line by line, calling the handler for each row.
 * Streams the file to avoid loading it entirely into memory.
 *
 * @param filePath - Path to the .tsv.gz file
 * @param handler - Function to transform each row (return null to skip)
 * @param options - Optional settings
 */
async function parseTsvGz<T>(
  filePath: string,
  handler: (columns: string[], headers: string[]) => T | null,
  options?: { progressLabel?: string; progressInterval?: number }
): Promise<T[]> {
  const fileStream = fs.createReadStream(filePath)
  const gunzip = createGunzip()
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity,
  })

  const results: T[] = []
  let headers: string[] = []
  let isFirstLine = true
  let lineCount = 0
  let lastProgressReport = 0
  const progressInterval = options?.progressInterval ?? 1000000 // Default: every 1M lines
  const progressLabel = options?.progressLabel ?? "rows"

  for await (const line of rl) {
    if (isFirstLine) {
      headers = line.split("\t")
      isFirstLine = false
      continue
    }

    lineCount++

    // Report progress periodically
    if (lineCount - lastProgressReport >= progressInterval) {
      const millionLines = (lineCount / 1000000).toFixed(1)
      process.stdout.write(`\r  Parsing: ${millionLines}M ${progressLabel}...`)
      lastProgressReport = lineCount
    }

    const columns = line.split("\t")
    const result = handler(columns, headers)
    if (result !== null) {
      results.push(result)
    }
  }

  // Clear progress line
  if (lastProgressReport > 0) {
    process.stdout.write("\r" + " ".repeat(50) + "\r")
  }

  return results
}

/**
 * Parse a gzipped TSV file line by line with a filter predicate.
 * Only processes rows that match the filter.
 *
 * @param filePath - Path to the .tsv.gz file
 * @param filter - Function to determine if a row should be processed
 * @param handler - Function to transform matching rows
 * @param options - Optional settings
 */
async function parseTsvGzFiltered<T>(
  filePath: string,
  filter: (columns: string[], headers: string[]) => boolean,
  handler: (columns: string[], headers: string[]) => T,
  options?: { progressLabel?: string; progressInterval?: number }
): Promise<T[]> {
  const fileStream = fs.createReadStream(filePath)
  const gunzip = createGunzip()
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity,
  })

  const results: T[] = []
  let headers: string[] = []
  let isFirstLine = true
  let lineCount = 0
  let lastProgressReport = 0
  const progressInterval = options?.progressInterval ?? 1000000 // Default: every 1M lines
  const progressLabel = options?.progressLabel ?? "rows"

  for await (const line of rl) {
    if (isFirstLine) {
      headers = line.split("\t")
      isFirstLine = false
      continue
    }

    lineCount++

    // Report progress periodically
    if (lineCount - lastProgressReport >= progressInterval) {
      const millionLines = (lineCount / 1000000).toFixed(1)
      process.stdout.write(
        `\r  Scanning: ${millionLines}M ${progressLabel} (found ${results.length})...`
      )
      lastProgressReport = lineCount
    }

    const columns = line.split("\t")
    if (filter(columns, headers)) {
      results.push(handler(columns, headers))
    }
  }

  // Clear progress line
  if (lastProgressReport > 0) {
    process.stdout.write("\r" + " ".repeat(60) + "\r")
  }

  return results
}

// Helper to parse "\\N" as null
function parseNullable(value: string): string | null {
  return value === "\\N" ? null : value
}

function parseNullableInt(value: string): number | null {
  if (value === "\\N") return null
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? null : parsed
}

// ============================================================
// Episode Index (In-Memory)
// ============================================================

// Map of showId -> episodes
let episodeIndex: Map<string, ImdbEpisode[]> | null = null
let episodeIndexBuildTime: number | null = null

async function ensureEpisodeIndex(): Promise<Map<string, ImdbEpisode[]>> {
  // Check if index is still valid
  if (episodeIndex && episodeIndexBuildTime && Date.now() - episodeIndexBuildTime < CACHE_TTL_MS) {
    return episodeIndex
  }

  console.log("Building IMDb episode index...")
  const startTime = Date.now()

  const filePath = await ensureFileDownloaded("title.episode.tsv.gz")

  const episodes = await parseTsvGz<ImdbEpisode>(
    filePath,
    (columns, headers) => {
      const tconst = columns[headers.indexOf("tconst")]
      const parentTconst = columns[headers.indexOf("parentTconst")]
      const seasonNumber = parseNullableInt(columns[headers.indexOf("seasonNumber")])
      const episodeNumber = parseNullableInt(columns[headers.indexOf("episodeNumber")])

      // Skip episodes without season/episode numbers
      if (seasonNumber === null || episodeNumber === null) {
        return null
      }

      return {
        tconst,
        parentTconst,
        seasonNumber,
        episodeNumber,
      }
    },
    { progressLabel: "episodes" }
  )

  // Build index by parent show
  episodeIndex = new Map()
  for (const ep of episodes) {
    const existing = episodeIndex.get(ep.parentTconst) || []
    existing.push(ep)
    episodeIndex.set(ep.parentTconst, existing)
  }

  episodeIndexBuildTime = Date.now()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(
    `Built episode index: ${episodes.length} episodes, ${episodeIndex.size} shows in ${elapsed}s`
  )

  return episodeIndex
}

// ============================================================
// Movie Index (In-Memory)
// ============================================================

// Movie array for fuzzy matching (loaded once per session)
let movieIndex: ImdbMovieBasics[] | null = null
let movieIndexBuildTime: number | null = null

async function ensureMovieIndex(): Promise<ImdbMovieBasics[]> {
  // Check if index is still valid
  if (movieIndex && movieIndexBuildTime && Date.now() - movieIndexBuildTime < CACHE_TTL_MS) {
    return movieIndex
  }

  console.log("Building IMDb movie index...")
  const startTime = Date.now()

  const filePath = await ensureFileDownloaded("title.basics.tsv.gz")

  const movies = await parseTsvGz<ImdbMovieBasics>(
    filePath,
    (columns, headers) => {
      const titleType = columns[headers.indexOf("titleType")]

      // Only include movies (feature films) and TV movies
      if (titleType !== "movie" && titleType !== "tvMovie") {
        return null
      }

      const startYear = parseNullableInt(columns[headers.indexOf("startYear")])

      // Skip movies without year (can't match reliably)
      if (startYear === null) {
        return null
      }

      return {
        tconst: columns[headers.indexOf("tconst")],
        primaryTitle: columns[headers.indexOf("primaryTitle")],
        originalTitle: columns[headers.indexOf("originalTitle")],
        startYear,
        runtimeMinutes: parseNullableInt(columns[headers.indexOf("runtimeMinutes")]),
      }
    },
    { progressLabel: "titles" }
  )

  movieIndex = movies
  movieIndexBuildTime = Date.now()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`Built movie index: ${movies.length} movies in ${elapsed}s`)

  return movieIndex
}

// ============================================================
// Public API
// ============================================================

/**
 * Get the full movie index for fuzzy matching.
 *
 * Loads all movies (titleType = "movie" or "tvMovie") from title.basics.tsv.gz
 * into memory. Results are cached for the session duration.
 *
 * Typical size: ~1M movies, ~500MB memory usage.
 *
 * @returns Array of movie basics for building a Fuse.js search index
 */
export async function getMovieIndex(): Promise<ImdbMovieBasics[]> {
  return ensureMovieIndex()
}

/**
 * Get all episodes for a show by IMDb show ID.
 */
export async function getShowEpisodes(imdbShowId: string): Promise<ImdbEpisode[]> {
  const index = await ensureEpisodeIndex()
  return index.get(imdbShowId) || []
}

/**
 * Get episodes for a specific season of a show.
 */
export async function getSeasonEpisodes(
  imdbShowId: string,
  seasonNumber: number
): Promise<ImdbEpisode[]> {
  const episodes = await getShowEpisodes(imdbShowId)
  return episodes.filter((ep) => ep.seasonNumber === seasonNumber)
}

/**
 * Get title details for one or more IMDb IDs.
 * Parses title.basics.tsv.gz on-demand.
 */
export async function getTitles(tconsts: string[]): Promise<Map<string, ImdbTitle>> {
  if (tconsts.length === 0) return new Map()

  const tconstSet = new Set(tconsts)
  const filePath = await ensureFileDownloaded("title.basics.tsv.gz")

  console.log(`  Looking up ${tconsts.length} title(s) in IMDb...`)
  const titles = await parseTsvGzFiltered<ImdbTitle>(
    filePath,
    (columns, headers) => tconstSet.has(columns[headers.indexOf("tconst")]),
    (columns, headers) => ({
      tconst: columns[headers.indexOf("tconst")],
      titleType: columns[headers.indexOf("titleType")],
      primaryTitle: columns[headers.indexOf("primaryTitle")],
      originalTitle: columns[headers.indexOf("originalTitle")],
      isAdult: columns[headers.indexOf("isAdult")] === "1",
      startYear: parseNullableInt(columns[headers.indexOf("startYear")]),
      endYear: parseNullableInt(columns[headers.indexOf("endYear")]),
      runtimeMinutes: parseNullableInt(columns[headers.indexOf("runtimeMinutes")]),
      genres: parseNullable(columns[headers.indexOf("genres")])?.split(",") || [],
    }),
    { progressLabel: "titles" }
  )

  const map = new Map<string, ImdbTitle>()
  for (const title of titles) {
    map.set(title.tconst, title)
  }
  return map
}

/**
 * Get cast (principals) for one or more IMDb title IDs.
 * Parses title.principals.tsv.gz on-demand.
 * Only returns actors/actresses.
 */
export async function getEpisodeCast(tconsts: string[]): Promise<Map<string, ImdbPrincipal[]>> {
  if (tconsts.length === 0) return new Map()

  const tconstSet = new Set(tconsts)
  const filePath = await ensureFileDownloaded("title.principals.tsv.gz")

  console.log(`  Looking up cast for ${tconsts.length} episode(s) in IMDb...`)
  const principals = await parseTsvGzFiltered<ImdbPrincipal>(
    filePath,
    (columns, headers) => {
      const tconst = columns[headers.indexOf("tconst")]
      const category = columns[headers.indexOf("category")]
      return tconstSet.has(tconst) && (category === "actor" || category === "actress")
    },
    (columns, headers) => {
      const characters = parseNullable(columns[headers.indexOf("characters")])
      let parsedCharacters: string[] | null = null
      if (characters) {
        // Characters are stored as JSON array like '["Character Name"]'
        try {
          parsedCharacters = JSON.parse(characters) as string[]
        } catch {
          parsedCharacters = [characters]
        }
      }

      return {
        tconst: columns[headers.indexOf("tconst")],
        ordering: parseInt(columns[headers.indexOf("ordering")], 10),
        nconst: columns[headers.indexOf("nconst")],
        category: columns[headers.indexOf("category")],
        job: parseNullable(columns[headers.indexOf("job")]),
        characters: parsedCharacters,
      }
    },
    { progressLabel: "cast entries" }
  )

  const map = new Map<string, ImdbPrincipal[]>()
  for (const p of principals) {
    const existing = map.get(p.tconst) || []
    existing.push(p)
    map.set(p.tconst, existing)
  }

  // Sort by ordering within each title
  for (const [tconst, cast] of map) {
    cast.sort((a, b) => a.ordering - b.ordering)
    map.set(tconst, cast)
  }

  return map
}

/**
 * Get person details for one or more IMDb person IDs.
 * Parses name.basics.tsv.gz on-demand.
 */
export async function getPersons(nconsts: string[]): Promise<Map<string, ImdbPerson>> {
  if (nconsts.length === 0) return new Map()

  const nconstSet = new Set(nconsts)
  const filePath = await ensureFileDownloaded("name.basics.tsv.gz")

  console.log(`  Looking up ${nconsts.length} person(s) in IMDb...`)
  const persons = await parseTsvGzFiltered<ImdbPerson>(
    filePath,
    (columns, headers) => nconstSet.has(columns[headers.indexOf("nconst")]),
    (columns, headers) => ({
      nconst: columns[headers.indexOf("nconst")],
      primaryName: columns[headers.indexOf("primaryName")],
      birthYear: parseNullableInt(columns[headers.indexOf("birthYear")]),
      deathYear: parseNullableInt(columns[headers.indexOf("deathYear")]),
      primaryProfession:
        parseNullable(columns[headers.indexOf("primaryProfession")])?.split(",") || [],
      knownForTitles: parseNullable(columns[headers.indexOf("knownForTitles")])?.split(",") || [],
    }),
    { progressLabel: "names" }
  )

  const map = new Map<string, ImdbPerson>()
  for (const person of persons) {
    map.set(person.nconst, person)
  }
  return map
}

/**
 * Get a single person by IMDb person ID.
 */
export async function getPerson(nconst: string): Promise<ImdbPerson | null> {
  const persons = await getPersons([nconst])
  return persons.get(nconst) || null
}

// ============================================================
// Enriched Episode Fetching
// ============================================================

/**
 * Get episodes for a season with title details (names, runtime, etc.)
 * Returns normalized episodes compatible with other data sources.
 */
export async function getSeasonEpisodesWithDetails(
  imdbShowId: string,
  seasonNumber: number
): Promise<NormalizedImdbEpisode[]> {
  const episodes = await getSeasonEpisodes(imdbShowId, seasonNumber)
  if (episodes.length === 0) return []

  // Get title details for all episodes
  const tconsts = episodes.map((ep) => ep.tconst)
  const titles = await getTitles(tconsts)

  return episodes
    .map((ep): NormalizedImdbEpisode => {
      const title = titles.get(ep.tconst)
      return {
        seasonNumber: ep.seasonNumber!,
        episodeNumber: ep.episodeNumber!,
        name: title?.primaryTitle || null,
        overview: null, // IMDb datasets don't include plot summaries
        airDate: null, // IMDb datasets don't include air dates
        runtime: title?.runtimeMinutes || null,
        stillPath: null, // IMDb datasets don't include images
        imdbEpisodeId: ep.tconst,
      }
    })
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
}

/**
 * Get ALL episodes for a show with title details (names, runtime, etc.)
 * Does NOT filter by season - returns all episodes for the show.
 * Useful when IMDb season data is unreliable (e.g., soap operas with all
 * episodes dumped into "Season 1").
 *
 * @param imdbShowId - The IMDb ID of the show
 * @param prefetchedEpisodes - Optional pre-fetched episodes to avoid duplicate API calls
 */
export async function getAllShowEpisodesWithDetails(
  imdbShowId: string,
  prefetchedEpisodes?: ImdbEpisode[]
): Promise<NormalizedImdbEpisode[]> {
  const episodes = prefetchedEpisodes ?? (await getShowEpisodes(imdbShowId))
  if (episodes.length === 0) return []

  // Get title details for all episodes
  const tconsts = episodes.map((ep) => ep.tconst)
  const titles = await getTitles(tconsts)

  // Track episode numbers per season to handle null episodeNumber values
  // by assigning sequential numbers instead of defaulting all to 1
  const seasonEpisodeCounters = new Map<number, number>()

  return episodes
    .map((ep): NormalizedImdbEpisode => {
      const title = titles.get(ep.tconst)
      const seasonNumber = ep.seasonNumber ?? 1

      // Handle null episode numbers by assigning sequential values per season
      let episodeNumber: number
      if (ep.episodeNumber != null) {
        episodeNumber = ep.episodeNumber
      } else {
        const current = seasonEpisodeCounters.get(seasonNumber) ?? 0
        episodeNumber = current + 1
        seasonEpisodeCounters.set(seasonNumber, episodeNumber)
      }

      return {
        seasonNumber,
        episodeNumber,
        name: title?.primaryTitle || null,
        overview: null,
        airDate: null,
        runtime: title?.runtimeMinutes || null,
        stillPath: null,
        imdbEpisodeId: ep.tconst,
      }
    })
    .sort((a, b) => {
      // Sort by season first, then by episode number
      if (a.seasonNumber !== b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber
      }
      return a.episodeNumber - b.episodeNumber
    })
}

/**
 * Get cast for an episode with person details (birth/death year).
 * Returns normalized cast members compatible with other data sources.
 */
export async function getEpisodeCastWithDetails(
  imdbEpisodeId: string
): Promise<NormalizedImdbCastMember[]> {
  const castMap = await getEpisodeCast([imdbEpisodeId])
  const cast = castMap.get(imdbEpisodeId) || []
  if (cast.length === 0) return []

  // Get person details for all cast members
  const nconsts = cast.map((c) => c.nconst)
  const persons = await getPersons(nconsts)

  return cast.map((c, index): NormalizedImdbCastMember => {
    const person = persons.get(c.nconst)
    // Convert year-only values to dates with precision
    const birthYear = person?.birthYear || null
    const deathYear = person?.deathYear || null
    return {
      name: person?.primaryName || "Unknown",
      characterName: c.characters?.[0] || null,
      // IMDb only has year - store as YYYY-01-01 with precision='year'
      birthday: birthYear ? `${birthYear}-01-01` : null,
      birthdayPrecision: birthYear ? "year" : null,
      deathday: deathYear ? `${deathYear}-01-01` : null,
      deathdayPrecision: deathYear ? "year" : null,
      profilePath: null, // IMDb datasets don't include images
      billingOrder: index,
      appearanceType: "guest", // Can't distinguish regular vs guest from IMDb data
      imdbPersonId: c.nconst,
      birthYear,
      deathYear,
    }
  })
}

// ============================================================
// Movie Cast (for documentaries and films not in TMDB)
// ============================================================

/**
 * Detect appearance type from IMDb character field.
 *
 * IMDb stores character information that can indicate:
 * - "Self" appearances (documentaries, talk shows, etc.)
 * - Archive footage (interviews from past, news clips, etc.)
 * - Regular acting roles
 *
 * @param characterName - The character field from IMDb (may be null)
 * @returns The detected appearance type
 */
export function detectAppearanceType(characterName: string | null): MovieAppearanceType {
  if (!characterName) return "regular"

  const lowered = characterName.toLowerCase().trim()

  // Archive footage patterns
  const archivePatterns = [
    "archive footage",
    "archive film",
    "archive material",
    "(archive)",
    "archival",
    "stock footage",
    "newsreel",
    "footage from",
    "file footage",
    "scenes from",
  ]

  for (const pattern of archivePatterns) {
    if (lowered.includes(pattern)) {
      return "archive"
    }
  }

  // Self/Himself/Herself patterns - playing themselves in documentaries
  const selfPatterns = [
    "self",
    "himself",
    "herself",
    "themselves",
    "themself",
    "as himself",
    "as herself",
    "as themselves",
    "(self)",
    "(himself)",
    "(herself)",
  ]

  // Word boundary characters (whitespace and common punctuation)
  const boundaryChars = /[\s\-(),:']/

  for (const pattern of selfPatterns) {
    // Check for exact match
    if (lowered === pattern) {
      return "self"
    }

    // Check for pattern at word boundaries (start of string or after boundary char)
    const patternIndex = lowered.indexOf(pattern)
    if (patternIndex !== -1) {
      const beforeOk = patternIndex === 0 || boundaryChars.test(lowered[patternIndex - 1])
      const afterIndex = patternIndex + pattern.length
      const afterOk = afterIndex >= lowered.length || boundaryChars.test(lowered[afterIndex])

      if (beforeOk && afterOk) {
        return "self"
      }
    }
  }

  // Also check if the character name is just "Self" with any casing
  if (/^self$/i.test(characterName.trim())) {
    return "self"
  }

  return "regular"
}

/**
 * Get cast (principals) for one or more IMDb movie IDs.
 * Similar to getEpisodeCast but explicitly for movies.
 * Parses title.principals.tsv.gz on-demand.
 * Only returns actors/actresses.
 */
export async function getMovieCast(tconsts: string[]): Promise<Map<string, ImdbPrincipal[]>> {
  // Reuse the same underlying function - it works for both episodes and movies
  return getEpisodeCast(tconsts)
}

/**
 * Get cast for a movie with person details (birth/death year) and detected appearance type.
 * Returns normalized cast members for movie appearances.
 *
 * @param imdbMovieId - The IMDb ID of the movie (e.g., "tt0111161")
 * @returns Array of normalized cast members with appearance types
 */
export async function getMovieCastWithDetails(
  imdbMovieId: string
): Promise<NormalizedImdbMovieCastMember[]> {
  const castMap = await getMovieCast([imdbMovieId])
  const cast = castMap.get(imdbMovieId) || []
  if (cast.length === 0) return []

  // Get person details for all cast members
  const nconsts = cast.map((c) => c.nconst)
  const persons = await getPersons(nconsts)

  return cast.map((c, index): NormalizedImdbMovieCastMember => {
    const person = persons.get(c.nconst)
    const birthYear = person?.birthYear || null
    const deathYear = person?.deathYear || null
    const characterName = c.characters?.[0] || null

    return {
      name: person?.primaryName || "Unknown",
      characterName,
      birthday: birthYear ? `${birthYear}-01-01` : null,
      birthdayPrecision: birthYear ? "year" : null,
      deathday: deathYear ? `${deathYear}-01-01` : null,
      deathdayPrecision: deathYear ? "year" : null,
      profilePath: null, // IMDb datasets don't include images
      billingOrder: index,
      appearanceType: detectAppearanceType(characterName),
      imdbPersonId: c.nconst,
      birthYear,
      deathYear,
    }
  })
}

// ============================================================
// Death Date Verification via IMDb Dataset
// ============================================================

export interface ImdbDeathVerification {
  found: boolean // Actor found in IMDb dataset
  hasDeathYear: boolean // IMDb has a deathYear for this person
  imdbDeathYear: number | null
  yearMatches: boolean // IMDb deathYear matches TMDB year
}

export type DeathDateConfidence =
  | "verified"
  | "imdb_verified"
  | "unverified"
  | "suspicious"
  | "conflicting"

/**
 * Find a person in the IMDb name.basics.tsv.gz dataset by name and birth year.
 *
 * Matches by exact primaryName (case-sensitive, matching IMDb convention).
 * If birthYear is provided, requires ±1 year match.
 * Returns the first match, or null if not found.
 */
export async function findPersonByName(
  name: string,
  birthYear: number | null
): Promise<ImdbPerson | null> {
  const filePath = await ensureFileDownloaded("name.basics.tsv.gz")

  const matches = await parseTsvGzFiltered<ImdbPerson>(
    filePath,
    (columns, headers) => {
      if (columns[headers.indexOf("primaryName")] !== name) return false
      if (birthYear !== null) {
        const imdbBirthYear = parseNullableInt(columns[headers.indexOf("birthYear")])
        if (imdbBirthYear === null) return false
        if (Math.abs(imdbBirthYear - birthYear) > 1) return false
      }
      return true
    },
    (columns, headers) => ({
      nconst: columns[headers.indexOf("nconst")],
      primaryName: columns[headers.indexOf("primaryName")],
      birthYear: parseNullableInt(columns[headers.indexOf("birthYear")]),
      deathYear: parseNullableInt(columns[headers.indexOf("deathYear")]),
      primaryProfession:
        parseNullable(columns[headers.indexOf("primaryProfession")])?.split(",") || [],
      knownForTitles: parseNullable(columns[headers.indexOf("knownForTitles")])?.split(",") || [],
    }),
    { progressLabel: "names" }
  )

  return matches[0] ?? null
}

/**
 * Find multiple people in the IMDb name.basics.tsv.gz dataset in a single pass.
 *
 * For batch validation — avoids re-scanning the ~13M row file per actor.
 * Matches by exact primaryName (case-sensitive). If birthYear is provided
 * for a lookup, requires ±1 year match.
 *
 * Each lookup includes a unique key (e.g., actor database ID) to handle
 * duplicate names correctly. Two actors named "John Smith" with different
 * birth years will be matched independently.
 *
 * Returns Map keyed by the caller-provided key.
 */
export async function findPersonsByNames(
  lookups: Array<{ key: string; name: string; birthYear: number | null }>
): Promise<Map<string, ImdbPerson>> {
  if (lookups.length === 0) return new Map()

  // Build lookup index: name -> array of {key, birthYear} entries
  // Multiple actors can share a name but have different birth years
  const lookupMap = new Map<string, Array<{ key: string; birthYear: number | null }>>()
  for (const { key, name, birthYear } of lookups) {
    const existing = lookupMap.get(name) || []
    existing.push({ key, birthYear })
    lookupMap.set(name, existing)
  }

  const filePath = await ensureFileDownloaded("name.basics.tsv.gz")

  // Track which keys have been matched to avoid duplicate processing
  const matchedKeys = new Set<string>()
  const results = new Map<string, ImdbPerson>()

  const matches = await parseTsvGzFiltered<ImdbPerson>(
    filePath,
    (columns, headers) => {
      const primaryName = columns[headers.indexOf("primaryName")]
      const entries = lookupMap.get(primaryName)
      if (!entries) return false

      const imdbBirthYear = parseNullableInt(columns[headers.indexOf("birthYear")])

      // Check if this IMDb row matches any unmatched lookup entry
      for (const entry of entries) {
        if (matchedKeys.has(entry.key)) continue
        if (entry.birthYear !== null) {
          if (imdbBirthYear === null) continue
          if (Math.abs(imdbBirthYear - entry.birthYear) > 1) continue
        }
        return true
      }
      return false
    },
    (columns, headers) => {
      const person: ImdbPerson = {
        nconst: columns[headers.indexOf("nconst")],
        primaryName: columns[headers.indexOf("primaryName")],
        birthYear: parseNullableInt(columns[headers.indexOf("birthYear")]),
        deathYear: parseNullableInt(columns[headers.indexOf("deathYear")]),
        primaryProfession:
          parseNullable(columns[headers.indexOf("primaryProfession")])?.split(",") || [],
        knownForTitles: parseNullable(columns[headers.indexOf("knownForTitles")])?.split(",") || [],
      }

      // Assign this person to the first matching unmatched entry
      const entries = lookupMap.get(person.primaryName) || []
      for (const entry of entries) {
        if (matchedKeys.has(entry.key)) continue
        if (entry.birthYear !== null) {
          if (person.birthYear === null) continue
          if (Math.abs(person.birthYear - entry.birthYear) > 1) continue
        }
        matchedKeys.add(entry.key)
        results.set(entry.key, person)
        break
      }

      return person
    },
    { progressLabel: "names" }
  )

  // parseTsvGzFiltered collects results but we already built our map via side effect
  void matches

  return results
}

/**
 * Verify an actor's death date against the IMDb name.basics.tsv.gz dataset.
 *
 * Looks up the actor by name + birth year, then compares IMDb's deathYear
 * against the TMDB death year (exact match — year precision means ±0).
 */
export async function verifyDeathDateImdb(
  name: string,
  birthYear: number | null,
  tmdbDeathYear: number
): Promise<ImdbDeathVerification> {
  const person = await findPersonByName(name, birthYear)

  if (!person) {
    return { found: false, hasDeathYear: false, imdbDeathYear: null, yearMatches: false }
  }

  if (person.deathYear === null) {
    // Found in IMDb but no deathYear — IMDb says they're alive
    return { found: true, hasDeathYear: false, imdbDeathYear: null, yearMatches: false }
  }

  return {
    found: true,
    hasDeathYear: true,
    imdbDeathYear: person.deathYear,
    yearMatches: person.deathYear === tmdbDeathYear,
  }
}

/**
 * Combine Wikidata and IMDb death date verification results into a final confidence.
 *
 * Truth table:
 * | Wikidata      | IMDb             | → Confidence    | → Source          |
 * |---------------|------------------|-----------------|-------------------|
 * | verified      | year matches     | verified        | wikidata,imdb     |
 * | verified      | alive / not found| verified        | wikidata          |
 * | unverified    | year matches     | imdb_verified   | imdb              |
 * | unverified    | alive (no death) | suspicious      | imdb              |
 * | unverified    | not in dataset   | unverified      | (null)            |
 * | conflicting   | any              | conflicting     | wikidata[,imdb]   |
 */
export function combineVerification(
  wikidata: {
    confidence: "verified" | "unverified" | "conflicting"
    wikidataDeathDate: string | null
  },
  imdb: ImdbDeathVerification
): { confidence: DeathDateConfidence; source: string | null } {
  if (wikidata.confidence === "conflicting") {
    // Conflicting always wins — Wikidata date significantly differs from TMDB
    const source = imdb.yearMatches ? "wikidata,imdb" : "wikidata"
    return { confidence: "conflicting", source }
  }

  if (wikidata.confidence === "verified") {
    // Wikidata confirmed — add IMDb as secondary source if it also matches
    const source = imdb.yearMatches ? "wikidata,imdb" : "wikidata"
    return { confidence: "verified", source }
  }

  // Wikidata is unverified — IMDb is the tiebreaker
  if (imdb.found && imdb.hasDeathYear && imdb.yearMatches) {
    return { confidence: "imdb_verified", source: "imdb" }
  }

  if (imdb.found && !imdb.hasDeathYear) {
    // IMDb knows this person but says they're alive — suspicious
    return { confidence: "suspicious", source: "imdb" }
  }

  // Not found in IMDb at all — stays unverified
  return { confidence: "unverified", source: null }
}

// ============================================================
// Cache Utilities
// ============================================================

/**
 * Clear the IMDb cache directory and in-memory index.
 */
export async function clearCache(): Promise<void> {
  episodeIndex = null
  episodeIndexBuildTime = null

  if (fs.existsSync(CACHE_DIR)) {
    await fsp.rm(CACHE_DIR, { recursive: true })
  }
}

/**
 * Get cache status for diagnostic purposes.
 */
export async function getCacheStatus(): Promise<{
  cacheDir: string
  files: { name: string; size: number; downloadedAt: Date | null; valid: boolean }[]
  episodeIndexLoaded: boolean
  episodeIndexShowCount: number
}> {
  await ensureCacheDir()

  const files = [
    "title.episode.tsv.gz",
    "title.basics.tsv.gz",
    "title.principals.tsv.gz",
    "name.basics.tsv.gz",
  ]
  const fileStatuses = await Promise.all(
    files.map(async (name) => {
      const safeName = validateFilename(name)
      // nosemgrep: path-join-resolve-traversal - validated against allowlist
      const filePath = path.join(CACHE_DIR, safeName)
      const metadata = await getCacheMetadata(safeName)
      const exists = fs.existsSync(filePath)

      return {
        name,
        size: exists ? (await fsp.stat(filePath)).size : 0,
        downloadedAt: metadata ? new Date(metadata.downloadedAt) : null,
        valid: exists && isCacheValid(metadata),
      }
    })
  )

  return {
    cacheDir: CACHE_DIR,
    files: fileStatuses,
    episodeIndexLoaded: episodeIndex !== null,
    episodeIndexShowCount: episodeIndex?.size || 0,
  }
}
