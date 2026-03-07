#!/usr/bin/env tsx
/**
 * Diagnostic CLI for testing individual enrichment sources.
 *
 * Instantiates sources directly, runs them against known actors, and prints
 * verbose results including availability, success/error, confidence, and
 * text preview. Useful for debugging 0% success rate sources.
 *
 * Usage:
 *   cd server && npx tsx scripts/diagnose-sources.ts --source wikipedia-bio --actor "John Wayne"
 *   cd server && npx tsx scripts/diagnose-sources.ts --source wikidata --actor-id 2157
 *   cd server && npx tsx scripts/diagnose-sources.ts --all-sources --system bio
 */
import "dotenv/config"

import { Command } from "commander"
import { Pool } from "pg"

// Biography sources
import { WikidataBiographySource } from "../src/lib/biography-sources/sources/wikidata.js"
import { WikipediaBiographySource } from "../src/lib/biography-sources/sources/wikipedia.js"
import { BritannicaBiographySource } from "../src/lib/biography-sources/sources/britannica.js"
import { BiographyComSource } from "../src/lib/biography-sources/sources/biography-com.js"
import { TCMBiographySource } from "../src/lib/biography-sources/sources/tcm.js"
import { AllMusicBiographySource } from "../src/lib/biography-sources/sources/allmusic.js"
import { GoogleBooksBiographySource } from "../src/lib/biography-sources/sources/google-books.js"
import { OpenLibraryBiographySource } from "../src/lib/biography-sources/sources/open-library.js"
import { IABooksBiographySource } from "../src/lib/biography-sources/sources/ia-books.js"
import { GoogleBiographySearch } from "../src/lib/biography-sources/sources/google-search.js"
import { BingBiographySearch } from "../src/lib/biography-sources/sources/bing-search.js"
import { DuckDuckGoBiographySearch } from "../src/lib/biography-sources/sources/duckduckgo.js"
import { BraveBiographySearch } from "../src/lib/biography-sources/sources/brave-search.js"
import { GuardianBiographySource } from "../src/lib/biography-sources/sources/guardian.js"
import { NYTimesBiographySource } from "../src/lib/biography-sources/sources/nytimes.js"
import { APNewsBiographySource } from "../src/lib/biography-sources/sources/ap-news.js"
import { ReutersBiographySource } from "../src/lib/biography-sources/sources/reuters.js"
import { WashingtonPostBiographySource } from "../src/lib/biography-sources/sources/washington-post.js"
import { LATimesBiographySource } from "../src/lib/biography-sources/sources/la-times.js"
import { BBCNewsBiographySource } from "../src/lib/biography-sources/sources/bbc-news.js"
import { NPRBiographySource } from "../src/lib/biography-sources/sources/npr.js"
import { PBSBiographySource } from "../src/lib/biography-sources/sources/pbs.js"
import { PeopleBiographySource } from "../src/lib/biography-sources/sources/people.js"
import { IndependentBiographySource } from "../src/lib/biography-sources/sources/independent.js"
import { TelegraphBiographySource } from "../src/lib/biography-sources/sources/telegraph.js"
import { TimeBiographySource } from "../src/lib/biography-sources/sources/time.js"
import { NewYorkerBiographySource } from "../src/lib/biography-sources/sources/new-yorker.js"
import { RollingStoneBiographySource } from "../src/lib/biography-sources/sources/rolling-stone.js"
import { NationalGeographicBiographySource } from "../src/lib/biography-sources/sources/national-geographic.js"
import { SmithsonianBiographySource } from "../src/lib/biography-sources/sources/smithsonian.js"
import { HistoryComBiographySource } from "../src/lib/biography-sources/sources/history-com.js"
import { LegacyBiographySource } from "../src/lib/biography-sources/sources/legacy.js"
import { FindAGraveBiographySource } from "../src/lib/biography-sources/sources/findagrave.js"
import { InternetArchiveBiographySource } from "../src/lib/biography-sources/sources/internet-archive.js"
import { ChroniclingAmericaBiographySource } from "../src/lib/biography-sources/sources/chronicling-america.js"
import { TroveBiographySource } from "../src/lib/biography-sources/sources/trove.js"
import { EuropeanaBiographySource } from "../src/lib/biography-sources/sources/europeana.js"
import { setIgnoreCache as setBioIgnoreCache } from "../src/lib/biography-sources/base-source.js"
import type { BaseBiographySource } from "../src/lib/biography-sources/base-source.js"
import type { ActorForBiography } from "../src/lib/biography-sources/types.js"

