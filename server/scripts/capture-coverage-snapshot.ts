#!/usr/bin/env tsx
/**
 * Capture death detail coverage snapshot.
 *
 * This script captures a daily snapshot of death detail page coverage statistics
 * for historical trend tracking in the admin dashboard.
 *
 * Designed to run as a daily cron job (typically at 2 AM to avoid peak traffic).
 *
 * Usage:
 *   npm run coverage:snapshot
 *
 * Cron configuration (daily at 2 AM):
 *   0 2 * * * cd /app/server && npm run coverage:snapshot >> logs/coverage-snapshot.log 2>&1
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { captureCurrentSnapshot } from "../src/lib/db/admin-coverage-queries.js"
import { logger } from "../src/lib/logger.js"
import { startCronjobRun, completeCronjobRun } from "../src/lib/cronjob-tracking.js"

const program = new Command()
  .name("capture-coverage-snapshot")
  .description("Capture current death detail coverage statistics for historical tracking")
  .action(async () => {
    await withNewRelicTransaction("capture-coverage-snapshot", async () => {
      await runCapture()
    })
  })

async function runCapture(): Promise<void> {
  const pool = getPool()
  let runId: number | undefined

  try {
    logger.info("Starting coverage snapshot capture")

    // Start tracking this run
    runId = await startCronjobRun(pool, "coverage-snapshot")

    await captureCurrentSnapshot(pool)

    // Mark run as successful
    await completeCronjobRun(pool, runId, "success")

    logger.info("Coverage snapshot captured successfully")
  } catch (error) {
    logger.error({ error }, "Failed to capture coverage snapshot")

    // Mark run as failed if we started tracking
    if (runId !== undefined) {
      try {
        await completeCronjobRun(
          pool,
          runId,
          "failure",
          error instanceof Error ? error.message : String(error)
        )
      } catch (trackingError) {
        // Log but don't fail on tracking error
        logger.error({ trackingError }, "Failed to record cronjob failure")
      }
    }

    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
