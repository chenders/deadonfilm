#!/usr/bin/env tsx
/**
 * Seed script to populate the actuarial_life_tables database.
 *
 * Uses US Social Security Administration Period Life Tables (2022) data.
 * Data represents the 2022 period life table for the Social Security area population,
 * as used in the 2025 Trustees Report.
 *
 * Usage:
 *   npm run seed:actuarial
 */

import "dotenv/config"
import { Pool } from "pg"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface ActuarialEntry {
  age: number
  qx: number // Death probability
  lx: number // Survivors per 100k
  ex: number // Life expectancy
}

interface ActuarialData {
  source: string
  notes: string
  male: ActuarialEntry[]
  female: ActuarialEntry[]
}

async function main() {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("\nSeeding actuarial life tables...\n")

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Load actuarial data from JSON file
    const dataPath = join(__dirname, "..", "data", "actuarial-life-tables.json")
    const rawData = readFileSync(dataPath, "utf-8")
    const data: ActuarialData = JSON.parse(rawData)

    console.log(`Source: ${data.source}`)
    console.log(`Notes: ${data.notes}\n`)

    // Clear existing data
    console.log("Clearing existing actuarial data...")
    await pool.query("DELETE FROM actuarial_life_tables")

    // Use 2022 as the birth year for this period life table
    // (The table represents mortality rates as of 2022)
    const birthYear = 2022

    // Prepare insert query
    const insertQuery = `
      INSERT INTO actuarial_life_tables
      (birth_year, age, gender, death_probability, life_expectancy, survivors_per_100k)
      VALUES ($1, $2, $3, $4, $5, $6)
    `

    // Insert male data
    console.log("Inserting male data...")
    for (const entry of data.male) {
      await pool.query(insertQuery, [birthYear, entry.age, "male", entry.qx, entry.ex, entry.lx])
    }
    console.log(`  Inserted ${data.male.length} male entries`)

    // Insert female data
    console.log("Inserting female data...")
    for (const entry of data.female) {
      await pool.query(insertQuery, [birthYear, entry.age, "female", entry.qx, entry.ex, entry.lx])
    }
    console.log(`  Inserted ${data.female.length} female entries`)

    // Also create "combined" entries by averaging male and female
    console.log("Inserting combined (average) data...")
    for (let i = 0; i < data.male.length; i++) {
      const male = data.male[i]
      const female = data.female[i]
      if (male && female && male.age === female.age) {
        await pool.query(insertQuery, [
          birthYear,
          male.age,
          "combined",
          (male.qx + female.qx) / 2,
          (male.ex + female.ex) / 2,
          Math.round((male.lx + female.lx) / 2),
        ])
      }
    }
    console.log(`  Inserted ${data.male.length} combined entries`)

    // Verify the data
    const result = await pool.query(
      "SELECT gender, COUNT(*) as count FROM actuarial_life_tables GROUP BY gender"
    )
    console.log("\nSummary:")
    for (const row of result.rows) {
      console.log(`  ${row.gender}: ${row.count} entries`)
    }

    // Show sample data
    console.log("\nSample data (age 0, 50, 80):")
    const sampleResult = await pool.query(`
      SELECT age, gender, death_probability, life_expectancy
      FROM actuarial_life_tables
      WHERE age IN (0, 50, 80) AND gender = 'combined'
      ORDER BY age
    `)
    for (const row of sampleResult.rows) {
      console.log(
        `  Age ${row.age}: death prob ${(Number(row.death_probability) * 100).toFixed(4)}%, life exp ${row.life_expectancy} years`
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

main()
