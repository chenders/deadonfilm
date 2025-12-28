#!/usr/bin/env tsx
/**
 * Sitemap generation and search engine submission script.
 *
 * This script:
 * 1. Generates all sitemap XML files using the sitemap-generator library
 * 2. Computes a combined SHA-256 hash of all sitemap content
 * 3. Compares the hash against the previously stored hash in sync_state
 * 4. If changed (or --force-submit), writes files and submits to search engines
 * 5. Updates sync_state with the new hash
 *
 * Usage:
 *   npm run sitemap:generate                          # Normal generation
 *   npm run sitemap:generate -- --dry-run             # Preview without writing/submitting
 *   npm run sitemap:generate -- --force-submit        # Submit even if unchanged
 *   npm run sitemap:generate -- --output-dir /tmp/sm  # Custom output directory
 */

import "dotenv/config"
import { Command } from "commander"
import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { getPool } from "../src/lib/db.js"
import { generateAllSitemaps } from "../src/lib/sitemap-generator.js"

const SYNC_TYPE = "sitemap_submission"
const BASE_URL = "https://deadonfilm.com"
const DEFAULT_OUTPUT_DIR = "/app/sitemaps"

/**
 * Sanitize a filename to prevent path traversal attacks.
 * Only allows alphanumeric characters, dots, hyphens, and underscores.
 */
function sanitizeFilename(filename: string): string {
  // Remove any path components and validate characters
  const basename = path.basename(filename)
  if (!/^[\w.-]+$/.test(basename)) {
    throw new Error(`Invalid filename: ${filename}`)
  }
  return basename
}

/**
 * Safely join paths with sanitization to prevent path traversal.
 */
function safePathJoin(baseDir: string, filename: string): string {
  const sanitized = sanitizeFilename(filename)
  // nosemgrep: path-join-resolve-traversal - baseDir is hardcoded or from CLI, sanitized validates filename
  const resolvedBase = path.resolve(baseDir)
  // nosemgrep: path-join-resolve-traversal - sanitized is already validated above
  const fullPath = path.join(resolvedBase, sanitized)

  // Ensure the result is still under the base directory
  if (!fullPath.startsWith(resolvedBase)) {
    throw new Error(`Path traversal detected: ${filename}`)
  }
  return fullPath
}

interface SyncState {
  lastHash: string | null
  lastRunAt: Date | null
}

/**
 * Get the current sitemap sync state from database
 */
async function getSyncState(): Promise<SyncState> {
  const db = getPool()
  const result = await db.query<{ last_hash: string | null; last_run_at: Date | null }>(
    "SELECT last_hash, last_run_at FROM sync_state WHERE sync_type = $1",
    [SYNC_TYPE]
  )

  if (result.rows.length === 0) {
    return { lastHash: null, lastRunAt: null }
  }

  return {
    lastHash: result.rows[0].last_hash,
    lastRunAt: result.rows[0].last_run_at,
  }
}

/**
 * Update the sitemap sync state in database
 */
async function updateSyncState(hash: string, itemsProcessed: number): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO sync_state (sync_type, last_sync_date, last_hash, last_run_at, items_processed)
     VALUES ($1, CURRENT_DATE, $2, NOW(), $3)
     ON CONFLICT (sync_type) DO UPDATE SET
       last_sync_date = CURRENT_DATE,
       last_hash = $2,
       last_run_at = NOW(),
       items_processed = $3`,
    [SYNC_TYPE, hash, itemsProcessed]
  )
}

/**
 * Compute a combined SHA-256 hash of all sitemap files
 */
export function computeCombinedHash(files: Map<string, string>): string {
  const hash = crypto.createHash("sha256")
  // Sort by filename for deterministic order
  const sortedEntries = [...files.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [filename, content] of sortedEntries) {
    hash.update(filename)
    hash.update(content)
  }
  return hash.digest("hex")
}

/**
 * Write all sitemap files to the output directory
 */
async function writeFiles(files: Map<string, string>, outputDir: string): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(outputDir, { recursive: true })

  for (const [filename, content] of files) {
    const filePath = safePathJoin(outputDir, filename)
    await fs.writeFile(filePath, content, "utf-8")
    console.log(`  Written: ${filePath}`)
  }
}

/**
 * Write the IndexNow key file for Bing verification
 */
async function writeIndexNowKeyFile(outputDir: string, key: string): Promise<void> {
  const filePath = safePathJoin(outputDir, `${key}.txt`)
  await fs.writeFile(filePath, key, "utf-8")
  console.log(`  Written IndexNow key file: ${filePath}`)
}

/**
 * Submit sitemap to Google via ping URL
 */
export async function submitToGoogle(sitemapUrl: string): Promise<boolean> {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
  try {
    const response = await fetch(pingUrl)
    console.log(`  Google ping: ${response.status} ${response.statusText}`)
    return response.ok
  } catch (error) {
    console.error(`  Google ping failed:`, error)
    return false
  }
}

/**
 * Submit sitemap to Bing via IndexNow API
 */
export async function submitToBing(sitemapUrl: string, key: string): Promise<boolean> {
  const indexNowUrl = `https://api.indexnow.org/indexnow?url=${encodeURIComponent(sitemapUrl)}&key=${key}`
  try {
    const response = await fetch(indexNowUrl)
    console.log(`  IndexNow (Bing): ${response.status} ${response.statusText}`)
    // 200 = success, 202 = accepted for processing
    return response.ok || response.status === 202
  } catch (error) {
    console.error(`  IndexNow submission failed:`, error)
    return false
  }
}

