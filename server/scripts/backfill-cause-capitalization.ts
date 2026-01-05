#!/usr/bin/env tsx
/**
 * One-time script to normalize capitalization of existing cause_of_death values.
 *
 * Converts all cause_of_death values to sentence case (first letter capitalized,
 * rest lowercase) while preserving medical acronyms like COVID-19, ALS, AIDS, etc.
 *
 * Usage:
 *   npm run backfill:cause-capitalization
 *   npm run backfill:cause-capitalization -- --dry-run
 */
import "dotenv/config"
import { Command } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { toSentenceCase } from "../src/lib/text-utils.js"

async function run(options: { dryRun: boolean }) {
  const { dryRun } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  console.log(dryRun ? "DRY RUN - No changes will be made\n" : "")

  // Get all distinct cause_of_death values
  const result = await db.query<{ cause_of_death: string }>(
    `SELECT DISTINCT cause_of_death FROM actors WHERE cause_of_death IS NOT NULL ORDER BY cause_of_death`
  )

  console.log(`Found ${result.rows.length} distinct cause_of_death values\n`)

  let updated = 0
  let unchanged = 0

  for (const row of result.rows) {
    const original = row.cause_of_death
    const normalized = toSentenceCase(original)

    if (original !== normalized) {
      console.log(`"${original}" → "${normalized}"`)

      if (!dryRun) {
        await db.query(
          `UPDATE actors SET cause_of_death = $1, updated_at = NOW() WHERE cause_of_death = $2`,
          [normalized, original]
        )
      }
      updated++
    } else {
      unchanged++
    }
  }

  console.log(`\n${"─".repeat(50)}`)
  console.log(`Summary:`)
  console.log(`  Changed: ${updated}`)
  console.log(`  Already correct: ${unchanged}`)
  console.log(`  Total: ${result.rows.length}`)

  if (dryRun && updated > 0) {
    console.log(`\nRun without --dry-run to apply changes`)
  }

  await resetPool()
}

const program = new Command()
  .name("backfill-cause-capitalization")
  .description("Normalize capitalization of cause_of_death values to sentence case")
  .option("-n, --dry-run", "Preview changes without writing to database")
  .action(async (options) => {
    await run({ dryRun: options.dryRun ?? false })
  })

program.parse()
