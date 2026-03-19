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
import { logger } from "../src/lib/logger.js"
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

async function runSnapshot(): Promise<void> {
  const pool = getPool()
  let runId: number | undefined

  try {
    if (!isGscConfigured()) {
      logger.warn("GSC not configured — skipping snapshot")
      return
    }

    logger.info("Starting GSC snapshot capture")
    runId = await startCronjobRun(pool, "gsc-snapshot")

    const yesterday = daysAgo(1)
    const thirtyDaysAgo = daysAgo(30)

    // Fetch all data from GSC API
    const performance = await getSearchPerformanceOverTime(thirtyDaysAgo, yesterday)
    const queries = await getTopQueries(yesterday, yesterday, 100)
    const pages = await getTopPages(yesterday, yesterday, 100)
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

      // Search performance (last 30 days)
      for (const row of performance.rows) {
        await client.query(
          `INSERT INTO gsc_search_performance (date, search_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, search_type)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [row.keys[0], "web", row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Top queries (yesterday)
      for (const row of queries.rows) {
        await client.query(
          `INSERT INTO gsc_top_queries (date, query, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, query)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [yesterday, row.keys[0], row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Top pages (yesterday)
      for (const row of pages.rows) {
        const pageUrl = row.keys[0]
        let path: string
        try {
          path = new URL(pageUrl).pathname
        } catch {
          path = pageUrl
        }
        const pageType = categorizeUrl(path)

        await client.query(
          `INSERT INTO gsc_top_pages (date, page_url, page_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (date, page_url)
           DO UPDATE SET page_type = $3, clicks = $4, impressions = $5, ctr = $6, position = $7, fetched_at = now()`,
          [yesterday, pageUrl, pageType, row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Page type performance (yesterday)
      for (const [pageType, data] of Object.entries(pageTypes)) {
        await client.query(
          `INSERT INTO gsc_page_type_performance (date, page_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, page_type)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [yesterday, pageType, data.clicks, data.impressions, data.ctr, data.position]
        )
      }

      // Indexing status from sitemaps
      if (sitemaps.length > 0) {
        let totalSubmitted = 0
        let totalIndexed = 0
        const indexDetails: Record<string, { submitted: number; indexed: number }> = {}

        for (const sitemap of sitemaps) {
          for (const content of sitemap.contents) {
            totalSubmitted += content.submitted
            totalIndexed += content.indexed
            if (!indexDetails[content.type]) {
              indexDetails[content.type] = { submitted: 0, indexed: 0 }
            }
            indexDetails[content.type].submitted += content.submitted
            indexDetails[content.type].indexed += content.indexed
          }
        }

        await client.query(
          `INSERT INTO gsc_indexing_status (date, total_submitted, total_indexed, index_details)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (date)
           DO UPDATE SET total_submitted = $2, total_indexed = $3, index_details = $4, fetched_at = now()`,
          [yesterday, totalSubmitted, totalIndexed, JSON.stringify(indexDetails)]
        )
      }

      await client.query("COMMIT")

      logger.info(
        {
          performanceDays: performance.rows.length,
          queries: queries.rows.length,
          pages: pages.rows.length,
          pageTypes: Object.keys(pageTypes).length,
        },
        "GSC snapshot captured successfully"
      )
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
