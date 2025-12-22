#!/usr/bin/env tsx
/**
 * Display statistics about imported TV shows.
 *
 * Usage:
 *   npm run import:stats:shows -- [options]
 *
 * Options:
 *   --format <format>   Output format: table (default) or json
 *   --by-phase          Group by popularity phase
 *   --by-year           Group by first_air_date year
 *   --by-status         Group by show status (Ended, Returning, Canceled)
 *
 * Examples:
 *   npm run import:stats:shows
 *   npm run import:stats:shows -- --format json
 *   npm run import:stats:shows -- --by-phase
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, getSyncState, type SyncStateRecord } from "../src/lib/db.js"
import { PHASE_THRESHOLDS } from "../src/lib/import-phases.js"

// Re-export for backwards compatibility with tests
export { PHASE_THRESHOLDS }

export type OutputFormat = "table" | "json"

export function parseFormat(value: string): OutputFormat {
  if (value !== "table" && value !== "json") {
    throw new InvalidArgumentError("Format must be: table or json")
  }
  return value
}

interface StatsOptions {
  format: OutputFormat
  byPhase: boolean
  byYear: boolean
  byStatus: boolean
}

// ============================================================================
// Query result types
// ============================================================================

interface OverviewStats {
  total_shows: number
  total_cast: number
  total_deceased: number
  avg_cast: number
  avg_deceased: number
}

interface PhaseStats {
  phase: string
  count: number
  avg_cast: number
  avg_deceased: number
  avg_curse_score: number | null
}

interface YearStats {
  year: number
  count: number
  avg_cast: number
  avg_deceased: number
}

interface StatusStats {
  status: string
  count: number
  avg_cast: number
  avg_deceased: number
}

interface DataQualityStats {
  zero_cast: number
  missing_mortality: number
  missing_age: number
  orphaned_appearances: number
}

interface ActorStats {
  unique_actors: number
  deceased_actors: number
}

// ============================================================================
// Query functions (exported for testing)
// ============================================================================

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = getPool()
  const result = await db.query<OverviewStats>(`
    SELECT
      COUNT(*)::int as total_shows,
      COALESCE(SUM(cast_count), 0)::int as total_cast,
      COALESCE(SUM(deceased_count), 0)::int as total_deceased,
      ROUND(COALESCE(AVG(cast_count), 0))::int as avg_cast,
      ROUND(COALESCE(AVG(deceased_count), 0))::int as avg_deceased
    FROM shows
  `)
  return result.rows[0]
}

export async function getActorStats(): Promise<ActorStats> {
  const db = getPool()
  const result = await db.query<ActorStats>(`
    SELECT
      COUNT(DISTINCT actor_tmdb_id)::int as unique_actors,
      COUNT(DISTINCT CASE WHEN is_deceased THEN actor_tmdb_id END)::int as deceased_actors
    FROM show_actor_appearances
  `)
  return result.rows[0]
}

export async function getStatsByPhase(): Promise<PhaseStats[]> {
  const db = getPool()
  const result = await db.query<PhaseStats>(`
    SELECT phase, count, avg_cast, avg_deceased, avg_curse_score
    FROM (
      SELECT
        CASE
          WHEN popularity >= 50 THEN 'popular'
          WHEN popularity >= 10 THEN 'standard'
          ELSE 'obscure'
        END as phase,
        COUNT(*)::int as count,
        ROUND(COALESCE(AVG(cast_count), 0))::int as avg_cast,
        ROUND(COALESCE(AVG(deceased_count), 0))::int as avg_deceased,
        ROUND(AVG(mortality_surprise_score)::numeric, 2)::float as avg_curse_score
      FROM shows
      GROUP BY 1
    ) sub
    ORDER BY
      CASE phase
        WHEN 'popular' THEN 1
        WHEN 'standard' THEN 2
        ELSE 3
      END
  `)
  return result.rows
}

export async function getStatsByYear(): Promise<YearStats[]> {
  const db = getPool()
  const result = await db.query<YearStats>(`
    SELECT
      EXTRACT(YEAR FROM first_air_date)::int as year,
      COUNT(*)::int as count,
      ROUND(COALESCE(AVG(cast_count), 0))::int as avg_cast,
      ROUND(COALESCE(AVG(deceased_count), 0))::int as avg_deceased
    FROM shows
    WHERE first_air_date IS NOT NULL
    GROUP BY year
    ORDER BY year DESC
    LIMIT 20
  `)
  return result.rows
}

export async function getStatsByStatus(): Promise<StatusStats[]> {
  const db = getPool()
  const result = await db.query<StatusStats>(`
    SELECT
      COALESCE(status, 'Unknown') as status,
      COUNT(*)::int as count,
      ROUND(COALESCE(AVG(cast_count), 0))::int as avg_cast,
      ROUND(COALESCE(AVG(deceased_count), 0))::int as avg_deceased
    FROM shows
    GROUP BY status
    ORDER BY count DESC
  `)
  return result.rows
}

export async function getDataQualityStats(): Promise<DataQualityStats> {
  const db = getPool()

  // Run queries in parallel
  const [zeroCast, missingMortality, missingAge, orphaned] = await Promise.all([
    db.query<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM shows WHERE cast_count = 0 OR cast_count IS NULL"
    ),
    db.query<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM shows WHERE mortality_surprise_score IS NULL"
    ),
    db.query<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM show_actor_appearances WHERE age_at_filming IS NULL"
    ),
    db.query<{ count: number }>(`
      SELECT COUNT(*)::int as count
      FROM show_actor_appearances saa
      LEFT JOIN shows s ON saa.show_tmdb_id = s.tmdb_id
      WHERE s.id IS NULL
    `),
  ])

  return {
    zero_cast: zeroCast.rows[0].count,
    missing_mortality: missingMortality.rows[0].count,
    missing_age: missingAge.rows[0].count,
    orphaned_appearances: orphaned.rows[0].count,
  }
}

export async function getLastImportState(): Promise<SyncStateRecord | null> {
  return getSyncState("show_import")
}

// ============================================================================
// Output formatting
// ============================================================================

export function formatTableOutput(data: {
  overview: OverviewStats
  actors: ActorStats
  phases?: PhaseStats[]
  years?: YearStats[]
  statuses?: StatusStats[]
  quality: DataQualityStats
  lastImport: SyncStateRecord | null
}): string {
  const lines: string[] = []

  lines.push("TV Show Import Statistics")
  lines.push("=".repeat(50))
  lines.push(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`)
  lines.push("")

  // Overview
  lines.push("Overview")
  lines.push("-".repeat(30))
  lines.push(`Total shows:              ${data.overview.total_shows.toLocaleString()}`)
  lines.push(`Total actor appearances:  ${data.overview.total_cast.toLocaleString()}`)
  lines.push(`Unique actors:            ${data.actors.unique_actors.toLocaleString()}`)
  lines.push(`Deceased actors:          ${data.actors.deceased_actors.toLocaleString()}`)
  lines.push(`Avg cast per show:        ${data.overview.avg_cast}`)
  lines.push(`Avg deceased per show:    ${data.overview.avg_deceased}`)
  lines.push("")

  // By Phase
  if (data.phases && data.phases.length > 0) {
    lines.push("By Popularity Phase")
    lines.push("-".repeat(70))
    lines.push(
      `${"Phase".padEnd(12)} ${"Count".padStart(8)} ${"Avg Cast".padStart(10)} ${"Avg Dead".padStart(10)} ${"Avg Curse".padStart(12)}`
    )
    for (const row of data.phases) {
      const curseStr = row.avg_curse_score !== null ? row.avg_curse_score.toFixed(2) : "N/A"
      lines.push(
        `${row.phase.padEnd(12)} ${row.count.toString().padStart(8)} ${row.avg_cast.toString().padStart(10)} ${row.avg_deceased.toString().padStart(10)} ${curseStr.padStart(12)}`
      )
    }
    lines.push("")
  }

  // By Year
  if (data.years && data.years.length > 0) {
    lines.push("By Year (Top 20)")
    lines.push("-".repeat(50))
    lines.push(
      `${"Year".padEnd(8)} ${"Count".padStart(8)} ${"Avg Cast".padStart(10)} ${"Avg Dead".padStart(10)}`
    )
    for (const row of data.years) {
      lines.push(
        `${row.year.toString().padEnd(8)} ${row.count.toString().padStart(8)} ${row.avg_cast.toString().padStart(10)} ${row.avg_deceased.toString().padStart(10)}`
      )
    }
    lines.push("")
  }

  // By Status
  if (data.statuses && data.statuses.length > 0) {
    lines.push("By Status")
    lines.push("-".repeat(50))
    lines.push(
      `${"Status".padEnd(20)} ${"Count".padStart(8)} ${"Avg Cast".padStart(10)} ${"Avg Dead".padStart(10)}`
    )
    for (const row of data.statuses) {
      lines.push(
        `${row.status.padEnd(20)} ${row.count.toString().padStart(8)} ${row.avg_cast.toString().padStart(10)} ${row.avg_deceased.toString().padStart(10)}`
      )
    }
    lines.push("")
  }

  // Data Quality
  lines.push("Data Quality")
  lines.push("-".repeat(30))
  lines.push(`Shows with zero cast:       ${data.quality.zero_cast}`)
  lines.push(`Shows missing mortality:    ${data.quality.missing_mortality}`)
  lines.push(`Appearances missing age:    ${data.quality.missing_age}`)
  lines.push(`Orphaned appearances:       ${data.quality.orphaned_appearances}`)
  lines.push("")

  // Last Import
  lines.push("Last Import")
  lines.push("-".repeat(30))
  if (data.lastImport) {
    lines.push(`Phase: ${data.lastImport.current_phase || "N/A"}`)
    if (data.lastImport.phase_completed && data.lastImport.phase_total) {
      const pct = Math.round((data.lastImport.phase_completed / data.lastImport.phase_total) * 100)
      lines.push(
        `Progress: ${data.lastImport.phase_completed}/${data.lastImport.phase_total} (${pct}%)`
      )
    }
    lines.push(`Last ID: ${data.lastImport.last_processed_id || "N/A"}`)
    lines.push(
      `Last Run: ${data.lastImport.last_run_at?.toISOString().replace("T", " ").slice(0, 19) || "N/A"}`
    )
    lines.push(`Items Processed: ${data.lastImport.items_processed}`)
    lines.push(`Errors: ${data.lastImport.errors_count}`)
  } else {
    lines.push("No import checkpoint found")
  }

  return lines.join("\n")
}

// ============================================================================
// Main script
// ============================================================================

const program = new Command()
  .name("show-import-stats")
  .description("Display statistics about imported TV shows")
  .option("-f, --format <format>", "Output format: table or json", parseFormat, "table")
  .option("--by-phase", "Include breakdown by popularity phase", false)
  .option("--by-year", "Include breakdown by year", false)
  .option("--by-status", "Include breakdown by status", false)
  .action(async (options: StatsOptions) => {
    await runStats(options)
  })

async function runStats(options: StatsOptions) {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  try {
    // Fetch all stats in parallel
    const [overview, actors, quality, lastImport, phases, years, statuses] = await Promise.all([
      getOverviewStats(),
      getActorStats(),
      getDataQualityStats(),
      getLastImportState(),
      options.byPhase ? getStatsByPhase() : Promise.resolve(undefined),
      options.byYear ? getStatsByYear() : Promise.resolve(undefined),
      options.byStatus ? getStatsByStatus() : Promise.resolve(undefined),
    ])

    // Default: always show phases if no grouping specified
    const showPhases = options.byPhase || (!options.byYear && !options.byStatus)
    const finalPhases = showPhases ? (phases ?? (await getStatsByPhase())) : undefined

    const data = {
      overview,
      actors,
      phases: finalPhases,
      years,
      statuses,
      quality,
      lastImport,
    }

    if (options.format === "json") {
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.log(formatTableOutput(data))
    }
  } catch (error) {
    console.error("Error fetching stats:", error)
    process.exit(1)
  }
}

// Only run when executed directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
