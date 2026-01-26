#!/usr/bin/env tsx
/**
 * Master orchestration script for rating/score backfills
 *
 * Coordinates execution of all rating backfill scripts in the correct dependency order:
 * 1. Prerequisites (movie IMDb IDs, show external IDs)
 * 2. OMDb ratings (movies, shows, episodes)
 * 3. Trakt stats (movies, shows)
 * 4. TheTVDB scores + TMDB popularity + actor details
 *
 * Features:
 * - ✅ API key verification with helpful error messages
 * - ✅ Execution plan preview before running
 * - ✅ Confirmation prompt before database modifications
 * - ✅ Progress indicators for each script
 * - ✅ Circuit breaker support for API outages
 * - ✅ Comprehensive summary reporting
 * - ✅ Graceful error handling
 *
 * Usage:
 *   npm run backfill:ratings -- [options]
 *
 * Options:
 *   --limit <n>              Override limit for all scripts
 *   --skip-phase <name>      Skip specific phase (prerequisites|omdb|trakt|thetvdb-tmdb)
 *   --dry-run                Preview without executing (no confirmation needed)
 *   --verbose                Show detailed script output
 *   --continue-on-error      Don't stop if a script fails
 *
 * Examples:
 *   npm run backfill:ratings -- --limit 100 --dry-run
 *   npm run backfill:ratings -- --skip-phase omdb
 *   npm run backfill:ratings -- --verbose --continue-on-error
 *
 * Check coverage after running:
 *   npm run report:rating-coverage
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import * as readline from "readline"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface OrchestrationOptions {
  limit?: number
  skipPhase?: string
  dryRun?: boolean
  verbose?: boolean
  continueOnError?: boolean
}

interface ScriptResult {
  name: string
  success: boolean
  duration: number
  error?: string
  circuitBreakerTripped?: boolean
}

interface PhaseResult {
  name: string
  scripts: ScriptResult[]
  duration: number
}

const program = new Command()
  .name("orchestrate-rating-backfills")
  .description("Master orchestration script for all rating backfills")
  .option("-l, --limit <number>", "Override limit for all scripts", parsePositiveInt)
  .option("--skip-phase <name>", "Skip phase: prerequisites|omdb|trakt|thetvdb-tmdb")
  .option("-n, --dry-run", "Preview without executing")
  .option("-v, --verbose", "Show detailed script output")
  .option("--continue-on-error", "Don't stop if a script fails")
  .action(async (options: OrchestrationOptions) => {
    await runOrchestration(options)
  })

/**
 * Execute a backfill script and return its result
 */
async function runScript(
  scriptName: string,
  args: string[],
  verbose: boolean
): Promise<ScriptResult> {
  const startTime = Date.now()

  // scriptName comes from hardcoded values in phase definitions below
  // (e.g., "backfill-movie-imdb-ids.ts"). Validate it contains no path separators
  // to satisfy security scanners.
  if (scriptName.includes("/") || scriptName.includes("\\") || scriptName.includes("..")) {
    throw new Error(`Invalid script name: ${scriptName}`)
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const scriptPath = path.resolve(__dirname, scriptName)

  return new Promise((resolve) => {
    const child = spawn("tsx", [scriptPath, ...args], {
      stdio: verbose ? "inherit" : "pipe",
      env: process.env,
    })

    let stdout = ""
    let stderr = ""

    if (!verbose) {
      child.stdout?.on("data", (data) => {
        stdout += data.toString()
      })
      child.stderr?.on("data", (data) => {
        stderr += data.toString()
      })
    }

    child.on("close", (code) => {
      const duration = Date.now() - startTime
      const success = code === 0
      const circuitBreakerTripped = code === 2

      if (!success && !verbose) {
        console.error(`\n  Error output from ${scriptName}:`)
        console.error(stderr || stdout)
      }

      resolve({
        name: scriptName,
        success,
        duration,
        error: success ? undefined : `Exit code ${code}`,
        circuitBreakerTripped,
      })
    })

    child.on("error", (error) => {
      const duration = Date.now() - startTime
      resolve({
        name: scriptName,
        success: false,
        duration,
        error: error.message,
      })
    })
  })
}

/**
 * Run a phase (group of scripts) serially
 */
async function runPhase(
  phaseName: string,
  scripts: Array<{ name: string; args: string[] }>,
  options: OrchestrationOptions
): Promise<PhaseResult> {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`Phase: ${phaseName}`)
  console.log("=".repeat(60))

  const startTime = Date.now()
  const results: ScriptResult[] = []

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i]
    const progress = `[${i + 1}/${scripts.length}]`
    console.log(`\n${progress} Starting: ${script.name}`)

    const result = await runScript(script.name, script.args, options.verbose || false)
    results.push(result)

    if (result.circuitBreakerTripped) {
      console.error(
        `  🚨 ${script.name} circuit breaker tripped - API may be experiencing an outage`
      )
      console.error("  Stopping orchestration immediately to prevent cascading failures\n")
      break
    } else if (!result.success) {
      console.error(`  ❌ ${script.name} failed: ${result.error}`)
      if (!options.continueOnError) {
        console.error("\n  Stopping due to error (use --continue-on-error to override)")
        break
      }
    } else {
      console.log(`  ✅ ${script.name} completed in ${(result.duration / 1000).toFixed(1)}s`)
    }
  }

  const duration = Date.now() - startTime

  return {
    name: phaseName,
    scripts: results,
    duration,
  }
}

