#!/usr/bin/env tsx
/**
 * Backfill URL Resolution for Existing Death Circumstances
 *
 * This script re-resolves URLs in existing actor_death_circumstances records
 * to populate the resolvedSources field with human-readable source names.
 *
 * Usage:
 *   npm run backfill:sources -- [options]
 *
 * Options:
 *   -l, --limit <n>         Number of actors to process (default: 100)
 *   -n, --dry-run           Preview changes without writing to database
 *   -a, --actor-id <id>     Process specific actor by ID
 *   -y, --yes               Skip confirmation prompt
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { resolveRedirectUrls, type ResolvedUrl } from "../src/lib/death-sources/url-resolver.js"
import { invalidateActorCache } from "../src/lib/cache.js"

interface ActorWithSources {
  id: number
  name: string
  sources: Record<string, unknown>
}

interface SourceWithUrls {
  type?: string
  rawData?: {
    parsed?: {
      sources?: string[]
    }
    resolvedSources?: ResolvedUrl[]
    [key: string]: unknown
  }
}

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be positive integer")
  }
  return n
}

async function waitForConfirmation(skip: boolean): Promise<boolean> {
  if (skip) return true

  console.log("\nPress Enter to continue or Ctrl+C to cancel...")
  return new Promise((resolve) => {
    process.stdin.once("data", () => {
      resolve(true)
    })
  })
}

async function backfillSourceResolution(options: {
  limit: number
  dryRun: boolean
  actorId?: number
  yes: boolean
}) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log("Backfill Source Resolution")
    console.log("=".repeat(60))
    console.log(`Limit: ${options.actorId ? "1 (specific actor)" : options.limit}`)
    console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`)
    console.log(`Actor ID: ${options.actorId || "all"}`)
    console.log("=".repeat(60))

    // Query actors with sources
    let query: string
    let params: unknown[]

    if (options.actorId) {
      query = `
        SELECT adc.actor_id as id, a.name, adc.sources
        FROM actor_death_circumstances adc
        JOIN actors a ON a.id = adc.actor_id
        WHERE adc.actor_id = $1
          AND adc.sources IS NOT NULL
      `
      params = [options.actorId]
    } else {
      query = `
        SELECT adc.actor_id as id, a.name, adc.sources
        FROM actor_death_circumstances adc
        JOIN actors a ON a.id = adc.actor_id
        WHERE adc.sources IS NOT NULL
        ORDER BY adc.actor_id
        LIMIT $1
      `
      params = [options.limit]
    }

    const result = await pool.query<ActorWithSources>(query, params)
    const actors = result.rows

    console.log(`\nFound ${actors.length} actors with sources\n`)

    if (actors.length === 0) {
      console.log("No actors to process. Exiting.")
      return
    }

    // Preview
    if (!options.yes) {
      console.log("Preview of first 5 actors:")
      for (const actor of actors.slice(0, 5)) {
        console.log(`  - ${actor.name} (ID: ${actor.id})`)
      }
      if (actors.length > 5) {
        console.log(`  ... and ${actors.length - 5} more`)
      }
      console.log()

      const confirmed = await waitForConfirmation(options.yes)
      if (!confirmed) {
        console.log("Cancelled by user")
        return
      }
    }

    // Process each actor
    let processed = 0
    let updated = 0
    let skipped = 0
    let errors = 0

    for (const actor of actors) {
      try {
        processed++
        console.log(`[${processed}/${actors.length}] Processing ${actor.name}...`)

        // Extract URLs from all source fields
        const sourcesObj = actor.sources as Record<string, SourceWithUrls>
        const allUrls: string[] = []

        for (const [field, sourceEntry] of Object.entries(sourcesObj)) {
          if (field === "cleanupSource") continue // Skip metadata field

          const sourceData = sourceEntry as SourceWithUrls
          const urls = sourceData?.rawData?.parsed?.sources

          if (Array.isArray(urls)) {
            allUrls.push(...urls.filter((url): url is string => typeof url === "string"))
          }
        }

        if (allUrls.length === 0) {
          console.log(`  No URLs found - skipping`)
          skipped++
          continue
        }

        console.log(`  Found ${allUrls.length} URLs to resolve`)

        // Resolve URLs
        const resolvedSources: ResolvedUrl[] = await resolveRedirectUrls(allUrls)

        // Count successful resolutions
        const successCount = resolvedSources.filter((r) => !r.error).length
        const errorCount = resolvedSources.filter((r) => r.error).length

        console.log(`  Resolved: ${successCount} success, ${errorCount} errors`)

        if (successCount === 0) {
          console.log(`  No successful resolutions - skipping`)
          skipped++
          continue
        }

        // Update each source field with resolvedSources
        const updatedSources = { ...sourcesObj }
        for (const [field, sourceEntry] of Object.entries(sourcesObj)) {
          if (field === "cleanupSource") continue

          const sourceData = sourceEntry as SourceWithUrls
          if (sourceData?.rawData?.parsed?.sources) {
            updatedSources[field] = {
              ...sourceData,
              rawData: {
                ...sourceData.rawData,
                resolvedSources,
              },
            }
          }
        }

        if (!options.dryRun) {
          // Write to database
          await pool.query(
            `UPDATE actor_death_circumstances
             SET sources = $1, updated_at = NOW()
             WHERE actor_id = $2`,
            [JSON.stringify(updatedSources), actor.id]
          )

          // Invalidate cache (graceful - doesn't fail if Redis unavailable)
          await invalidateActorCache(actor.id)

          console.log(`  ✓ Updated database and invalidated cache`)
        } else {
          console.log(`  (Dry run - would update database)`)
        }

        updated++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.error(`  ✗ Error processing ${actor.name}: ${errorMsg}`)
        errors++
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("Summary:")
    console.log(`  Processed: ${processed}`)
    console.log(`  Updated: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Errors: ${errors}`)
    console.log("=".repeat(60))

    if (options.dryRun) {
      console.log("\nDry run complete - no changes written to database")
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("backfill-source-resolution")
  .description("Backfill URL resolution for existing death circumstances")
  .option("-l, --limit <n>", "Number of actors to process", parsePositiveInt, 100)
  .option("-n, --dry-run", "Preview changes without writing to database", false)
  .option("-a, --actor-id <id>", "Process specific actor by ID", parsePositiveInt)
  .option("-y, --yes", "Skip confirmation prompt", false)
  .action(async (options) => {
    await backfillSourceResolution(options)
  })

program.parse()
