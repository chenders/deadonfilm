#!/usr/bin/env tsx
/**
 * Diagnostic script to inspect Redis cache contents for recent deaths.
 */
import { initRedis, closeRedis, getRedisClient } from "../src/lib/redis.js"
import { CACHE_PREFIX, buildCacheKey } from "../src/lib/cache.js"

async function main() {
  console.log("Connecting to Redis...\n")

  const redisAvailable = await initRedis()
  if (!redisAvailable) {
    console.error("❌ Redis is not available")
    process.exit(1)
  }

  const client = getRedisClient()
  if (!client) {
    console.error("❌ Redis client is null")
    process.exit(1)
  }

  console.log("✅ Connected to Redis\n")

  // Check for recent-deaths keys
  console.log("Scanning for recent-deaths keys...\n")
  const pattern = `${CACHE_PREFIX.RECENT_DEATHS}:*`
  const keys = await client.keys(pattern)

  if (keys.length === 0) {
    console.log("❌ No recent-deaths cache keys found")
    console.log(`   Pattern searched: ${pattern}\n`)
  } else {
    console.log(`✅ Found ${keys.length} recent-deaths cache keys:\n`)

    for (const key of keys) {
      console.log(`📦 Key: ${key}`)
      const ttl = await client.ttl(key)
      console.log(`   TTL: ${ttl} seconds (${Math.floor(ttl / 3600)} hours)`)

      const data = await client.get(key)
      if (data) {
        const parsed = JSON.parse(data)
        if (parsed.deaths && Array.isArray(parsed.deaths)) {
          console.log(`   Deaths count: ${parsed.deaths.length}`)
          if (parsed.deaths.length > 0) {
            console.log(`   First death: ${parsed.deaths[0].name} (${parsed.deaths[0].deathday})`)
            console.log(
              `   Last death: ${parsed.deaths[parsed.deaths.length - 1].name} (${parsed.deaths[parsed.deaths.length - 1].deathday})`
            )
          } else {
            console.log(`   ⚠️  EMPTY ARRAY - no deaths in cache!`)
          }
        } else {
          console.log(`   ⚠️  Invalid data structure:`, parsed)
        }
      } else {
        console.log(`   ⚠️  Key exists but has no data`)
      }
      console.log()
    }
  }

  // Also check for the specific keys that should be rebuilt
  console.log("\nChecking specifically for limit 5, 10, 20 (the ones rebuilt):")
  for (const limit of [5, 10, 20]) {
    const key = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { limit })
    const exists = await client.exists(key)
    console.log(`  ${key}: ${exists ? "✅ EXISTS" : "❌ NOT FOUND"}`)
  }

  // Check for limit 8 (used by homepage)
  console.log("\nChecking for limit 8 (used by homepage RecentDeaths component):")
  const key8 = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { limit: 8 })
  const exists8 = await client.exists(key8)
  console.log(`  ${key8}: ${exists8 ? "✅ EXISTS" : "❌ NOT FOUND"}`)
  if (exists8) {
    const data = await client.get(key8)
    if (data) {
      const parsed = JSON.parse(data)
      console.log(`  Deaths in cache: ${parsed.deaths?.length || 0}`)
      if (parsed.deaths && parsed.deaths.length > 0) {
        console.log("\n  Cached deaths:")
        parsed.deaths.forEach((d: { name: string; deathday: string }, i: number) => {
          console.log(`    ${i + 1}. ${d.name} - ${d.deathday}`)
        })
      }
    }
  }

  await closeRedis()
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
