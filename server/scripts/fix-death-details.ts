#!/usr/bin/env tsx
/**
 * Fix clearly wrong/irrelevant death details entries.
 * These are entries where the cause_of_death_details field contains
 * information that is not about the person's death (biographical info,
 * family details, etc.) or where the details contradict the cause.
 *
 * Usage:
 *   npm run fix:death-details           # Apply fixes
 *   npm run fix:death-details -- --dry-run  # Preview without updating
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"

interface BadEntry {
  tmdb_id: number
  action: "clear_details"
  reason: string
}

// Entries with clearly wrong/irrelevant details
const BAD_ENTRIES: BadEntry[] = [
  // === BIOGRAPHICAL INFO INSTEAD OF DEATH INFO ===
  { tmdb_id: 80625, action: "clear_details", reason: "Details about marriage, not death" }, // George Burns
  { tmdb_id: 160263, action: "clear_details", reason: "Details about family, not death" }, // Tom Smothers
  {
    tmdb_id: 6587,
    action: "clear_details",
    reason: "Details about daughter drowning, not her death",
  }, // Diane Ladd
  { tmdb_id: 10160, action: "clear_details", reason: "Details list marriages, not death info" }, // Rhonda Fleming
  { tmdb_id: 5658, action: "clear_details", reason: "Details about Top Gear, not death" }, // Michael Gambon
  { tmdb_id: 18197, action: "clear_details", reason: "Details about films, not death" }, // Anna Karina
  { tmdb_id: 553693, action: "clear_details", reason: "Biographical details, not death info" }, // Pierre Boulez
  { tmdb_id: 119864, action: "clear_details", reason: "About founding theatre, not death" }, // Judith Malina
  { tmdb_id: 1494036, action: "clear_details", reason: "Biographical, not death info" }, // Lucilla Morlacchi
  { tmdb_id: 2698, action: "clear_details", reason: "About children, not death" }, // Norman Lloyd
  { tmdb_id: 27699, action: "clear_details", reason: "Filmography list, not death info" }, // Jean Parédès
  { tmdb_id: 117419, action: "clear_details", reason: "About mansion and pets, not death" }, // Gene Raymond
  { tmdb_id: 175910, action: "clear_details", reason: "About education, not death" }, // Simon Cadell
  { tmdb_id: 28329, action: "clear_details", reason: "Filmography list, not death info" }, // Gaby Sylvia
  { tmdb_id: 86691, action: "clear_details", reason: "Biographical, not death info" }, // Mikhail Pugovkin
  { tmdb_id: 4791, action: "clear_details", reason: "About career, not death" }, // Greg Burson
  { tmdb_id: 982731, action: "clear_details", reason: "About relationship, not death" }, // William LeMassena
  { tmdb_id: 19111, action: "clear_details", reason: "Biographical, not death info" }, // John Anderson
  { tmdb_id: 2565, action: "clear_details", reason: "About marriage, not death" }, // Yves Montand
  { tmdb_id: 53010, action: "clear_details", reason: "About career, not death" }, // John McIntire
  { tmdb_id: 6256, action: "clear_details", reason: "About award, not death" }, // Josef Meinrad
  { tmdb_id: 30275, action: "clear_details", reason: "About murder case, not her death" }, // Frances Langford
  { tmdb_id: 579030, action: "clear_details", reason: "About career, not death" }, // Kjeld Petersen
  { tmdb_id: 10370, action: "clear_details", reason: "About brother, not death" }, // David Lochary
  { tmdb_id: 2047007, action: "clear_details", reason: "About school expulsion, not death" }, // Wolfram Sievers
  { tmdb_id: 1183419, action: "clear_details", reason: "About drinking habits, not death" }, // Willard Maas

  // === CAUSE/DETAILS MISMATCH (Details say Parkinson's but cause is different) ===
  {
    tmdb_id: 40352,
    action: "clear_details",
    reason: "Cause says pancreatic cancer, details say Parkinson's",
  }, // Will Ryan
  {
    tmdb_id: 7631,
    action: "clear_details",
    reason: "Cause says Alzheimer's, details say Parkinson's",
  }, // Stella Stevens
  {
    tmdb_id: 71732,
    action: "clear_details",
    reason: "Cause says falling, details say Parkinson's",
  }, // Peter Masterson
  {
    tmdb_id: 14731,
    action: "clear_details",
    reason: "Cause says cardiac arrest, details say Parkinson's",
  }, // Henry Silva

  // === TRUNCATED WITH IRRELEVANT CONTENT ===
  { tmdb_id: 7686, action: "clear_details", reason: "About father's death, not hers" }, // Judith Evelyn
  { tmdb_id: 89162, action: "clear_details", reason: "About wife's death, not his" }, // Ken Clark
  { tmdb_id: 11502, action: "clear_details", reason: "About moving to LA, not death" }, // Harry Davenport
  { tmdb_id: 3001, action: "clear_details", reason: "About heart condition history, not death" }, // Conrad Veidt
  { tmdb_id: 98034, action: "clear_details", reason: "About filming, not death" }, // Ernest Torrence
]

interface ActorRow {
  name: string
  cause_of_death: string | null
  cause_of_death_details: string | null
}

const program = new Command()
  .name("fix-death-details")
  .description("Fix clearly wrong/irrelevant death details entries")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .action(async (options) => {
    // Don't wrap dry-run mode
    if (options.dryRun) {
      await runFix(options.dryRun ?? false)
    } else {
      await withNewRelicTransaction("fix-death-details", async (recordMetrics) => {
        const result = await runFix(options.dryRun ?? false)
        recordMetrics({
          recordsProcessed: result.total,
          recordsUpdated: result.fixed,
          errorsEncountered: result.skipped,
        })
      })
    }
  })

async function runFix(dryRun: boolean): Promise<{
  total: number
  fixed: number
  skipped: number
}> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  console.log("\nFixing " + BAD_ENTRIES.length + " entries with clearly wrong/irrelevant details:")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  console.log("")

  let fixed = 0
  let skipped = 0

  try {
    for (const entry of BAD_ENTRIES) {
      const before = await db.query<ActorRow>(
        "SELECT name, cause_of_death, cause_of_death_details FROM actors WHERE tmdb_id = $1",
        [entry.tmdb_id]
      )
      if (before.rows.length === 0) {
        console.log("SKIPPED: TMDB " + entry.tmdb_id + " not found")
        skipped++
        continue
      }

      const actor = before.rows[0]
      console.log("Fixing: " + actor.name + " (TMDB " + entry.tmdb_id + ")")
      console.log("  Reason: " + entry.reason)
      console.log("  Cause: " + actor.cause_of_death)
      console.log(
        "  Old Details: " +
          (actor.cause_of_death_details
            ? actor.cause_of_death_details.substring(0, 100) + "..."
            : "(none)")
      )

      if (!dryRun) {
        await db.query(
          "UPDATE actors SET cause_of_death_details = NULL, cause_of_death_details_source = NULL WHERE tmdb_id = $1",
          [entry.tmdb_id]
        )
      }
      console.log("  New Details: (cleared)")
      console.log("")
      fixed++
    }

    console.log(
      "Done! " + (dryRun ? "Would fix" : "Fixed") + " " + fixed + " entries, skipped " + skipped
    )

    return { total: BAD_ENTRIES.length, fixed, skipped }
  } finally {
    await db.end()
  }
}

program.parse()
