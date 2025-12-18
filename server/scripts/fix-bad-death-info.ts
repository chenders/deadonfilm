#!/usr/bin/env tsx
/**
 * Script to identify and fix death info records that incorrectly reference
 * family members' deaths instead of the person's own death.
 *
 * Usage:
 *   npm run fix:death-info              # Scan and show suspicious records
 *   npm run fix:death-info -- --fix     # Re-fetch suspicious records with improved prompt
 *   npm run fix:death-info -- --dry-run # Show what would be fixed without changing
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"
import Anthropic from "@anthropic-ai/sdk"

const { Pool } = pg

// Patterns that suggest the death info is about a family member, not the person
// These are checked as whole words, not substrings
const FAMILY_KEYWORDS = [
  "daughter",
  "son",
  "child",
  "children",
  "wife",
  "husband",
  "mother",
  "father",
  "brother",
  "sister",
  "sibling",
  "nephew",
  "niece",
  "grandson",
  "granddaughter",
]

// Words that contain family keywords but are NOT about family members
const FALSE_POSITIVE_WORDS = [
  "parkinson", // contains "son"
  "parkinsons",
  "parkinson's",
  "johnson", // contains "son"
  "wilson",
  "jackson",
  "nelson",
  "watson",
  "henderson",
  "anderson",
  "person", // contains "son"
  "reason",
  "season",
  "treason",
  "poisoning", // contains "son"
  "motherhood",
  "fatherhood",
  "brotherhood",
  "sisterhood",
]

// Causes that are implausible for adults (suggest confusion with child's death)
const CHILD_CAUSES = [
  "crib death",
  "sids",
  "sudden infant death",
  "stillborn",
  "stillbirth",
  "miscarriage",
]

// Patterns in details that suggest wrong person's death
// These patterns look for explicit mentions of family members' deaths IN the details
// Must be careful not to match "prior to his death" or similar valid phrases
const WRONG_PERSON_PATTERNS = [
  // "his daughter died", "her son was killed" (family member as subject of death verb)
  /(?:his|her|their) (?:daughter|son|child|wife|husband|mother|father|brother|sister) (?:died|was killed|committed suicide|was murdered)/i,
  // "daughter X died", "son X was killed" (named family member death)
  /(?:daughter|son|child|wife|husband|mother|father|brother|sister) [A-Z][a-z]+ (?:died|was killed|committed suicide|was murdered)/i,
  // "death of his/her daughter/son"
  /death of (?:his|her|their) (?:daughter|son|child|wife|husband|mother|father|brother|sister)/i,
  // "after his daughter's death" or "following her son's death"
  /(?:after|following) (?:his|her|their) (?:daughter|son|child|wife|husband|mother|father|brother|sister)'?s? death/i,
  // "when his father died" or "after her mother died"
  /(?:when|after) (?:his|her|their) (?:daughter|son|child|wife|husband|mother|father|brother|sister) died/i,
]

// Helper to check if a string contains false positive words
function containsFalsePositive(text: string): boolean {
  const lower = text.toLowerCase()
  return FALSE_POSITIVE_WORDS.some((word) => lower.includes(word))
}

// Helper to check for family keywords as whole words (not substrings)
function containsFamilyKeyword(text: string): string | null {
  const lower = text.toLowerCase()

  // First check for false positives - if any are present, be more careful
  if (containsFalsePositive(lower)) {
    // Only flag if we find a family keyword that's NOT part of a false positive word
    for (const keyword of FAMILY_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i")
      if (regex.test(lower)) {
        // Check if this keyword is part of a false positive word
        let isFalsePositive = false
        for (const fp of FALSE_POSITIVE_WORDS) {
          if (fp.includes(keyword) && lower.includes(fp)) {
            isFalsePositive = true
            break
          }
        }
        if (!isFalsePositive) {
          return keyword
        }
      }
    }
    return null
  }

  // No false positives, check for whole-word matches
  for (const keyword of FAMILY_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i")
    if (regex.test(lower)) {
      return keyword
    }
  }
  return null
}

interface SuspiciousRecord {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  age_at_death: number | null
  cause_of_death: string | null
  cause_of_death_details: string | null
  reason: string
}

function isSuspicious(record: {
  cause_of_death: string | null
  cause_of_death_details: string | null
  age_at_death: number | null
}): string | null {
  const cause = record.cause_of_death?.toLowerCase() || ""
  const details = record.cause_of_death_details || ""

  // Check for child-specific causes in adults
  if (record.age_at_death && record.age_at_death > 18) {
    for (const childCause of CHILD_CAUSES) {
      if (cause.includes(childCause)) {
        return `Adult (${record.age_at_death}) with child-specific cause: "${childCause}"`
      }
    }
  }

  // Check for family keywords in cause of death (very suspicious)
  // Uses word boundary matching and filters out false positives like "Parkinson's"
  const causeKeyword = containsFamilyKeyword(cause)
  if (causeKeyword) {
    return `Cause contains family keyword: "${causeKeyword}"`
  }

  // Check for family death patterns in details
  // These are specific patterns that indicate the details are about someone else's death
  for (const pattern of WRONG_PERSON_PATTERNS) {
    if (pattern.test(details)) {
      return `Details mention family member's death`
    }
  }

  // Check for excessive biographical content in details (more than 300 chars with family keywords)
  // This catches cases where details include tangential family info
  if (details.length > 300) {
    const detailsKeyword = containsFamilyKeyword(details)
    if (detailsKeyword) {
      return `Long details (${details.length} chars) with family keyword: "${detailsKeyword}"`
    }
  }

  return null
}

// Ask Claude to verify if death info is actually about the person or a family member
async function verifyDeathInfo(
  anthropic: Anthropic,
  name: string,
  cause: string | null,
  details: string | null
): Promise<{ isWrong: boolean; reason: string }> {
  const prompt = `Is this death information about ${name} themselves, or is it mistakenly about a family member's death?

Cause of death: ${cause || "unknown"}
Details: ${details || "none"}

Check if:
1. The cause of death is actually for ${name} (not a child, spouse, parent, sibling)
2. The details describe ${name}'s death (not biographical info about family members who died)

Respond ONLY with JSON:
{"isWrong": true/false, "reason": "brief explanation"}

Examples:
- isWrong: true if cause mentions "SIDS" for an adult (likely child's death)
- isWrong: true if details talk about "his daughter died" or "her son was killed"
- isWrong: false if details mention family context but still describe the person's death
- isWrong: false if cause is accurate even if details are sparse`

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  })

  const responseText = message.content[0].type === "text" ? message.content[0].text : ""
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      return { isWrong: false, reason: "Could not parse response" }
    }
  }
  return { isWrong: false, reason: "No response" }
}

async function refetchDeathInfo(
  anthropic: Anthropic,
  name: string,
  birthYear: number | null,
  deathYear: number
): Promise<{ cause: string | null; details: string | null }> {
  const birthInfo = birthYear ? ` (born ${birthYear})` : ""
  const prompt = `What was the cause of death for ${name}${birthInfo} who died in ${deathYear}?

CRITICAL RULES:
1. Report ONLY how ${name} personally died - not family members or others
2. The "details" field should ONLY explain medical circumstances of the death itself

For "cause": Give the specific medical cause (e.g., "lung cancer", "heart attack", "car accident")

For "details": ONLY include information that explains WHY or HOW they died medically. Examples of GOOD details:
- "Had been battling the disease for 3 years"
- "Complications from surgery"
- "Long history of heart problems"

Return null for details if you only know basic facts. NEVER include:
- Marriage history or spouse names
- Career achievements or awards
- Tributes, quotes, or flowery language
- Date, age, or location (we already have these)
- Children, family relationships
- Any biographical information

Respond ONLY with JSON:
{"cause": "specific cause", "details": "medical context only, or null"}

If unknown: {"cause": null, "details": null}`

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  })

  const responseText = message.content[0].type === "text" ? message.content[0].text : ""
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      return { cause: null, details: null }
    }
  }
  return { cause: null, details: null }
}

const program = new Command()
  .name("fix-bad-death-info")
  .description("Identify and fix death info that incorrectly references family members")
  .option("-f, --fix", "Re-fetch suspicious records with improved prompt")
  .option("-n, --dry-run", "Show what would be fixed without making changes")
  .option("-l, --limit <number>", "Limit number of records to process", "100")
  .option("-v, --verify", "Use Claude to verify suspicious records (requires ANTHROPIC_API_KEY)")
  .action(
    async (options: { fix?: boolean; dryRun?: boolean; limit?: string; verify?: boolean }) => {
      await run(options)
    }
  )

async function run(options: { fix?: boolean; dryRun?: boolean; limit?: string; verify?: boolean }) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let anthropic: Anthropic | null = null

  if ((options.fix || options.verify) && !options.dryRun) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY required for --fix or --verify mode")
      process.exit(1)
    }
    anthropic = new Anthropic()
  }

  try {
    // Find all records with cause of death info
    const result = await pool.query<{
      tmdb_id: number
      name: string
      birthday: string | null
      deathday: string
      age_at_death: number | null
      cause_of_death: string | null
      cause_of_death_details: string | null
    }>(`
      SELECT tmdb_id, name, birthday, deathday, age_at_death, cause_of_death, cause_of_death_details
      FROM deceased_persons
      WHERE cause_of_death IS NOT NULL OR cause_of_death_details IS NOT NULL
      ORDER BY name
    `)

    console.log(`Scanning ${result.rows.length} records with death info...\n`)

    const suspicious: SuspiciousRecord[] = []

    for (const row of result.rows) {
      const reason = isSuspicious(row)
      if (reason) {
        suspicious.push({ ...row, reason })
      }
    }

    console.log(`Found ${suspicious.length} pattern-matched candidates:\n`)

    const limit = parseInt(options.limit || "100", 10)
    const toProcess = suspicious.slice(0, limit)

    // If verify mode, use Claude to filter out false positives
    const verified: Array<SuspiciousRecord & { claudeReason?: string }> = []

    if (options.verify && anthropic) {
      console.log(`Verifying ${toProcess.length} candidates with Claude...\n`)
      console.log("=".repeat(80))

      for (let i = 0; i < toProcess.length; i++) {
        const record = toProcess[i]
        process.stdout.write(`[${i + 1}/${toProcess.length}] ${record.name}... `)

        const verification = await verifyDeathInfo(
          anthropic,
          record.name,
          record.cause_of_death,
          record.cause_of_death_details
        )

        if (verification.isWrong) {
          console.log(`❌ WRONG: ${verification.reason}`)
          verified.push({ ...record, claudeReason: verification.reason })
        } else {
          console.log(`✓ OK`)
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      console.log("\n" + "=".repeat(80))
      console.log(`\nVerified ${verified.length} records with incorrect death info:\n`)
    } else {
      // No verification, just show pattern-matched candidates
      console.log("=".repeat(80))
      verified.push(...toProcess)
    }

    let updatedCount = 0

    for (let i = 0; i < verified.length; i++) {
      const record = verified[i]
      console.log(`\n[${i + 1}/${verified.length}] ${record.name} (ID: ${record.tmdb_id})`)
      console.log(`  Age at death: ${record.age_at_death}`)
      console.log(`  Cause: ${record.cause_of_death}`)
      console.log(`  Details: ${record.cause_of_death_details?.slice(0, 150)}...`)
      console.log(`  Pattern: ${record.reason}`)
      if (record.claudeReason) {
        console.log(`  Claude: ${record.claudeReason}`)
      }

      if (options.fix && anthropic) {
        const birthYear = record.birthday ? new Date(record.birthday).getFullYear() : null
        const deathYear = new Date(record.deathday).getFullYear()

        console.log(`  Refetching...`)
        const newInfo = await refetchDeathInfo(anthropic, record.name, birthYear, deathYear)
        console.log(`  NEW cause: ${newInfo.cause}`)
        console.log(`  NEW details: ${newInfo.details}`)

        if (!options.dryRun) {
          await pool.query(
            `
            UPDATE deceased_persons
            SET cause_of_death = $1,
                cause_of_death_source = 'claude',
                cause_of_death_details = $2,
                cause_of_death_details_source = 'claude',
                updated_at = NOW()
            WHERE tmdb_id = $3
          `,
            [newInfo.cause, newInfo.details, record.tmdb_id]
          )
          console.log(`  ✓ UPDATED`)
          updatedCount++
        } else {
          console.log(`  (dry run - not updated)`)
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }

    if (suspicious.length > limit) {
      console.log(`\n... and ${suspicious.length - limit} more pattern-matched candidates`)
      console.log(`Use --limit to process more`)
    }

    console.log("\n" + "=".repeat(80))
    console.log(`\nSummary:`)
    console.log(`  Total records scanned: ${result.rows.length}`)
    console.log(`  Pattern-matched candidates: ${suspicious.length}`)
    if (options.verify) {
      console.log(`  Claude-verified wrong: ${verified.length}`)
    }
    if (options.fix && !options.dryRun) {
      console.log(`  Records updated: ${updatedCount}`)
    }
  } finally {
    await pool.end()
  }
}

program.parse()
