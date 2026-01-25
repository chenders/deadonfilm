#!/usr/bin/env tsx
/**
 * Manually rebuild death caches.
 */
import { initRedis, closeRedis } from "../src/lib/redis.js"
import { rebuildDeathCaches } from "../src/lib/cache.js"

async function main() {
  console.log("Initializing Redis connection...\n")

  const redisAvailable = await initRedis()
  if (!redisAvailable) {
    console.error("❌ Redis is not available")
    process.exit(1)
  }

  console.log("✅ Redis connected\n")
  console.log("Rebuilding death caches...\n")

  try {
    await rebuildDeathCaches()
    console.log("✅ Death caches rebuilt successfully\n")
  } catch (error) {
    console.error("❌ Error rebuilding caches:", error)
    process.exit(1)
  } finally {
    await closeRedis()
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
