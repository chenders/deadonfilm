#!/usr/bin/env tsx
/**
 * Invalidate the decades cache to force regeneration with slugs and corrected movie data.
 */
import { invalidateKeys, CACHE_PREFIX } from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"

async function main() {
  console.log("Invalidating decades cache...")

  await initRedis()

  await invalidateKeys(CACHE_PREFIX.DECADES)

  console.log("✓ Decades cache invalidated")

  await closeRedis()
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
