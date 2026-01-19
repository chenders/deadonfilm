#!/usr/bin/env tsx
/**
 * Test script for browser authentication and paywalled content access.
 *
 * Tests:
 * 1. NYTimes login flow
 * 2. Session persistence
 * 3. Paywalled article access
 * 4. Integration with death enrichment (link following)
 *
 * Usage:
 *   npx tsx scripts/test-browser-auth.ts                    # Run all tests
 *   npx tsx scripts/test-browser-auth.ts --login-only       # Just test login
 *   npx tsx scripts/test-browser-auth.ts --url <url>        # Fetch specific URL
 *   npx tsx scripts/test-browser-auth.ts --actor <name>     # Test with actor lookup
 */

import { Command } from "commander"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

// Load environment
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env") })

import { Pool } from "pg"
import {
  browserFetchPage,
  shutdownBrowser,
  registerBrowserCleanup,
  isAuthEnabledForUrl,
} from "../src/lib/death-sources/browser-fetch.js"
import {
  getBrowserAuthConfig,
  hasAnyCredentials,
  hasCredentialsForSite,
  getSessionInfo,
  listSessions,
  NYTimesLoginHandler,
} from "../src/lib/death-sources/browser-auth/index.js"
import type { ActorForEnrichment } from "../src/lib/death-sources/types.js"

// Register cleanup
registerBrowserCleanup()

interface TestResult {
  name: string
  success: boolean
  message: string
  details?: Record<string, unknown>
}

const results: TestResult[] = []

function logResult(result: TestResult): void {
  results.push(result)
  const icon = result.success ? "✅" : "❌"
  console.log(`\n${icon} ${result.name}`)
  console.log(`   ${result.message}`)
  if (result.details) {
    for (const [key, value] of Object.entries(result.details)) {
      console.log(`   ${key}: ${JSON.stringify(value)}`)
    }
  }
}

async function testConfiguration(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log("Configuration Check")
  console.log("=".repeat(60))

  const config = getBrowserAuthConfig()

  logResult({
    name: "Browser auth enabled",
    success: config.enabled,
    message: config.enabled ? "Browser authentication is enabled" : "Browser authentication is DISABLED",
    details: {
      sessionStoragePath: config.sessionStoragePath,
      sessionTtlHours: config.sessionTtlHours,
    },
  })

  logResult({
    name: "NYTimes credentials",
    success: hasCredentialsForSite("nytimes"),
    message: hasCredentialsForSite("nytimes")
      ? "NYTimes credentials are configured"
      : "NYTimes credentials NOT configured",
  })

  logResult({
    name: "Washington Post credentials",
    success: hasCredentialsForSite("washingtonpost"),
    message: hasCredentialsForSite("washingtonpost")
      ? "Washington Post credentials are configured"
      : "Washington Post credentials NOT configured",
  })

  logResult({
    name: "CAPTCHA solver",
    success: !!config.captchaSolver,
    message: config.captchaSolver
      ? `CAPTCHA solver configured: ${config.captchaSolver.provider}`
      : "No CAPTCHA solver configured (login may fail if CAPTCHA appears)",
    details: config.captchaSolver
      ? {
          provider: config.captchaSolver.provider,
          timeoutMs: config.captchaSolver.timeoutMs,
          maxCostPerSolve: config.captchaSolver.maxCostPerSolve,
        }
      : undefined,
  })
}

async function testExistingSessions(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log("Existing Sessions")
  console.log("=".repeat(60))

  const sessions = await listSessions()

  if (sessions.length === 0) {
    logResult({
      name: "Stored sessions",
      success: true,
      message: "No existing sessions found (first run)",
    })
    return
  }

  for (const domain of sessions) {
    const info = await getSessionInfo(domain)
    if (info) {
      logResult({
        name: `Session: ${domain}`,
        success: true,
        message: `Session found with ${info.cookieCount} cookies`,
        details: {
          createdAt: info.createdAt,
          lastUsedAt: info.lastUsedAt,
          loginEmail: info.loginEmail || "(not recorded)",
        },
      })
    }
  }
}

