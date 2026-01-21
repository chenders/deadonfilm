#!/usr/bin/env tsx
/**
 * Backfill cause of death normalizations using Claude AI.
 *
 * This script:
 * 1. Gets all unique cause_of_death values from the actors table
 * 2. Batches them and sends to Claude for intelligent normalization
 * 3. Stores the mappings in the cause_of_death_normalizations table
 *
 * Usage:
 *   npx tsx scripts/backfill-cause-normalizations.ts [--dry-run] [--batch-size=20]
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import Anthropic from "@anthropic-ai/sdk"
import { getPool } from "../src/lib/db/pool"
import { getClaudeRateLimiter } from "../src/lib/claude"
import { recordCliEvent } from "../src/lib/newrelic-cli.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface NormalizationResult {
  original: string
  normalized: string
}

interface NormalizationBatchResult {
  normalizations: NormalizationResult[]
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

async function normalizeCausesWithClaude(
  client: Anthropic,
  causes: string[]
): Promise<NormalizationBatchResult> {
  const prompt = `You are normalizing cause of death strings for database grouping. For each cause, provide a normalized/canonical version.

Rules:
1. Merge case variations: "lung cancer", "Lung cancer" → "Lung cancer"
2. Merge singular/plural: "gunshot wound", "gunshot wounds" → "Gunshot wound"
3. British/American spelling: "tumour" → "tumor"
4. Sentence case: Capitalize first word only, except proper nouns/acronyms
5. Preserve medical accuracy: Don't merge different conditions
6. Acronyms stay uppercase: COVID-19, ALS, AIDS, COPD
7. Simplify: "death from cancer" → "Cancer"
8. Fix obvious typos
9. Choose the most common/recognizable form

Here are the causes to normalize:
${causes.map((c, i) => `${i + 1}. "${c}"`).join("\n")}

Respond with JSON array: [{"original": "exact input", "normalized": "your normalized version"}]`

  const response = await client.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude")
  }

  try {
    // Strip markdown code blocks if present
    let jsonText = content.text.trim()
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
    }

    const results = JSON.parse(jsonText) as NormalizationResult[]
    // Validate the response
    for (const result of results) {
      if (!result.original || !result.normalized) {
        throw new Error("Invalid response structure")
      }
    }
    return {
      normalizations: results,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  } catch (e) {
    console.error("Failed to parse Claude response:", content.text)
    throw e
  }
}

async function main(options: { dryRun: boolean; batchSize: number }) {
  const { dryRun, batchSize } = options
  const db = getPool()

  console.log(`\nBackfilling cause of death normalizations...`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Batch size: ${batchSize}\n`)

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set")
    process.exit(1)
  }

  const client = new Anthropic()
  const rateLimiter = getClaudeRateLimiter()

  // Get all unique causes that don't have normalizations yet
  const result = await db.query<{ cause_of_death: string }>(`
    SELECT DISTINCT a.cause_of_death
    FROM actors a
    LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
    WHERE a.cause_of_death IS NOT NULL
      AND a.cause_of_death != ''
      AND n.original_cause IS NULL
    ORDER BY a.cause_of_death
  `)

  const causes = result.rows.map((r) => r.cause_of_death)
  console.log(`Found ${causes.length} causes needing normalization\n`)

  if (causes.length === 0) {
    console.log("All causes already have normalizations. Done!")
    return
  }

  // Process in batches
  const batches: string[][] = []
  for (let i = 0; i < causes.length; i += batchSize) {
    batches.push(causes.slice(i, i + batchSize))
  }

  console.log(`Processing ${batches.length} batches...\n`)

  let totalProcessed = 0
  let totalErrors = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(`Batch ${i + 1}/${batches.length} (${batch.length} causes)...`)

    try {
      // Rate limit
      await rateLimiter.waitForRateLimit("haiku")

      const result = await normalizeCausesWithClaude(client, batch)
      const normalizations = result.normalizations

      // Record New Relic custom event
      const normalizationsOutput = normalizations
        .map((n) => `${n.original} → ${n.normalized}`)
        .join(" | ")
        .substring(0, 4000)

      recordCliEvent("CauseOfDeathNormalization", {
        batchSize: batch.length,
        causesInput: batch.join(" | ").substring(0, 4000),
        normalizationsOutput,
        model: "claude-opus-4-5-20251101",
        success: true,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      })

      if (dryRun) {
        console.log("  Would insert:")
        for (const n of normalizations) {
          if (n.original !== n.normalized) {
            console.log(`    "${n.original}" → "${n.normalized}"`)
          }
        }
      } else {
        // Insert normalizations
        let insertCount = 0
        let updateCount = 0

        for (const n of normalizations) {
          // Check if mapping already exists
          const existingResult = await db.query<{ normalized_cause: string }>(
            `SELECT normalized_cause FROM cause_of_death_normalizations WHERE original_cause = $1`,
            [n.original]
          )

          const isUpdate = existingResult.rows.length > 0
          if (isUpdate && existingResult.rows[0].normalized_cause !== n.normalized) {
            console.log(
              `    Updating: "${n.original}" from "${existingResult.rows[0].normalized_cause}" → "${n.normalized}"`
            )
            updateCount++
          } else if (!isUpdate && n.original !== n.normalized) {
            insertCount++
          }

          await db.query(
            `INSERT INTO cause_of_death_normalizations (original_cause, normalized_cause)
             VALUES ($1, $2)
             ON CONFLICT (original_cause) DO UPDATE SET normalized_cause = $2`,
            [n.original, n.normalized]
          )
        }

        console.log(
          `  Inserted ${insertCount} new mappings, updated ${updateCount} existing mappings`
        )
      }

      totalProcessed += batch.length
    } catch (error) {
      console.error(`  Error processing batch:`, error)

      // Record failed New Relic event
      recordCliEvent("CauseOfDeathNormalization", {
        batchSize: batch.length,
        model: "claude-opus-4-5-20251101",
        success: false,
        error: error instanceof Error ? error.message.substring(0, 1000) : "Unknown error",
      })

      totalErrors += batch.length
    }

    // Progress
    const progress = ((i + 1) / batches.length) * 100
    console.log(`  Progress: ${progress.toFixed(1)}%\n`)
  }

  console.log(`\nDone!`)
  console.log(`  Processed: ${totalProcessed}`)
  console.log(`  Errors: ${totalErrors}`)

  // Show summary of normalizations that changed
  if (!dryRun) {
    const changedResult = await db.query<{
      original_cause: string
      normalized_cause: string
    }>(`
      SELECT original_cause, normalized_cause
      FROM cause_of_death_normalizations
      WHERE original_cause != normalized_cause
      ORDER BY normalized_cause, original_cause
      LIMIT 50
    `)

    if (changedResult.rows.length > 0) {
      console.log(`\nSample normalizations that changed:`)
      for (const row of changedResult.rows) {
        console.log(`  "${row.original_cause}" → "${row.normalized_cause}"`)
      }
    }
  }

  process.exit(0)
}

const program = new Command()
  .name("backfill-cause-normalizations")
  .description("Use Claude AI to normalize cause of death strings")
  .option("-n, --dry-run", "Preview changes without writing to database")
  .option("-b, --batch-size <number>", "Number of causes per Claude API call", parsePositiveInt, 20)
  .action(async (options) => {
    await main({
      dryRun: options.dryRun ?? false,
      batchSize: options.batchSize,
    })
  })

program.parse()
