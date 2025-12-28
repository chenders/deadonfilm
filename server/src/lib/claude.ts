import Anthropic from "@anthropic-ai/sdk"

let client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null
  }
  if (!client) {
    client = new Anthropic()
  }
  return client
}

export interface ClaudeCauseOfDeathResult {
  causeOfDeath: string | null
  details: string | null
}

export interface ClaudeCauseVerificationResult {
  claudeCause: string | null
  confidence: "high" | "medium" | "low" | null
  reasoning: string | null
}

export type ClaudeModel = "sonnet" | "haiku"

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: "claude-sonnet-4-20250514",
  haiku: "claude-3-haiku-20240307",
}

// Rate limits per model (requests per minute)
// Conservative estimates to avoid hitting limits
const MODEL_RATE_LIMITS: Record<ClaudeModel, number> = {
  sonnet: 50, // Sonnet has stricter limits
  haiku: 100, // Haiku allows more throughput
}

/**
 * Rate limiter for Claude API requests.
 * Ensures we don't exceed rate limits for each model.
 */
export class ClaudeRateLimiter {
  private lastRequestTime: Record<ClaudeModel, number> = {
    sonnet: 0,
    haiku: 0,
  }

  /**
   * Wait if necessary to respect rate limits before making a request.
   * Returns the delay that was applied (in ms).
   */
  async waitForRateLimit(model: ClaudeModel): Promise<number> {
    const requestsPerMinute = MODEL_RATE_LIMITS[model]
    const minDelayMs = Math.ceil(60000 / requestsPerMinute) // Convert to minimum ms between requests

    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime[model]
    const waitTime = Math.max(0, minDelayMs - timeSinceLastRequest)

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime[model] = Date.now()
    return waitTime
  }

  /**
   * Get the minimum delay between requests for a model (in ms).
   */
  getMinDelayMs(model: ClaudeModel): number {
    return Math.ceil(60000 / MODEL_RATE_LIMITS[model])
  }
}

// Singleton rate limiter instance
const rateLimiter = new ClaudeRateLimiter()

/**
 * Get the rate limiter instance for external use (e.g., batch processing).
 */
export function getClaudeRateLimiter(): ClaudeRateLimiter {
  return rateLimiter
}

// Vague causes that should trigger Claude lookup
const VAGUE_CAUSES = [
  "disease",
  "illness",
  "natural causes",
  "natural cause",
  "unspecified",
  "unknown",
]

export function isVagueCause(cause: string | null): boolean {
  if (!cause) return true
  return VAGUE_CAUSES.some((vague) => cause.toLowerCase().includes(vague.toLowerCase()))
}

// Patterns that indicate irrelevant content in death details
const IRRELEVANT_PATTERNS = [
  // Biographical info
  /\bborn in\b/i,
  /\bstudied at\b/i,
  /\beducated at\b/i,
  /\bgraduated from\b/i,
  /\bfounded\b/i,
  /\bco-founded\b/i,

  // Family info
  /\bmarried\b/i,
  /\bdivorced\b/i,
  /\bwidow(er)?\b/i,
  /\bsurvived by\b/i,
  /\bpredeceased\b/i,
  /\bdaughter[s]?\b/i,
  /\bson[s]?\b/i,
  /\bchildren\b/i,
  /\bwife\b/i,
  /\bhusband\b/i,
  /\bspouse\b/i,
  /\bgrandchild/i,

  // Career/filmography
  /\bfilmography\b/i,
  /\bappeared in\b.*\bfilm/i,
  /\bstarred in\b/i,
  /\bknown for\b/i,
  /\bplayed the role\b/i,
  /\* [A-Z]/, // Bullet point lists (filmography)
  /\(\d{4}\)/g, // Years in parentheses (filmography entries like "(1939)")

  // Awards/achievements
  /\baward\b/i,
  /\bnominated\b/i,
  /\bhonored\b/i,

  // Other people's deaths
  /\bhis (father|mother|brother|sister|wife|spouse|partner)\b.*\bdied\b/i,
  /\bher (father|mother|brother|sister|husband|spouse|partner)\b.*\bdied\b/i,
]

