/**
 * Wikidata SPARQL source for structured death information.
 *
 * Queries Wikidata for:
 * - P509: Cause of death
 * - P1196: Manner of death (natural, accident, suicide, homicide, etc.)
 * - P20: Place of death
 * - P157: Killed by (for homicides/accidents)
 * - P793: Significant event (for notable death circumstances)
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

/**
 * Check if a Wikidata label value is valid (not a URL or blank node identifier).
 * Wikidata sometimes returns genid URLs instead of actual labels when the value
 * is a complex statement or blank node.
 */
export function isValidLabel(value: string | undefined): value is string {
  if (!value) return false
  // Filter out URLs, genid references, and Wikidata entity IDs without labels
  if (value.startsWith("http://") || value.startsWith("https://")) return false
  if (value.includes("genid")) return false
  if (/^Q\d+$/.test(value)) return false // Raw entity ID like "Q12345"
  return true
}

/**
 * Get a valid label value or null if invalid.
 */
export function getValidLabel(value: string | undefined): string | null {
  return isValidLabel(value) ? value : null
}

interface WikidataSparqlResponse {
  results: {
    bindings: WikidataDeathBinding[]
  }
}

interface WikidataDeathBinding {
  person?: { value: string }
  personLabel?: { value: string }
  causeOfDeathLabel?: { value: string }
  mannerOfDeathLabel?: { value: string }
  placeOfDeathLabel?: { value: string }
  killedByLabel?: { value: string }
  significantEventLabel?: { value: string }
  birthDate?: { value: string }
  deathDate?: { value: string }
  article?: { value: string }
}

/**
 * Wikidata source for structured death information via SPARQL.
 */
export class WikidataSource extends BaseDataSource {
  readonly name = "Wikidata"
  readonly type = DataSourceType.WIKIDATA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.STRUCTURED_DATA

