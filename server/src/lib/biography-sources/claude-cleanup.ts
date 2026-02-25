/**
 * Claude-powered biography synthesis (Stage 3).
 *
 * Takes pre-cleaned, multi-source biographical data and synthesizes it
 * into structured narrative biography fields via Claude API.
 *
 * Cost: ~$0.01-0.05 per actor using Sonnet (configurable model).
 */

import newrelic from "newrelic"
import Anthropic from "@anthropic-ai/sdk"
import type { ActorForBiography, RawBiographySourceData, BiographyData } from "./types.js"
import { BiographySourceType, VALID_LIFE_NOTABLE_FACTORS } from "./types.js"
import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
import { sanitizeSourceText } from "../shared/sanitize-source-text.js"
import { getPool } from "../db/pool.js"
import { saveRejectedFactors } from "../rejected-factors.js"

// Sonnet pricing (per million tokens)
const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15

const DEFAULT_MODEL = "claude-sonnet-4-20250514"
const MAX_TOKENS = 4096
const MAX_SOURCE_CHARS = 50_000

const VALID_CONFIDENCE = new Set(["high", "medium", "low"])

/**
 * Result from Claude biography synthesis including cost/token metadata.
 */
export interface BiographySynthesisResult {
  data: BiographyData | null
  costUsd: number
  model: string
  inputTokens: number
  outputTokens: number
  error?: string
}

/**
 * Builds the prompt for Claude biography synthesis.
 *
 * @param actor - Actor info for context
 * @param rawSources - Pre-cleaned source data sorted by reliability
 * @returns The complete prompt text
 */