// Validate death details and return null if they contain irrelevant content
function validateDeathDetails(
  details: string | null,
  cause: string | null,
  name: string
): string | null {
  if (!details) return null

  // Check for irrelevant patterns
  for (const pattern of IRRELEVANT_PATTERNS) {
    if (pattern.test(details)) {
      console.log(`Details for ${name} rejected: matches pattern ${pattern}`)
      return null
    }
  }

  // Check for cause/details mismatch (e.g., cause is cancer but details say Parkinson's)
  if (cause) {
    const causeLower = cause.toLowerCase()

    // If cause doesn't mention Parkinson's but details do, it's likely wrong
    if (!causeLower.includes("parkinson") && /parkinson/i.test(details)) {
      console.log(`Details for ${name} rejected: Parkinson's mismatch with cause "${cause}"`)
      return null
    }

    // If cause doesn't mention Alzheimer's but details do, it's likely wrong
    if (!causeLower.includes("alzheimer") && /alzheimer/i.test(details)) {
      console.log(`Details for ${name} rejected: Alzheimer's mismatch with cause "${cause}"`)
      return null
    }
  }

  // Check for truncated content (ends with "...")
  if (details.trim().endsWith("...")) {
    console.log(`Details for ${name} rejected: appears truncated`)
    return null
  }

  // Check for very short details that don't add value
  if (details.length < 30) {
    console.log(`Details for ${name} rejected: too short (${details.length} chars)`)
    return null
  }

  return details
}

export async function getCauseOfDeathFromClaude(
  name: string,
  birthYear: number | null,
  deathYear: number,
  model: ClaudeModel = "sonnet"
): Promise<ClaudeCauseOfDeathResult> {
  const anthropic = getClient()
  if (!anthropic) {
    return { causeOfDeath: null, details: null }
  }

  try {
    const birthInfo = birthYear ? ` (born ${birthYear})` : ""
    const prompt = `What was the cause of death for ${name}${birthInfo} who died in ${deathYear}?

CRITICAL RULES:
1. Report ONLY how ${name} personally died - not family members, spouses, or others
2. The "details" field must ONLY explain the medical circumstances leading to ${name}'s death
3. Details must DIRECTLY relate to the stated cause of death

For "cause": Give the specific medical cause (e.g., "lung cancer", "heart attack", "car accident", "stroke")

For "details": ONLY include medical context about THIS PERSON'S death.

GOOD details examples:
- "Had been battling the disease for 3 years before succumbing"
- "Complications arose following surgery"
- "Long history of heart problems contributed to the cardiac event"
- "The cancer had metastasized to other organs"

Return null for details if you only know the basic cause. It's better to return null than include irrelevant information.

NEVER include in details (return null if you're tempted to include these):
- Deaths of other people (spouse, partner, children, parents, siblings)
- Words: "predeceased", "widow", "widower", "survived by", "outlived"
- Marriage history, spouse names, divorce info
- Career achievements, awards, notable roles
- Education, schools attended, training
- Filmography or list of works (no movie/TV titles)
- Tributes, quotes, or praise about the person
- Date, age, or location of death (we already have these)
- Children, family relationships, grandchildren
- Biographical/personal life info unrelated to the death
- Information about how their death was announced or received
- Hospital names or care facility names (unless medically relevant)

VALIDATION: Before responding, verify:
1. Does "details" ONLY discuss ${name}'s medical condition/death?
2. Is "details" consistent with "cause"? (e.g., don't say "Parkinson's" if cause is "cancer")
3. Does "details" avoid ALL the forbidden content above?

If in doubt, return {"cause": "the cause", "details": null}

Respond ONLY with JSON:
{"cause": "specific cause", "details": "medical context only, or null"}

If unknown: {"cause": null, "details": null}`

    // Apply rate limiting before making request
    await rateLimiter.waitForRateLimit(model)

    console.log(`Claude query for: ${name} (died ${deathYear}) using ${model}`)

    const message = await anthropic.messages.create({
      model: MODEL_IDS[model],
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.log(`Claude response not JSON for ${name}: ${responseText}`)
      return { causeOfDeath: null, details: null }
    }

    let parsed: { cause: string | null; details: string | null }

    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      // JSON parsing failed - try to extract values with regex as fallback
      // This handles cases where Claude includes unescaped quotes in the values
      console.log(`Claude JSON parse failed for ${name}, trying regex fallback: ${jsonMatch[0]}`)

      const causeMatch = jsonMatch[0].match(/"cause"\s*:\s*"([^"]*)"/)
      const detailsMatch = jsonMatch[0].match(/"details"\s*:\s*"([^"]*)"/)

      parsed = {
        cause: causeMatch ? causeMatch[1] : null,
        details: detailsMatch ? detailsMatch[1] : null,
      }
    }

    // Validate and potentially reject bad details
    if (parsed.details) {
      const validatedDetails = validateDeathDetails(parsed.details, parsed.cause, name)
      if (validatedDetails !== parsed.details) {
        console.log(`Claude details rejected for ${name}: "${parsed.details?.substring(0, 50)}..."`)
        parsed.details = validatedDetails
      }
    }

    console.log(`Claude result for ${name}: cause="${parsed.cause}", details="${parsed.details}"`)

    return {
      causeOfDeath: parsed.cause,
      details: parsed.details,
    }
  } catch (error) {
    console.error(`Claude error for ${name}:`, error)
    return { causeOfDeath: null, details: null }
  }
}