async function testNYTimesLogin(): Promise<boolean> {
  console.log("\n" + "=".repeat(60))
  console.log("NYTimes Login Test")
  console.log("=".repeat(60))

  if (!hasCredentialsForSite("nytimes")) {
    logResult({
      name: "NYTimes login",
      success: false,
      message: "Skipped - no credentials configured",
    })
    return false
  }

  const handler = new NYTimesLoginHandler()

  console.log("\nLaunching browser for login test...")
  console.log("(Set BROWSER_FETCH_HEADLESS=false to see the browser)")

  // Import playwright dynamically
  const { chromium } = await import("playwright-core")

  const browser = await chromium.launch({
    headless: process.env.BROWSER_FETCH_HEADLESS !== "false",
  })

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  })

  const page = await context.newPage()

  try {
    const config = getBrowserAuthConfig()
    const result = await handler.login(page, config.captchaSolver)

    logResult({
      name: "NYTimes login",
      success: result.success,
      message: result.success ? "Login successful!" : `Login failed: ${result.error}`,
      details: {
        captchaEncountered: result.captchaEncountered,
        captchaCostUsd: result.captchaCostUsd,
      },
    })

    if (result.success) {
      // Verify we can access logged-in content
      const isLoggedIn = await handler.verifySession(page)
      logResult({
        name: "Session verification",
        success: isLoggedIn,
        message: isLoggedIn
          ? "Session verified - user menu detected"
          : "Session verification failed - may not be fully logged in",
      })

      // Save the session for future use
      const { saveSession } = await import("../src/lib/death-sources/browser-auth/session-manager.js")
      const config = getBrowserAuthConfig()
      await saveSession("nytimes.com", context, config.credentials.nytimes?.email)
      console.log("\n   Session saved for future use")
    }

    return result.success
  } finally {
    await browser.close()
  }
}

async function testPageFetch(url: string): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log(`Fetching: ${url}`)
  console.log("=".repeat(60))

  const authEnabled = isAuthEnabledForUrl(url)
  console.log(`Auth enabled for URL: ${authEnabled}`)

  const result = await browserFetchPage(url)

  logResult({
    name: `Fetch ${new URL(url).hostname}`,
    success: !result.error && result.contentLength > 500,
    message: result.error
      ? `Failed: ${result.error}`
      : `Success - ${result.contentLength} chars in ${result.fetchTimeMs}ms`,
    details: {
      title: result.title?.substring(0, 100),
      contentPreview: result.content?.substring(0, 200) + "...",
      fetchMethod: result.fetchMethod,
    },
  })
}

async function testEnrichmentWithActor(tmdbId: number): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log(`Death Enrichment Test (TMDB ID: ${tmdbId})`)
  console.log("=".repeat(60))

  // Look up actor from database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const result = await pool.query(
      `SELECT id, tmdb_id, name, birthday, deathday, cause_of_death,
              cause_of_death_details, popularity
       FROM actors WHERE tmdb_id = $1`,
      [tmdbId]
    )

    if (result.rows.length === 0) {
      logResult({
        name: `Actor lookup: TMDB ${tmdbId}`,
        success: false,
        message: `Actor with TMDB ID ${tmdbId} not found in database`,
      })
      return
    }

    const row = result.rows[0]
    const actor: ActorForEnrichment = {
      id: row.id,
      tmdbId: row.tmdb_id,
      name: row.name,
      birthday: row.birthday?.toISOString().split("T")[0] || null,
      deathday: row.deathday?.toISOString().split("T")[0] || null,
      causeOfDeath: row.cause_of_death,
      causeOfDeathDetails: row.cause_of_death_details,
      popularity: row.popularity,
    }

    console.log(`\nActor: ${actor.name}`)
    console.log(`  ID: ${actor.id}, TMDB: ${actor.tmdbId}`)
    console.log(`  Death date: ${actor.deathday || "unknown"}`)
    console.log(`  Cause of death: ${actor.causeOfDeath || "unknown"}`)

    // Import and run the orchestrator
    const { DeathEnrichmentOrchestrator } = await import("../src/lib/death-sources/orchestrator.js")

    const orchestrator = new DeathEnrichmentOrchestrator({
      linkFollow: {
        enabled: true,
        maxLinksPerActor: 3,
        maxCostPerActor: 0.05,
        aiLinkSelection: false,
        aiContentExtraction: false,
      },
    })

    console.log("\nRunning enrichment with link following...")
    console.log("This will search sources and follow links (including NYTimes with auth).\n")

    const enrichResult = await orchestrator.enrichActor(actor)

    const hasData = !!(
      enrichResult.circumstances ||
      enrichResult.locationOfDeath ||
      enrichResult.additionalContext
    )

    logResult({
      name: `Enrichment: ${actor.name}`,
      success: hasData,
      message: hasData ? "Found enrichment data" : "No new data found",
      details: {
        circumstances: enrichResult.circumstances?.substring(0, 200) || "(none)",
        location: enrichResult.locationOfDeath || "(none)",
        source: enrichResult.circumstancesSource?.type || "(unknown)",
      },
    })

    // Show raw sources if available
    if (enrichResult.rawSources && enrichResult.rawSources.length > 0) {
      console.log("\n   Raw sources gathered:")
      for (const rawSource of enrichResult.rawSources) {
        console.log(`\n   📰 ${rawSource.sourceName}:`)
        if (rawSource.text) {
          console.log(`      ${rawSource.text.substring(0, 150)}...`)
        }
        if (rawSource.url) {
          console.log(`      URL: ${rawSource.url}`)
        }
      }
    }
  } finally {
    await pool.end()
  }
}

