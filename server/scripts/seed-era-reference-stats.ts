#!/usr/bin/env tsx
/**
 * Seed era reference stats from database movie data
 *
 * Calculates yearly statistics for normalizing popularity metrics:
 * - Median/average box office
 * - Average IMDb votes
 * - Average Trakt watchers
 * - Inflation factors relative to 2024
 *
 * Usage:
 *   npx tsx scripts/seed-era-reference-stats.ts              # Update all years
 *   npx tsx scripts/seed-era-reference-stats.ts --dry-run    # Preview without updating
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"

// CPI data for inflation calculation (BLS historical data, normalized to 2024)
// Source: https://www.bls.gov/cpi/
const CPI_DATA: Record<number, number> = {
  1920: 20.0,
  1930: 16.7,
  1940: 14.0,
  1950: 24.1,
  1960: 29.6,
  1970: 38.8,
  1980: 82.4,
  1990: 130.7,
  2000: 172.2,
  2005: 195.3,
  2010: 218.1,
  2015: 237.0,
  2016: 240.0,
  2017: 245.1,
  2018: 251.1,
  2019: 255.7,
  2020: 258.8,
  2021: 271.0,
  2022: 292.7,
  2023: 304.7,
  2024: 313.5, // Estimated
}

// Reference year for inflation
const REFERENCE_YEAR = 2024

interface SeedOptions {
  dryRun?: boolean
  verbose?: boolean
}

interface YearStats {
  year: number
  median_box_office_cents: number | null
  avg_box_office_cents: number | null
  top_10_avg_box_office_cents: number | null
  inflation_factor: number | null
  total_movies_released: number
  avg_imdb_votes: number | null
  avg_trakt_watchers: number | null
}

const program = new Command()
  .name("seed-era-reference-stats")
  .description("Calculate and seed era reference statistics from movie data")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-v, --verbose", "Show detailed output for each year")
  .action(async (options) => {
    await seedEraStats(options)
  })

/**
 * Get CPI value for a year, interpolating if needed
 */
function getCPI(year: number): number {
  if (CPI_DATA[year]) return CPI_DATA[year]

  // Find surrounding years for interpolation
  const years = Object.keys(CPI_DATA)
    .map(Number)
    .sort((a, b) => a - b)

  if (year < years[0]) return CPI_DATA[years[0]]
  if (year > years[years.length - 1]) return CPI_DATA[years[years.length - 1]]

  let lowerYear = years[0]
  let upperYear = years[years.length - 1]

  for (const y of years) {
    if (y <= year) lowerYear = y
    if (y >= year && upperYear === years[years.length - 1]) upperYear = y
  }

  // Linear interpolation
  const lowerCPI = CPI_DATA[lowerYear]
  const upperCPI = CPI_DATA[upperYear]
  const ratio = (year - lowerYear) / (upperYear - lowerYear || 1)

  return lowerCPI + (upperCPI - lowerCPI) * ratio
}

/**
 * Calculate inflation factor to convert to reference year dollars
 */
function calculateInflationFactor(year: number): number {
  const yearCPI = getCPI(year)
  const refCPI = getCPI(REFERENCE_YEAR)
  return refCPI / yearCPI
}