/**
 * Pass 1: Verify cause of death using Claude (Sonnet by default).
 * Returns the cause, confidence level, and reasoning.
 */
export async function verifyCauseOfDeath(
  name: string,
  birthYear: number | null,
  deathYear: number,
  storedCause: string | null,
  model: ClaudeModel = "sonnet"
): Promise<ClaudeCauseVerificationResult> {
  const anthropic = getClient()
  if (!anthropic) {
    return { claudeCause: null, confidence: null, reasoning: null }
  }

  try {
    const birthInfo = birthYear ? ` (born ${birthYear})` : ""
    const storedCauseInfo = storedCause
      ? `\n\nNote: We currently have "${storedCause}" recorded as the cause. Please verify if this is accurate or if you have more specific/correct information.`
      : ""

    const prompt = `What was the cause of death for ${name}${birthInfo} who died in ${deathYear}?${storedCauseInfo}

Please provide:
1. The specific medical cause of death (e.g., "lung cancer", "heart attack", "Parkinson's disease complications", "car accident")
2. Your confidence level: "high" (well-documented), "medium" (some uncertainty), or "low" (limited information)
3. Brief reasoning explaining your answer

Important:
- Be as specific as possible (e.g., "pancreatic cancer" not just "cancer")
- If a condition led to another (e.g., Parkinson's leading to pneumonia), mention the underlying condition
- Only report how ${name} personally died, not family members

Respond ONLY with JSON:
{"cause": "specific cause or null", "confidence": "high/medium/low", "reasoning": "brief explanation"}

If unknown: {"cause": null, "confidence": null, "reasoning": "No reliable information found"}`

    // Apply rate limiting before making request
    await rateLimiter.waitForRateLimit(model)

    console.log(`Claude cause verification for: ${name} (died ${deathYear}) using ${model}`)

    const message = await anthropic.messages.create({
      model: MODEL_IDS[model],
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.log(`Claude verification response not JSON for ${name}: ${responseText}`)
      return { claudeCause: null, confidence: null, reasoning: null }
    }

    let parsed: { cause: string | null; confidence: string | null; reasoning: string | null }

    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.log(`Claude verification JSON parse failed for ${name}: ${jsonMatch[0]}`)
      const causeMatch = jsonMatch[0].match(/"cause"\s*:\s*"([^"]*)"/)
      const confidenceMatch = jsonMatch[0].match(/"confidence"\s*:\s*"([^"]*)"/)
      const reasoningMatch = jsonMatch[0].match(/"reasoning"\s*:\s*"([^"]*)"/)

      parsed = {
        cause: causeMatch ? causeMatch[1] : null,
        confidence: confidenceMatch ? confidenceMatch[1] : null,
        reasoning: reasoningMatch ? reasoningMatch[1] : null,
      }
    }

    const validConfidence =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : null

    console.log(
      `Claude verification for ${name}: cause="${parsed.cause}", confidence="${validConfidence}"`
    )

    return {
      claudeCause: parsed.cause,
      confidence: validConfidence,
      reasoning: parsed.reasoning,
    }
  } catch (error) {
    console.error(`Claude verification error for ${name}:`, error)
    return { claudeCause: null, confidence: null, reasoning: null }
  }
}

