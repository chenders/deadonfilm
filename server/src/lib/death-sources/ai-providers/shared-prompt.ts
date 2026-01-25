/**
 * Shared prompt builder for death enrichment AI providers.
 *
 * Creates standardized prompts that ask for:
 * - Core death information (circumstances, cause, location)
 * - Career context (last project, career status, posthumous releases)
 * - Related people (celebrities, related deaths)
 */

import type { ActorForEnrichment } from "../types.js"

/**
 * Response structure for enriched death prompts.
 * Used by all AI providers for consistency.
 */
export interface EnrichedDeathResponse {
  // Core death info
  circumstances: string | null
  location_of_death: string | null
  notable_factors: string[]
  rumored_circumstances: string | null
  confidence: "high" | "medium" | "low" | null

  // Career context
  career_status_at_death: "active" | "semi-retired" | "retired" | "hiatus" | "unknown" | null
  last_project: {
    title: string
    year: number | null
    type: "movie" | "show" | "documentary" | "unknown"
  } | null
  posthumous_releases: Array<{
    title: string
    year: number | null
    type: "movie" | "show" | "documentary" | "unknown"
  }> | null

  // Related people
  related_celebrities: Array<{
    name: string
    relationship: string
  }> | null
  related_deaths: string | null

  // Sources (for providers with web search)
  sources?: string[]
}

/**
 * Build an enriched death prompt that asks for career context.
 * Use this for AI providers with good knowledge bases (Perplexity, GPT-4, etc.)
 *
 * @param actor - Actor to enrich
 * @param requireSources - If true, require source URLs for all claims (default: true)
 * @param requireReliableSources - If true, specifically ask for "reliable" sources (default: false)
 */
export function buildEnrichedDeathPrompt(
  actor: ActorForEnrichment,
  requireSources: boolean = true,
  requireReliableSources: boolean = false
): string {
  const deathDate = actor.deathday
    ? new Date(actor.deathday).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "unknown date"

  const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
  const age = birthYear && deathYear ? deathYear - birthYear : null

  const ageInfo = age ? ` (age ${age})` : ""

  const publicationsQualifier = requireReliableSources ? "reliable publications" : "publications"
  const sourcesQualifier = requireReliableSources ? "reliable sources" : "sources"

  const sourceRequirement = requireSources
    ? `
CRITICAL: All information MUST be sourced from ${publicationsQualifier}. Include URLs in the "sources" array.
- If you cannot find ${sourcesQualifier} for a field, return null for that field
- Return empty sources array ONLY when all death fields are null (no information found)
- "circumstances" and "rumored_circumstances" REQUIRE source URLs - never provide these fields without ${sourcesQualifier}
`
    : ""

  const circumstancesDesc = requireSources
    ? "- circumstances: Narrative describing how they died. Include where found, what led to death, medical details. MUST have sources."
    : "- circumstances: Narrative describing how they died. Include where found, what led to death, medical details."

  const rumoredDesc = requireSources
    ? "- rumored_circumstances: ONLY if disputed facts or controversy. null if straightforward. MUST have sources if provided."
    : "- rumored_circumstances: ONLY if disputed facts or controversy. null if straightforward."

  const sourcesDesc = requireSources
    ? "- sources: REQUIRED array of source URLs. Never empty if circumstances are provided."
    : "- sources: Array of source URLs if available."

  return `Search for how ${actor.name} (actor)${ageInfo} died on ${deathDate}.

Respond with JSON only. No biography or career achievements unless death-related.${sourceRequirement}
Required fields:
${circumstancesDesc}
- location_of_death: City, State/Country where they died
- notable_factors: Tags only: "sudden", "long illness", "accident", "suicide", "overdose", "found unresponsive", "on_set", "vehicle_crash", "fire", "drowning", "homicide", "suspicious_circumstances", "multiple_deaths", "family_tragedy"
${rumoredDesc}
- confidence: "high" | "medium" | "low"
${sourcesDesc}

Career context fields (if known):
- career_status_at_death: "active" | "semi-retired" | "retired" | "hiatus" | "unknown"
- last_project: Their last film/TV project before death {"title": "...", "year": 2023, "type": "movie|show|documentary"}
- posthumous_releases: Projects released after death [{"title": "...", "year": 2024, "type": "movie"}]

Related people fields (if applicable):
- related_celebrities: Celebrities involved in their death or mentioned [{name: "...", relationship: "spouse/co-star/etc"}]
- related_deaths: If others died in connection (same incident, discovered together). Describe with names and timeline.

{
  "circumstances": "narrative",
  "location_of_death": "City, State",
  "notable_factors": [],
  "rumored_circumstances": null,
  "confidence": "high",
  "career_status_at_death": "active",
  "last_project": {"title": "Movie Name", "year": 2023, "type": "movie"},
  "posthumous_releases": null,
  "related_celebrities": null,
  "related_deaths": null,
  "sources": ["https://variety.com/...", "https://people.com/..."]
}

${
  requireSources
    ? "If death info unknown OR no sources found: return all null values with empty notable_factors and sources arrays."
    : "If death info unknown: return all null values with empty notable_factors and sources arrays."
}`
}

