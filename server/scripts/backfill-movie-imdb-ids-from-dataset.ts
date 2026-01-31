#!/usr/bin/env tsx
/**
 * Backfill IMDb IDs for movies using the IMDb title.basics dataset.
 *
 * This script uses fuzzy title+year matching against the IMDb dataset to find
 * IMDb IDs for movies that don't have them. It's more comprehensive than the
 * TMDB-based backfill which relies on TMDB having the external ID.
 *
 * Features:
 * - Loads ~1M movies from IMDb title.basics.tsv.gz
 * - Uses Fuse.js for fuzzy title matching
 * - Requires year match (exact or ±1 year tolerance)
 * - Configurable confidence threshold (default: 90%)
 * - Flags borderline matches (85-90%) for manual review
 * - Processes highest popularity movies first
 *
 * Usage:
 *   npm run backfill:movie-imdb-ids-dataset -- [options]
 *
 * Options:
 *   --limit <n>           Limit number of movies to process
 *   --min-popularity <n>  Only process movies with popularity >= n
 *   --min-confidence <n>  Minimum match confidence 0-1 (default: 0.90)
 *   --dry-run            Preview without writing to database
 *   --skip-tmdb-failed   Only process movies that TMDB couldn't resolve
 *
 * Examples:
 *   npm run backfill:movie-imdb-ids-dataset -- --limit 500 --dry-run
 *   npm run backfill:movie-imdb-ids-dataset -- --min-popularity 10
 *   npm run backfill:movie-imdb-ids-dataset -- --skip-tmdb-failed --limit 1000
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import Fuse from "fuse.js"
import { getPool, resetPool } from "../src/lib/db.js"
import { getMovieIndex } from "../src/lib/imdb.js"
import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseNonNegativeNumber(value: string): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Must be a non-negative number")
  }
  return parsed
}

function parseConfidence(value: string): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("Must be a number between 0 and 1")
  }
  return parsed
}

interface MovieToProcess {
  id: number
  tmdb_id: number
  title: string
  release_date: string | null
  popularity: number | null
}

interface FuseSearchItem {
  tconst: string
  primaryTitle: string
  originalTitle: string
  startYear: number | null
}

interface MatchResult {
  imdbId: string
  title: string
  confidence: number
  year: number | null
  needsReview: boolean
}

const MIN_CONFIDENCE_AUTO = 0.9 // Auto-match threshold
const MIN_CONFIDENCE_REVIEW = 0.85 // Match but flag for review
const YEAR_TOLERANCE = 1 // Allow ±1 year difference

const program = new Command()
  .name("backfill-movie-imdb-ids-from-dataset")
  .description("Backfill IMDb IDs for movies using the IMDb title.basics dataset")
  .option("-l, --limit <number>", "Limit number of movies to process", parsePositiveInt)
  .option(
    "--min-popularity <number>",
    "Only process movies with popularity >= n",
    parseNonNegativeNumber
  )
  .option(
    "--min-confidence <number>",
    "Minimum match confidence (0-1)",
    parseConfidence,
    MIN_CONFIDENCE_REVIEW
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--skip-tmdb-failed", "Only process movies that TMDB couldn't resolve")
  .action(async (options) => {
    if (options.dryRun) {
      await runBackfill(options)
    } else {
      await withNewRelicTransaction("backfill-movie-imdb-ids-dataset", async (recordMetrics) => {
        const stats = await runBackfill(options)
        recordMetrics({
          recordsProcessed: stats.processed,
          recordsUpdated: stats.updated,
          recordsReviewFlagged: stats.reviewFlagged,
          recordsSkipped: stats.skipped,
        })
      })
    }
  })

interface Options {
  limit?: number
  minPopularity?: number
  minConfidence: number
  dryRun?: boolean
  skipTmdbFailed?: boolean
}

interface Stats {
  processed: number
  updated: number
  reviewFlagged: number
  skipped: number
}

async function runBackfill(options: Options): Promise<Stats> {
  const { limit, minPopularity, minConfidence, dryRun, skipTmdbFailed } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const db = getPool()

  console.log("\n" + "=".repeat(70))
  console.log("IMDb ID Backfill from Dataset")
  console.log("=".repeat(70))
  console.log(`Min confidence: ${(minConfidence * 100).toFixed(0)}%`)
  console.log(
    `Review threshold: ${(MIN_CONFIDENCE_REVIEW * 100).toFixed(0)}%-${(MIN_CONFIDENCE_AUTO * 100).toFixed(0)}%`
  )
  if (minPopularity !== undefined) console.log(`Min popularity: ${minPopularity}`)
  if (limit) console.log(`Limit: ${limit} movies`)
  if (skipTmdbFailed) console.log("Only processing movies where TMDB failed")
  if (dryRun) console.log("DRY RUN - no changes will be made")
  console.log()

  // Step 1: Load IMDb movie index
  console.log("Loading IMDb movie index...")
  const imdbMovies = await getMovieIndex()
  console.log(`Loaded ${imdbMovies.length.toLocaleString()} movies from IMDb dataset\n`)

  // Step 2: Build Fuse.js search index
  console.log("Building Fuse.js search index...")
  const fuseItems: FuseSearchItem[] = imdbMovies.map((m) => ({
    tconst: m.tconst,
    primaryTitle: m.primaryTitle,
    originalTitle: m.originalTitle,
    startYear: m.startYear,
  }))

  const fuse = new Fuse(fuseItems, {
    keys: ["primaryTitle", "originalTitle"],
    threshold: 0.35, // 65% minimum similarity for initial search
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  })
  console.log("Search index ready\n")

  // Step 3: Query movies needing IMDb IDs
  let query = `
    SELECT id, tmdb_id, title, release_date, popularity
    FROM movies
    WHERE imdb_id IS NULL
  `

  const params: (number | string)[] = []

  if (skipTmdbFailed) {
    // Only movies that TMDB couldn't resolve (permanently failed or attempted)
    query += ` AND (external_ids_permanently_failed = true OR external_ids_fetch_attempts > 0)`
  }

  if (minPopularity !== undefined) {
    params.push(minPopularity)
    query += ` AND popularity >= $${params.length}`
  }

  query += " ORDER BY popularity DESC NULLS LAST"

  if (limit) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  console.log("Fetching movies from database...")
  const result = await db.query<MovieToProcess>(query, params)
  const movies = result.rows

  console.log(`Found ${movies.length} movies to process\n`)

  if (movies.length === 0) {
    console.log("No movies found matching criteria.")
    await resetPool()
    return { processed: 0, updated: 0, reviewFlagged: 0, skipped: 0 }
  }

  // Step 4: Process each movie
  console.log("Processing movies...\n")
  let processed = 0
  let updated = 0
  let reviewFlagged = 0
  let skipped = 0

  for (const movie of movies) {
    processed++
    const year = movie.release_date ? parseInt(movie.release_date.substring(0, 4), 10) : null

    process.stdout.write(`[${processed}/${movies.length}] ${movie.title} (${year || "?"})... `)

    // Skip if no year - can't match reliably
    if (!year) {
      console.log("skipped (no year)")
      skipped++
      continue
    }

    // Fuzzy search
    const match = findBestMatch(fuse, movie.title, year, minConfidence)

    if (!match) {
      console.log("no match")
      skipped++
      continue
    }

    // Update database
    if (!dryRun) {
      await db.query(
        `UPDATE movies
         SET imdb_id = $1,
             imdb_id_source = 'dataset',
             imdb_id_needs_review = $2,
             -- Reset retry tracking since we now have an IMDb ID
             external_ids_fetch_attempts = 0,
             external_ids_permanently_failed = false,
             external_ids_fetch_error = NULL
         WHERE id = $3`,
        [match.imdbId, match.needsReview, movie.id]
      )
    }

    if (match.needsReview) {
      reviewFlagged++
      console.log(
        `${dryRun ? "would set: " : ""}${match.imdbId} (${(match.confidence * 100).toFixed(0)}% - NEEDS REVIEW)`
      )
    } else {
      updated++
      console.log(
        `${dryRun ? "would set: " : ""}${match.imdbId} (${(match.confidence * 100).toFixed(0)}%)`
      )
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(70))
  console.log("SUMMARY")
  console.log("=".repeat(70))
  console.log(`Processed: ${processed}`)
  console.log(`${dryRun ? "Would update" : "Updated"}: ${updated}`)
  console.log(`${dryRun ? "Would flag for review" : "Flagged for review"}: ${reviewFlagged}`)
  console.log(`Skipped (no year or no match): ${skipped}`)

  const successRate = processed > 0 ? ((updated + reviewFlagged) / processed) * 100 : 0
  console.log(`Success rate: ${successRate.toFixed(1)}%`)

  await resetPool()

  return { processed, updated, reviewFlagged, skipped }
}

/**
 * Find the best matching IMDb movie using fuzzy title search with year filtering.
 */
function findBestMatch(
  fuse: Fuse<FuseSearchItem>,
  title: string,
  year: number,
  minConfidence: number
): MatchResult | null {
  // Search for title
  const results = fuse.search(title)

  // Filter by year (exact match or ±1 year tolerance)
  const yearFilteredResults = results.filter((r) => {
    if (!r.item.startYear) return false
    return Math.abs(r.item.startYear - year) <= YEAR_TOLERANCE
  })

  if (yearFilteredResults.length === 0) {
    return null
  }

  const topMatch = yearFilteredResults[0]
  const confidence = 1 - (topMatch.score || 0)

  // Check confidence threshold
  if (confidence < minConfidence) {
    return null
  }

  // Determine if needs review (borderline confidence)
  const needsReview = confidence >= MIN_CONFIDENCE_REVIEW && confidence < MIN_CONFIDENCE_AUTO

  return {
    imdbId: topMatch.item.tconst,
    title: topMatch.item.primaryTitle,
    confidence,
    year: topMatch.item.startYear,
    needsReview,
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
