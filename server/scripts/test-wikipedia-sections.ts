#!/usr/bin/env tsx
import "dotenv/config"
import { Command } from "commander"
import { WikipediaSource } from "../src/lib/death-sources/sources/wikipedia.js"
import { isAISectionSelectionAvailable } from "../src/lib/death-sources/wikipedia-section-selector.js"
import { setIgnoreCache } from "../src/lib/death-sources/base-source.js"

const program = new Command()
  .name("test-wikipedia-sections")
  .description("Test Wikipedia source section selection")
  .option("-a, --actor <name>", "Actor name to test", "Dick Cheney")
  .option("--ai-selection", "Enable AI-assisted section selection")
  .option("--ignore-cache", "Bypass the cache to force a fresh lookup")
  .option("--id <number>", "Actor ID for cache/logging (optional)")
  .option("--birthday <date>", "Actor birthday YYYY-MM-DD (optional)")
  .option("--deathday <date>", "Actor death date YYYY-MM-DD (optional)")
  .parse()

const opts = program.opts()

// Generate a simple hash for default ID when not provided
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

async function main() {
  // Bypass cache if requested
  if (opts.ignoreCache) {
    console.log("Cache: BYPASSED (--ignore-cache)")
    setIgnoreCache(true)
  }

  try {
    const source = new WikipediaSource()

    // Enable AI section selection if requested
    if (opts.aiSelection) {
      console.log("AI section selection: ENABLED")
      console.log("isAISectionSelectionAvailable():", isAISectionSelectionAvailable())
      console.log("GOOGLE_AI_API_KEY set:", !!process.env.GOOGLE_AI_API_KEY)
      if (!isAISectionSelectionAvailable()) {
        console.error("ERROR: GOOGLE_AI_API_KEY not set. AI section selection requires this key.")
        console.error("Get one at: https://aistudio.google.com/app/apikey")
        process.exit(1)
      }
      source.setWikipediaOptions({ useAISectionSelection: true })
      console.log("Called setWikipediaOptions({ useAISectionSelection: true })")
    } else {
      console.log("AI section selection: disabled (use --ai-selection to enable)")
    }

    // Use provided ID or generate one from the actor name
    // Note: Generated IDs may cause cache write failures if actor doesn't exist in DB
    let actorId: number
    if (opts.id) {
      const parsedId = parseInt(opts.id, 10)
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        console.error(
          `ERROR: Invalid actor ID "${opts.id}". Please provide a positive integer for --id.`
        )
        process.exit(1)
      }
      actorId = parsedId
    } else {
      actorId = simpleHash(opts.actor)
      console.log(
        `Note: Using generated ID ${actorId} for "${opts.actor}". Cache writes may fail if actor not in DB.`
      )
      console.log(`      Use --id <number> to specify a valid actor ID.`)
    }

    const actor = {
      id: actorId,
      tmdbId: null, // Wikipedia-only testing: no TMDB ID associated
      name: opts.actor,
      birthday: opts.birthday ?? null, // Only include if explicitly provided
      deathday: opts.deathday ?? null, // Only include if explicitly provided
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: null,
    }

    console.log(`\nTesting Wikipedia source for ${actor.name}...`)
    const result = await source.lookup(actor)

    console.log("\n=== Result ===")
    console.log("Success:", result.success)
    console.log("Source:", JSON.stringify(result.source, null, 2))

    if (result.data) {
      console.log("\n=== Extracted Text (first 5000 chars) ===")
      console.log(result.data.circumstances?.substring(0, 5000))
      if ((result.data.circumstances?.length || 0) > 5000) {
        console.log("\n[...truncated...]")
      }
    }

    if (result.error) {
      console.log("Error:", result.error)
    }
  } finally {
    // Reset cache flag to avoid affecting other scripts if this module is imported
    if (opts.ignoreCache) {
      setIgnoreCache(false)
    }
  }
}

main().catch(console.error)
