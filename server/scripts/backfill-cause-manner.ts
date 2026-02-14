#!/usr/bin/env tsx
/**
 * Backfill cause manner mappings using deterministic rules + Claude AI.
 *
 * Step 1: Deterministic classification (~730 causes)
 *   - Matches explicit intent markers (suicide, murder, natural causes, etc.)
 *   - Mechanism-only patterns (gunshot, drowning) are NOT classified here
 *
 * Step 2: Claude classification (~72 ambiguous causes)
 *   - Sends remaining causes to Claude for manner classification
 *   - Instructed to classify mechanism-only as "undetermined"
 *
 * Usage:
 *   npx tsx scripts/backfill-cause-manner.ts [--dry-run] [--batch-size=30]
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

type Manner = "natural" | "accident" | "suicide" | "homicide" | "undetermined"

interface MannerResult {
  cause: string
  manner: Manner
}

// ============================================================================
// Deterministic Rules
// ============================================================================

const SUICIDE_PATTERNS = [
  "suicide",
  "self-inflicted",
  "took own life",
  "took his own life",
  "took her own life",
  "killed himself",
  "killed herself",
  "self-immolation",
]

const HOMICIDE_PATTERNS = [
  "murder",
  "murdered",
  "assassination",
  "assassinated",
  "homicide",
  "killed by",
  "manslaughter",
]

const ACCIDENT_PATTERNS = [
  "accidental",
  "car accident",
  "automobile accident",
  "auto accident",
  "traffic accident",
  "traffic collision",
  "road accident",
  "plane crash",
  "aircraft crash",
  "aviation accident",
  "helicopter crash",
  "motorcycle accident",
  "motorcycle crash",
  "bicycle accident",
  "boating accident",
  "industrial accident",
  "accident",
]

const NATURAL_PATTERNS = [
  // Explicit natural
  "natural causes",
  "old age",
  "age-related",
  "died peacefully",
  "died in sleep",
  "natural death",
  // Cancer
  "cancer",
  "carcinoma",
  "leukemia",
  "leukaemia",
  "lymphoma",
  "melanoma",
  "tumor",
  "tumour",
  "myeloma",
  "sarcoma",
  "malignant",
  "metastatic",
  "neoplasm",
  // Heart
  "heart attack",
  "cardiac arrest",
  "myocardial infarction",
  "heart failure",
  "cardiovascular",
  "coronary",
  "cardiomyopathy",
  "cardiac",
  "heart disease",
  "congestive heart",
  "arrhythmia",
  "aortic",
  // Respiratory
  "pneumonia",
  "copd",
  "emphysema",
  "pulmonary",
  "lung disease",
  "respiratory failure",
  "respiratory",
  "asthma",
  "bronchitis",
  "pulmonary fibrosis",
  "pulmonary embolism",
  // Neurological
  "alzheimer",
  "parkinson",
  "dementia",
  "als",
  "amyotrophic lateral sclerosis",
  "stroke",
  "aneurysm",
  "brain hemorrhage",
  "cerebral",
  "multiple sclerosis",
  "epilepsy",
  "huntington",
  // Infectious
  "covid",
  "coronavirus",
  "aids",
  "hiv",
  "tuberculosis",
  "sepsis",
  "infection",
  "hepatitis",
  "meningitis",
  "influenza",
  // Liver/Kidney
  "liver failure",
  "liver disease",
  "cirrhosis",
  "kidney failure",
  "kidney disease",
  "renal failure",
  "renal disease",
  "hepatic",
  // Other natural
  "diabetes",
  "complications",
  "organ failure",
  "multi-organ failure",
  "multiple organ failure",
  "blood clot",
  "thrombosis",
  "embolism",
  "hemorrhage",
  "internal bleeding",
  "gastro",
  "intestinal",
  "bowel",
  "pancreatitis",
  "peritonitis",
  "appendicitis",
  "ulcer",
  "malnutrition",
  "dehydration",
  "anemia",
  "lupus",
  "sclerosis",
  "fibrosis",
  "circulatory",
  "atherosclerosis",
  "hypertension",
  "hypotension",
  "edema",
]

function classifyDeterministic(cause: string): Manner | null {
  const lower = cause.toLowerCase()

  // Check suicide first (most specific intent markers)
  for (const pattern of SUICIDE_PATTERNS) {
    if (lower.includes(pattern)) return "suicide"
  }

  // Check homicide (explicit intent markers only — not mechanisms)
  for (const pattern of HOMICIDE_PATTERNS) {
    if (lower.includes(pattern)) return "homicide"
  }

  // Check accident (explicit accident markers — not mechanisms)
  for (const pattern of ACCIDENT_PATTERNS) {
    if (lower.includes(pattern)) return "accident"
  }

  // Check natural (disease/medical terms)
  for (const pattern of NATURAL_PATTERNS) {
    if (lower.includes(pattern)) return "natural"
  }

  // Ambiguous — needs Claude
  return null
}

// ============================================================================
// Claude Classification
// ============================================================================

interface ClaudeBatchResult {
  results: MannerResult[]
  usage: { inputTokens: number; outputTokens: number }
}

async function classifyWithClaude(
  client: Anthropic,
  causes: string[]
): Promise<ClaudeBatchResult> {
  const prompt = `You are classifying the manner of death for deceased actors/entertainers.

For each cause of death, classify the MANNER (intent/circumstances) as one of:
- "natural" — disease, illness, medical condition, organ failure, old age
- "accident" — unintentional: car/plane crash, accidental fall, accidental drowning, workplace accident
- "suicide" — intentional self-harm
- "homicide" — killed by another person intentionally
- "undetermined" — mechanism-only descriptions without clear intent (e.g., "gunshot wound", "drowning", "hanging", "stabbing", "overdose" without "accidental")

IMPORTANT RULES:
- "gunshot wound" alone → "undetermined" (could be suicide, homicide, or accident)
- "drowning" alone → "undetermined" (could be accident or suicide)
- "hanging" alone → "undetermined" (could be suicide or accident)
- "overdose" alone → "undetermined" (could be accident or suicide)
- "stabbing" or "stab wound" alone → "undetermined" (could be homicide or accident)
- Only classify as homicide/suicide/accident if the text explicitly states the intent

Causes to classify:
${causes.map((c, i) => `${i + 1}. "${c}"`).join("\n")}

Respond with JSON array: [{"cause": "exact input", "manner": "classification"}]`

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude")
  }

  let jsonText = content.text.trim()
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
  }

  const results = JSON.parse(jsonText) as MannerResult[]
  const validManners = new Set(["natural", "accident", "suicide", "homicide", "undetermined"])
  for (const result of results) {
    if (!result.cause || !result.manner || !validManners.has(result.manner)) {
      throw new Error(`Invalid response: ${JSON.stringify(result)}`)
    }
  }

  return {
    results,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(options: { dryRun: boolean; batchSize: number }) {
  const { dryRun, batchSize } = options
  const db = getPool()

  console.log(`\nBackfilling cause manner mappings...`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Batch size: ${batchSize}\n`)

  // Get all distinct normalized causes that don't have manner mappings yet
  const result = await db.query<{ normalized_cause: string; actor_count: string }>(`
    SELECT
      COALESCE(n.normalized_cause, a.cause_of_death) as normalized_cause,
      COUNT(*) as actor_count
    FROM actors a
    LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
    LEFT JOIN cause_manner_mappings cmm ON COALESCE(n.normalized_cause, a.cause_of_death) = cmm.normalized_cause
    WHERE a.cause_of_death IS NOT NULL
      AND a.cause_of_death != ''
      AND cmm.normalized_cause IS NULL
    GROUP BY COALESCE(n.normalized_cause, a.cause_of_death)
    ORDER BY actor_count DESC
  `)

  const causes = result.rows.map((r) => ({
    cause: r.normalized_cause,
    actorCount: parseInt(r.actor_count, 10),
  }))

  console.log(`Found ${causes.length} unmapped causes\n`)

  if (causes.length === 0) {
    console.log("All causes already have manner mappings. Done!")
    await db.end()
    return
  }

  // Step 1: Deterministic classification
  const deterministic: MannerResult[] = []
  const ambiguous: string[] = []

  for (const { cause } of causes) {
    const manner = classifyDeterministic(cause)
    if (manner) {
      deterministic.push({ cause, manner })
    } else {
      ambiguous.push(cause)
    }
  }

  console.log(`Deterministic: ${deterministic.length} causes classified`)
  console.log(`Ambiguous: ${ambiguous.length} causes need Claude\n`)

  // Insert deterministic results
  if (deterministic.length > 0) {
    const mannerCounts: Record<string, number> = {}
    for (const { manner } of deterministic) {
      mannerCounts[manner] = (mannerCounts[manner] || 0) + 1
    }
    console.log("Deterministic breakdown:")
    for (const [manner, count] of Object.entries(mannerCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${manner}: ${count}`)
    }
    console.log()

    if (!dryRun) {
      let inserted = 0
      for (const { cause, manner } of deterministic) {
        await db.query(
          `INSERT INTO cause_manner_mappings (normalized_cause, manner, source)
           VALUES ($1, $2, 'deterministic')
           ON CONFLICT (normalized_cause) DO NOTHING`,
          [cause, manner]
        )
        inserted++
      }
      console.log(`Inserted ${inserted} deterministic mappings\n`)
    } else {
      console.log("(dry run — skipping inserts)\n")
      // Show samples
      const samples = deterministic.slice(0, 10)
      for (const { cause, manner } of samples) {
        console.log(`  "${cause}" → ${manner}`)
      }
      if (deterministic.length > 10) {
        console.log(`  ... and ${deterministic.length - 10} more\n`)
      }
    }
  }

  // Step 2: Claude classification for ambiguous causes
  if (ambiguous.length > 0) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("Warning: ANTHROPIC_API_KEY not set — skipping Claude classification")
      console.log(`${ambiguous.length} causes left unclassified:`)
      for (const cause of ambiguous.slice(0, 20)) {
        console.log(`  "${cause}"`)
      }
      if (ambiguous.length > 20) {
        console.log(`  ... and ${ambiguous.length - 20} more`)
      }
      await db.end()
      return
    }

    const client = new Anthropic()
    const rateLimiter = getClaudeRateLimiter()

    const batches: string[][] = []
    for (let i = 0; i < ambiguous.length; i += batchSize) {
      batches.push(ambiguous.slice(i, i + batchSize))
    }

    console.log(`Processing ${batches.length} Claude batches...\n`)

    let totalProcessed = 0
    let totalErrors = 0

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      console.log(`Batch ${i + 1}/${batches.length} (${batch.length} causes)...`)

      try {
        await rateLimiter.waitForRateLimit("haiku")

        const { results, usage } = await classifyWithClaude(client, batch)

        recordCliEvent("CauseMannerClassification", {
          batchSize: batch.length,
          model: "claude-sonnet-4-5-20250929",
          success: true,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        })

        if (dryRun) {
          console.log("  Would insert:")
          for (const { cause, manner } of results) {
            console.log(`    "${cause}" → ${manner}`)
          }
        } else {
          for (const { cause, manner } of results) {
            await db.query(
              `INSERT INTO cause_manner_mappings (normalized_cause, manner, source)
               VALUES ($1, $2, 'claude')
               ON CONFLICT (normalized_cause) DO NOTHING`,
              [cause, manner]
            )
          }
          console.log(`  Inserted ${results.length} Claude mappings`)
        }

        totalProcessed += batch.length
      } catch (error) {
        console.error(`  Error processing batch:`, error)
        recordCliEvent("CauseMannerClassification", {
          batchSize: batch.length,
          model: "claude-sonnet-4-5-20250929",
          success: false,
          error: error instanceof Error ? error.message.substring(0, 1000) : "Unknown error",
        })
        totalErrors += batch.length
      }

      const progress = ((i + 1) / batches.length) * 100
      console.log(`  Progress: ${progress.toFixed(1)}%\n`)
    }

    console.log(`Claude classification done:`)
    console.log(`  Processed: ${totalProcessed}`)
    console.log(`  Errors: ${totalErrors}\n`)
  }

  // Summary
  if (!dryRun) {
    const summary = await db.query<{ manner: string; count: string }>(`
      SELECT manner, COUNT(*) as count
      FROM cause_manner_mappings
      GROUP BY manner
      ORDER BY count DESC
    `)

    console.log("Final manner distribution:")
    for (const row of summary.rows) {
      console.log(`  ${row.manner}: ${row.count}`)
    }
  }

  await db.end()
  process.exit(0)
}

const program = new Command()
  .name("backfill-cause-manner")
  .description("Classify cause of death strings by manner (natural/accident/suicide/homicide/undetermined)")
  .option("-n, --dry-run", "Preview changes without writing to database")
  .option("-b, --batch-size <number>", "Number of causes per Claude API call", parsePositiveInt, 30)
  .action(async (options) => {
    try {
      await main({
        dryRun: options.dryRun ?? false,
        batchSize: options.batchSize,
      })
    } catch (error) {
      console.error("Fatal error:", error)
      process.exit(1)
    }
  })

program.parse()
