#!/usr/bin/env tsx
import "dotenv/config"
import { invalidateActorCache } from "../src/lib/cache.js"

const actorId = parseInt(process.argv[2], 10)
if (!actorId || isNaN(actorId)) {
  console.error("Usage: npx tsx scripts/clear-actor-cache.ts <actorId>")
  process.exit(1)
}

async function main() {
  console.log(`Clearing cache for actor ${actorId}...`)
  await invalidateActorCache(actorId)
  console.log("Done!")
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