async function seedEraStats(options: SeedOptions): Promise<void> {
  const { dryRun = false, verbose = false } = options

  console.log("\nCalculating era reference statistics from movie data...")
  if (dryRun) console.log("(DRY RUN - no changes will be made)\n")

  const db = getPool()

  try {
    // Get the range of years we have data for
    const rangeResult = await db.query<{ min_year: number; max_year: number }>(`
      SELECT
        MIN(release_year) as min_year,
        MAX(release_year) as max_year
      FROM movies
      WHERE release_year IS NOT NULL
    `)

    const minYear = rangeResult.rows[0]?.min_year ?? 1920
    const maxYear = rangeResult.rows[0]?.max_year ?? 2024

    console.log(`Processing years ${minYear} to ${maxYear}...\n`)

    const yearStats: YearStats[] = []

    // Calculate statistics for each year
    for (let year = minYear; year <= maxYear; year++) {
      const stats = await calculateYearStats(db, year)
      stats.inflation_factor = calculateInflationFactor(year)
      yearStats.push(stats)

      if (verbose) {
        console.log(`${year}:`)
        console.log(`  Movies: ${stats.total_movies_released}`)
        console.log(
          `  Median Box Office: ${stats.median_box_office_cents ? `$${(stats.median_box_office_cents / 100).toLocaleString()}` : "N/A"}`
        )
        console.log(`  Avg IMDb Votes: ${stats.avg_imdb_votes?.toLocaleString() ?? "N/A"}`)
        console.log(`  Inflation Factor: ${stats.inflation_factor?.toFixed(4) ?? "N/A"}`)
        console.log()
      }
    }

    // Summary
    const yearsWithBoxOffice = yearStats.filter((s) => s.median_box_office_cents !== null).length
    const yearsWithVotes = yearStats.filter((s) => s.avg_imdb_votes !== null).length

    console.log("Summary:")
    console.log(`  Total years: ${yearStats.length}`)
    console.log(`  Years with box office data: ${yearsWithBoxOffice}`)
    console.log(`  Years with IMDb vote data: ${yearsWithVotes}`)
    console.log()

    if (dryRun) {
      console.log("DRY RUN complete - no changes made.\n")
      return
    }

    // Upsert statistics
    console.log("Updating database...")

    for (const stats of yearStats) {
      await db.query(
        `
        INSERT INTO era_reference_stats (
          year,
          median_box_office_cents,
          avg_box_office_cents,
          top_10_avg_box_office_cents,
          inflation_factor,
          total_movies_released,
          avg_imdb_votes,
          avg_trakt_watchers,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (year) DO UPDATE SET
          median_box_office_cents = EXCLUDED.median_box_office_cents,
          avg_box_office_cents = EXCLUDED.avg_box_office_cents,
          top_10_avg_box_office_cents = EXCLUDED.top_10_avg_box_office_cents,
          inflation_factor = EXCLUDED.inflation_factor,
          total_movies_released = EXCLUDED.total_movies_released,
          avg_imdb_votes = EXCLUDED.avg_imdb_votes,
          avg_trakt_watchers = EXCLUDED.avg_trakt_watchers,
          updated_at = NOW()
        `,
        [
          stats.year,
          stats.median_box_office_cents,
          stats.avg_box_office_cents,
          stats.top_10_avg_box_office_cents,
          stats.inflation_factor,
          stats.total_movies_released,
          stats.avg_imdb_votes,
          stats.avg_trakt_watchers,
        ]
      )
    }

    console.log(`Updated ${yearStats.length} year records.\n`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

/**
 * Calculate statistics for a single year
 */
async function calculateYearStats(
  db: ReturnType<typeof getPool>,
  year: number
): Promise<YearStats> {
  // Get movie count and aggregate stats
  const statsResult = await db.query<{
    total_count: string
    avg_box_office: string | null
    avg_imdb_votes: string | null
    avg_trakt_watchers: string | null
  }>(
    `
    SELECT
      COUNT(*) as total_count,
      AVG(omdb_box_office_cents)::bigint as avg_box_office,
      AVG(omdb_imdb_votes)::int as avg_imdb_votes,
      AVG(trakt_watchers)::int as avg_trakt_watchers
    FROM movies
    WHERE release_year = $1
    `,
    [year]
  )

  const stats = statsResult.rows[0]
  const totalCount = parseInt(stats.total_count, 10)

  // Get median box office (requires sorted data)
  const medianResult = await db.query<{ median_box_office: string | null }>(
    `
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY omdb_box_office_cents)::bigint as median_box_office
    FROM movies
    WHERE release_year = $1 AND omdb_box_office_cents IS NOT NULL
    `,
    [year]
  )

  // Get top 10 average box office
  const top10Result = await db.query<{ top_10_avg: string | null }>(
    `
    SELECT AVG(omdb_box_office_cents)::bigint as top_10_avg
    FROM (
      SELECT omdb_box_office_cents
      FROM movies
      WHERE release_year = $1 AND omdb_box_office_cents IS NOT NULL
      ORDER BY omdb_box_office_cents DESC
      LIMIT 10
    ) top10
    `,
    [year]
  )

  return {
    year,
    median_box_office_cents: medianResult.rows[0]?.median_box_office
      ? parseInt(medianResult.rows[0].median_box_office, 10)
      : null,
    avg_box_office_cents: stats.avg_box_office ? parseInt(stats.avg_box_office, 10) : null,
    top_10_avg_box_office_cents: top10Result.rows[0]?.top_10_avg
      ? parseInt(top10Result.rows[0].top_10_avg, 10)
      : null,
    inflation_factor: null, // Filled in later
    total_movies_released: totalCount,
    avg_imdb_votes: stats.avg_imdb_votes ? parseInt(stats.avg_imdb_votes, 10) : null,
    avg_trakt_watchers: stats.avg_trakt_watchers ? parseInt(stats.avg_trakt_watchers, 10) : null,
  }
}

// Only run when executed directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed-era-reference-stats.ts")

if (isMainModule) {
  program.parse()
}