/**
 * Validate death details to reject irrelevant content.
 * Returns the validated details string or null if rejected.
 */
export function validateDeathDetails(details: string, cause: string): string | null {
  const lowerDetails = details.toLowerCase()

  // Reject if it mentions family relationships
  const familyPatterns = [
    /\b(wife|husband|spouse|widow|widower)\b/i,
    /\b(son|daughter|child|children|mother|father|parent)\b/i,
    /\b(married|marriage|divorce|wedding)\b/i,
    /\bsurvived by\b/i,
    /\bpredeceased\b/i,
    /\bfamily\b/i,
  ]

  for (const pattern of familyPatterns) {
    if (pattern.test(details)) {
      console.log(`  Rejected: contains family reference (${pattern})`)
      return null
    }
  }

  // Reject if it's about career/tributes
  const careerPatterns = [
    /\b(career|starring|film|movie|role|actor|actress|hollywood)\b/i,
    /\b(award|oscar|emmy|grammy|tony|golden globe)\b/i,
    /\b(tribute|memorial|remembered|legacy|beloved)\b/i,
    /\b(born in|native of|grew up)\b/i,
  ]

  for (const pattern of careerPatterns) {
    if (pattern.test(details)) {
      console.log(`  Rejected: contains career/tribute reference (${pattern})`)
      return null
    }
  }

  // Reject if it's just repeating the cause without additional context
  const normalizedCause = cause.toLowerCase().replace(/[^a-z]/g, "")
  const normalizedDetails = lowerDetails.replace(/[^a-z]/g, "")
  if (normalizedDetails.length < normalizedCause.length + 20) {
    console.log(`  Rejected: too short to contain meaningful context`)
    return null
  }

  return details
}

/**
 * Pass 2: Get death details using Claude, given a verified cause.
 * The cause is passed to ensure details are consistent with it.
 */
export async function getDeathDetails(
  name: string,
  birthYear: number | null,
  deathYear: number,
  verifiedCause: string,
  model: ClaudeModel = "sonnet"
): Promise<string | null> {
  const anthropic = getClient()
  if (!anthropic) {
    return null
  }

  try {
    const birthInfo = birthYear ? ` (born ${birthYear})` : ""

    const prompt = `${name}${birthInfo} died in ${deathYear} from ${verifiedCause}.

Please provide 1-2 sentences of additional medical context about how ${name} died.

Focus ONLY on:
- Duration of illness (e.g., "battled for 3 years")
- Medical progression (e.g., "complications from surgery", "disease had metastasized")
- Relevant medical history directly related to the death

Do NOT include:
- Date, age, or location of death (we have these)
- Family information (spouse, children, survivors)
- Career achievements, awards, filmography
- How the death was announced or tributes
- Any information about other people's deaths

If you only know the basic cause with no additional medical context, respond with just: null

Respond with ONLY the details text (1-2 sentences) or null. No JSON, no quotes around the response.`

    // Apply rate limiting before making request
    await rateLimiter.waitForRateLimit(model)

    console.log(`Claude details query for: ${name} (cause: ${verifiedCause}) using ${model}`)

    const message = await anthropic.messages.create({
      model: MODEL_IDS[model],
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text.trim() : ""

    // Check for null response
    if (!responseText || responseText.toLowerCase() === "null") {
      console.log(`Claude details: no additional context for ${name}`)
      return null
    }

    // Validate the details
    const validated = validateDeathDetails(responseText, verifiedCause)
    if (!validated) {
      console.log(`Claude details rejected for ${name}: "${responseText.substring(0, 50)}..."`)
      return null
    }

    console.log(`Claude details for ${name}: "${validated.substring(0, 60)}..."`)
    return validated
  } catch (error) {
    console.error(`Claude details error for ${name}:`, error)
    return null
  }
}