/**
 * Build a simpler prompt for providers with limited capabilities.
 * Focuses on core death info without career context.
 *
 * @param actor - Actor to enrich
 * @param requireSources - If true, require source URLs for all claims (default: true)
 */
export function buildBasicDeathPrompt(
  actor: ActorForEnrichment,
  requireSources: boolean = true
): string {
  const deathDate = actor.deathday
    ? new Date(actor.deathday).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "unknown date"

  const sourceNote = requireSources
    ? "\n\nCRITICAL: Provide source URLs for all claims. If no sources found, return null for that field."
    : ""

  const ifUnknown = requireSources
    ? 'If unknown OR no sources: {"circumstances": null, "location_of_death": null, "notable_factors": [], "rumored_circumstances": null, "confidence": null, "sources": []}'
    : 'If unknown: {"circumstances": null, "location_of_death": null, "notable_factors": [], "rumored_circumstances": null, "confidence": null, "sources": []}'

  return `How did ${actor.name} (actor) die on ${deathDate}?${sourceNote}

Respond with JSON only:
{
  "circumstances": "narrative of how they died",
  "location_of_death": "City, State or null",
  "notable_factors": ["tag1"],
  "rumored_circumstances": "disputed info or null",
  "confidence": "high" | "medium" | "low",
  "sources": ["https://source1.com", "https://source2.com"]
}

${ifUnknown}`
}

/**
 * Extract the first complete JSON object from text using brace balancing.
 * More robust than regex for handling nested structures.
 */
function extractFirstJsonObject(responseText: string): string | null {
  const start = responseText.indexOf("{")
  if (start === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let i = start; i < responseText.length; i++) {
    const char = responseText[i]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === "\\") {
      if (inString) {
        isEscaped = true
      }
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === "{") {
        depth++
      } else if (char === "}") {
        depth--
        if (depth === 0) {
          return responseText.slice(start, i + 1)
        }
      }
    }
  }

  return null
}

/**
 * Parse a JSON response from any AI provider.
 * Handles common variations and malformed JSON.
 */
export function parseEnrichedResponse(responseText: string): Partial<EnrichedDeathResponse> | null {
  try {
    // Find the first complete JSON object using brace balancing
    const jsonText = extractFirstJsonObject(responseText)
    if (!jsonText) {
      return null
    }

    const parsed = JSON.parse(jsonText)

    // Normalize the response
    return {
      circumstances: parsed.circumstances || null,
      location_of_death: parsed.location_of_death || parsed.locationOfDeath || null,
      notable_factors: Array.isArray(parsed.notable_factors)
        ? parsed.notable_factors
        : Array.isArray(parsed.notableFactors)
          ? parsed.notableFactors
          : [],
      rumored_circumstances: parsed.rumored_circumstances || parsed.rumoredCircumstances || null,
      confidence: parsed.confidence || null,
      career_status_at_death: parsed.career_status_at_death || parsed.careerStatusAtDeath || null,
      last_project: parsed.last_project || parsed.lastProject || null,
      posthumous_releases: parsed.posthumous_releases || parsed.posthumousReleases || null,
      related_celebrities: parsed.related_celebrities || parsed.relatedCelebrities || null,
      related_deaths: parsed.related_deaths || parsed.relatedDeaths || null,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    }
  } catch {
    return null
  }
}
