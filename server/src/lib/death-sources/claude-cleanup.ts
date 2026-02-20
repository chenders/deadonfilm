/**
 * Claude Opus 4.5 cleanup module for death enrichment.
 *
 * Takes raw data gathered from multiple sources (Wikipedia, BFI, DuckDuckGo, etc.)
 * and passes it to Claude Opus 4.5 to extract clean, structured death information
 * suitable for display on the /death page.
 *
 * The cleanup step:
 * 1. Removes Wikipedia citation markers [1][2]
 * 2. Filters out career achievements unless death-related
 * 3. Creates comprehensive, publication-ready narratives
 * 4. Extracts structured fields (cause, location, notable factors)
 */

import Anthropic from "@anthropic-ai/sdk"
import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
import { DeathMannerSchema } from "../claude-batch/schemas.js"
import type {
  ActorForEnrichment,
  CleanedDeathInfo,
  RawSourceData,
  ConfidenceLevel,
  ProjectReference,
  CareerStatus,
  RelatedCelebrity,
} from "./types.js"
import { sanitizeSourceText } from "../shared/sanitize-source-text.js"
import { getEnrichmentLogger } from "./logger.js"
import newrelic from "newrelic"

const MODEL_ID = "claude-opus-4-5-20251101"
const MAX_TOKENS = 3000

/**
 * Valid notable_factors tags that Claude is allowed to return.
 * Any tags not in this set are filtered out to prevent Claude from
 * confusing categories (e.g. "respiratory", "neurological") with notable_factors.
 */
export const VALID_NOTABLE_FACTORS = new Set([
  "on_set",
  "vehicle_crash",
  "plane_crash",
  "fire",
  "drowning",
  "fall",
  "electrocution",
  "exposure",
  "overdose",
  "substance_involvement",
  "poisoning",
  "suicide",
  "homicide",
  "assassination",
  "terrorism",
  "suspicious_circumstances",
  "investigation",
  "controversial",
  "media_sensation",
  "celebrity_involvement",
  "multiple_deaths",
  "family_tragedy",
  "public_incident",
  "workplace_accident",
  "medical_malpractice",
  "surgical_complications",
  "misdiagnosis",
  "natural_causes",
  "alzheimers",
  "cancer",
  "heart_disease",
  "covid_related",
  "pandemic",
  "war_related",
  "autoerotic_asphyxiation",
  "found_dead",
  "young_death",
])

/** Manners of death considered "violent" for the violent_death boolean derivation. */
const VIOLENT_MANNERS = ["homicide", "suicide", "accident"]

/**
 * Derive violent_death boolean from death_manner.
 * Returns undefined if manner is null/undefined (no data to derive from).
 */
export function isViolentDeath(manner: string | null | undefined): boolean | undefined {
  if (manner == null) return undefined
  return VIOLENT_MANNERS.includes(manner)
}

// Cost per million tokens (Opus 4.5)
const INPUT_COST_PER_MILLION = 15
const OUTPUT_COST_PER_MILLION = 75

/**
 * Response structure expected from Claude.
 */
interface ClaudeCleanupResponse {
  cause: string | null
  cause_confidence: ConfidenceLevel | null
  details: string | null
  details_confidence: ConfidenceLevel | null
  circumstances: string | null
  circumstances_confidence: ConfidenceLevel | null
  rumored_circumstances: string | null
  notable_factors: string[] | null
  categories: string[] | null
  location_of_death: string | null
  related_deaths: string | null
  additional_context: string | null
  // Date confidence
  birthday_confidence: ConfidenceLevel | null
  deathday_confidence: ConfidenceLevel | null
  // Career context
  career_status_at_death: CareerStatus | null
  last_project: ProjectReference | null
  posthumous_releases: ProjectReference[] | null
  // Related celebrities
  related_celebrities: Array<{
    name: string
    relationship: string
  }> | null
  // Manner of death
  manner: "natural" | "accident" | "suicide" | "homicide" | "undetermined" | "pending" | null
  // Quality gate
  has_substantive_content: boolean
}

/**
 * Build the cleanup prompt for Claude Opus 4.5.
 */