const program = new Command()
  .name("sitemap-generate")
  .description("Generate sitemap files and submit to search engines when changed")
  .option("-o, --output-dir <path>", "Output directory for sitemap files", DEFAULT_OUTPUT_DIR)
  .option("-n, --dry-run", "Preview changes without writing files or submitting")
  .option("-f, --force-submit", "Submit to search engines even if hash unchanged")
  .action(async (options: { outputDir: string; dryRun?: boolean; forceSubmit?: boolean }) => {
    const startTime = Date.now()
    console.log("Sitemap Generation Script")
    console.log("=".repeat(50))

    if (options.dryRun) {
      console.log("DRY RUN MODE - No files will be written or submissions made\n")
    }

    try {
      // Get previous hash from database
      console.log("Fetching previous sync state...")
      const syncState = await getSyncState()
      if (syncState.lastHash) {
        console.log(`  Previous hash: ${syncState.lastHash.substring(0, 16)}...`)
        console.log(`  Last run: ${syncState.lastRunAt?.toISOString() || "never"}`)
      } else {
        console.log("  No previous sync state found")
      }
      console.log()

      // Generate all sitemaps
      console.log("Generating sitemaps...")
      const { files, pageCounts } = await generateAllSitemaps()
      console.log(`  Generated ${files.size} sitemap files`)
      console.log(
        `  Page counts - Movies: ${pageCounts.movies}, Actors: ${pageCounts.actors}, Shows: ${pageCounts.shows}`
      )
      console.log()

      // Compute hash
      const currentHash = computeCombinedHash(files)
      console.log(`Current hash: ${currentHash.substring(0, 16)}...`)

      const hashChanged = currentHash !== syncState.lastHash
      const shouldSubmit = hashChanged || options.forceSubmit

      if (!hashChanged) {
        console.log("Hash unchanged from previous run")
        if (options.forceSubmit) {
          console.log("Force submit enabled - will submit anyway")
        }
      } else {
        console.log("Hash changed - sitemap content has been updated")
      }
      console.log()

      if (!shouldSubmit) {
        console.log("No submission needed. Exiting.")
        await getPool().end()
        process.exit(0)
      }

      // Write files
      if (!options.dryRun) {
        console.log(`Writing files to ${options.outputDir}...`)
        await writeFiles(files, options.outputDir)

        // Write IndexNow key file if key is available
        const indexNowKey = process.env.INDEXNOW_KEY
        if (indexNowKey) {
          await writeIndexNowKeyFile(options.outputDir, indexNowKey)
        }
        console.log()
      } else {
        console.log("Would write files to:", options.outputDir)
        for (const filename of files.keys()) {
          console.log(`  - ${filename}`)
        }
        console.log()
      }

      // Submit to search engines
      const sitemapUrl = `${BASE_URL}/sitemap.xml`

      if (!options.dryRun) {
        console.log("Submitting to search engines...")

        // Submit to Google
        const googleSuccess = await submitToGoogle(sitemapUrl)

        // Submit to Bing via IndexNow (if key is available)
        const indexNowKey = process.env.INDEXNOW_KEY
        let bingSuccess = false
        if (indexNowKey) {
          bingSuccess = await submitToBing(sitemapUrl, indexNowKey)
        } else {
          console.log("  Skipping IndexNow - INDEXNOW_KEY not set")
        }

        console.log()
        console.log("Submission results:")
        console.log(`  Google: ${googleSuccess ? "SUCCESS" : "FAILED"}`)
        console.log(
          `  Bing (IndexNow): ${indexNowKey ? (bingSuccess ? "SUCCESS" : "FAILED") : "SKIPPED"}`
        )
        console.log()

        // Update sync state
        console.log("Updating sync state...")
        await updateSyncState(currentHash, files.size)
        console.log("  Done")
      } else {
        console.log("Would submit to search engines:")
        console.log(`  - Google ping: ${sitemapUrl}`)
        if (process.env.INDEXNOW_KEY) {
          console.log(`  - IndexNow (Bing): ${sitemapUrl}`)
        } else {
          console.log("  - IndexNow (Bing): SKIPPED (INDEXNOW_KEY not set)")
        }
        console.log()
        console.log("Would update sync state with new hash")
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
      console.log()
      console.log(`Completed in ${elapsed}s`)

      await getPool().end()
      process.exit(0)
    } catch (error) {
      console.error("Error:", error)
      await getPool().end()
      process.exit(1)
    }
  })

program.parse()
