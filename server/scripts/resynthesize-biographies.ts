#!/usr/bin/env tsx
import "dotenv/config" // MUST be first import

import * as readline from "readline"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { BiographyEnrichmentOrchestrator } from "../src/lib/biography-sources/orchestrator.js"
import { writeBiographyToProduction } from "../src/lib/biography-enrichment-db-writer.js"
import type { ActorForBiography } from "../src/lib/biography-sources/types.js"

/**
 * Re-synthesize biographies from cached source data.
 *
 * Pulls previously cached source text from source_query_cache and re-runs
 * Claude synthesis with the current prompt. No external source fetching occurs,
 * so the only cost is the Claude API call (~$0.01-0.05 per actor).
 *
 * Usage:
 *   cd server && npx tsx scripts/resynthesize-biographies.ts [options]
 *
 * Examples:
 *   npx tsx scripts/resynthesize-biographies.ts --actor-id 7468 --dry-run --compare
 *   npx tsx scripts/resynthesize-biographies.ts --actor-id 3160,7934,7468 --compare --yes
 *   npx tsx scripts/resynthesize-biographies.ts --version 5.0.0 --limit 10 --dry-run
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

function parseCommaSeparatedIds(value: string): number[] {
  return value.split(",").map((s) => {
    const n = parseInt(s.trim(), 10)
    if (isNaN(n) || !Number.isInteger(n) || n <= 0)
      throw new InvalidArgumentError(`Invalid ID: ${s}`)
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
// Actor Query Functions
// ============================================================================

async function queryActorsByIds(pool: Pool, ids: number[]): Promise<ActorForBiography[]> {
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
  const result = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography_raw_tmdb, biography
     FROM actors
     WHERE id IN (${placeholders})`,
    ids
  )
  return result.rows
}

async function queryActorsByVersion(
  pool: Pool,
  version: string,
  limit: number
): Promise<ActorForBiography[]> {
  const result = await pool.query(
    `SELECT a.id, a.tmdb_id, a.imdb_person_id, a.name, a.birthday, a.deathday,
            a.wikipedia_url, a.biography_raw_tmdb, a.biography
     FROM actors a
     JOIN actor_biography_details abd ON abd.actor_id = a.id
     WHERE a.biography_version = $1
     ORDER BY a.dof_popularity DESC NULLS LAST
     LIMIT $2`,
    [version, limit]
  )
  return result.rows
}

async function getCurrentNarrative(pool: Pool, actorId: number): Promise<string | null> {
  const result = await pool.query<{ narrative: string | null }>(
    `SELECT narrative FROM actor_biography_details WHERE actor_id = $1`,
    [actorId]
  )
  return result.rows[0]?.narrative ?? null
}

async function getCurrentLesserKnownFacts(pool: Pool, actorId: number): Promise<string[]> {
  const result = await pool.query<{ lesser_known_facts: string[] | null }>(
    `SELECT lesser_known_facts FROM actor_biography_details WHERE actor_id = $1`,
    [actorId]
  )
  return result.rows[0]?.lesser_known_facts ?? []
}

// ============================================================================
// Comparison Output
// ============================================================================

function printComparison(
  actorName: string,
  oldNarrative: string | null,
  newNarrative: string | null,
  oldFacts: string[],
  newFacts: string[]
): void {
  console.log(`\n${"─".repeat(70)}`)
  console.log(`  ${actorName}`)
  console.log(`${"─".repeat(70)}`)

  if (oldNarrative && newNarrative) {
    // Show first 500 chars of each for comparison
    const previewLen = 500
    console.log(`\n  OLD NARRATIVE (first ${previewLen} chars):`)
    console.log(`  ${oldNarrative.substring(0, previewLen).replace(/\n/g, "\n  ")}...`)
    console.log(`\n  NEW NARRATIVE (first ${previewLen} chars):`)
    console.log(`  ${newNarrative.substring(0, previewLen).replace(/\n/g, "\n  ")}...`)

    // Check for improvements
    const superlatives = [
      "renowned",
      "acclaimed",
      "legendary",
      "iconic",
      "beloved",
      "celebrated",
      "distinguished",
      "prolific",
      "seminal",
      "groundbreaking",
      "trailblazing",
      "masterful",
      "definitive",
    ]
    const awards = [
      "Oscar",
      "Academy Award",
      "Emmy",
      "Tony",
      "Grammy",
      "Golden Globe",
      "BAFTA",
      "SAG",
      "Pulitzer",
      "Cannes",
      "Venice",
    ]

    const oldNarrativeLower = oldNarrative.toLowerCase()
    const newNarrativeLower = newNarrative.toLowerCase()

    const oldSuperlatives = superlatives.filter((s) => oldNarrativeLower.includes(s.toLowerCase()))
    const newSuperlatives = superlatives.filter((s) => newNarrativeLower.includes(s.toLowerCase()))
    const oldAwards = awards.filter((a) => oldNarrativeLower.includes(a.toLowerCase()))
    const newAwards = awards.filter((a) => newNarrativeLower.includes(a.toLowerCase()))

    console.log(`\n  QUALITY CHECK:`)
    console.log(
      `    Superlatives: ${oldSuperlatives.length} → ${newSuperlatives.length} ${newSuperlatives.length < oldSuperlatives.length ? "✓" : newSuperlatives.length === 0 ? "✓" : "✗"}`
    )
    if (newSuperlatives.length > 0) {
      console.log(`      Remaining: ${newSuperlatives.join(", ")}`)
    }
    console.log(
      `    Award names:  ${oldAwards.length} → ${newAwards.length} ${newAwards.length < oldAwards.length ? "✓" : newAwards.length === 0 ? "✓" : "✗"}`
    )
    if (newAwards.length > 0) {
      console.log(`      Remaining: ${newAwards.join(", ")}`)
    }

    // Check opening pattern
    const formulaicStarts = ["Born in", "Growing up in"]
    const oldFormulaic = formulaicStarts.some((s) => oldNarrative.startsWith(s))
    const newFormulaic = formulaicStarts.some((s) => newNarrative.startsWith(s))
    console.log(
      `    Opening:      ${oldFormulaic ? "formulaic" : "varied"} → ${newFormulaic ? "formulaic ✗" : "varied ✓"}`
    )
  }

  if (newFacts.length > 0) {
    console.log(`\n  LESSER-KNOWN FACTS (${newFacts.length}):`)
    for (const fact of newFacts) {
      console.log(`    • ${fact}`)
    }
  }

  if (oldFacts.length > 0) {
    console.log(`\n  OLD FACTS (${oldFacts.length}):`)
    for (const fact of oldFacts) {
      console.log(`    • ${fact}`)
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function run(options: {
  actorId?: number[]
  version?: string
  limit: number
  dryRun: boolean
  compare: boolean
  yes: boolean
}): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Determine target actors
    let actors: ActorForBiography[]

    if (options.actorId) {
      actors = await queryActorsByIds(pool, options.actorId)
      if (actors.length === 0) {
        throw new Error("No actors found with the specified IDs")
      }
      console.log(`Found ${actors.length} actor(s) by ID`)
    } else if (options.version) {
      actors = await queryActorsByVersion(pool, options.version, options.limit)
      if (actors.length === 0) {
        throw new Error(`No actors found with biography_version = "${options.version}"`)
      }
      console.log(`Found ${actors.length} actor(s) with version ${options.version}`)
    } else {
      throw new Error("Either --actor-id or --version is required")
    }

    // Show what we're about to do
    console.log(`\nRe-synthesis plan:`)
    console.log(`  Actors:      ${actors.length}`)
    console.log(`  Dry run:     ${options.dryRun}`)
    console.log(`  Compare:     ${options.compare}`)
    console.log(`\n  Actors:`)
    for (const actor of actors) {
      console.log(`    - ${actor.name} (ID: ${actor.id})`)
    }

    await waitForConfirmation(options.yes)

    const orchestrator = new BiographyEnrichmentOrchestrator()

    let processed = 0
    let succeeded = 0
    let failed = 0
    let totalCost = 0

    // Process actors sequentially (re-synthesis is just a Claude API call per actor)
    for (const actor of actors) {
      processed++
      console.log(`\n[${processed}/${actors.length}] Processing ${actor.name}...`)

      // Save old narrative/facts for comparison
      let oldNarrative: string | null = null
      let oldFacts: string[] = []
      if (options.compare) {
        oldNarrative = await getCurrentNarrative(pool, actor.id)
        oldFacts = await getCurrentLesserKnownFacts(pool, actor.id)
      }

      const result = await orchestrator.resynthesizeFromCache(actor)

      if (result.error || !result.data) {
        console.log(`  Failed: ${result.error || "No data produced"}`)
        failed++
        continue
      }

      totalCost += result.stats.totalCostUsd
      succeeded++

      if (options.compare) {
        printComparison(
          actor.name,
          oldNarrative,
          result.data.narrative,
          oldFacts,
          result.data.lesserKnownFacts
        )
      }

      if (!options.dryRun && result.data.hasSubstantiveContent) {
        await writeBiographyToProduction(pool, actor.id, result.data, result.sources)
        console.log(`  Written to production`)
      } else if (options.dryRun) {
        console.log(`  [DRY RUN] Would write to production`)
      }
    }

    // Summary
    console.log(`\n${"=".repeat(60)}`)
    console.log(`Re-synthesis complete!`)
    console.log(`  Processed: ${processed}`)
    console.log(`  Succeeded: ${succeeded}`)
    console.log(`  Failed:    ${failed}`)
    console.log(`  Total cost: $${totalCost.toFixed(4)}`)
    if (options.dryRun) {
      console.log(`  [DRY RUN] No changes written to database`)
    }
    console.log(`${"=".repeat(60)}`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

// ============================================================================
// CLI Definition
// ============================================================================

const program = new Command()
  .name("resynthesize-biographies")
  .description("Re-synthesize biographies from cached source data using the current Claude prompt")
  .option("--actor-id <ids>", "Comma-separated actor IDs to re-synthesize", parseCommaSeparatedIds)
  .option("--version <ver>", "Re-synthesize all actors with this biography_version")
  .option("--limit <n>", "Max actors to process (used with --version)", parsePositiveInt, 50)
  .option("-n, --dry-run", "Output results without writing to DB", false)
  .option("--compare", "Output side-by-side old vs new comparison", false)
  .option("-y, --yes", "Skip confirmation prompt", false)
  .action(async (opts) => {
    await run(opts)
  })

program.parse()