  // Wikidata is generous but we should still be polite
  protected minDelayMs = 500

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    // Need birthday for reliable matching
    if (!actor.birthday || !actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Missing birthday or deathday for Wikidata lookup",
      }
    }

    const birthYear = new Date(actor.birthday).getFullYear()
    const deathYear = new Date(actor.deathday).getFullYear()
    const query = this.buildSparqlQuery(actor.name, birthYear, deathYear)

    try {
      console.log(`Wikidata death circumstances query for: ${actor.name}`)

      const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": this.userAgent,
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        console.log(`Wikidata error: ${response.status} ${response.statusText}`)
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, query),
          data: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = (await response.json()) as WikidataSparqlResponse
      console.log(`Wikidata results for ${actor.name}: ${data.results.bindings.length} bindings`)

      const result = this.parseResults(data.results.bindings, actor.name, deathYear)

      if (!result) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, query, data),
          data: null,
          error: "No matching person found in Wikidata",
        }
      }

      // Calculate confidence based on how much data we got
      let confidence = 0.3 // Base confidence for finding the person
      if (result.circumstances) confidence += 0.2
      if (result.locationOfDeath) confidence += 0.1
      if (result.notableFactors.length > 0) confidence += 0.2

      return {
        success: true,
        source: this.createSourceEntry(
          startTime,
          confidence,
          result.wikipediaUrl ?? undefined,
          query,
          data
        ),
        data: {
          circumstances: result.circumstances,
          rumoredCircumstances: null,
          notableFactors: result.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: result.locationOfDeath,
          additionalContext: result.additionalContext,
        },
      }
    } catch (error) {
      console.log(`Wikidata error for ${actor.name}:`, error)
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, undefined, query),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Build enhanced SPARQL query for death circumstances.
   */
  private buildSparqlQuery(name: string, birthYear: number, deathYear: number): string {
    // Escape backslashes first, then double quotes for SPARQL string literal
    const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

    return `
      SELECT ?person ?personLabel ?causeOfDeathLabel ?mannerOfDeathLabel
             ?placeOfDeathLabel ?killedByLabel ?significantEventLabel
             ?birthDate ?deathDate ?article
      WHERE {
        ?person wdt:P31 wd:Q5 .
        ?person rdfs:label "${escapedName}"@en .

        ?person wdt:P569 ?birthDate .
        FILTER(YEAR(?birthDate) = ${birthYear})

        ?person wdt:P570 ?deathDate .
        FILTER(YEAR(?deathDate) >= ${deathYear - 1} && YEAR(?deathDate) <= ${deathYear + 1})

        # Cause of death (P509)
        OPTIONAL { ?person wdt:P509 ?causeOfDeath . }

        # Manner of death (P1196) - natural, accident, suicide, homicide, etc.
        OPTIONAL { ?person wdt:P1196 ?mannerOfDeath . }

        # Place of death (P20)
        OPTIONAL { ?person wdt:P20 ?placeOfDeath . }

        # Killed by (P157) - for homicides/accidents
        OPTIONAL { ?person wdt:P157 ?killedBy . }

        # Significant event (P793) - for notable death circumstances
        OPTIONAL { ?person wdt:P793 ?significantEvent . }

        # Wikipedia article
        OPTIONAL {
          ?article schema:about ?person .
          ?article schema:isPartOf <https://en.wikipedia.org/> .
        }

        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 5
    `
  }

  /**
   * Parse Wikidata results into enrichment data.
   */
  private parseResults(
    bindings: WikidataDeathBinding[],
    targetName: string,
    deathYear: number
  ): ParsedWikidataResult | null {
    if (bindings.length === 0) {
      return null
    }

    for (const binding of bindings) {
      const personName = binding.personLabel?.value || ""

      if (!this.isNameMatch(targetName, personName)) {
        continue
      }

      if (binding.deathDate?.value) {
        const wikidataDeathYear = new Date(binding.deathDate.value).getFullYear()
        if (Math.abs(wikidataDeathYear - deathYear) > 1) {
          continue
        }
      }

      // Build circumstances from available data
      const circumstances = this.buildCircumstances(binding)
      const notableFactors = this.extractNotableFactors(binding)

      return {
        causeOfDeath: getValidLabel(binding.causeOfDeathLabel?.value),
        mannerOfDeath: getValidLabel(binding.mannerOfDeathLabel?.value),
        locationOfDeath: getValidLabel(binding.placeOfDeathLabel?.value),
        killedBy: getValidLabel(binding.killedByLabel?.value),
        significantEvent: getValidLabel(binding.significantEventLabel?.value),
        wikipediaUrl: binding.article?.value || null,
        circumstances,
        notableFactors,
        additionalContext: null,
      }
    }

    return null
  }

  /**
   * Build a circumstances string from the structured data.
   */
  private buildCircumstances(binding: WikidataDeathBinding): string | null {
    const parts: string[] = []

    const manner = getValidLabel(binding.mannerOfDeathLabel?.value)
    const cause = getValidLabel(binding.causeOfDeathLabel?.value)
    const place = getValidLabel(binding.placeOfDeathLabel?.value)
    const killedBy = getValidLabel(binding.killedByLabel?.value)

    if (manner && manner !== "natural causes") {
      parts.push(`Manner of death: ${manner}`)
    }

    if (cause) {
      parts.push(`Cause: ${cause}`)
    }

    if (killedBy) {
      parts.push(`Killed by: ${killedBy}`)
    }

    if (place) {
      parts.push(`Died in ${place}`)
    }

    return parts.length > 0 ? parts.join(". ") + "." : null
  }

  /**
   * Extract notable factors from the structured data.
   */
  private extractNotableFactors(binding: WikidataDeathBinding): string[] {
    const factors: string[] = []

    const manner = getValidLabel(binding.mannerOfDeathLabel?.value)?.toLowerCase()
    if (manner) {
      if (manner.includes("accident") || manner.includes("accidental")) {
        factors.push("accidental death")
      }
      if (manner.includes("suicide") || manner.includes("self-inflicted")) {
        factors.push("self-inflicted")
      }
      if (manner.includes("homicide") || manner.includes("murder")) {
        factors.push("homicide")
      }
    }

    const killedBy = getValidLabel(binding.killedByLabel?.value)
    if (killedBy) {
      factors.push("killed by another person/thing")
    }

    const significantEvent = getValidLabel(binding.significantEventLabel?.value)?.toLowerCase()
    if (significantEvent) {
      if (significantEvent.includes("crash") || significantEvent.includes("accident")) {
        factors.push("involved in accident")
      }
      if (significantEvent.includes("fire")) {
        factors.push("fire-related")
      }
    }

    return factors
  }

  /**
   * Check if names match (handles variations).
   */
  private isNameMatch(tmdbName: string, wikidataName: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
    const tmdbNorm = normalize(tmdbName)
    const wikiNorm = normalize(wikidataName)

    if (tmdbNorm === wikiNorm) {
      return true
    }

    if (tmdbNorm.includes(wikiNorm) || wikiNorm.includes(tmdbNorm)) {
      return true
    }

    // Check if last names match
    const tmdbParts = tmdbName.toLowerCase().split(/\s+/)
    const wikiParts = wikidataName.toLowerCase().split(/\s+/)
    const tmdbLast = tmdbParts[tmdbParts.length - 1]
    const wikiLast = wikiParts[wikiParts.length - 1]

    return tmdbLast === wikiLast
  }
}

interface ParsedWikidataResult {
  causeOfDeath: string | null
  mannerOfDeath: string | null
  locationOfDeath: string | null
  killedBy: string | null
  significantEvent: string | null
  wikipediaUrl: string | null
  circumstances: string | null
  notableFactors: string[]
  additionalContext: string | null
}