/**
 * Verify required API keys and configuration
 */
function verifyConfiguration(skipPhase?: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  // Check database
  if (!process.env.DATABASE_URL) {
    warnings.push("❌ DATABASE_URL is not set (required for all phases)")
    return { valid: false, warnings }
  }

  // Check TMDB (required for prerequisites)
  if (skipPhase !== "prerequisites" && !process.env.TMDB_API_TOKEN) {
    warnings.push("⚠️  TMDB_API_TOKEN is not set (needed for prerequisites phase)")
  }

  // Check OMDb
  if (skipPhase !== "omdb") {
    if (!process.env.OMDB_API_KEY) {
      warnings.push("⚠️  OMDB_API_KEY is not set (needed for OMDb phase)")
      warnings.push("   Get yours at: https://www.omdbapi.com/apikey.aspx ($1/month)")
    }
  }

  // Check Trakt
  if (skipPhase !== "trakt") {
    if (!process.env.TRAKT_CLIENT_ID) {
      warnings.push("⚠️  TRAKT_CLIENT_ID is not set (needed for Trakt phase)")
      warnings.push("   Get yours at: https://trakt.tv/oauth/applications (free)")
    }
  }

  // Check TheTVDB
  if (skipPhase !== "thetvdb-tmdb") {
    if (!process.env.THETVDB_API_KEY) {
      warnings.push("⚠️  THETVDB_API_KEY is not set (needed for TheTVDB phase)")
      warnings.push("   Get yours at: https://thetvdb.com/api-information (free)")
    }
  }

  return { valid: true, warnings }
}

/**
 * Print execution plan
 */
