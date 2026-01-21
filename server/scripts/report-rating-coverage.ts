#!/usr/bin/env tsx
/**
 * Report rating data coverage across all entities
 *
 * Shows coverage percentages for:
 * - Movies: IMDb IDs, OMDb ratings, Trakt stats, popularity
 * - Shows: External IDs, OMDb ratings, Trakt stats, TheTVDB scores
 * - Episodes: OMDb ratings
 * - Actors: Details (birthday, profile_path)
 *
 * Also reports permanently failed items that won't be retried.
 *
 * Usage:
 *   npm run report:rating-coverage
 */

import "dotenv/config"
import { getPool, resetPool } from "../src/lib/db.js"

interface CoverageStats {
  total: number
  withData: number
  percentage: number
  permanentlyFailed?: number
  needingRetry?: number
  nextRetry?: string
}

async function getMovieCoverage() {
  const db = getPool()

  const totalResult = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM movies")
  const total = parseInt(totalResult.rows[0].count, 10)

  const stats: Record<string, CoverageStats> = {}

  // IMDb IDs
  const imdbResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE imdb_id IS NOT NULL"
  )
  const imdbFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE external_ids_permanently_failed = true"
  )
  stats.imdb_ids = {
    total,
    withData: parseInt(imdbResult.rows[0].count, 10),
    percentage: (parseInt(imdbResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(imdbFailed.rows[0].count, 10),
  }

  // OMDb ratings
  const omdbResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE omdb_updated_at IS NOT NULL"
  )
  const omdbFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE omdb_permanently_failed = true"
  )
  const omdbRetry = await db.query<{ count: string; next_retry: string }>(
    `SELECT COUNT(*) as count,
            MIN(omdb_last_fetch_attempt + INTERVAL '1 hour' * POWER(2, omdb_fetch_attempts)) as next_retry
     FROM movies
     WHERE omdb_updated_at IS NULL
       AND omdb_permanently_failed = false
       AND omdb_fetch_attempts > 0
       AND omdb_fetch_attempts < 3`
  )
  stats.omdb_ratings = {
    total,
    withData: parseInt(omdbResult.rows[0].count, 10),
    percentage: (parseInt(omdbResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(omdbFailed.rows[0].count, 10),
    needingRetry: parseInt(omdbRetry.rows[0].count, 10),
    nextRetry: omdbRetry.rows[0].next_retry,
  }

  // Trakt stats
  const traktResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE trakt_updated_at IS NOT NULL"
  )
  const traktFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE trakt_permanently_failed = true"
  )
  stats.trakt_stats = {
    total,
    withData: parseInt(traktResult.rows[0].count, 10),
    percentage: (parseInt(traktResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(traktFailed.rows[0].count, 10),
  }

  // Popularity
  const popularityResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE popularity IS NOT NULL"
  )
  const popularityFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE popularity_permanently_failed = true"
  )
  stats.popularity = {
    total,
    withData: parseInt(popularityResult.rows[0].count, 10),
    percentage: (parseInt(popularityResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(popularityFailed.rows[0].count, 10),
  }

  return stats
}

async function getShowCoverage() {
  const db = getPool()

  const totalResult = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM shows")
  const total = parseInt(totalResult.rows[0].count, 10)

  const stats: Record<string, CoverageStats> = {}

  // TheTVDB IDs
  const thetvdbIdResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE thetvdb_id IS NOT NULL"
  )
  const externalIdsFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE external_ids_permanently_failed = true"
  )
  stats.thetvdb_ids = {
    total,
    withData: parseInt(thetvdbIdResult.rows[0].count, 10),
    percentage: (parseInt(thetvdbIdResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(externalIdsFailed.rows[0].count, 10),
  }

  // OMDb ratings
  const omdbResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE omdb_updated_at IS NOT NULL"
  )
  const omdbFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE omdb_permanently_failed = true"
  )
  stats.omdb_ratings = {
    total,
    withData: parseInt(omdbResult.rows[0].count, 10),
    percentage: (parseInt(omdbResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(omdbFailed.rows[0].count, 10),
  }

  // Trakt stats
  const traktResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE trakt_updated_at IS NOT NULL"
  )
  const traktFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE trakt_permanently_failed = true"
  )
  stats.trakt_stats = {
    total,
    withData: parseInt(traktResult.rows[0].count, 10),
    percentage: (parseInt(traktResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(traktFailed.rows[0].count, 10),
  }

  // TheTVDB scores
  const thetvdbScoreResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE thetvdb_score IS NOT NULL"
  )
  const thetvdbFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM shows WHERE thetvdb_permanently_failed = true"
  )
  stats.thetvdb_scores = {
    total,
    withData: parseInt(thetvdbScoreResult.rows[0].count, 10),
    percentage: (parseInt(thetvdbScoreResult.rows[0].count, 10) / total) * 100,
    permanentlyFailed: parseInt(thetvdbFailed.rows[0].count, 10),
  }

  return stats
}

