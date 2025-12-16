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

CRITICAL: Report ONLY how ${name} personally died. Do NOT confuse with:
- Deaths of their children, parents, siblings, or other family members
- Deaths of co-workers, friends, or colleagues
- Any other person's death mentioned in their biography

Provide:
1. cause: The specific medical cause for ${name}'s death (e.g., "lung cancer", "heart attack")
2. details: ONLY information explaining WHY or HOW ${name} died - underlying conditions, contributing factors, or notable circumstances. Return null if you only know basic facts.

The details field must ONLY contain information about ${name}'s own death. Do not include:
- Deaths of family members or other people
- Marriage/relationship information
- Career achievements or biographical info
- Date, age, or location of death (already known)

Just state facts - no flowery adjectives.

Respond in JSON only:
{"cause": "specific cause", "details": "context about death circumstances, or null"}

If unknown, respond: {"cause": null, "details": null}`

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
