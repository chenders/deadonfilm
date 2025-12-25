#!/usr/bin/env tsx
/**
 * Wrapper script to import all TV show phases with auto-resume and error recovery.
 *
 * Features:
 * - Automatically resumes from checkpoint if one exists
 * - Attempts to self-recover from errors by retrying with --resume when a checkpoint exists
 * - Logs all errors encountered during the run
 * - Provides error summary at the end
 *
 * Usage:
 *   npm run import:shows:all             # Run all phases with auto-resume
 *   npm run import:shows:all -- --fresh  # Start fresh, ignore existing checkpoint
 *
 * Options:
 *   --fresh      Start fresh, ignoring any existing checkpoint
 *   --dry-run    Preview without writing to database
 *
 * Notes:
 *   Retries using --resume require that a checkpoint has already been created for the phase.
 *   If a phase fails before its first checkpoint is written, you may need to rerun that phase
 *   by starting fresh (the script will detect no checkpoint and start from the beginning).
 */

import "dotenv/config"
import { Command } from "commander"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import { createInterface } from "readline"
import { getSyncState, updateSyncState } from "../src/lib/db.js"
import type { ImportPhase } from "../src/lib/import-phases.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Phase configurations in order of execution
export const PHASES: Array<{ phase: ImportPhase; maxShows: number }> = [
  { phase: "popular", maxShows: 500 },
  { phase: "standard", maxShows: 2000 },
  { phase: "obscure", maxShows: 5000 },
]

// Maximum retry attempts per phase
export const MAX_RETRIES = 3

// Delay between retries (in milliseconds)
export const RETRY_DELAY_MS = 5000

// Sync state key (must match import-shows.ts)
export const SYNC_TYPE = "show_import"

export interface PhaseResult {
  phase: ImportPhase
  success: boolean
  attempts: number
  errors: string[]
}

export interface ErrorLog {
  timestamp: Date
  phase: ImportPhase
  attempt: number
  message: string
}

const errorLogs: ErrorLog[] = []

/**
 * Build command line arguments for running a phase.
 * @param phase - The phase to run
 * @param maxShows - Maximum shows to import
 * @param useResume - Whether to use --resume flag
 * @param attempt - Current attempt number (1-indexed)
 * @param dryRun - Whether to use --dry-run flag
 */
export function buildPhaseArgs(
  phase: ImportPhase,
  maxShows: number,
  useResume: boolean,
  attempt: number,
  dryRun: boolean
): string[] {
  const args: string[] = []

  if (useResume && attempt === 1) {
    // First attempt: use --resume if we're resuming
    args.push("--resume")
  } else if (attempt > 1) {
    // Retry attempts: always use --resume
    args.push("--resume")
  } else {
    // Fresh start for this phase
    args.push("--phase", phase, "--max-shows", String(maxShows))
  }

  if (dryRun) {
    args.push("--dry-run")
  }

  return args
}

/**
 * Find the index of a phase in the PHASES array.
 * Returns 0 if phase not found.
 */
export function findPhaseIndex(phase: ImportPhase): number {
  const index = PHASES.findIndex((p) => p.phase === phase)
  return index >= 0 ? index : 0
}

/**
 * Truncate a message to a maximum length, adding ellipsis if truncated.
 */
export function truncateMessage(message: string, maxLength: number = 200): string {
  return message.length > maxLength ? message.slice(0, maxLength) + "..." : message
}

function logError(phase: ImportPhase, attempt: number, message: string): void {
  const entry: ErrorLog = {
    timestamp: new Date(),
    phase,
    attempt,
    message,
  }
  errorLogs.push(entry)
  console.error(`❌ [${phase}] Attempt ${attempt}: ${message}`)
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Prompt the user for confirmation via stdin.
 * Returns true only if the user types exactly "yes".
 */
async function confirmWithUser(prompt: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === "yes")
    })
  })
}

/**
 * Clear the existing checkpoint from the sync_state table.
 */