export function buildBiographySynthesisPrompt(
  actor: ActorForBiography,
  rawSources: RawBiographySourceData[]
): string {
  const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

  const birthPart = birthYear ? `born ${birthYear}` : ""
  const deathPart = deathYear ? `died ${deathYear}` : ""
  const dateParts = [birthPart, deathPart].filter(Boolean).join(", ")
  const dateString = dateParts ? ` (${dateParts})` : ""

  // Sort sources by reliability (highest first)
  const sorted = [...rawSources].sort((a, b) => {
    const aScore = a.reliabilityScore ?? 0
    const bScore = b.reliabilityScore ?? 0
    return bScore - aScore
  })

  // Extract Wikidata structured data (if available)
  const wikidataSource = sorted.find((s) => s.sourceType === BiographySourceType.WIKIDATA_BIO)

  // Build source material section, truncating if needed
  const nonWikidataSources = sorted.filter((s) => s.sourceType !== BiographySourceType.WIKIDATA_BIO)
  const sourceBlocks: string[] = []
  let totalChars = 0

  for (const source of nonWikidataSources) {
    const reliabilityPercent =
      source.reliabilityScore !== undefined
        ? `${(source.reliabilityScore * 100).toFixed(0)}%`
        : "unknown"
    const publicationLabel = source.publication ? source.publication : source.sourceName
    const cleanedText = sanitizeSourceText(source.text)
    const block = `--- ${source.sourceName} (${publicationLabel}, reliability: ${reliabilityPercent}) ---\n${cleanedText}`

    if (totalChars + block.length > MAX_SOURCE_CHARS) {
      // Truncate this source or skip it entirely
      const remaining = MAX_SOURCE_CHARS - totalChars
      if (remaining > 200) {
        sourceBlocks.push(block.substring(0, remaining) + "\n[...truncated]")
      }
      break
    }

    sourceBlocks.push(block)
    totalChars += block.length
  }

  const sourceSection = sourceBlocks.join("\n\n")

  // Build structured data section from Wikidata
  let structuredDataSection = ""
  if (wikidataSource) {
    structuredDataSection = `
STRUCTURED DATA (from Wikidata):
${wikidataSource.text}
`
  }

  return `You are writing a biography for ${actor.name}${dateString}.

This biography is for a website that tracks deceased actors, but the
biography section should read like a biography of a PERSON, not a
celebrity profile. Think of how you'd describe anyone's life — their
childhood, their family, their struggles, what made them who they were
— and only mention their career the way you'd mention anyone's job.

Source material (pre-cleaned, sorted by reliability):

${sourceSection}
${structuredDataSection}
Return JSON only:
{
  "narrative": "Full biography. Adaptive length...",
  "life_notable_factors": ["tags from the VALID set"],
  "birthplace_details": "Rich context about where they grew up...",
  "family_background": "Parents, siblings, family circumstances...",
  "education": "Schools, degrees, scholarships...",
  "pre_fame_life": "What they did before the public knew them...",
  "fame_catalyst": "What single thing catapulted them...",
  "personal_struggles": "Addiction, legal issues, health...",
  "relationships": "Marriages, significant partnerships, children...",
  "lesser_known_facts": ["Array of surprising or little-known facts that are NOT already mentioned in the narrative above. Each fact should add NEW information the reader hasn't already seen."],
  "narrative_confidence": "high|medium|low",
  "has_substantive_content": true/false
}

NARRATIVE STRUCTURE:
- Open with childhood/family background, NOT "born on [date] in [city]"
- Weave in education, early struggles, formative experiences
- Mention what launched them into public life in 1-2 sentences MAX
- Include personal life: relationships, family, challenges
- Describe events as they happened at the time, in their own context. Do NOT frame early events
  as precursors to later identity. A childhood on a farm is just a childhood on a farm — not
  "the early seeds of" anything.
- End with something human and specific, not a career summary. But do NOT circle back to a
  childhood image or theme to create literary closure. Just stop at a natural resting point.
- VARY openings

TONE:
- Write like a well-researched retrospective, not a magazine profile. You are working from
  published sources, not a personal interview — so report what is documented, not what the
  person might have felt or thought.
- Factual but warm — let vivid, specific details carry the emotional weight instead of
  dramatic adjectives
- No superlatives: avoid "renowned", "acclaimed", "legendary", "beloved", "masterful"
- No Wikipedia-isms: avoid "is widely regarded as", "is best known for"
- No purple prose: avoid "profound", "devastating", "fierce", "relentless", "unwavering",
  "tumultuous", "indomitable". If you need an adjective, choose one that is specific and
  precise rather than dramatic.
- Report what happened and what people said. Do NOT infer motivations, inner thoughts, or
  emotional states unless directly quoted from the person or attributed to a named source.
  "He later said he joined the Navy to escape his father" is fine. "His drive came from
  someplace deeper than ambition" is not — that is the writer's invention.
- Trust the reader. Present facts and let them draw their own connections. Do not editorialize
  with phrases like "little did he know" or "it was this very quality that..."
- Specific details over vague praise

BANNED PATTERNS — these appear in AI-generated text and make biographies sound formulaic:
- "that would [define/shape/become/later/eventually]" — foreshadowing. Describe events when
  they happened, not as setup for what came later.
  BAD: "a scrappy resourcefulness that would define his adult life"
  GOOD: "he learned to fix cars, cook meals, and talk his way out of trouble"
- "would [become/go on to/later/eventually]" — same foreshadowing with different construction
- "marked by" — vague literary shorthand. Name what actually happened.
  BAD: "a childhood marked by poverty and loss"
  GOOD: "his family moved four times before he was ten, always one step ahead of the landlord"
- "both [X] and [Y]" to manufacture paradox — e.g., "both fiercely independent and deeply
  loyal." Real people are complex without the narrator pointing it out.
- "instilled in him/her" — speculative causation. You don't know what was instilled unless
  someone said so.
- "shaped his/her" — same problem. Describe what happened; don't narrate what it did to
  the person's character.
- "the [noun] who [past tense verb]" as a closing device — e.g., "The boy who stole apples
  never lost his instinct to help people." This is literary fiction technique, not journalism.

VALID LIFE NOTABLE FACTORS:
[${[...VALID_LIFE_NOTABLE_FACTORS].join(", ")}]

SURVIVOR TAGS: Use the specific survivor type, not a generic "survivor". Pick the one that best matches:
- holocaust_survivor: Survived the Holocaust
- cancer_survivor: Beat cancer or achieved remission
- disaster_survivor: Survived a natural disaster, fire, shipwreck, etc.
- accident_survivor: Survived a serious accident (plane crash, car crash, etc.)
- abuse_survivor: Survived domestic violence, sexual abuse, or similar

WHEN SOURCES CONFLICT:
- Prefer higher reliability sources
- If a fact appears in only one low-reliability source, mark narrative_confidence as "medium" or "low"
- Never present disputed facts as certain

CRITICAL:
- Do NOT list filmography, awards, box office numbers
- Do NOT include birth/death dates (displayed separately on the page)
- Do NOT describe how or when the person died — death circumstances have their own dedicated section on the page. End the narrative before the death event.
- Mention their career only as context for their personal story
- If sources are thin, write a shorter biography rather than padding with career achievements
- Set has_substantive_content to false if you can only produce a generic career summary with no personal details
- Do NOT impose a thematic arc. Real lives are not stories with a thesis. Events can be
  presented chronologically without arguing they all connect to one defining quality.
- Prefer concrete, specific details over abstract characterization. "He ate sardine sandwiches
  for lunch every day for thirty years" tells the reader more than "he was a man of simple
  habits."`
}

