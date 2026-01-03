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

async function normalizeCausesWithClaude(
  client: Anthropic,
  causes: string[]
): Promise<NormalizationResult[]> {
  const prompt = `You are helping normalize cause of death strings for a database to enable proper grouping. Given a list of cause of death strings, provide a normalized/canonical version for each.

CRITICAL Rules for normalization:
1. **Merge case variations**: "lung cancer", "Lung cancer", "LUNG CANCER" → all become "Lung cancer"
2. **Merge singular/plural**: "gunshot wound", "gunshot wounds" → all become "Gunshot wound"
3. **Merge British/American spellings**: "tumour" → "tumor", "leukaemia" → "leukemia"
4. **Standardize capitalization**: Use sentence case (capitalize first word only, except proper nouns/acronyms)
5. **Keep medical accuracy**: Don't merge genuinely different conditions (e.g., "heart attack" and "heart failure" are different)
6. **For acronyms**: Keep them uppercase (e.g., "COVID-19", "ALS", "AIDS", "COPD")
7. **Simplify where possible**: "death from cancer" → "Cancer", "died of heart attack" → "Heart attack"
8. **Fix typos**: If you're confident about a typo, fix it
9. **Choose the most common/recognizable form** as the canonical version

Examples:
- "lung cancer", "Lung cancer", "Lung Cancer" → "Lung cancer"
- "gunshot wound", "Gunshot wound", "gunshot wounds", "Gunshot Wounds" → "Gunshot wound"
- "Heart attack", "heart attack", "Myocardial infarction" → "Heart attack" (choose the common term)
- "Parkinson's disease", "parkinsons disease", "Parkinson disease" → "Parkinson's disease"
- "suicide", "Suicide", "died by suicide" → "Suicide"

Here are the causes to normalize:
${causes.map((c, i) => `${i + 1}. "${c}"`).join("\n")}

Respond with a JSON array of objects, each with "original" (exact input) and "normalized" (your normalized version) fields. Only output the JSON array, nothing else.`

  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
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
    return results
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

      const normalizations = await normalizeCausesWithClaude(client, batch)

      if (dryRun) {
        console.log("  Would insert:")
        for (const n of normalizations) {
          if (n.original !== n.normalized) {
            console.log(`    "${n.original}" → "${n.normalized}"`)
          }
        }
      } else {
        // Insert normalizations
        for (const n of normalizations) {
          await db.query(
            `INSERT INTO cause_of_death_normalizations (original_cause, normalized_cause)
             VALUES ($1, $2)
             ON CONFLICT (original_cause) DO UPDATE SET normalized_cause = $2`,
            [n.original, n.normalized]
          )
        }
        console.log(`  Inserted ${normalizations.length} normalizations`)
      }

      totalProcessed += batch.length
    } catch (error) {
      console.error(`  Error processing batch:`, error)
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