async function clearCheckpoint(): Promise<void> {
  try {
    await updateSyncState({
      sync_type: SYNC_TYPE,
      last_sync_date: new Date().toISOString().split("T")[0],
      current_phase: null,
      last_processed_id: null,
      phase_total: null,
      phase_completed: null,
      items_processed: 0,
      errors_count: 0,
    })
  } catch (error) {
    console.error(
      "Failed to clear checkpoint. Please check your database connection and try again.",
      error
    )
    throw error
  }
}

/**
 * Run the import-shows.ts script with the given arguments.
 * Returns true if successful, false otherwise.
 */
async function runImportScript(args: string[]): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "import-shows.ts")
    const child = spawn("tsx", [scriptPath, ...args], {
      stdio: ["inherit", "inherit", "pipe"],
      cwd: path.join(__dirname, ".."),
    })

    let stderrOutput = ""

    child.stderr?.on("data", (data) => {
      const text = data.toString()
      stderrOutput += text
      process.stderr.write(data)
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({
          success: false,
          error: stderrOutput.trim() || `Process exited with code ${code}`,
        })
      }
    })

    child.on("error", (err) => {
      // Include any stderr collected before the error occurred
      const stderrMessage = stderrOutput.trim()
      const errorMessage = stderrMessage
        ? `${err.message}\n\nStderr before error:\n${stderrMessage}`
        : err.message
      resolve({ success: false, error: errorMessage })
    })
  })
}

/**
 * Run verification and stats scripts after all phases complete.
 */
async function runPostImportScripts(dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log("\n📊 Skipping verification and stats in dry-run mode\n")
    return
  }

  console.log("\n📊 Running post-import verification and stats...\n")

  // Run verify-shows.ts --fix
  const verifyScript = path.join(__dirname, "verify-shows.ts")
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tsx", [verifyScript, "--fix"], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`verify-shows.ts failed with exit code ${code}`))
      }
    })
  })

  // Run show-import-stats.ts
  const statsScript = path.join(__dirname, "show-import-stats.ts")
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tsx", [statsScript], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`show-import-stats.ts failed with exit code ${code}`))
      }
    })
  })
}

/**
 * Execute a single phase with retry logic.
 */
