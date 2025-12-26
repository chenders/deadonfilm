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
  deathYear: number
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

    console.log(`Claude query for: ${name} (died ${deathYear})`)

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
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
