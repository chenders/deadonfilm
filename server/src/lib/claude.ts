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

Please provide:
1. The specific medical cause of death (e.g., "lung cancer", "heart attack", "complications from diabetes")
2. A brief one-sentence explanation if relevant

Respond in this exact JSON format only, with no other text:
{"cause": "specific cause here", "details": "brief explanation or null"}

If you don't know or aren't confident, respond with:
{"cause": null, "details": null}`

    console.log(`Claude query for: ${name} (died ${deathYear})`)

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 150,
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
      const causeNullMatch = jsonMatch[0].match(/"cause"\s*:\s*null/)
      const detailsNullMatch = jsonMatch[0].match(/"details"\s*:\s*null/)

      parsed = {
        cause: causeMatch ? causeMatch[1] : causeNullMatch ? null : null,
        details: detailsMatch ? detailsMatch[1] : detailsNullMatch ? null : null,
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