async function getEpisodeCoverage() {
  const db = getPool()

  const totalResult = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM episodes")
  const total = parseInt(totalResult.rows[0].count, 10)

  const omdbResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM episodes WHERE omdb_updated_at IS NOT NULL"
  )
  const omdbFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM episodes WHERE omdb_permanently_failed = true"
  )

  return {
    omdb_ratings: {
      total,
      withData: parseInt(omdbResult.rows[0].count, 10),
      percentage: (parseInt(omdbResult.rows[0].count, 10) / total) * 100,
      permanentlyFailed: parseInt(omdbFailed.rows[0].count, 10),
    },
  }
}

async function getActorCoverage() {
  const db = getPool()

  const totalResult = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM actors")
  const total = parseInt(totalResult.rows[0].count, 10)

  const detailsResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM actors WHERE birthday IS NOT NULL OR profile_path IS NOT NULL"
  )
  const detailsFailed = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM actors WHERE details_permanently_failed = true"
  )

  return {
    details: {
      total,
      withData: parseInt(detailsResult.rows[0].count, 10),
      percentage: (parseInt(detailsResult.rows[0].count, 10) / total) * 100,
      permanentlyFailed: parseInt(detailsFailed.rows[0].count, 10),
    },
  }
}

function formatStat(stat: CoverageStats): string {
  const lines: string[] = []
  lines.push(`${stat.withData.toLocaleString()}/${stat.total.toLocaleString()} (${stat.percentage.toFixed(1)}%)`)
  if (stat.permanentlyFailed && stat.permanentlyFailed > 0) {
    lines.push(`  Permanently failed: ${stat.permanentlyFailed.toLocaleString()}`)
  }
  if (stat.needingRetry && stat.needingRetry > 0) {
    const retryTime = stat.nextRetry
      ? new Date(stat.nextRetry).toLocaleString()
      : "unknown"
    lines.push(`  Awaiting retry: ${stat.needingRetry.toLocaleString()} (next: ${retryTime})`)
  }
  return lines.join("\n    ")
}

async function run() {
  try {
    console.log("\n" + "=".repeat(60))
    console.log("Rating Data Coverage Report")
    console.log("=".repeat(60))
    console.log(`Generated: ${new Date().toLocaleString()}`)
    console.log("=".repeat(60))

    const movieStats = await getMovieCoverage()
    console.log("\n📽️  Movies")
    console.log("  IMDb IDs:       " + formatStat(movieStats.imdb_ids))
    console.log("  OMDb ratings:   " + formatStat(movieStats.omdb_ratings))
    console.log("  Trakt stats:    " + formatStat(movieStats.trakt_stats))
    console.log("  Popularity:     " + formatStat(movieStats.popularity))

    const showStats = await getShowCoverage()
    console.log("\n📺 Shows")
    console.log("  TheTVDB IDs:    " + formatStat(showStats.thetvdb_ids))
    console.log("  OMDb ratings:   " + formatStat(showStats.omdb_ratings))
    console.log("  Trakt stats:    " + formatStat(showStats.trakt_stats))
    console.log("  TheTVDB scores: " + formatStat(showStats.thetvdb_scores))

    const episodeStats = await getEpisodeCoverage()
    console.log("\n🎞️  Episodes")
    console.log("  OMDb ratings:   " + formatStat(episodeStats.omdb_ratings))

    const actorStats = await getActorCoverage()
    console.log("\n👤 Actors")
    console.log("  Details (birthday/profile): " + formatStat(actorStats.details))

    console.log("\n" + "=".repeat(60))

    await resetPool()
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  run()
}
