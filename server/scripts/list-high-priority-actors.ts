#!/usr/bin/env tsx
/**
 * List high-priority actors (popularity >= 10) without death pages
 * Demonstrates the actorIds parameter for enrichment
 */

import { Command } from "commander"
import { getPool } from "../src/lib/db.js"

const program = new Command()
  .name("list-high-priority-actors")
  .description("List high-priority actors needing enrichment")
  .option("-l, --limit <number>", "Limit number of results", "20")
  .action(async (options) => {
    const limit = parseInt(options.limit, 10)
    const pool = getPool()

    try {
      const result = await pool.query(
        `SELECT
          a.id,
          a.name,
          a.deathday,
          a.popularity,
          dd.enriched_at
        FROM actors a
        LEFT JOIN actor_death_circumstances dd ON dd.actor_id = a.id
        WHERE a.deathday IS NOT NULL
          AND a.popularity >= 10
          AND dd.actor_id IS NULL
        ORDER BY a.popularity DESC NULLS LAST
        LIMIT $1`,
        [limit]
      )

      console.log(`\nHigh-Priority Actors (popularity >= 10) without death pages:\n`)
      console.log(`Found ${result.rows.length} actors:\n`)

      for (const actor of result.rows) {
        console.log(`  ID: ${actor.id}`)
        console.log(`  Name: ${actor.name}`)
        console.log(`  Popularity: ${actor.popularity?.toFixed(1) ?? "N/A"}`)
        console.log(`  Death Date: ${actor.deathday}`)
        console.log(`  Last Enriched: ${actor.enriched_at ?? "Never"}`)
        console.log()
      }

      // Print example command to enrich these actors
      if (result.rows.length > 0) {
        const actorIds = result.rows.map((a) => a.id).join(",")
        console.log(`\nTo enrich these actors, run:`)
        console.log(`  npx tsx scripts/enrich-death-details.ts --actor-ids ${actorIds} --dry-run\n`)
      }
    } catch (error) {
      console.error("Error:", error)
      process.exit(1)
    } finally {
      await pool.end()
    }
  })

program.parse()
