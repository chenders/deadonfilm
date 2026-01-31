#!/usr/bin/env tsx
/**
 * Backfill fallback profile photos for actors without TMDB photos.
 *
 * This script fetches images from multiple sources for actors who:
 * - Don't have a TMDB profile_path
 * - Are not obscure (visible in listings)
 * - Have a death date (appear in death-related lists)
 *
 * Sources tried in order:
 * 1. Wikidata P18 (image property)
 * 2. Wikipedia infobox image
 * 3. TMDB /person/{id}/images endpoint
 * 4. Wikimedia Commons name search
 *
 * The images are stored in the fallback_profile_url column.
 *
 * Usage:
 *   npm run backfill:fallback-photos -- [options]
 *
 * Options:
 *   --limit <n>      Limit number of actors to process
 *   --actor <id>     Process a single actor by internal ID
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run backfill:fallback-photos                    # All eligible actors
 *   npm run backfill:fallback-photos -- --limit 10     # First 10 actors
 *   npm run backfill:fallback-photos -- --actor 205459 # Single actor
 *   npm run backfill:fallback-photos -- --dry-run      # Preview only
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import {
  getActorImageFromWikidata,
  getActorImageFromWikipediaInfobox,
  getActorImageFromCommonsSearch,
} from "../src/lib/wikidata.js"
import { getBestPersonImageUrl } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface ActorInfo {
  id: number
  tmdb_id: number | null
  name: string
  birthday: string | null
  deathday: string | null
  wikipedia_url: string | null
}

type ImageSource = "wikidata" | "wikipedia" | "tmdb" | "commons"

interface BackfillStats {
  processed: number
  foundImages: number
  noImageFound: number
  errors: number
  bySource: Record<ImageSource, number>
}

const program = new Command()
  .name("backfill-actor-fallback-photos")
  .description("Backfill fallback profile photos from Wikidata for actors without TMDB photos")
  .option("-l, --limit <number>", "Limit number of actors to process", parsePositiveInt)
  .option("--actor <id>", "Process a single actor by internal ID", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options: { limit?: number; actor?: number; dryRun?: boolean }) => {
    await runBackfill(options)
  })

async function runBackfill(options: {
  limit?: number
  actor?: number
  dryRun?: boolean
}): Promise<BackfillStats> {
  const { limit, actor: actorId, dryRun } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const db = getPool()

  const stats: BackfillStats = {
    processed: 0,
    foundImages: 0,
    noImageFound: 0,
    errors: 0,
    bySource: {
      wikidata: 0,
      wikipedia: 0,
      tmdb: 0,
      commons: 0,
    },
  }

  console.log(`\nBackfilling fallback profile photos${dryRun ? " (DRY RUN)" : ""}`)
  console.log("Sources: Wikidata P18 → Wikipedia infobox → TMDB images → Commons search")
  if (actorId) console.log(`Processing single actor: ID ${actorId}`)
  if (limit) console.log(`Limit: ${limit} actors`)
  console.log()

  try {
    // Get actors without TMDB photos who are not obscure and have died
    let query = `
      SELECT id, tmdb_id, name, birthday, deathday, wikipedia_url
      FROM actors
      WHERE (profile_path IS NULL OR profile_path = '')
        AND (fallback_profile_url IS NULL OR fallback_profile_url = '')
        AND is_obscure = false
        AND deathday IS NOT NULL
    `
    const params: (number | string)[] = []

    if (actorId) {
      params.push(actorId)
      query += ` AND id = $${params.length}`
    }

    // Order by most recent deaths first (most visible)
    query += " ORDER BY deathday DESC NULLS LAST"

    if (limit && !actorId) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }

    const actorsResult = await db.query<ActorInfo>(query, params)
    const actors = actorsResult.rows

    console.log(`Found ${actors.length} actors without photos\n`)

    if (actors.length === 0) {
      console.log("No actors to process.")
      return stats
    }

    // Process each actor
    for (const actor of actors) {
      stats.processed++
      const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
      const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

      console.log(
        `[${stats.processed}/${actors.length}] ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdb_id || "none"}, Birth: ${birthYear || "unknown"}, Death: ${deathYear || "unknown"})`
      )

      try {
        let imageUrl: string | null = null
        let source: ImageSource | null = null

        // Source 1: Wikidata P18 (image property)
        console.log("  Trying Wikidata P18...")
        imageUrl = await getActorImageFromWikidata(actor.name, birthYear, deathYear)
        if (imageUrl) {
          source = "wikidata"
        }

        // Source 2: Wikipedia infobox image
        if (!imageUrl && actor.wikipedia_url) {
          console.log("  Trying Wikipedia infobox...")
          imageUrl = await getActorImageFromWikipediaInfobox(actor.wikipedia_url)
          if (imageUrl) {
            source = "wikipedia"
          }
        }

        // Source 3: TMDB images endpoint (may have images even if profile_path is null)
        if (!imageUrl && actor.tmdb_id) {
          console.log("  Trying TMDB images endpoint...")
          imageUrl = await getBestPersonImageUrl(actor.tmdb_id)
          if (imageUrl) {
            source = "tmdb"
          }
        }

        // Source 4: Wikimedia Commons name search
        if (!imageUrl) {
          console.log("  Trying Wikimedia Commons search...")
          imageUrl = await getActorImageFromCommonsSearch(actor.name)
          if (imageUrl) {
            source = "commons"
          }
        }

        if (imageUrl && source) {
          stats.foundImages++
          stats.bySource[source]++
          console.log(`  ✓ Found image (${source}): ${imageUrl}`)

          if (!dryRun) {
            await db.query(`UPDATE actors SET fallback_profile_url = $1 WHERE id = $2`, [
              imageUrl,
              actor.id,
            ])
            console.log("  ✓ Updated database")
          } else {
            console.log("  (dry-run: would update database)")
          }
        } else {
          stats.noImageFound++
          console.log("  ✗ No image found from any source")
        }

        // Rate limit to be nice to external APIs
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        stats.errors++
        console.error(`  ✗ Error: ${error instanceof Error ? error.message : error}`)
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60))
    console.log("Summary:")
    console.log(`  Actors processed: ${stats.processed}`)
    console.log(`  Images found: ${stats.foundImages}`)
    if (stats.foundImages > 0) {
      console.log("    By source:")
      console.log(`      Wikidata P18:      ${stats.bySource.wikidata}`)
      console.log(`      Wikipedia infobox: ${stats.bySource.wikipedia}`)
      console.log(`      TMDB images:       ${stats.bySource.tmdb}`)
      console.log(`      Commons search:    ${stats.bySource.commons}`)
    }
    console.log(`  No image found: ${stats.noImageFound}`)
    console.log(`  Errors: ${stats.errors}`)
    console.log("=".repeat(60))

    return stats
  } finally {
    await resetPool()
  }
}

program.parse()
