#!/usr/bin/env tsx
/**
 * Invalidate and rebuild death-related caches.
 * Use this after adding new death records to ensure they appear on the site.
 */
import "dotenv/config"
import { Command } from "commander"
import { rebuildDeathCaches, invalidateDeathCaches } from "../src/lib/cache.js"
import { logger } from "../src/lib/logger.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"

const program = new Command()
  .name("invalidate-death-caches")
  .description("Invalidate and optionally rebuild death-related caches")
  .option("--no-rebuild", "Only invalidate caches without rebuilding")
  .action(async (options) => {
    try {
      const redisAvailable = await initRedis()
      if (!redisAvailable) {
        console.error("Error: Redis client not available")
        console.error("This script requires Redis for cache invalidation.")
        await closeRedis()
        process.exit(1)
      }

      if (options.rebuild) {
        console.log("Invalidating and rebuilding death caches...")
        await rebuildDeathCaches()
        console.log("✓ Death caches rebuilt successfully")
      } else {
        console.log("Invalidating death caches...")
        await invalidateDeathCaches()
        console.log("✓ Death caches invalidated successfully")
      }

      await closeRedis()
      process.exit(0)
    } catch (error) {
      logger.error({ error }, "Failed to invalidate death caches")
      console.error("Error:", error)
      await closeRedis()
      process.exit(1)
    }
  })

program.parse()
