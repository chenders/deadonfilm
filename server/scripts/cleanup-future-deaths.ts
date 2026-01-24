#!/usr/bin/env tsx
/**
 * Cleanup script to remove actors with future or suspicious death dates.
 * This fixes bad data from TMDB vandalism/errors.
 */

import "dotenv/config"
import { Pool } from "pg"

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    console.log("Identifying actors with suspicious death dates...\n")

    // Find actors with future or very recent death dates
    const result = await pool.query(
      `SELECT id, name, death_date, birthday
       FROM actors
       WHERE death_date IS NOT NULL
         AND (
           death_date > CURRENT_DATE
           OR death_date > $1
           OR (birthday IS NOT NULL AND death_date < birthday)
         )
       ORDER BY death_date DESC`,
      [thirtyDaysAgo.toISOString().split("T")[0]]
    )

    if (result.rows.length === 0) {
      console.log("✅ No suspicious death dates found.")
      return
    }

    console.log(`Found ${result.rows.length} actors with suspicious death dates:\n`)

    for (const row of result.rows) {
      const reason =
        new Date(row.death_date) > now
          ? "Future date"
          : new Date(row.death_date) > thirtyDaysAgo
            ? "Too recent"
            : "Death before birth"
      console.log(`  ❌ ${row.name} (ID: ${row.id}): ${row.death_date} - ${reason}`)
    }

    console.log(`\nRemoving death data for these ${result.rows.length} actors...\n`)

    // Clear the death-related fields for these actors
    const updateResult = await pool.query(
      `UPDATE actors
       SET
         death_date = NULL,
         cause_of_death = NULL,
         cause_of_death_details = NULL,
         cause_of_death_source = NULL,
         years_lost = NULL,
         age_at_death = NULL,
         updated_at = NOW()
       WHERE death_date IS NOT NULL
         AND (
           death_date > CURRENT_DATE
           OR death_date > $1
           OR (birthday IS NOT NULL AND death_date < birthday)
         )
       RETURNING id, name`,
      [thirtyDaysAgo.toISOString().split("T")[0]]
    )

    console.log(`✅ Cleaned ${updateResult.rowCount} actor records\n`)

    for (const row of updateResult.rows) {
      console.log(`  ✓ ${row.name} (ID: ${row.id})`)
    }
  } catch (error) {
    console.error("Error cleaning up death data:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

run()
