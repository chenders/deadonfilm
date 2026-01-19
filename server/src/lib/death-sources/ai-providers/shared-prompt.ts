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
 */
export function buildEnrichedDeathPrompt(actor: ActorForEnrichment): string {
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

  return `Search for how ${actor.name} (actor)${ageInfo} died on ${deathDate}.

Respond with JSON only. No biography or career achievements unless death-related.

Required fields:
- circumstances: Narrative describing how they died. Include where found, what led to death, medical details.
- location_of_death: City, State/Country where they died
- notable_factors: Tags only: "sudden", "long illness", "accident", "suicide", "overdose", "found unresponsive", "on_set", "vehicle_crash", "fire", "drowning", "homicide", "suspicious_circumstances", "multiple_deaths", "family_tragedy"
- rumored_circumstances: ONLY if disputed facts or controversy. null if straightforward.
- confidence: "high" | "medium" | "low"

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
  "sources": ["url1"]
}

If death info unknown: return all null values with empty notable_factors array.`
}

/**
 * Build a simpler prompt for providers with limited capabilities.
 * Focuses on core death info without career context.
 */
export function buildBasicDeathPrompt(actor: ActorForEnrichment): string {
  const deathDate = actor.deathday
    ? new Date(actor.deathday).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "unknown date"

  return `How did ${actor.name} (actor) die on ${deathDate}?

Respond with JSON only:
{
  "circumstances": "narrative of how they died",
  "location_of_death": "City, State or null",
  "notable_factors": ["tag1"] or [],
  "rumored_circumstances": "disputed info or null",
  "confidence": "high" | "medium" | "low"
}

If unknown: {"circumstances": null, "location_of_death": null, "notable_factors": [], "rumored_circumstances": null, "confidence": null}`
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
