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
      result.newLesserKnownFacts.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.text}`)
        if (f.sourceUrl) console.log(`     Source: ${f.sourceName} → ${f.sourceUrl}`)
      })
    }
    if (result.updatedNarrative) {
      console.log(`Narrative updated: yes (${result.updatedNarrative.length} chars)`)
    }

    // Write results to DB
    if (result.hasFindings || result.discoveryResults.autocomplete.queriesRun > 0) {
      const updateFields: string[] = ["discovery_results = $2"]
      const updateParams: unknown[] = [row.id, JSON.stringify(result.discoveryResults)]
      let paramIdx = 3

      if (result.newLesserKnownFacts.length > 0) {
        updateFields.push(
          `lesser_known_facts = $${paramIdx}::jsonb || COALESCE(lesser_known_facts, '[]'::jsonb)`
        )
        updateParams.push(JSON.stringify(result.newLesserKnownFacts))
        paramIdx++
      }

      if (result.updatedNarrative) {
        updateFields.push(`narrative = $${paramIdx}`)
        updateParams.push(result.updatedNarrative)
        paramIdx++
      }

      await pool.query(
        `UPDATE actor_biography_details SET ${updateFields.join(", ")} WHERE actor_id = $1`,
        updateParams
      )
      console.log(
        `\nWrote ${result.newLesserKnownFacts.length} new facts + discovery results to DB`
      )

      // Clear Redis cache - use explicit keys, not KEYS pattern scan
      const Redis = (await import("ioredis")).default
      const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379")
      const keysToDelete = [`actor:id:${row.id}:v:2`, `related-actors:id:${row.id}`]
      await redis.del(...keysToDelete)
      console.log(`Cleared Redis cache keys: ${keysToDelete.join(", ")}`)
      await redis.quit()
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