export function buildCleanupPrompt(actor: ActorForEnrichment, rawSources: RawSourceData[]): string {
  const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  const rawDataSection = rawSources
    .map((s) => {
      const reliabilityLabel =
        s.reliabilityScore !== undefined
          ? `, reliability: ${(s.reliabilityScore * 100).toFixed(0)}%`
          : ""
      const cleanedText = sanitizeSourceText(s.text)
      return `--- ${s.sourceName} (confidence: ${(s.confidence * 100).toFixed(0)}%${reliabilityLabel}) ---\n${cleanedText}`
    })
    .join("\n\n")

  return `You are extracting death information for ${actor.name} (${birthInfo}died ${deathYear}).

Raw data gathered from multiple sources:

${rawDataSection}

Extract ALL death-related information into clean, factual prose written in the tone of a local news site. Return JSON with these fields:

{
  "cause": "specific medical cause (e.g., 'pancreatic cancer', 'heart failure', 'hantavirus pulmonary syndrome'). Null if unknown.",
  "cause_confidence": "high|medium|low|disputed",
  "details": "2-4 sentences about the immediate cause of death. Adapt to manner of death:
    - NATURAL DEATHS: Medical context (diagnosis timeline, organ failure, treatment attempted)
    - VIOLENT DEATHS (homicide, assassination, accident): Forensic/investigative findings (autopsy results, ballistics, toxicology, medical examiner ruling, manner of death determination)
    - OVERDOSE: Toxicology findings, substances involved, accidental vs intentional ruling
    - SUICIDE: Method, medical examiner findings, toxicology if relevant
    This is a SHORT summary; put extensive history in circumstances instead. Null if no details available.",
  "details_confidence": "high|medium|low|disputed",

  "birthday_confidence": "high|medium|low|disputed - based on source agreement and reliability. Null if not discussed.",
  "deathday_confidence": "high|medium|low|disputed - based on source agreement and reliability. Null if not discussed.",

  "circumstances": "COMPREHENSIVE narrative of the death. This is the main content for the death page. Structure the narrative based on the MANNER OF DEATH:

    FOR VIOLENT DEATHS (homicide, assassination, accident, crash, drowning, fire):
    1. Lead with THE EVENT — what happened, when, where, who was involved
    2. Investigation — police, FBI, forensic findings, witnesses, evidence
    3. Legal proceedings — arrests, trials, convictions, sentences
    4. Aftermath — funeral, public reaction, legacy impact
    5. Health history ONLY if independently notable (e.g., JFK's hidden Addison's disease is notable in its own right; a murder victim's high blood pressure is not)

    FOR SUICIDE:
    1. Lead with the event and discovery
    2. Investigation and medical examiner findings
    3. Brief mental health context and prior attempts (1-2 sentences — detailed history belongs in the biography)
    4. Other contributing factors, preceding events

    FOR OVERDOSE:
    1. Lead with the event and discovery
    2. Toxicology findings, substances identified
    3. Brief context on substance history if publicly known (1-2 sentences — detailed history belongs in the biography)
    4. Accidental vs intentional determination

    FOR NATURAL DEATHS:
    1. Lead with the medical conditions that caused or contributed to the death — diagnosis timeline, treatment, and decline
    2. Other health conditions only if they contributed to or complicated the cause of death
    3. Progression of final illness or decline
    4. The death itself — how, when, where, who was present

    FOR ALL DEATHS, also include when relevant:
    - How and when the body was discovered, by whom
    - Location details (home, hospital, on set, etc.)
    - Other people involved or affected (family members who also died, witnesses)
    - First responder/medical examiner findings
    - Media coverage significance if it was a major news story
    - Anything unusual, tragic, or newsworthy about the circumstances

    IMPORTANT: This narrative will be displayed on the actor's page alongside a separate biography section that covers their personal life, struggles, and history in detail. Keep the death narrative focused on the DEATH EVENT and its direct medical/investigative context. When substance abuse, mental health, or medical history is relevant to the death, provide a brief summary (1-2 sentences) rather than a full biographical account. For example, 'Fisher had publicly discussed her struggles with addiction and bipolar disorder throughout her life' is sufficient context — do not retell the full history of their personal battles.

    Write as clean, factual prose in a tone similar to a local news site. Multiple paragraphs are fine.",
  "circumstances_confidence": "high|medium|low|disputed",

  "rumored_circumstances": "Alternative accounts, disputed information, conspiracy theories, or unconfirmed reports. Be COMPREHENSIVE for controversial or high-profile deaths. Include:
    - Each major alternative theory SEPARATELY — don't lump them into vague summaries
    - Name specific investigations and their conclusions (e.g., Warren Commission concluded X, HSCA concluded Y)
    - Name specific people who proposed or championed each theory
    - Cite specific books, documentaries, and investigative reports by title and author/director when known
    - Describe key evidence cited for and against each theory
    - Note how theories evolved over time (declassified documents, deathbed confessions, forensic re-analysis, new witness testimony)
    - Include official investigations that contradicted each other
    - Include family disputes about cause of death, medical/forensic disputes between experts
    - Write multiple paragraphs if warranted — a single vague sentence is insufficient for deaths like JFK, Marilyn Monroe, or Bruce Lee
    Null if there are genuinely no alternative accounts or disputed information.",

  "notable_factors": ["array of tags describing notable aspects. Use any applicable from:
    on_set, vehicle_crash, plane_crash, fire, drowning, fall, electrocution, exposure,
    overdose, substance_involvement, poisoning,
    suicide, homicide, assassination, terrorism,
    suspicious_circumstances, investigation, controversial, media_sensation,
    celebrity_involvement, multiple_deaths, family_tragedy, public_incident,
    workplace_accident, medical_malpractice, surgical_complications, misdiagnosis,
    natural_causes, alzheimers, cancer, heart_disease, covid_related, pandemic,
    war_related, autoerotic_asphyxiation, found_dead, young_death"],

  "categories": ["array of medical/contributing factor categories. Use: cancer, heart-disease, neurological, respiratory, natural, accident, infectious, liver-kidney, suicide, overdose, homicide. Multiple allowed, e.g. ['cancer', 'respiratory']. Null if unknown."],

  "location_of_death": "city, state/province, country where they died. Null if unknown.",

  "manner": "natural|accident|suicide|homicide|undetermined|pending - medical examiner classification. null if unknown.",

  "related_deaths": "If family members or others died in connection (same incident, discovered together, etc.), describe here with names, relationships, causes, and timeline. Null if none.",

  "related_celebrities": [{"name": "Celebrity Name", "relationship": "spouse/co-star/friend/etc."}] - celebrities mentioned in the death circumstances or related to it. Include the nature of their relationship. Null if none relevant.",

  "career_status_at_death": "active|semi-retired|retired|hiatus|unknown - what was their career status when they died? Were they still actively working, had they retired, or were they on a break?",

  "last_project": {"title": "Project Name", "year": 2023, "tmdb_id": null, "imdb_id": null, "type": "movie|show|documentary|unknown"} - their last known film/TV project before death. Null if unknown.",

  "posthumous_releases": [{"title": "Project Name", "year": 2024, "tmdb_id": null, "imdb_id": null, "type": "movie|show|documentary|unknown"}] - projects released after their death. Null if none.",

  "additional_context": "Career context relevant to the death (e.g., 'had retired from acting in 2004', 'was filming at the time', 'won two Academy Awards'). Null if not relevant or no notable context.",

  "has_substantive_content": true/false - Set to FALSE if you cannot provide meaningful death details beyond generic statements such as: information is limited, no details available, cause of death was not disclosed, or similar. Set to FALSE if the sources contain JavaScript code, HTML fragments, website markup, or technical code instead of natural language biography text. Set to TRUE only if there are actual facts about the death circumstances, medical history, cause of death, or specific details about how/where/when they died. A death page should only be created when there is real information to share.
}

CRITICAL INSTRUCTIONS:
- When sources CONFLICT on factual claims (cause of death, dates, locations), PREFER data from sources with higher reliability scores. A 95% reliability source (e.g., AP News, NYT) should take precedence over a 35% reliability source (e.g., Find a Grave, IMDb). Confidence measures text relevance; reliability measures publisher trustworthiness.
- ADAPT narrative structure to manner of death: for violent deaths (homicide, assassination, accident), the violent event IS the story — lead with it. For natural deaths, medical history IS the story — lead with it. Do NOT bury an assassination under paragraphs of medical history.
- Be THOROUGH in circumstances - capture the full story, not just the medical cause
- Include medical history that CAUSED or CONTRIBUTED to the death: heart conditions, cancer battles, transplants, chronic illnesses, medical devices, significant surgeries — but for violent deaths, only include health history if it is independently notable (well-known in its own right), not as a preamble to the actual death event
- For substance abuse, mental health, or personal struggles: provide brief context (1-2 sentences) when relevant to the death, but do NOT retell the full biographical history — that belongs in the separate biography section
- Be COMPREHENSIVE in rumored_circumstances for controversial or high-profile deaths — a single vague sentence summarizing "there are conspiracy theories" is INSUFFICIENT. Name specific theories, investigations, people, books, and evidence. Multiple detailed paragraphs are expected for deaths like JFK, Marilyn Monroe, Bruce Lee, etc.
- If the death was a major news story, capture WHY it was newsworthy
- Include related deaths (spouse, family) if they're part of the story
- Include related_celebrities if any notable people are mentioned in the death story
- Fill in career_status_at_death based on any mentions of their work status
- Fill in last_project and posthumous_releases if mentioned in sources
- Remove Wikipedia citation markers [1][2], "citation needed" tags
- Remove formatting artifacts from web scraping
- Do NOT include career achievements, filmography, or awards unless directly death-related
- Write clean, factual prose in a tone similar to a local news site
- VARY your opening sentences — do NOT start every narrative with "[Name] had a long..." or "[Name] had a complicated medical history" or similar formulaic openings. Each person's story is unique; start with the most distinctive or newsworthy aspect of their death. Some openings might lead with a date, others with a location, others with a dramatic event, others with a diagnosis. Avoid repetitive sentence structures across different people.
- Use null for any field where information is not available
- Set has_substantive_content to FALSE if the sources only say things like "cause unknown", "no details released", "information is limited" - we don't want to create death pages that just say "we don't know anything"
- Set has_substantive_content to FALSE if the sources contain JavaScript code, function definitions, variable declarations, website markup, or other technical/programming content instead of actual biographical information
- Return ONLY valid JSON, no markdown code fences`
}