function printExecutionPlan(options: OrchestrationOptions) {
  console.log("\n📋 Execution Plan:")
  console.log("=".repeat(60))

  const phases: Array<{ name: string; scripts: string[] }> = []

  if (options.skipPhase !== "prerequisites") {
    phases.push({
      name: "Phase 1: Prerequisites",
      scripts: [
        "backfill-movie-imdb-ids.ts (limit: " + (options.limit || 500) + ")",
        "backfill-external-ids.ts (limit: " + (options.limit || 200) + ")",
      ],
    })
  }

  if (options.skipPhase !== "omdb") {
    phases.push({
      name: "Phase 2: OMDb Ratings",
      scripts: [
        "backfill-omdb-ratings.ts --movies-only (limit: " + (options.limit || 200) + ")",
        "backfill-omdb-ratings.ts --shows-only (limit: " + (options.limit || 100) + ")",
      ],
    })
  }

  if (options.skipPhase !== "trakt") {
    phases.push({
      name: "Phase 3: Trakt Stats",
      scripts: [
        "backfill-trakt-ratings.ts --movies-only (limit: " + (options.limit || 200) + ")",
        "backfill-trakt-ratings.ts --shows-only (limit: " + (options.limit || 100) + ")",
      ],
    })
  }

  if (options.skipPhase !== "thetvdb-tmdb") {
    phases.push({
      name: "Phase 4: TheTVDB & TMDB",
      scripts: [
        "backfill-thetvdb-scores.ts (limit: " + (options.limit || 200) + ")",
        "backfill-movie-popularity.ts (limit: " + (options.limit || 500) + ")",
        "backfill-actor-details.ts (limit: " + (options.limit || 200) + ")",
      ],
    })
  }

  for (const phase of phases) {
    console.log(`\n${phase.name}`)
    for (const script of phase.scripts) {
      console.log(`  • ${script}`)
    }
  }

  const totalScripts = phases.reduce((sum, p) => sum + p.scripts.length, 0)
  console.log(`\nTotal scripts to run: ${totalScripts}`)
  console.log(`Estimated time: ${Math.ceil(totalScripts * 0.5)}-${totalScripts} minutes`)
  console.log("=".repeat(60))
}

async function runOrchestration(options: OrchestrationOptions) {
  console.log("🎬 Rating Backfill Orchestration")
  console.log("=".repeat(60))
  console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
  console.log(`Limit override: ${options.limit || "none (using script defaults)"}`)
  console.log(`Skip phase: ${options.skipPhase || "none"}`)
  console.log(`Continue on error: ${options.continueOnError ? "YES" : "NO"}`)
  console.log(`Verbose: ${options.verbose ? "YES" : "NO"}`)

  // Verify configuration
  console.log("\n🔍 Checking Configuration...")
  console.log("=".repeat(60))
  const { valid, warnings } = verifyConfiguration(options.skipPhase)

  if (!valid) {
    console.error("\n❌ Configuration check failed:")
    warnings.forEach((w) => console.error(w))
    console.error("\nPlease set the required environment variables and try again.")
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.warn("\n⚠️  Configuration warnings:")
    warnings.forEach((w) => console.warn(w))
    console.warn("\nSome phases may fail without the required API keys.")
    console.warn("You can skip phases with --skip-phase <name>")
  } else {
    console.log("✅ All required API keys found")
  }

  // Print execution plan
  printExecutionPlan(options)

  // Confirmation prompt (skip in dry-run mode)
  if (!options.dryRun) {
    // Skip prompt if stdin is not a TTY (non-interactive mode)
    if (!process.stdin.isTTY) {
      console.log("\n⚠️  Non-interactive mode detected, skipping confirmation...")
    } else {
      console.log("\n⚠️  This will modify the database.")
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      await new Promise<void>((resolve) => {
        rl.question("Press Enter to continue, or Ctrl+C to cancel... ", () => {
          rl.close()
          resolve()
        })
      })
    }
  }

  const baseArgs: string[] = []
  if (options.limit) baseArgs.push("--limit", options.limit.toString())
  if (options.dryRun) baseArgs.push("--dry-run")

  const phaseResults: PhaseResult[] = []
  const overallStartTime = Date.now()

  // Phase 1: Prerequisites (MUST complete for dependent scripts to work)
  if (options.skipPhase !== "prerequisites") {
    const phase1 = await runPhase(
      "Prerequisites",
      [
        {
          name: "backfill-movie-imdb-ids.ts",
          args: [...baseArgs, ...(!options.limit ? ["--limit", "500"] : [])],
        },
        {
          name: "backfill-external-ids.ts",
          args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])],
        },
      ],
      options
    )
    phaseResults.push(phase1)

    // Stop if circuit breaker tripped or if prerequisites failed
    const circuitBreakerTripped = phase1.scripts.some((s) => s.circuitBreakerTripped)
    if (circuitBreakerTripped) {
      printSummary(phaseResults, overallStartTime)
      process.exit(2)
    }

    const allSuccess = phase1.scripts.every((s) => s.success)
    if (!allSuccess && !options.continueOnError) {
      printSummary(phaseResults, overallStartTime)
      process.exit(1)
    }
  }

  // Phase 2: OMDb Ratings (can process movies/shows/episodes independently)
  if (options.skipPhase !== "omdb") {
    const phase2 = await runPhase(
      "OMDb Ratings",
      [
        {
          name: "backfill-omdb-ratings.ts",
          args: [...baseArgs, "--movies-only", ...(!options.limit ? ["--limit", "200"] : [])],
        },
        {
          name: "backfill-omdb-ratings.ts",
          args: [...baseArgs, "--shows-only", ...(!options.limit ? ["--limit", "100"] : [])],
        },
      ],
      options
    )
    phaseResults.push(phase2)
  }

  // Phase 3: Trakt Stats (movies use IMDb IDs, shows use TheTVDB IDs)
  if (options.skipPhase !== "trakt") {
    const phase3 = await runPhase(
      "Trakt Stats",
      [
        {
          name: "backfill-trakt-ratings.ts",
          args: [...baseArgs, "--movies-only", ...(!options.limit ? ["--limit", "200"] : [])],
        },
        {
          name: "backfill-trakt-ratings.ts",
          args: [...baseArgs, "--shows-only", ...(!options.limit ? ["--limit", "100"] : [])],
        },
      ],
      options
    )
    phaseResults.push(phase3)
  }

  // Phase 4: TheTVDB, TMDB popularity, and actor details (independent)
  if (options.skipPhase !== "thetvdb-tmdb") {
    const phase4 = await runPhase(
      "TheTVDB & TMDB",
      [
        {
          name: "backfill-thetvdb-scores.ts",
          args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])],
        },
        {
          name: "backfill-movie-popularity.ts",
          args: [...baseArgs, ...(!options.limit ? ["--limit", "500"] : [])],
        },
        {
          name: "backfill-actor-details.ts",
          args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])],
        },
      ],
      options
    )
    phaseResults.push(phase4)
  }

  printSummary(phaseResults, overallStartTime)

  // Exit with appropriate code
  const circuitBreakerTripped = phaseResults.some((phase) =>
    phase.scripts.some((s) => s.circuitBreakerTripped)
  )
  const anyFailed = phaseResults.some((phase) => phase.scripts.some((s) => !s.success))

  if (circuitBreakerTripped) {
    process.exit(2) // Exit code 2 indicates circuit breaker trip
  } else if (anyFailed) {
    process.exit(1) // Exit code 1 indicates general failure
  }
}

