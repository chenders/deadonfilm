#!/usr/bin/env tsx
import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import {
  findPersonsByNames,
  combineVerification,
  type DeathDateConfidence,
} from "../src/lib/imdb.js"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0)
    throw new InvalidArgumentError("Must be positive integer")
  return n
}

interface ActorRow {
  id: number
  name: string
  birthday: string | null
  deathday: string
  deathday_confidence: string | null
  deathday_verification_source: string | null
}

interface ValidationResult {
  actorId: number
  name: string
  oldConfidence: string | null
  newConfidence: DeathDateConfidence
  newSource: string | null
  imdbDeathYear: number | null
  tmdbDeathYear: number
}

async function run(options: {
  limit?: number
  unverifiedOnly: boolean
  dryRun: boolean
}): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // 1. Query deceased actors
    let query = `
      SELECT id, name, birthday, deathday, deathday_confidence, deathday_verification_source
      FROM actors
      WHERE deathday IS NOT NULL
    `
    const params: unknown[] = []
    if (options.unverifiedOnly) {
      query += ` AND (deathday_confidence = 'unverified' OR deathday_confidence IS NULL)`
    }
    query += ` ORDER BY id`
    if (options.limit) {
      params.push(options.limit)
      query += ` LIMIT $${params.length}`
    }

    const { rows: actors } = await pool.query<ActorRow>(query, params)
    console.log(`Found ${actors.length} deceased actors to validate`)

    if (actors.length === 0) {
      console.log("Nothing to do.")
      return
    }

    // 2. Build lookups for batch IMDb search (keyed by actor ID for duplicate name safety)
    const lookups = actors.map((a) => ({
      key: String(a.id),
      name: a.name,
      birthYear: a.birthday ? new Date(a.birthday).getFullYear() : null,
    }))

    console.log(`\nSearching IMDb dataset for ${lookups.length} names (single pass)...`)
    const imdbResults = await findPersonsByNames(lookups)
    console.log(`Found ${imdbResults.size} matches in IMDb dataset`)

    // 3. Process results
    const results: ValidationResult[] = []
    let verified = 0
    let imdbVerified = 0
    let suspicious = 0
    let unverified = 0
    let conflicting = 0
    let unchanged = 0

    for (const actor of actors) {
      const tmdbDeathYear = new Date(actor.deathday).getFullYear()
      const imdbPerson = imdbResults.get(String(actor.id))

      // Build IMDb verification result
      const imdbVerif = imdbPerson
        ? {
            found: true,
            hasDeathYear: imdbPerson.deathYear !== null,
            imdbDeathYear: imdbPerson.deathYear,
            yearMatches: imdbPerson.deathYear === tmdbDeathYear,
          }
        : { found: false, hasDeathYear: false, imdbDeathYear: null, yearMatches: false }

      // Map existing confidence to Wikidata-compatible values.
      // imdb_verified and suspicious are IMDb-only values — treat as unverified for Wikidata input.
      let wikidataConfidence: "verified" | "unverified" | "conflicting" = "unverified"
      if (actor.deathday_confidence === "verified") {
        wikidataConfidence = "verified"
      } else if (actor.deathday_confidence === "conflicting") {
        wikidataConfidence = "conflicting"
      }
      const hasWikidata = actor.deathday_verification_source?.includes("wikidata") ?? false

      const { confidence, source } = combineVerification(
        {
          confidence: wikidataConfidence,
          wikidataDeathDate: hasWikidata ? "known" : null,
        },
        imdbVerif
      )

      // Track if anything changed
      if (
        confidence === actor.deathday_confidence &&
        source === actor.deathday_verification_source
      ) {
        unchanged++
        continue
      }

      results.push({
        actorId: actor.id,
        name: actor.name,
        oldConfidence: actor.deathday_confidence,
        newConfidence: confidence,
        newSource: source,
        imdbDeathYear: imdbVerif.imdbDeathYear,
        tmdbDeathYear,
      })

      switch (confidence) {
        case "verified":
          verified++
          break
        case "imdb_verified":
          imdbVerified++
          break
        case "suspicious":
          suspicious++
          break
        case "unverified":
          unverified++
          break
        case "conflicting":
          conflicting++
          break
      }
    }

    // 4. Print summary
    console.log(`\n=== Validation Summary ===`)
    console.log(`Total actors checked: ${actors.length}`)
    console.log(`Unchanged: ${unchanged}`)
    console.log(`Changes: ${results.length}`)
    if (verified > 0) console.log(`  verified (wikidata+imdb): ${verified}`)
    if (imdbVerified > 0) console.log(`  imdb_verified: ${imdbVerified}`)
    if (suspicious > 0) console.log(`  suspicious (IMDb says alive): ${suspicious}`)
    if (unverified > 0) console.log(`  unverified: ${unverified}`)
    if (conflicting > 0) console.log(`  conflicting: ${conflicting}`)

    // Print suspicious actors (potential vandalism)
    const suspiciousActors = results.filter((r) => r.newConfidence === "suspicious")
    if (suspiciousActors.length > 0) {
      console.log(`\n=== Suspicious Deaths (IMDb says alive) ===`)
      for (const r of suspiciousActors) {
        console.log(`  ${r.name} (id: ${r.actorId}, TMDB deathday year: ${r.tmdbDeathYear})`)
      }
    }

    // 5. Apply updates (unless dry run)
    if (options.dryRun) {
      console.log(`\n[DRY RUN] Would update ${results.length} actors`)
      return
    }

    if (results.length === 0) {
      console.log("\nNo updates needed.")
      return
    }

    console.log(`\nUpdating ${results.length} actors...`)
    let updated = 0
    for (const r of results) {
      await pool.query(
        `UPDATE actors
         SET deathday_confidence = $1,
             deathday_verification_source = $2,
             deathday_verified_at = NOW()
         WHERE id = $3`,
        [r.newConfidence, r.newSource, r.actorId]
      )
      updated++
      if (updated % 1000 === 0) {
        console.log(`  Updated ${updated}/${results.length}...`)
      }
    }

    console.log(`Done. Updated ${updated} actors.`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("validate-death-dates")
  .description(
    "Cross-validate deceased actor death dates against IMDb dataset. " +
      "Retroactively checks existing actors and updates confidence levels."
  )
  .option("-l, --limit <n>", "Max actors to check", parsePositiveInt)
  .option(
    "-u, --unverified-only",
    "Only check actors with confidence = 'unverified' or NULL",
    false
  )
  .option("-n, --dry-run", "Preview changes without updating the database", false)
  .action(async (opts) => {
    await run(opts)
  })

program.parse()