async function executePhase(
  phase: ImportPhase,
  maxShows: number,
  useResume: boolean,
  dryRun: boolean
): Promise<PhaseResult> {
  const result: PhaseResult = {
    phase,
    success: false,
    attempts: 0,
    errors: [],
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    result.attempts = attempt

    const args = buildPhaseArgs(phase, maxShows, useResume, attempt, dryRun)

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Phase: ${phase.toUpperCase()} (Attempt ${attempt}/${MAX_RETRIES})`)
    console.log(`Command: import-shows ${args.join(" ")}`)
    console.log("=".repeat(60) + "\n")

    const { success, error } = await runImportScript(args)

    if (success) {
      result.success = true
      return result
    }

    // Log the error
    const errorMessage = error || "Unknown error"
    result.errors.push(errorMessage)
    logError(phase, attempt, errorMessage)

    if (attempt < MAX_RETRIES) {
      console.log(`\n⏳ Retrying in ${RETRY_DELAY_MS / 1000} seconds...\n`)
      await delay(RETRY_DELAY_MS)
    }
  }

  return result
}

/**
 * Determine the starting phase based on existing checkpoint.
 */
async function determineStartingPhase(
  fresh: boolean
): Promise<{ phase: ImportPhase; useResume: boolean }> {
  try {
    const syncState = await getSyncState(SYNC_TYPE)

    if (syncState?.current_phase) {
      const currentPhase = syncState.current_phase as ImportPhase
      const phaseCompleted = syncState.phase_completed || 0
      const lastProcessedId = syncState.last_processed_id

      if (fresh) {
        // User requested fresh start but there's an existing checkpoint
        console.log(`\n⚠️  Existing checkpoint found:`)
        console.log(`   Phase: ${currentPhase}`)
        console.log(`   Shows completed: ${phaseCompleted}`)
        console.log(`   Last processed ID: ${lastProcessedId}`)
        console.log(`\nStarting fresh will discard this progress.`)

        const confirmed = await confirmWithUser('Type "yes" to confirm and discard checkpoint: ')

        if (!confirmed) {
          console.log("\nAborted. Run without --fresh to resume from checkpoint.")
          process.exit(0)
        }

        // Clear the checkpoint
        console.log("\nClearing checkpoint...")
        await clearCheckpoint()
        console.log("Checkpoint cleared. Starting fresh.\n")
        return { phase: "popular", useResume: false }
      }

      // Resume from checkpoint
      console.log(`\n📌 Found existing checkpoint for '${currentPhase}' phase`)
      console.log(`   Last processed ID: ${lastProcessedId}`)
      console.log(`   Phase completed: ${phaseCompleted}`)
      return { phase: currentPhase, useResume: true }
    }
  } catch (error) {
    // Database not available or failed to read checkpoint - log and start fresh
    console.warn("[import-shows-all] Failed to get sync state; starting fresh import.", error)
  }

  // No checkpoint exists, fresh start
  return { phase: "popular", useResume: false }
}

interface AllPhaseOptions {
  fresh: boolean
  dryRun: boolean
}

async function runAllPhases(options: AllPhaseOptions): Promise<void> {
  const { fresh, dryRun } = options

  console.log("\n" + "🎬".repeat(30))
  console.log("     TV SHOW IMPORT - ALL PHASES")
  console.log("🎬".repeat(30))
  console.log(`\nMode: ${dryRun ? "DRY RUN" : "LIVE"}`)
  console.log(`Fresh start: ${fresh}`)

  // Determine where to start
  const { phase: startPhase, useResume } = await determineStartingPhase(fresh)
  const startIndex = findPhaseIndex(startPhase)

  const results: PhaseResult[] = []
  let allSucceeded = true

  // Execute phases starting from the determined phase
  for (let i = startIndex; i < PHASES.length; i++) {
    const { phase, maxShows } = PHASES[i]

    // Only use resume for the first phase if we found a checkpoint
    const shouldResume = i === startIndex && useResume

    const result = await executePhase(phase, maxShows, shouldResume, dryRun)
    results.push(result)

    if (!result.success) {
      allSucceeded = false
      console.error(`\n❌ Phase '${phase}' failed after ${result.attempts} attempts`)
      console.error(
        "Stopping import process. Re-run this script without --fresh to resume from the last checkpoint.\n"
      )
      break
    }

    console.log(`\n✅ Phase '${phase}' completed successfully`)
  }

  // Run post-import scripts if all phases succeeded
  if (allSucceeded) {
    await runPostImportScripts(dryRun)
  }

  // Print summary
  printSummary(results, allSucceeded)
}

function printSummary(results: PhaseResult[], allSucceeded: boolean): void {
  console.log("\n" + "=".repeat(60))
  console.log("IMPORT SUMMARY")
  console.log("=".repeat(60))

  // Phase results
  for (const result of results) {
    const status = result.success ? "✅" : "❌"
    const attempts = result.attempts > 1 ? ` (${result.attempts} attempts)` : ""
    console.log(`  ${status} ${result.phase}${attempts}`)
  }

  // Error summary
  if (errorLogs.length > 0) {
    console.log("\n" + "-".repeat(60))
    console.log(`ERRORS ENCOUNTERED: ${errorLogs.length}`)
    console.log("-".repeat(60))

    for (const error of errorLogs) {
      const time = error.timestamp.toISOString().split("T")[1].split(".")[0]
      console.log(`  [${time}] ${error.phase} (attempt ${error.attempt}):`)
      console.log(`    ${truncateMessage(error.message)}`)
    }
  }

  console.log("\n" + "=".repeat(60))

  if (allSucceeded) {
    console.log("🎉 ALL PHASES COMPLETED SUCCESSFULLY")
  } else {
    console.log("⚠️  IMPORT INCOMPLETE - Run again to resume")
  }

  console.log("=".repeat(60) + "\n")

  // Exit with appropriate code
  if (!allSucceeded) {
    process.exit(1)
  }
}

const program = new Command()
  .name("import-shows-all")
  .description("Import all TV show phases with auto-resume and error recovery")
  .option("--fresh", "Start fresh, ignoring any existing checkpoint", false)
  .option("-n, --dry-run", "Preview without writing to database", false)
  .action(async (options: AllPhaseOptions) => {
    await runAllPhases(options)
  })

program.parse()