// Death sources
import { WikidataSource } from "../src/lib/death-sources/sources/wikidata.js"
import { WikipediaSource } from "../src/lib/death-sources/sources/wikipedia.js"
import { BFISightSoundSource } from "../src/lib/death-sources/sources/bfi-sight-sound.js"
import { GoogleSearchSource } from "../src/lib/death-sources/sources/google.js"
import { BingSearchSource } from "../src/lib/death-sources/sources/bing.js"
import { DuckDuckGoSource } from "../src/lib/death-sources/sources/duckduckgo.js"
import { BraveSearchSource } from "../src/lib/death-sources/sources/brave.js"
import { FindAGraveSource } from "../src/lib/death-sources/sources/findagrave.js"
import { LegacySource } from "../src/lib/death-sources/sources/legacy.js"
import { GuardianSource } from "../src/lib/death-sources/sources/guardian.js"
import { NYTimesSource } from "../src/lib/death-sources/sources/nytimes.js"
import { APNewsSource } from "../src/lib/death-sources/sources/ap-news.js"
import { ReutersSource } from "../src/lib/death-sources/sources/reuters.js"
import { WashingtonPostSource } from "../src/lib/death-sources/sources/washington-post.js"
import { BBCNewsSource } from "../src/lib/death-sources/sources/bbc-news.js"
import { LATimesSource } from "../src/lib/death-sources/sources/la-times.js"
import { RollingStoneSource } from "../src/lib/death-sources/sources/rolling-stone.js"
import { TelegraphSource } from "../src/lib/death-sources/sources/telegraph.js"
import { IndependentSource } from "../src/lib/death-sources/sources/independent.js"
import { NPRSource } from "../src/lib/death-sources/sources/npr.js"
import { TimeSource } from "../src/lib/death-sources/sources/time.js"
import { PBSSource } from "../src/lib/death-sources/sources/pbs.js"
import { NewYorkerSource } from "../src/lib/death-sources/sources/new-yorker.js"
import { NationalGeographicSource } from "../src/lib/death-sources/sources/national-geographic.js"
import { PeopleSource } from "../src/lib/death-sources/sources/people.js"
import { VarietySource } from "../src/lib/death-sources/sources/variety.js"
import { DeadlineSource } from "../src/lib/death-sources/sources/deadline.js"
import { HollywoodReporterSource } from "../src/lib/death-sources/sources/hollywood-reporter.js"
import { TMZSource } from "../src/lib/death-sources/sources/tmz.js"
import { GoogleBooksDeathSource } from "../src/lib/death-sources/sources/google-books.js"
import { OpenLibraryDeathSource } from "../src/lib/death-sources/sources/open-library.js"
import { IABooksDeathSource } from "../src/lib/death-sources/sources/ia-books.js"
import { TroveSource } from "../src/lib/death-sources/sources/trove.js"
import { EuropeanaSource } from "../src/lib/death-sources/sources/europeana.js"
import { InternetArchiveSource } from "../src/lib/death-sources/sources/internet-archive.js"
import { ChroniclingAmericaSource } from "../src/lib/death-sources/sources/chronicling-america.js"
import { setIgnoreCache as setDeathIgnoreCache } from "../src/lib/death-sources/base-source.js"
import type { BaseDataSource } from "../src/lib/death-sources/base-source.js"
import type { ActorForEnrichment } from "../src/lib/death-sources/types.js"

// ============================================================================
// Source Registry
// ============================================================================

type AnySource = BaseBiographySource | BaseDataSource

function createBioSources(): Map<string, BaseBiographySource> {
  const sources: BaseBiographySource[] = [
    new WikidataBiographySource(),
    new WikipediaBiographySource(),
    new BritannicaBiographySource(),
    new BiographyComSource(),
    new TCMBiographySource(),
    new AllMusicBiographySource(),
    new GoogleBooksBiographySource(),
    new OpenLibraryBiographySource(),
    new IABooksBiographySource(),
    new GoogleBiographySearch(),
    new BingBiographySearch(),
    new DuckDuckGoBiographySearch(),
    new BraveBiographySearch(),
    new GuardianBiographySource(),
    new NYTimesBiographySource(),
    new APNewsBiographySource(),
    new ReutersBiographySource(),
    new WashingtonPostBiographySource(),
    new LATimesBiographySource(),
    new BBCNewsBiographySource(),
    new NPRBiographySource(),
    new PBSBiographySource(),
    new PeopleBiographySource(),
    new IndependentBiographySource(),
    new TelegraphBiographySource(),
    new TimeBiographySource(),
    new NewYorkerBiographySource(),
    new RollingStoneBiographySource(),
    new NationalGeographicBiographySource(),
    new SmithsonianBiographySource(),
    new HistoryComBiographySource(),
    new LegacyBiographySource(),
    new FindAGraveBiographySource(),
    new InternetArchiveBiographySource(),
    new ChroniclingAmericaBiographySource(),
    new TroveBiographySource(),
    new EuropeanaBiographySource(),
  ]
  const map = new Map<string, BaseBiographySource>()
  for (const s of sources) map.set(s.type, s)
  return map
}

