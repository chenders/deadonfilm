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
 * - Runs prerequisite scripts serially (dependencies must complete first)
 * - Handles errors gracefully with continue-on-error option
 * - Provides detailed progress tracking and summary reporting
 * - Respects all rate limits with safe buffer
 *
 * Usage:
 *   npm run backfill:ratings -- [options]
 *
 * Options:
 *   --limit <n>              Override limit for all scripts
 *   --skip-phase <name>      Skip specific phase (prerequisites|omdb|trakt|thetvdb-tmdb)
 *   --dry-run                Preview without executing
 *   --verbose                Show detailed script output
 *   --continue-on-error      Don't stop if a script fails
 *
 * Examples:
 *   npm run backfill:ratings -- --limit 100 --dry-run
 *   npm run backfill:ratings -- --skip-phase omdb
 *   npm run backfill:ratings -- --verbose --continue-on-error
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

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
  .option(
    "--skip-phase <name>",
    "Skip phase: prerequisites|omdb|trakt|thetvdb-tmdb"
  )
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
  const scriptPath = path.join(__dirname, scriptName)

  return new Promise((resolve) => {
    console.log(`  Running: ${scriptName} ${args.join(" ")}`)

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

      if (!success && !verbose) {
        console.error(`\n  Error output from ${scriptName}:`)
        console.error(stderr || stdout)
      }

      resolve({
        name: scriptName,
        success,
        duration,
        error: success ? undefined : `Exit code ${code}`,
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

  for (const script of scripts) {
    const result = await runScript(script.name, script.args, options.verbose || false)
    results.push(result)

    if (!result.success) {
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

async function runOrchestration(options: OrchestrationOptions) {
  console.log("🎬 Rating Backfill Orchestration")
  console.log("=".repeat(60))
  console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
  console.log(`Limit override: ${options.limit || "none (using script defaults)"}`)
  console.log(`Skip phase: ${options.skipPhase || "none"}`)
  console.log(`Continue on error: ${options.continueOnError ? "YES" : "NO"}`)
  console.log(`Verbose: ${options.verbose ? "YES" : "NO"}`)

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
        { name: "backfill-movie-imdb-ids.ts", args: [...baseArgs, ...(!options.limit ? ["--limit", "500"] : [])] },
        { name: "backfill-external-ids.ts", args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])] },
      ],
      options
    )
    phaseResults.push(phase1)

    // Stop if prerequisites failed and not continuing on error
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
        { name: "backfill-omdb-ratings.ts", args: [...baseArgs, "--movies-only", ...(!options.limit ? ["--limit", "200"] : [])] },
        { name: "backfill-omdb-ratings.ts", args: [...baseArgs, "--shows-only", ...(!options.limit ? ["--limit", "100"] : [])] },
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
        { name: "backfill-trakt-ratings.ts", args: [...baseArgs, "--movies-only", ...(!options.limit ? ["--limit", "200"] : [])] },
        { name: "backfill-trakt-ratings.ts", args: [...baseArgs, "--shows-only", ...(!options.limit ? ["--limit", "100"] : [])] },
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
        { name: "backfill-thetvdb-scores.ts", args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])] },
        { name: "backfill-movie-popularity.ts", args: [...baseArgs, ...(!options.limit ? ["--limit", "500"] : [])] },
        { name: "backfill-actor-details.ts", args: [...baseArgs, ...(!options.limit ? ["--limit", "200"] : [])] },
      ],
      options
    )
    phaseResults.push(phase4)
  }

  printSummary(phaseResults, overallStartTime)

  // Exit with error if any script failed
  const anyFailed = phaseResults.some((phase) => phase.scripts.some((s) => !s.success))
  if (anyFailed) {
    process.exit(1)
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
      const status = script.success ? "✅" : "❌"
      const time = (script.duration / 1000).toFixed(1)
      console.log(`  ${status} ${script.name} (${time}s)`)
      if (script.error) {
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
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
