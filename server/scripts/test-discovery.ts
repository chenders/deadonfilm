#!/usr/bin/env tsx
import "dotenv/config"
import { Pool } from "pg"
import { runSurpriseDiscovery } from "../src/lib/biography-sources/surprise-discovery/orchestrator.js"
import { DEFAULT_DISCOVERY_CONFIG } from "../src/lib/biography-sources/surprise-discovery/types.js"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const actorResult = await pool.query(
      `SELECT a.id, a.name, a.tmdb_id, abd.narrative, abd.lesser_known_facts
       FROM actors a
       JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE a.id = 15854`
    )

    const row = actorResult.rows[0]
    if (!row) {
      console.error("Actor not found")
      process.exitCode = 1
      return
    }

    console.log(`\nRunning surprise discovery for: ${row.name}`)
    console.log(`Existing bio: ${row.narrative?.length ?? 0} chars`)
    console.log(`Existing facts: ${(row.lesser_known_facts ?? []).length}`)
    console.log("---\n")

    const result = await runSurpriseDiscovery(
      { id: row.id, name: row.name, tmdb_id: row.tmdb_id },
      row.narrative ?? "",
      row.lesser_known_facts ?? [],
      { ...DEFAULT_DISCOVERY_CONFIG, incongruityThreshold: 7 }
    )

    console.log("\n=== RESULTS ===")
    console.log(`Has findings: ${result.hasFindings}`)
    console.log(`New facts: ${result.newLesserKnownFacts.length}`)
    if (result.newLesserKnownFacts.length > 0) {
      console.log("New lesser-known facts:")
      result.newLesserKnownFacts.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
    }
    if (result.updatedNarrative) {
      console.log(`Narrative updated: yes (${result.updatedNarrative.length} chars)`)
    }

    const dr = result.discoveryResults
    console.log(`\n=== PIPELINE STATS ===`)
    console.log(
      `Autocomplete: ${dr.autocomplete.queriesRun} queries, ${dr.autocomplete.uniqueSuggestions} unique suggestions`
    )
    console.log(`  By pattern: ${JSON.stringify(dr.autocomplete.byPattern)}`)
    console.log(
      `Boring filter: ${dr.boringFilter.dropped} dropped, ${dr.boringFilter.remaining} remaining`
    )
    console.log(`  Reasons: ${JSON.stringify(dr.boringFilter.droppedByReason)}`)
    console.log(`Incongruity candidates (${dr.incongruityCandidates.length}):`)
    dr.incongruityCandidates.forEach((c) =>
      console.log(`  ${c.term}: ${c.score}/10 — ${c.reasoning}`)
    )
    console.log(`Researched (${dr.researched.length}):`)
    dr.researched.forEach((r) => {
      console.log(`  ${r.term}: verified=${r.verified}, threads=${r.redditThreads.length}`)
      if (r.claimExtracted) console.log(`    Claim: ${r.claimExtracted.slice(0, 150)}`)
      if (r.verificationSource)
        console.log(`    Verified via: ${r.verificationSource} (${r.verificationUrl})`)
    })
    console.log(`Integrated (${dr.integrated.length}):`)
    dr.integrated.forEach((i) => console.log(`  ${i.term} → ${i.destination}`))
    console.log(`Total cost: $${dr.costUsd.toFixed(4)}`)
  } finally {
    await pool.end()
  }
}

main()