async function testNYTimesArticleFetch(articleUrl?: string): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log("NYTimes Article Fetch Test")
  console.log("=".repeat(60))

  // Use provided URL or a known obituary URL
  const url = articleUrl || "https://www.nytimes.com/2024/01/04/arts/david-soul-dead.html"

  console.log(`\nFetching article: ${url}`)
  console.log("This will use authenticated browser access if available.\n")

  const result = await browserFetchPage(url)

  const hasContent = !result.error && result.contentLength > 1000

  logResult({
    name: "NYTimes article fetch",
    success: hasContent,
    message: hasContent
      ? `Successfully fetched ${result.contentLength} characters in ${result.fetchTimeMs}ms`
      : `Failed: ${result.error || "Content too short"}`,
    details: {
      title: result.title || "(no title)",
      contentPreview: result.content?.substring(0, 300) + "...",
      fetchMethod: result.fetchMethod,
    },
  })

  // Check if content looks like full article (not truncated by paywall)
  if (hasContent) {
    const content = result.content || ""
    const wordCount = content.split(/\s+/).length
    const hasSubscribeText = content.toLowerCase().includes("subscribe") &&
      content.toLowerCase().includes("to continue reading")

    console.log(`\n   Article stats:`)
    console.log(`      Word count: ~${wordCount}`)
    console.log(`      Has paywall text: ${hasSubscribeText ? "YES (may be truncated)" : "No (full article)"}`)
  }
}

async function printSummary(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log("Test Summary")
  console.log("=".repeat(60))

  const passed = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  console.log(`\nTotal: ${results.length} tests`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)

  if (failed > 0) {
    console.log("\nFailed tests:")
    for (const result of results.filter((r) => !r.success)) {
      console.log(`  - ${result.name}: ${result.message}`)
    }
  }
}

// Main
const program = new Command()
  .name("test-browser-auth")
  .description("Test browser authentication and paywalled content access")
  .option("--login-only", "Only test the login flow")
  .option("--url <url>", "Fetch a specific URL")
  .option("--article", "Test fetching a NYTimes article with auth")
  .option("--tmdb <id>", "Test enrichment with actor by TMDB ID (e.g., 3084 for Marlon Brando)")
  .option("--skip-login", "Skip the login test")
  .action(async (options) => {
    try {
      console.log("🔐 Browser Authentication Test Suite")
      console.log("=====================================\n")

      // Always show configuration
      await testConfiguration()

      if (!hasAnyCredentials()) {
        console.log("\n⚠️  No credentials configured. Set environment variables:")
        console.log("   BROWSER_AUTH_ENABLED=true")
        console.log("   NYTIMES_AUTH_EMAIL=your-email")
        console.log("   NYTIMES_AUTH_PASSWORD=your-password")
        console.log("\nSee .env.example for full documentation.")
        return
      }

      // Show existing sessions
      await testExistingSessions()

      if (options.loginOnly) {
        // Just test login
        await testNYTimesLogin()
      } else if (options.url) {
        // Fetch specific URL
        await testPageFetch(options.url)
      } else if (options.article) {
        // Test NYTimes article fetch with auth
        await testNYTimesArticleFetch(typeof options.article === "string" ? options.article : undefined)
      } else if (options.tmdb) {
        // Test enrichment with a real actor from database
        const tmdbId = parseInt(options.tmdb, 10)
        if (isNaN(tmdbId)) {
          console.error("Invalid TMDB ID:", options.tmdb)
          process.exit(1)
        }
        await testEnrichmentWithActor(tmdbId)
      } else {
        // Run all tests
        if (!options.skipLogin) {
          await testNYTimesLogin()
        }

        // Test fetching a public NYTimes page
        console.log("\nTesting public page fetch...")
        await testPageFetch("https://www.nytimes.com/section/obituaries")

        // Test fetching a NYTimes article with authentication
        console.log("\nTesting authenticated article fetch...")
        await testNYTimesArticleFetch()
      }

      await printSummary()
    } catch (error) {
      console.error("\n❌ Fatal error:", error)
      process.exit(1)
    } finally {
      await shutdownBrowser()
    }
  })

program.parse()
