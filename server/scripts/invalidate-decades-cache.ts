#!/usr/bin/env tsx
/**
 * Invalidate the decades cache to force regeneration with slugs and corrected movie data.
 */
import { invalidateKeys, CACHE_PREFIX } from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"

export async function main() {
  console.log("Invalidating decades cache...")

  const redisAvailable = await initRedis()
  if (!redisAvailable) {
    console.error("Redis is not available. Cannot invalidate decades cache.")
    process.exit(1)
  }

  await invalidateKeys(CACHE_PREFIX.DECADES)

  console.log("✓ Decades cache invalidated")

  await closeRedis()
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
}

export default main
