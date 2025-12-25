#!/usr/bin/env tsx
/**
 * Verify TV show data integrity and optionally fix issues.
 *
 * Usage:
 *   npm run verify:shows -- [options]
 *
 * Options:
 *   --check-counts      Verify cast_count matches actual appearances
 *   --check-mortality   Verify mortality stats are calculated
 *   --check-all         Run all checks (default if no specific check specified)
 *   --sample <n>        Limit results to top N shows by popularity (default: all)
 *   --phase <phase>     Only check shows from specific phase (popular/standard/obscure)
 *   --fix               Auto-fix issues found
 *   --dry-run           Preview fixes without writing
 *
 * Examples:
 *   npm run verify:shows
 *   npm run verify:shows -- --check-counts --fix
 *   npm run verify:shows -- --sample 100 --phase popular
 *   npm run verify:shows -- --fix --dry-run
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  PHASE_THRESHOLDS,
  parsePositiveInt,
  parsePhase,
  type ImportPhase,
} from "../src/lib/import-phases.js"

// Re-export for backwards compatibility with tests
export { PHASE_THRESHOLDS, parsePositiveInt, parsePhase, type ImportPhase }

interface VerifyOptions {
  checkCounts: boolean
  checkMortality: boolean
  checkAll: boolean
  sample?: number
  phase?: ImportPhase
  fix: boolean
  dryRun: boolean
}

// ============================================================================
// Issue types
// ============================================================================

interface CastCountMismatch {
  tmdb_id: number
  name: string
  stored_count: number
  actual_count: number
}

interface DeceasedCountMismatch {
  tmdb_id: number
  name: string
  stored_count: number
  actual_count: number
}

interface MissingMortality {
  tmdb_id: number
  name: string
}

interface VerificationResults {
  castCountMismatches: CastCountMismatch[]
  deceasedCountMismatches: DeceasedCountMismatch[]
  missingMortality: MissingMortality[]
  showsChecked: number
  issuesFixed: number
}

// ============================================================================
// Check functions (exported for testing)
// ============================================================================

/**
 * Find shows where cast_count doesn't match actual appearances
 */
export async function findCastCountMismatches(
  phase?: ImportPhase,
  sample?: number
): Promise<CastCountMismatch[]> {
  const db = getPool()

  let whereClause = ""
  const params: (number | string)[] = []

  if (phase) {
    const threshold = PHASE_THRESHOLDS[phase]
    if (threshold.max === Infinity) {
      whereClause = "WHERE s.popularity >= $1"
      params.push(threshold.min)
    } else {
      whereClause = "WHERE s.popularity >= $1 AND s.popularity < $2"
      params.push(threshold.min, threshold.max)
    }
  }

  let limitClause = ""
  if (sample) {
    const paramIndex = params.length + 1
    limitClause = `LIMIT $${paramIndex}`
    params.push(sample)
  }

  const result = await db.query<CastCountMismatch>(
    `
    SELECT
      s.tmdb_id,
      s.name,
      COALESCE(s.cast_count, 0)::int as stored_count,
      COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
    FROM shows s
    LEFT JOIN actor_show_appearances saa ON s.tmdb_id = saa.show_tmdb_id
    ${whereClause}
    GROUP BY s.tmdb_id, s.name, s.cast_count, s.popularity
    HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
    ORDER BY s.popularity DESC NULLS LAST
    ${limitClause}
  `,
    params
  )

  return result.rows
}

/**
 * Find shows where deceased_count doesn't match actual deceased actors
 */
export async function findDeceasedCountMismatches(
  phase?: ImportPhase,
  sample?: number
): Promise<DeceasedCountMismatch[]> {
  const db = getPool()

  let whereClause = ""
  const params: (number | string)[] = []

  if (phase) {
    const threshold = PHASE_THRESHOLDS[phase]
    if (threshold.max === Infinity) {
      whereClause = "WHERE s.popularity >= $1"
      params.push(threshold.min)
    } else {
      whereClause = "WHERE s.popularity >= $1 AND s.popularity < $2"
      params.push(threshold.min, threshold.max)
    }
  }

  let limitClause = ""
  if (sample) {
    const paramIndex = params.length + 1
    limitClause = `LIMIT $${paramIndex}`
    params.push(sample)
  }

  const result = await db.query<DeceasedCountMismatch>(
    `
    SELECT
      s.tmdb_id,
      s.name,
      COALESCE(s.deceased_count, 0)::int as stored_count,
      COUNT(DISTINCT CASE WHEN a.deathday IS NOT NULL THEN saa.actor_tmdb_id END)::int as actual_count
    FROM shows s
    LEFT JOIN actor_show_appearances saa ON s.tmdb_id = saa.show_tmdb_id
    LEFT JOIN actors a ON saa.actor_tmdb_id = a.tmdb_id
    ${whereClause}
    GROUP BY s.tmdb_id, s.name, s.deceased_count, s.popularity
    HAVING COALESCE(s.deceased_count, 0) != COUNT(DISTINCT CASE WHEN a.deathday IS NOT NULL THEN saa.actor_tmdb_id END)
    ORDER BY s.popularity DESC NULLS LAST
    ${limitClause}
  `,
    params
  )

  return result.rows
}