/**
 * Calls Claude API with the synthesis prompt and parses the response.
 *
 * @param actor - Actor info for context
 * @param rawSources - Pre-cleaned source data
 * @param config - Optional model configuration
 * @returns Synthesis result with biography data or error
 */
export async function synthesizeBiography(
  actor: ActorForBiography,
  rawSources: RawBiographySourceData[],
  config?: { model?: string }
): Promise<BiographySynthesisResult> {
  const model = config?.model || DEFAULT_MODEL

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      data: null,
      costUsd: 0,
      model,
      inputTokens: 0,
      outputTokens: 0,
      error: "ANTHROPIC_API_KEY environment variable is required for biography synthesis",
    }
  }

  // Sort sources by reliability (highest first)
  const sorted = [...rawSources].sort((a, b) => {
    const aScore = a.reliabilityScore ?? 0
    const bScore = b.reliabilityScore ?? 0
    return bScore - aScore
  })

  const prompt = buildBiographySynthesisPrompt(actor, sorted)

  let response: Anthropic.Message
  try {
    const anthropic = new Anthropic()
    // Wrap Claude API call in New Relic segment
    response = await newrelic.startSegment("BioClaudeAPI", true, async () => {
      return anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      })
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    newrelic.recordCustomEvent("BioClaudeAPIError", {
      actorId: actor.id,
      actorName: actor.name,
      model,
      error: errorMsg,
    })
    if (error instanceof Error) {
      newrelic.noticeError(error, { actorId: actor.id, actorName: actor.name })
    }
    return {
      data: null,
      costUsd: 0,
      model,
      inputTokens: 0,
      outputTokens: 0,
      error: `Claude API error: ${errorMsg}`,
    }
  }

  // Calculate cost
  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const costUsd =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

  // Record Claude API call in New Relic
  newrelic.recordCustomEvent("BioClaudeAPICall", {
    actorId: actor.id,
    actorName: actor.name,
    model,
    inputTokens,
    outputTokens,
    costUsd,
    purpose: "biography_synthesis",
  })

  // Extract text content
  const textBlock = response.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return {
      data: null,
      costUsd,
      model,
      inputTokens,
      outputTokens,
      error: "No text response from Claude",
    }
  }

  // Parse JSON response
  let parsed: Record<string, unknown>
  try {
    const jsonText = stripMarkdownCodeFences(textBlock.text.trim())
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch (error) {
    const parseErrorMsg = error instanceof Error ? error.message : "Unknown error"
    newrelic.recordCustomEvent("BioClaudeParseError", {
      actorId: actor.id,
      actorName: actor.name,
      error: parseErrorMsg,
    })
    if (error instanceof Error) {
      newrelic.noticeError(error, { actorId: actor.id, actorName: actor.name })
    }
    return {
      data: null,
      costUsd,
      model,
      inputTokens,
      outputTokens,
      error: `Failed to parse Claude response as JSON: ${parseErrorMsg}`,
    }
  }

  // Validate life_notable_factors against VALID set
  const allFactors = (
    Array.isArray(parsed.life_notable_factors) ? parsed.life_notable_factors : []
  ).filter((f: unknown): f is string => typeof f === "string")
  const validFactors = allFactors.filter((f) => VALID_LIFE_NOTABLE_FACTORS.has(f))
  const rejectedFactors = allFactors.filter((f) => !VALID_LIFE_NOTABLE_FACTORS.has(f))
  if (rejectedFactors.length > 0) {
    saveRejectedFactors(getPool(), rejectedFactors, "life", actor.id, actor.name)
  }

  // Validate narrative_confidence
  const rawConfidence = parsed.narrative_confidence
  const confidence =
    typeof rawConfidence === "string" && VALID_CONFIDENCE.has(rawConfidence)
      ? (rawConfidence as "high" | "medium" | "low")
      : "medium"

  // Build BiographyData
  const data: BiographyData = {
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : null,
    narrativeConfidence: confidence,
    lifeNotableFactors: validFactors,
    birthplaceDetails:
      typeof parsed.birthplace_details === "string" ? parsed.birthplace_details : null,
    familyBackground:
      typeof parsed.family_background === "string" ? parsed.family_background : null,
    education: typeof parsed.education === "string" ? parsed.education : null,
    preFameLife: typeof parsed.pre_fame_life === "string" ? parsed.pre_fame_life : null,
    fameCatalyst: typeof parsed.fame_catalyst === "string" ? parsed.fame_catalyst : null,
    personalStruggles:
      typeof parsed.personal_struggles === "string" ? parsed.personal_struggles : null,
    relationships: typeof parsed.relationships === "string" ? parsed.relationships : null,
    lesserKnownFacts: Array.isArray(parsed.lesser_known_facts)
      ? parsed.lesser_known_facts.filter((f: unknown): f is string => typeof f === "string")
      : [],
    hasSubstantiveContent:
      typeof parsed.has_substantive_content === "boolean" ? parsed.has_substantive_content : false,
  }

  // Record successful parse in New Relic
  newrelic.recordCustomEvent("BioClaudeParsed", {
    actorId: actor.id,
    actorName: actor.name,
    hasNarrative: !!data.narrative,
    narrativeConfidence: data.narrativeConfidence ?? "unknown",
    factorCount: data.lifeNotableFactors.length,
    hasSubstantiveContent: data.hasSubstantiveContent,
    lesserKnownFactCount: data.lesserKnownFacts.length,
  })

  return {
    data,
    costUsd,
    model,
    inputTokens,
    outputTokens,
  }
}

/**
 * Estimates cost before calling Claude (for budget checking).
 *
 * @param rawSources - Source data to estimate cost for
 * @returns Estimated USD cost
 */
export function estimateSynthesisCost(rawSources: RawBiographySourceData[]): number {
  // Rough estimate: 4 chars per token for input
  const totalChars = rawSources.reduce((sum, s) => sum + s.text.length, 0)
  const estimatedInputTokens = Math.ceil(totalChars / 4) + 1800 // Add overhead for prompt template
  const estimatedOutputTokens = 1500 // Average expected output for biography

  return (
    (estimatedInputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (estimatedOutputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000
  )
}