function createDeathSources(): Map<string, BaseDataSource> {
  const sources: BaseDataSource[] = [
    new WikidataSource(),
    new WikipediaSource(),
    new BFISightSoundSource(),
    new GoogleSearchSource(),
    new BingSearchSource(),
    new DuckDuckGoSource(),
    new BraveSearchSource(),
    new FindAGraveSource(),
    new LegacySource(),
    new GuardianSource(),
    new NYTimesSource(),
    new APNewsSource(),
    new ReutersSource(),
    new WashingtonPostSource(),
    new BBCNewsSource(),
    new LATimesSource(),
    new RollingStoneSource(),
    new TelegraphSource(),
    new IndependentSource(),
    new NPRSource(),
    new TimeSource(),
    new PBSSource(),
    new NewYorkerSource(),
    new NationalGeographicSource(),
    new PeopleSource(),
    new VarietySource(),
    new DeadlineSource(),
    new HollywoodReporterSource(),
    new TMZSource(),
    new GoogleBooksDeathSource(),
    new OpenLibraryDeathSource(),
    new IABooksDeathSource(),
    new TroveSource(),
    new EuropeanaSource(),
    new InternetArchiveSource(),
    new ChroniclingAmericaSource(),
  ]
  const map = new Map<string, BaseDataSource>()
  for (const s of sources) map.set(s.type, s)
  return map
}

// ============================================================================
// Test Actors
// ============================================================================

const TEST_ACTORS = [
  { id: 2157, name: "John Wayne" },
  { id: 10127, name: "Audrey Hepburn" },
  { id: 10814, name: "Steve McQueen" },
]

// ============================================================================
// Actor Lookup
// ============================================================================

async function lookupActorForBio(
  pool: Pool,
  opts: { actorId?: number; actorName?: string }
): Promise<ActorForBiography | null> {
  const query = opts.actorId
    ? `SELECT id, tmdb_id, imdb_person_id, name, birthday::text, deathday::text,
              wikipedia_url, biography as biography_raw_tmdb, biography,
              place_of_birth
       FROM actors WHERE id = $1`
    : `SELECT id, tmdb_id, imdb_person_id, name, birthday::text, deathday::text,
              wikipedia_url, biography as biography_raw_tmdb, biography,
              place_of_birth
       FROM actors WHERE name ILIKE $1 AND deathday IS NOT NULL
       ORDER BY dof_popularity DESC NULLS LAST LIMIT 1`

  const param = opts.actorId ?? `%${opts.actorName}%`
  const result = await pool.query(query, [param])
  return result.rows[0] ?? null
}

async function lookupActorForDeath(
  pool: Pool,
  opts: { actorId?: number; actorName?: string }
): Promise<ActorForEnrichment | null> {
  const query = opts.actorId
    ? `SELECT id, tmdb_id as "tmdbId", imdb_person_id as "imdbPersonId",
              name, birthday::text, deathday::text,
              cause_of_death as "causeOfDeath",
              cause_of_death_details as "causeOfDeathDetails",
              dof_popularity as popularity
       FROM actors WHERE id = $1`
    : `SELECT id, tmdb_id as "tmdbId", imdb_person_id as "imdbPersonId",
              name, birthday::text, deathday::text,
              cause_of_death as "causeOfDeath",
              cause_of_death_details as "causeOfDeathDetails",
              dof_popularity as popularity
       FROM actors WHERE name ILIKE $1 AND deathday IS NOT NULL
       ORDER BY dof_popularity DESC NULLS LAST LIMIT 1`

  const param = opts.actorId ?? `%${opts.actorName}%`
  const result = await pool.query(query, [param])
  return result.rows[0] ?? null
}

// ============================================================================
// Diagnosis Logic
// ============================================================================

