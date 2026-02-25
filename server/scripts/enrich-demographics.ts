#!/usr/bin/env tsx
import "dotenv/config" // MUST be first import

import * as readline from "readline"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { fetchActorDemographics } from "../src/lib/wikidata-demographics.js"
import {
  calculateInterestingnessScore,
  type InterestingnessInput,
} from "../src/lib/interestingness-score.js"

/**
 * Demographic enrichment and interestingness score CLI script.
 *
 * Fetches demographic data from Wikidata (gender, ethnicity, birthplace country,
 * citizenship, military service, non-acting occupations) and calculates an
 * interestingness score (0-100) for prioritizing AI enrichment.
 *
 * Usage:
 *   cd server && npx tsx scripts/enrich-demographics.ts [options]
 *
 * Examples:
 *   npx tsx scripts/enrich-demographics.ts --limit 20 --dry-run
 *   npx tsx scripts/enrich-demographics.ts --limit 100 --min-popularity 5
 *   npx tsx scripts/enrich-demographics.ts --recalculate-scores-only --limit 500
 *   npx tsx scripts/enrich-demographics.ts --actor-id 2157,2158 --dry-run
 */

// ============================================================================
// Argument Parsers
// ============================================================================

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

function parsePositiveFloat(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive number")
  }
  return n
}

function parseCommaSeparatedIds(value: string): number[] {
  return value.split(",").map((s) => {
    const n = parseInt(s.trim(), 10)
    if (isNaN(n) || n <= 0) throw new InvalidArgumentError(`Invalid ID: ${s}`)
    return n
  })
}

// ============================================================================
// Confirmation Prompt
// ============================================================================

async function waitForConfirmation(skipPrompt: boolean): Promise<boolean> {
  if (skipPrompt) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question("\nPress Enter to continue, or Ctrl+C to cancel... ", () => {
      rl.close()
      resolve(true)
    })
  })
}

// ============================================================================
// Types
// ============================================================================

interface ActorForDemographics {
  id: number
  name: string
  birthday: string | null
  deathday: string | null
  death_manner: string | null
  years_lost: number | null
  violent_death: boolean | null
  age_at_death: number | null
  dof_popularity: number | null
  wikipedia_annual_pageviews: number | null
  wikidata_sitelinks: number | null
  wikidata_gender: string | null
  wikidata_ethnicity: string | null
  wikidata_birthplace_country: string | null
  wikidata_citizenship: string | null
  wikidata_military_service: string | null
  wikidata_occupations: string | null
  interestingness_score: number | null
}

interface CliOptions {
  limit: number
  minPopularity?: number
  actorId?: number[]
  dryRun?: boolean
  recalculateScoresOnly?: boolean
  yes?: boolean
}

// ============================================================================
// Actor Query Functions
// ============================================================================

const ACTOR_SELECT_FIELDS = `
  id, name, birthday, deathday,
  death_manner, years_lost, violent_death, age_at_death,
  dof_popularity, wikipedia_annual_pageviews, wikidata_sitelinks,
  wikidata_gender, wikidata_ethnicity, wikidata_birthplace_country,
  wikidata_citizenship, wikidata_military_service, wikidata_occupations,
  interestingness_score
`

async function queryActorsNeedingDemographics(
  pool: Pool,
  limit: number,
  minPopularity?: number
): Promise<ActorForDemographics[]> {
  const conditions = [
    "demographics_fetched_at IS NULL",
    "birthday IS NOT NULL",
    "deathday IS NOT NULL",
  ]
  const params: (number | string)[] = []
  let paramIdx = 1

  if (minPopularity !== undefined) {
    conditions.push(`dof_popularity >= $${paramIdx}`)
    params.push(minPopularity)
    paramIdx++
  }

  params.push(limit)

  const result = await pool.query(
    `SELECT ${ACTOR_SELECT_FIELDS}
     FROM actors
     WHERE ${conditions.join(" AND ")}
     ORDER BY dof_popularity DESC NULLS LAST
     LIMIT $${paramIdx}`,
    params
  )
  return result.rows
}

