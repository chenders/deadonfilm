#!/usr/bin/env tsx
/**
 * Capture Google Search Console snapshot.
 *
 * Fetches search performance, top queries, top pages, page type performance,
 * and indexing status from the GSC API and stores them in the database for
 * historical tracking in the admin SEO metrics dashboard.
 *
 * Designed to run as a daily cron job. GSC data updates daily, so running
 * more frequently provides no benefit.
 *
 * Usage:
 *   cd server && npm run gsc:snapshot
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  isGscConfigured,
  getSearchPerformanceOverTime,
  getTopQueries,
  getTopPages,
  getPerformanceByPageType,
  getSitemaps,
  categorizeUrl,
  daysAgo,
} from "../src/lib/gsc-client.js"
import { writeGscSnapshot, type GscPageRow } from "../src/lib/db/admin-gsc-queries.js"
import { logger } from "../src/lib/logger.js"
import { invalidateByPattern } from "../src/lib/cache.js"
import { startCronjobRun, completeCronjobRun } from "../src/lib/cronjob-tracking.js"
import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"

const program = new Command()
  .name("capture-gsc-snapshot")
  .description("Capture Google Search Console data for historical tracking")
  .action(async () => {
    await withNewRelicTransaction("capture-gsc-snapshot", async () => {
      await runSnapshot()
    })
  })

/** Categorize raw GSC page rows into typed page rows with page_type. */
function categorizePages(
  rows: Array<{
    keys: string[]
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
): GscPageRow[] {
  return rows.map((row) => {
    const pageUrl = row.keys[0]
    let path: string
    try {
      path = new URL(pageUrl).pathname
    } catch {
      path = pageUrl
    }
    return {
      page_url: pageUrl,
      page_type: categorizeUrl(path),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }
  })
}

async function runSnapshot(): Promise<void> {
  const pool = getPool()
  let runId: number | undefined

  try {
    if (!isGscConfigured()) {
      logger.warn("GSC not configured — skipping snapshot")
      return
    }

    logger.info("Starting GSC snapshot capture")

    // Clear GSC cache so we get fresh data from the API, not stale Redis entries
    const cleared = await invalidateByPattern("gsc:*")
    if (cleared > 0) {
      logger.info({ cleared }, "Cleared stale GSC cache entries")
    }

    runId = await startCronjobRun(pool, "gsc-snapshot")

    const yesterday = daysAgo(1)
    const thirtyDaysAgo = daysAgo(30)

    // Fetch all data from GSC API
    const performance = await getSearchPerformanceOverTime(thirtyDaysAgo, yesterday)
    const queries = await getTopQueries(yesterday, yesterday, 100)
    const rawPages = await getTopPages(yesterday, yesterday, 100)
    const pageTypes = await getPerformanceByPageType(yesterday, yesterday)

    let sitemaps: Awaited<ReturnType<typeof getSitemaps>>
    try {
      sitemaps = await getSitemaps()
    } catch (sitemapError) {
      logger.warn(
        { error: sitemapError },
        "Failed to fetch sitemaps — continuing without indexing data"
      )
      sitemaps = []
    }

    // Write atomically
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      const result = await writeGscSnapshot(client, {
        yesterday,
        performance,
        queries,
        pages: categorizePages(rawPages.rows),
        pageTypes,
        sitemaps,
      })

      await client.query("COMMIT")
      logger.info(result, "GSC snapshot captured successfully")
    } catch (txError) {
      await client.query("ROLLBACK")
      throw txError
    } finally {
      client.release()
    }

    await completeCronjobRun(pool, runId, "success")
  } catch (error) {
    logger.error({ error }, "Failed to capture GSC snapshot")

    if (runId !== undefined) {
      try {
        await completeCronjobRun(
          pool,
          runId,
          "failure",
          error instanceof Error ? error.message : String(error)
        )
      } catch (trackingError) {
        logger.error({ trackingError }, "Failed to record cronjob failure")
      }
    }

    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

program.parse()