async function diagnoseSource(
  source: AnySource,
  actor: ActorForBiography | ActorForEnrichment,
  system: string
): Promise<void> {
  const available = source.isAvailable()
  console.log(`  Available: ${available ? "YES" : "NO (missing API key?)"}`)

  if (!available) return

  try {
    const startMs = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bio and death sources have lookup() with different param types
    const result = await (source as any).lookup(actor)
    const elapsedMs = Date.now() - startMs

    console.log(`  Success:    ${result.success}`)
    console.log(`  Error:      ${result.error || "—"}`)
    console.log(`  Confidence: ${result.source?.confidence?.toFixed(3) ?? "—"}`)
    console.log(`  Cost:       $${result.source?.costUsd?.toFixed(4) ?? "0.0000"}`)
    console.log(`  Time:       ${elapsedMs}ms`)

    if (result.data) {
      const textFields = system === "bio" ? ["text", "sections"] : ["text", "circumstances"]
      for (const field of textFields) {
        const val = (result.data as Record<string, unknown>)[field]
        if (typeof val === "string" && val.length > 0) {
          console.log(`  ${field} length: ${val.length} chars`)
          console.log(`  ${field} preview: ${val.slice(0, 200).replace(/\n/g, " ")}...`)
        }
      }
    }
  } catch (err) {
    console.log(`  EXCEPTION: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ============================================================================
// Main
// ============================================================================

const program = new Command()
  .name("diagnose-sources")
  .description("Diagnose individual enrichment sources against test actors")
  .option("-s, --source <type>", "Source type to test (e.g., wikipedia-bio, wikidata)")
  .option("-a, --actor <name>", "Actor name to test against")
  .option("--actor-id <id>", "Actor ID to test against", parseInt)
  .option("--system <type>", "Enrichment system: bio or death", "bio")
  .option("--all-sources", "Test all available sources against test actors")
  .option("--list", "List all available source types")
  .action(async (opts) => {
    // Always bypass cache for diagnostics
    setBioIgnoreCache(true)
    setDeathIgnoreCache(true)

    if (opts.list) {
      console.log("\nBiography sources:")
      for (const [type, src] of createBioSources()) {
        console.log(`  ${type.padEnd(30)} available: ${src.isAvailable()}`)
      }
      console.log("\nDeath sources:")
      for (const [type, src] of createDeathSources()) {
        console.log(`  ${type.padEnd(30)} available: ${src.isAvailable()}`)
      }
      return
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL })

    try {
      const system = opts.system as "bio" | "death"
      const sources = system === "bio" ? createBioSources() : createDeathSources()

      if (opts.source) {
        // Single source mode
        const source = sources.get(opts.source)
        if (!source) {
          throw new Error(
            `Unknown source: ${opts.source}\nAvailable: ${[...sources.keys()].join(", ")}`
          )
        }

        const actor =
          system === "bio"
            ? await lookupActorForBio(pool, {
                actorId: opts.actorId,
                actorName: opts.actor || "John Wayne",
              })
            : await lookupActorForDeath(pool, {
                actorId: opts.actorId,
                actorName: opts.actor || "John Wayne",
              })

        if (!actor) {
          throw new Error("Actor not found in database")
        }

        console.log(`\nDiagnosing ${opts.source} for ${actor.name}`)
        console.log("─".repeat(60))
        await diagnoseSource(source, actor, system)
      } else if (opts.allSources) {
        // Test all available sources against test actors
        const testActors = []
        for (const ta of TEST_ACTORS) {
          const actor =
            system === "bio"
              ? await lookupActorForBio(pool, { actorId: ta.id })
              : await lookupActorForDeath(pool, { actorId: ta.id })
          if (actor) testActors.push({ ...ta, data: actor })
        }

        if (testActors.length === 0) {
          throw new Error("No test actors found in database")
        }

        console.log(
          `\nTesting ${sources.size} ${system} sources against ${testActors.length} actors\n`
        )

        for (const [type, source] of sources) {
          if (!source.isAvailable()) {
            console.log(`${type}: SKIPPED (not available)`)
            continue
          }

          // Test against first test actor only for speed
          const testActor = testActors[0]
          console.log(`\n${type} → ${testActor.name}`)
          console.log("─".repeat(60))
          await diagnoseSource(source, testActor.data, system)
        }
      } else {
        console.error("Specify --source <type>, --all-sources, or --list")
        process.exit(1)
      }
    } catch (error) {
      console.error("Fatal error:", error)
      process.exitCode = 1
    } finally {
      await pool.end()
    }
  })

program.parse()