/**
 * Find shows with missing mortality statistics
 */
export async function findMissingMortality(
  phase?: ImportPhase,
  sample?: number
): Promise<MissingMortality[]> {
  const db = getPool()

  let whereClause = "WHERE (s.mortality_surprise_score IS NULL OR s.expected_deaths IS NULL)"
  const params: (number | string)[] = []

  if (phase) {
    const threshold = PHASE_THRESHOLDS[phase]
    if (threshold.max === Infinity) {
      whereClause += " AND s.popularity >= $1"
      params.push(threshold.min)
    } else {
      whereClause += " AND s.popularity >= $1 AND s.popularity < $2"
      params.push(threshold.min, threshold.max)
    }
  }

  let limitClause = ""
  if (sample) {
    const paramIndex = params.length + 1
    limitClause = `LIMIT $${paramIndex}`
    params.push(sample)
  }

  const result = await db.query<MissingMortality>(
    `
    SELECT s.tmdb_id, s.name
    FROM shows s
    ${whereClause}
    ORDER BY s.popularity DESC NULLS LAST
    ${limitClause}
  `,
    params
  )

  return result.rows
}

// ============================================================================
// Fix functions (exported for testing)
// ============================================================================

/**
 * Fix cast_count values for specific shows (batch update)
 */
export async function fixCastCounts(
  mismatches: CastCountMismatch[],
  dryRun: boolean
): Promise<number> {
  if (dryRun || mismatches.length === 0) return 0

  const db = getPool()

  // Batch update using unnest arrays
  const tmdbIds = mismatches.map((m) => m.tmdb_id)
  const actualCounts = mismatches.map((m) => m.actual_count)

  await db.query(
    `
    UPDATE shows s
    SET cast_count = u.actual_count,
        living_count = u.actual_count - COALESCE(s.deceased_count, 0),
        updated_at = NOW()
    FROM unnest($1::int[], $2::int[]) AS u(tmdb_id, actual_count)
    WHERE s.tmdb_id = u.tmdb_id
  `,
    [tmdbIds, actualCounts]
  )

  return mismatches.length
}

/**
 * Fix deceased_count values for specific shows (batch update)
 */
export async function fixDeceasedCounts(
  mismatches: DeceasedCountMismatch[],
  dryRun: boolean
): Promise<number> {
  if (dryRun || mismatches.length === 0) return 0

  const db = getPool()

  // Batch update using unnest arrays
  const tmdbIds = mismatches.map((m) => m.tmdb_id)
  const actualCounts = mismatches.map((m) => m.actual_count)

  await db.query(
    `
    UPDATE shows s
    SET deceased_count = u.actual_count,
        living_count = COALESCE(s.cast_count, 0) - u.actual_count,
        updated_at = NOW()
    FROM unnest($1::int[], $2::int[]) AS u(tmdb_id, actual_count)
    WHERE s.tmdb_id = u.tmdb_id
  `,
    [tmdbIds, actualCounts]
  )

  return mismatches.length
}

// ============================================================================
// Main verification logic
// ============================================================================

