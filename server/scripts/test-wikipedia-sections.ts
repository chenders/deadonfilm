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
  .option("--birthday <date>", "Actor birthday (YYYY-MM-DD)", "1941-01-30")
  .option("--deathday <date>", "Actor death date (YYYY-MM-DD)", "2025-11-03")
  .parse()

const opts = program.opts()

async function main() {
  // Bypass cache if requested
  if (opts.ignoreCache) {
    console.log("Cache: BYPASSED (--ignore-cache)")
    setIgnoreCache(true)
  }

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

  const actor = {
    id: 8352,
    tmdbId: 8352,
    name: opts.actor,
    birthday: opts.birthday,
    deathday: opts.deathday,
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
}

main().catch(console.error)
