#!/usr/bin/env tsx
/**
 * Backfill cause of death information using Claude Opus 4.5 Batch API.
 *
 * This script uses the Message Batches API for 50% cost savings and handles:
 * - Actors missing cause_of_death
 * - Actors missing cause_of_death_details
 * - Date corrections (birthday, deathday)
 *
 * The script operates in four modes:
 * - submit: Create and submit a new batch
 * - status: Check status of a running batch
 * - process: Process results from a completed batch
 * - reprocess: Retry parsing failed responses after code fixes
 *
 * Checkpoint support ensures you can resume if the script is interrupted.
 *
 * Usage:
 *   npm run backfill:cause-of-death-batch -- submit [options]
 *   npm run backfill:cause-of-death-batch -- status --batch-id <id>
 *   npm run backfill:cause-of-death-batch -- process --batch-id <id>
 *   npm run backfill:cause-of-death-batch -- reprocess [--batch-id <id>]
 *
 * Options:
 *   --limit <n>             Limit number of actors to process
 *   --tmdb-id <id>          Process a specific actor by TMDB ID (re-process even if data exists)
 *   --missing-details-flag  Re-process actors with cause/details but missing has_detailed_death_info
 *   --dry-run               Preview without submitting batch
 *   --fresh                 Start fresh (ignore checkpoint)
 *   --batch-id <id>         Batch ID for status/process commands
 *
 * Examples:
 *   npm run backfill:cause-of-death-batch -- submit --limit 100 --dry-run
 *   npm run backfill:cause-of-death-batch -- submit
 *   npm run backfill:cause-of-death-batch -- submit --tmdb-id 1488908  # Re-process specific actor
 *   npm run backfill:cause-of-death-batch -- submit --missing-details-flag --limit 50  # Backfill missing flags
 *   npm run backfill:cause-of-death-batch -- status --batch-id msgbatch_xxx
 *   npm run backfill:cause-of-death-batch -- process --batch-id msgbatch_xxx
 *   npm run backfill:cause-of-death-batch -- reprocess --batch-id msgbatch_xxx
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { initNewRelic } from "../src/lib/newrelic.js"
import {
  submitBatch,
  checkBatchStatus,
  processResults,
  reprocessFailures,
} from "../src/lib/claude-batch/index.js"

// Re-export utilities for backwards compatibility with existing tests and other scripts
export {
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  normalizeDateToString,
  getYearFromDate,
  getMonthDayFromDate,
  stripMarkdownCodeFences,
  repairJson,
  storeFailure,
  type Checkpoint,
} from "../src/lib/claude-batch/index.js"

// Initialize New Relic for monitoring
initNewRelic()

export function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

// CLI setup
const program = new Command()
  .name("backfill-cause-of-death-batch")
  .description("Backfill cause of death info using Claude Opus 4.5 Batch API")

program
  .command("submit")
  .description("Create and submit a new batch")
  .option("-l, --limit <number>", "Limit number of actors to process", parsePositiveInt)
  .option("-t, --tmdb-id <number>", "Process a specific actor by TMDB ID", parsePositiveInt)
  .option(
    "--missing-details-flag",
    "Re-process actors with cause/details but missing has_detailed_death_info"
  )
  .option("-n, --dry-run", "Preview without submitting batch")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(async (options) => {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is required")
      process.exit(1)
    }

    if (!process.env.ANTHROPIC_API_KEY && !options.dryRun) {
      console.error("ANTHROPIC_API_KEY environment variable is required")
      process.exit(1)
    }

    const db = getPool()

    try {
      await submitBatch(db, options)
    } catch (error) {
      console.error("Error submitting batch:", error)
      process.exit(1)
    } finally {
      await resetPool()
    }
  })

program
  .command("status")
  .description("Check status of a batch")
  .requiredOption("-b, --batch-id <id>", "Batch ID to check")
  .action(async (options) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY environment variable is required")
      process.exit(1)
    }

    try {
      await checkBatchStatus(options.batchId)
    } catch (error) {
      console.error("Error checking batch status:", error)
      process.exit(1)
    }
  })

program
  .command("process")
  .description("Process results from a completed batch")
  .requiredOption("-b, --batch-id <id>", "Batch ID to process")
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY environment variable is required")
      process.exit(1)
    }

    if (!process.env.DATABASE_URL && !options.dryRun) {
      console.error("DATABASE_URL environment variable is required")
      process.exit(1)
    }

    const db = options.dryRun ? null : getPool()

    try {
      await processResults(db, options.batchId, options.dryRun)
    } catch (error) {
      console.error("Error processing results:", error)
      process.exit(1)
    } finally {
      if (db) {
        await resetPool()
      }
    }
  })

program
  .command("reprocess")
  .description("Retry parsing failed responses after code fixes")
  .option("-b, --batch-id <id>", "Only reprocess failures from specific batch")
  .action(async (options) => {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is required")
      process.exit(1)
    }

    const db = getPool()

    try {
      await reprocessFailures(db, options.batchId)
    } catch (error) {
      console.error("Error reprocessing failures:", error)
      process.exit(1)
    } finally {
      await db.end()
    }
  })

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