async function runVerification(options: VerifyOptions): Promise<VerificationResults> {
  const results: VerificationResults = {
    castCountMismatches: [],
    deceasedCountMismatches: [],
    missingMortality: [],
    showsChecked: 0,
    issuesFixed: 0,
  }

  // Determine which checks to run
  const runAll = options.checkAll || (!options.checkCounts && !options.checkMortality)
  const checkCounts = runAll || options.checkCounts
  const checkMortality = runAll || options.checkMortality

  console.log("\nTV Show Data Verification")
  console.log("=".repeat(50))
  if (options.phase) {
    const threshold = PHASE_THRESHOLDS[options.phase]
    console.log(
      `Phase: ${options.phase} (popularity ${threshold.min}-${threshold.max === Infinity ? "∞" : threshold.max})`
    )
  }
  if (options.sample) {
    console.log(`Sample: ${options.sample} shows`)
  }
  console.log(`Mode: ${options.fix ? (options.dryRun ? "DRY RUN FIX" : "FIX") : "CHECK ONLY"}`)
  console.log("")

  // Check cast counts
  if (checkCounts) {
    console.log("Checking cast counts...")
    results.castCountMismatches = await findCastCountMismatches(options.phase, options.sample)
    if (results.castCountMismatches.length > 0) {
      console.log(`  Found ${results.castCountMismatches.length} mismatches`)
      for (const m of results.castCountMismatches.slice(0, 5)) {
        console.log(`    ${m.name}: stored=${m.stored_count}, actual=${m.actual_count}`)
      }
      if (results.castCountMismatches.length > 5) {
        console.log(`    ... and ${results.castCountMismatches.length - 5} more`)
      }

      if (options.fix) {
        const fixed = await fixCastCounts(results.castCountMismatches, options.dryRun)
        results.issuesFixed += fixed
        console.log(`  ${options.dryRun ? "Would fix" : "Fixed"}: ${fixed} cast count issues`)
      }
    } else {
      console.log("  All cast counts match")
    }
    console.log("")
  }

  // Check deceased counts (always run when checking counts)
  if (checkCounts) {
    console.log("Checking deceased counts...")
    results.deceasedCountMismatches = await findDeceasedCountMismatches(
      options.phase,
      options.sample
    )
    if (results.deceasedCountMismatches.length > 0) {
      console.log(`  Found ${results.deceasedCountMismatches.length} mismatches`)
      for (const m of results.deceasedCountMismatches.slice(0, 5)) {
        console.log(`    ${m.name}: stored=${m.stored_count}, actual=${m.actual_count}`)
      }
      if (results.deceasedCountMismatches.length > 5) {
        console.log(`    ... and ${results.deceasedCountMismatches.length - 5} more`)
      }

      if (options.fix) {
        const fixed = await fixDeceasedCounts(results.deceasedCountMismatches, options.dryRun)
        results.issuesFixed += fixed
        console.log(`  ${options.dryRun ? "Would fix" : "Fixed"}: ${fixed} deceased count issues`)
      }
    } else {
      console.log("  All deceased counts match")
    }
    console.log("")
  }

  // Check mortality stats
  if (checkMortality) {
    console.log("Checking mortality stats...")
    results.missingMortality = await findMissingMortality(options.phase, options.sample)
    if (results.missingMortality.length > 0) {
      console.log(`  Found ${results.missingMortality.length} shows missing mortality stats`)
      for (const m of results.missingMortality.slice(0, 5)) {
        console.log(`    ${m.name} (ID: ${m.tmdb_id})`)
      }
      if (results.missingMortality.length > 5) {
        console.log(`    ... and ${results.missingMortality.length - 5} more`)
      }
      console.log("  (Use the import script to recalculate mortality stats)")
    } else {
      console.log("  All shows have mortality stats")
    }
    console.log("")
  }

  // Summary
  const totalIssues =
    results.castCountMismatches.length +
    results.deceasedCountMismatches.length +
    results.missingMortality.length

  console.log("=".repeat(50))
  console.log("SUMMARY")
  console.log("-".repeat(30))
  console.log(`Cast count mismatches:     ${results.castCountMismatches.length}`)
  console.log(`Deceased count mismatches: ${results.deceasedCountMismatches.length}`)
  console.log(`Missing mortality stats:   ${results.missingMortality.length}`)
  console.log("-".repeat(30))
  console.log(`Total issues:              ${totalIssues}`)
  if (options.fix) {
    console.log(
      `Issues fixed:             ${results.issuesFixed}${options.dryRun ? " (dry run)" : ""}`
    )
  }
  console.log("=".repeat(50))

  if (!options.fix && totalIssues > 0) {
    console.log("\nRun with --fix to repair issues.")
  }

  return results
}

// ============================================================================
// CLI setup
// ============================================================================

const program = new Command()
  .name("verify-shows")
  .description("Verify TV show data integrity and optionally fix issues")
  .option("--check-counts", "Verify cast_count matches actual appearances", false)
  .option("--check-mortality", "Verify mortality stats are calculated", false)
  .option("--check-all", "Run all checks", false)
  .option("-s, --sample <n>", "Check random sample of N shows", parsePositiveInt)
  .option("-p, --phase <phase>", "Only check shows from specific phase", parsePhase)
  .option("-f, --fix", "Auto-fix issues found", false)
  .option("-n, --dry-run", "Preview fixes without writing", false)
  .action(async (options: VerifyOptions) => {
    // Check required environment variables
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is required")
      process.exit(1)
    }

    try {
      const results = await runVerification(options)

      // Exit with error code if issues found and not fixing
      const totalIssues =
        results.castCountMismatches.length +
        results.deceasedCountMismatches.length +
        results.missingMortality.length

      if (totalIssues > 0 && !options.fix) {
        process.exit(1)
      }
    } catch (error) {
      console.error("Error during verification:", error)
      process.exit(1)
    }
  })

// Only run when executed directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