async function queryActorsForScoreRecalculation(
  pool: Pool,
  limit: number,
  minPopularity?: number
): Promise<ActorForDemographics[]> {
  const conditions = ["birthday IS NOT NULL", "deathday IS NOT NULL"]
  const params: (number | string)[] = []
  let paramIdx = 1

  if (minPopularity !== undefined) {
    conditions.push(`dof_popularity >= $${paramIdx}`)
    params.push(minPopularity)
    paramIdx++
  }

  params.push(limit)

  const result = await pool.query(
    `SELECT ${ACTOR_SELECT_FIELDS}
     FROM actors
     WHERE ${conditions.join(" AND ")}
     ORDER BY dof_popularity DESC NULLS LAST
     LIMIT $${paramIdx}`,
    params
  )
  return result.rows
}

async function queryActorsByIds(pool: Pool, ids: number[]): Promise<ActorForDemographics[]> {
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
  const result = await pool.query(
    `SELECT ${ACTOR_SELECT_FIELDS}
     FROM actors
     WHERE id IN (${placeholders})`,
    ids
  )
  return result.rows
}

// ============================================================================
// Score Calculation
// ============================================================================

function buildScoreInput(actor: ActorForDemographics): InterestingnessInput {
  return {
    birthday: actor.birthday,
    deathday: actor.deathday,
    wikidataGender: actor.wikidata_gender,
    wikidataEthnicity: actor.wikidata_ethnicity,
    wikidataBirthplaceCountry: actor.wikidata_birthplace_country,
    wikidataCitizenship: actor.wikidata_citizenship,
    wikidataMilitaryService: actor.wikidata_military_service,
    wikidataOccupations: actor.wikidata_occupations,
    deathManner: actor.death_manner,
    yearsLost: actor.years_lost != null ? Number(actor.years_lost) : null,
    violentDeath: actor.violent_death,
    ageAtDeath: actor.age_at_death != null ? Number(actor.age_at_death) : null,
    dofPopularity: actor.dof_popularity != null ? Number(actor.dof_popularity) : null,
    wikipediaAnnualPageviews:
      actor.wikipedia_annual_pageviews != null ? Number(actor.wikipedia_annual_pageviews) : null,
    wikidataSitelinks: actor.wikidata_sitelinks != null ? Number(actor.wikidata_sitelinks) : null,
  }
}

// ============================================================================
// Main Run Function
// ============================================================================