function printSummary(phases: PhaseResult[], startTime: number) {
  const totalDuration = Date.now() - startTime

  console.log("\n" + "=".repeat(60))
  console.log("📊 Orchestration Summary")
  console.log("=".repeat(60))

  for (const phase of phases) {
    console.log(`\n${phase.name}:`)
    for (const script of phase.scripts) {
      const status = script.circuitBreakerTripped ? "🚨" : script.success ? "✅" : "❌"
      const time = (script.duration / 1000).toFixed(1)
      console.log(`  ${status} ${script.name} (${time}s)`)
      if (script.circuitBreakerTripped) {
        console.log(`     Circuit breaker tripped - API outage detected`)
      } else if (script.error) {
        console.log(`     Error: ${script.error}`)
      }
    }
  }

  const totalScripts = phases.reduce((sum, p) => sum + p.scripts.length, 0)
  const successfulScripts = phases.reduce(
    (sum, p) => sum + p.scripts.filter((s) => s.success).length,
    0
  )
  const failedScripts = totalScripts - successfulScripts

  console.log("\n" + "=".repeat(60))
  console.log(`Total runtime: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`)
  console.log(`Scripts executed: ${totalScripts}`)
  console.log(`Successful: ${successfulScripts}`)
  if (failedScripts > 0) {
    console.log(`Failed: ${failedScripts}`)
  }
  console.log("=".repeat(60))

  if (successfulScripts > 0) {
    console.log("\n💡 Next steps:")
    console.log("  • Check coverage: npm run report:rating-coverage")
    console.log("  • Run again with higher --limit to backfill more data")
    console.log("  • Review any failed scripts and check API key configuration")
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