/**
 * Clean up raw data with Claude Opus 4.5.
 *
 * @param actor - The actor to clean up data for
 * @param rawSources - Raw data gathered from various sources
 * @returns Cleaned, structured death information
 */
/** Result from Claude cleanup including I/O data for logging */
export interface ClaudeCleanupResult {
  cleaned: CleanedDeathInfo
  costUsd: number
  prompt: string
  responseText: string
  inputTokens: number
  outputTokens: number
}

export async function cleanupWithClaude(
  actor: ActorForEnrichment,
  rawSources: RawSourceData[]
): Promise<ClaudeCleanupResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for Claude cleanup")
  }

  const logger = getEnrichmentLogger()
  const anthropic = new Anthropic()
  const prompt = buildCleanupPrompt(actor, rawSources)

  // Add New Relic attributes for Claude cleanup
  for (const [key, value] of Object.entries({
    "claude.cleanup.actorId": actor.id,
    "claude.cleanup.actorName": actor.name,
    "claude.cleanup.sourceCount": rawSources.length,
  })) {
    newrelic.addCustomAttribute(key, value)
  }

  console.log(`  Claude cleanup for ${actor.name} (${rawSources.length} sources)...`)

  // Log the request
  logger.logClaudeCleanupRequest(actor.id, actor.name, rawSources.length, prompt)

  const response = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  // Calculate cost
  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const costUsd =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

  // Extract text content for logging
  const textBlock = response.content.find((block) => block.type === "text")
  const responseText = textBlock?.type === "text" ? textBlock.text : ""

  // Log the response
  logger.logClaudeCleanupResponse(
    actor.id,
    actor.name,
    inputTokens,
    outputTokens,
    costUsd,
    responseText
  )

  console.log(
    `  Claude cleanup complete: ${inputTokens} input, ${outputTokens} output tokens ($${costUsd.toFixed(4)})`
  )

  // Record Claude API call in New Relic
  newrelic.recordCustomEvent("ClaudeAPICall", {
    actorId: actor.id,
    actorName: actor.name,
    model: MODEL_ID,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    costUsd: costUsd,
    purpose: "death_cleanup",
  })

  // Verify we have text content
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude")
  }

  // Parse JSON response
  const jsonText = stripMarkdownCodeFences(textBlock.text)
  let parsed: ClaudeCleanupResponse

  try {
    parsed = JSON.parse(jsonText) as ClaudeCleanupResponse
  } catch (error) {
    console.error(`JSON parse error for ${actor.name}:`, error)
    console.error("Raw response:", textBlock.text.substring(0, 500))
    throw new Error(
      `Failed to parse Claude response: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }

  // Convert related_celebrities to proper format
  const relatedCelebrities: RelatedCelebrity[] | null = Array.isArray(parsed.related_celebrities)
    ? parsed.related_celebrities.map((rc) => ({
        name: rc.name,
        tmdbId: null, // Will be looked up later when persisting
        relationship: rc.relationship,
      }))
    : null

  // Convert to CleanedDeathInfo
  const cleaned: CleanedDeathInfo = {
    cause: parsed.cause,
    causeConfidence: parsed.cause_confidence,
    details: parsed.details,
    detailsConfidence: parsed.details_confidence,
    birthdayConfidence: parsed.birthday_confidence,
    deathdayConfidence: parsed.deathday_confidence,
    circumstances: parsed.circumstances,
    circumstancesConfidence: parsed.circumstances_confidence,
    rumoredCircumstances: parsed.rumored_circumstances,
    locationOfDeath: parsed.location_of_death,
    manner: DeathMannerSchema.safeParse(parsed.manner).success ? parsed.manner : null,
    notableFactors: (Array.isArray(parsed.notable_factors) ? parsed.notable_factors : []).filter(
      (f: string) => VALID_NOTABLE_FACTORS.has(f)
    ),
    categories: Array.isArray(parsed.categories) ? parsed.categories : null,
    relatedDeaths: parsed.related_deaths,
    relatedCelebrities,
    additionalContext: parsed.additional_context,
    lastProject: parsed.last_project,
    careerStatusAtDeath: parsed.career_status_at_death,
    posthumousReleases: parsed.posthumous_releases,
    // Validate has_substantive_content is actually a boolean, default to false if missing/invalid
    hasSubstantiveContent:
      typeof parsed.has_substantive_content === "boolean" ? parsed.has_substantive_content : false,
    cleanupSource: "claude-opus-4.5",
    cleanupTimestamp: new Date().toISOString(),
  }
  newrelic.recordCustomEvent("ClaudeCleanedData", {
    cause: parsed.cause || "",
    causeConfidence: parsed.cause_confidence || "",
    details: parsed.details || "",
    detailsConfidence: parsed.details_confidence || "",
    birthdayConfidence: parsed.birthday_confidence || "",
    deathdayConfidence: parsed.deathday_confidence || "",
    circumstances: parsed.circumstances || "",
    circumstancesConfidence: parsed.circumstances_confidence || "",
    rumoredCircumstances: parsed.rumored_circumstances || "",
    locationOfDeath: parsed.location_of_death || "",
    manner: cleaned.manner || "",
    notableFactors: cleaned.notableFactors.join(", "),
    categories: (cleaned.categories || []).join(", "),
    relatedDeaths: parsed.related_deaths || "",
    relatedCelebrities: (Array.isArray(parsed.related_celebrities)
      ? parsed.related_celebrities
      : []
    )
      .map((rc) => rc.name)
      .join(", "),
    additionalContext: parsed.additional_context || "",
    careerStatusAtDeath: parsed.career_status_at_death || "",
    lastProject: parsed.last_project?.title || "",
    posthumousReleasesCount: (Array.isArray(parsed.posthumous_releases)
      ? parsed.posthumous_releases
      : []
    ).length,
    cleanupSource: "claude-opus-4.5",
    cleanupTimestamp: new Date().toISOString(),
  })
  return { cleaned, costUsd, prompt, responseText, inputTokens, outputTokens }
}

/**
 * Estimate the cost of a cleanup call based on raw data length.
 *
 * @param rawSources - Raw data to be processed
 * @returns Estimated cost in USD
 */
export function estimateCleanupCost(rawSources: RawSourceData[]): number {
  // Rough estimate: 4 chars per token for input
  const totalChars = rawSources.reduce((sum, s) => sum + s.text.length, 0)
  const estimatedInputTokens = Math.ceil(totalChars / 4) + 500 // Add 500 for prompt overhead
  const estimatedOutputTokens = 800 // Average expected output

  return (
    (estimatedInputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (estimatedOutputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000
  )
}