async function run(options: CliOptions): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Query actors
    let actors: ActorForDemographics[]

    if (options.actorId) {
      actors = await queryActorsByIds(pool, options.actorId)
    } else if (options.recalculateScoresOnly) {
      actors = await queryActorsForScoreRecalculation(pool, options.limit, options.minPopularity)
    } else {
      actors = await queryActorsNeedingDemographics(pool, options.limit, options.minPopularity)
    }

    if (actors.length === 0) {
      console.log("No actors found matching criteria.")
      return
    }

    console.log(`\nFound ${actors.length} actors to process.`)
    if (options.recalculateScoresOnly) {
      console.log("Mode: Recalculate scores only (no Wikidata fetching)")
    }
    if (options.dryRun) {
      console.log("Mode: DRY RUN (no database writes)")
    }

    await waitForConfirmation(options.yes ?? false)

    // Process actors
    let processed = 0
    let wikidataHits = 0
    let wikidataMisses = 0
    let scoresUpdated = 0

    for (const actor of actors) {
      processed++
      const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null

      // Phase 1: Fetch demographics from Wikidata (unless recalculate-only)
      if (!options.recalculateScoresOnly && birthYear) {
        console.log(`\n[${processed}/${actors.length}] ${actor.name} (born ${birthYear})`)

        const demographics = await fetchActorDemographics(actor.name, birthYear)

        if (demographics) {
          wikidataHits++
          console.log(
            `  Wikidata: gender=${demographics.gender}, ethnicity=${demographics.ethnicity}, country=${demographics.birthplaceCountry}, military=${demographics.militaryService}, occupations=${demographics.occupations}`
          )

          // Update actor object with fetched demographics
          actor.wikidata_gender = demographics.gender
          actor.wikidata_ethnicity = demographics.ethnicity
          actor.wikidata_birthplace_country = demographics.birthplaceCountry
          actor.wikidata_citizenship = demographics.citizenship
          actor.wikidata_military_service = demographics.militaryService
          actor.wikidata_occupations = demographics.occupations

          if (!options.dryRun) {
            await pool.query(
              `UPDATE actors SET
                wikidata_gender = $1,
                wikidata_ethnicity = $2,
                wikidata_birthplace_country = $3,
                wikidata_citizenship = $4,
                wikidata_military_service = $5,
                wikidata_occupations = $6,
                demographics_fetched_at = NOW()
              WHERE id = $7`,
              [
                demographics.gender,
                demographics.ethnicity,
                demographics.birthplaceCountry,
                demographics.citizenship,
                demographics.militaryService,
                demographics.occupations,
                actor.id,
              ]
            )
          }
        } else {
          wikidataMisses++
          console.log(`  Wikidata: no match found`)

          // Mark as fetched even on miss so we don't retry
          if (!options.dryRun) {
            await pool.query(`UPDATE actors SET demographics_fetched_at = NOW() WHERE id = $1`, [
              actor.id,
            ])
          }
        }
      } else if (options.recalculateScoresOnly) {
        if (processed === 1 || processed % 100 === 0) {
          console.log(`  Recalculating scores... (${processed}/${actors.length})`)
        }
      }

      // Phase 2: Calculate interestingness score
      const scoreInput = buildScoreInput(actor)
      const result = calculateInterestingnessScore(scoreInput)

      const existingScore =
        actor.interestingness_score != null ? Number(actor.interestingness_score) : null
      if (
        !options.recalculateScoresOnly ||
        existingScore === null ||
        result.score !== existingScore
      ) {
        scoresUpdated++
        const b = result.breakdown
        if (!options.recalculateScoresOnly) {
          console.log(
            `  Score: ${result.score.toFixed(1)} (era=${b.eraScore} demo=${b.demographicScore} death=${b.deathDramaScore} cross=${b.culturalCrossoverScore} wiki=${b.wikiInterestRatioScore} intl=${b.internationalRecognitionScore} life=${b.lifeComplexityScore})`
          )
        }

        if (!options.dryRun) {
          await pool.query(`UPDATE actors SET interestingness_score = $1 WHERE id = $2`, [
            result.score,
            actor.id,
          ])
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("Summary:")
    console.log(`  Actors processed: ${processed}`)
    if (!options.recalculateScoresOnly) {
      console.log(`  Wikidata hits: ${wikidataHits}`)
      console.log(`  Wikidata misses: ${wikidataMisses}`)
      console.log(
        `  Hit rate: ${processed > 0 ? ((wikidataHits / processed) * 100).toFixed(1) : 0}%`
      )
    }
    console.log(`  Scores updated: ${scoresUpdated}`)
    if (options.dryRun) {
      console.log("\n  (DRY RUN — no changes written to database)")
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command()
  .name("enrich-demographics")
  .description(
    "Fetch actor demographics from Wikidata and calculate interestingness scores for enrichment prioritization"
  )
  .option("-l, --limit <n>", "Limit actors to process", parsePositiveInt, 100)
  .option("-p, --min-popularity <n>", "Minimum popularity threshold", parsePositiveFloat)
  .option(
    "-a, --actor-id <ids>",
    "Process specific actor(s) by ID (comma-separated)",
    parseCommaSeparatedIds
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option(
    "--recalculate-scores-only",
    "Skip Wikidata fetching, just recompute scores from existing data"
  )
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    await run(options)
  })

program.parse()
