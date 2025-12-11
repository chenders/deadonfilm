#!/usr/bin/env tsx
/**
 * Seed script to populate the cohort_life_expectancy table.
 *
 * Uses US Social Security Administration Actuarial Study No. 120 data.
 * This contains cohort life expectancy at birth by year of birth (1900-2020).
 *
 * Cohort life expectancy differs from period life expectancy:
 * - Period: Expected lifespan based on current mortality rates
 * - Cohort: Expected lifespan for people born in a specific year
 *
 * Usage:
 *   npm run seed:cohort
 */

import "dotenv/config"
import { Command } from "commander"
import { Pool } from "pg"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface CohortEntry {
  birthYear: number
  male: number
  female: number
  combined: number
}

interface CohortData {
  source: string
  url: string
  notes: string
  data: CohortEntry[]
}

const program = new Command()
  .name("seed-cohort-life-expectancy")
  .description("Seed cohort life expectancy table from US Social Security Administration data")
  .action(async () => {
    await runSeed()
  })

async function runSeed() {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("\nSeeding cohort life expectancy table...\n")

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Load cohort data from JSON file
    const dataPath = join(__dirname, "..", "data", "cohort-life-expectancy.json")
    const rawData = readFileSync(dataPath, "utf-8")
    const data: CohortData = JSON.parse(rawData)

    console.log(`Source: ${data.source}`)
    console.log(`URL: ${data.url}`)
    console.log(`Notes: ${data.notes}\n`)

    // Clear existing data
    console.log("Clearing existing cohort life expectancy data...")
    await pool.query("DELETE FROM cohort_life_expectancy")

    // Prepare insert query
    const insertQuery = `
      INSERT INTO cohort_life_expectancy (birth_year, male, female, combined)
      VALUES ($1, $2, $3, $4)
    `

    // Insert data
    console.log("Inserting cohort life expectancy data...")
    for (const entry of data.data) {
      await pool.query(insertQuery, [entry.birthYear, entry.male, entry.female, entry.combined])
    }
    console.log(`  Inserted ${data.data.length} entries`)

    // Verify the data
    const result = await pool.query("SELECT COUNT(*) as count FROM cohort_life_expectancy")
    console.log(`\nTotal entries: ${result.rows[0].count}`)

    // Show sample data
    console.log("\nSample data (birth years 1900, 1950, 2000):")
    const sampleResult = await pool.query(`
      SELECT birth_year, male, female, combined
      FROM cohort_life_expectancy
      WHERE birth_year IN (1900, 1950, 2000)
      ORDER BY birth_year
    `)
    for (const row of sampleResult.rows) {
      console.log(
        `  Born ${row.birth_year}: Male ${row.male}, Female ${row.female}, Combined ${row.combined} years`
      )
    }

    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
