/**
 * Wikidata SPARQL source for structured biographical information.
 *
 * Queries Wikidata for personal/biographical properties:
 * - P69: educated at (education)
 * - P26: spouse (relationships)
 * - P40: child (relationships)
 * - P22: father (family background)
 * - P25: mother (family background)
 * - P3373: sibling (family)
 * - P241: military branch (military service)
 * - P140: religion (background)
 * - P19: place of birth (birthplace)
 * - P27: country of citizenship (birthplace context)
 * - P106: occupation (pre-fame life, non-acting occupations)
 * - P166: award received (non-entertainment awards)
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import {
  BiographySourceType,
  type ActorForBiography,
  type RawBiographySourceData,
} from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a Wikidata label value is valid (not a URL or blank node identifier).
 * Wikidata sometimes returns genid URLs instead of actual labels when the value
 * is a complex statement or blank node.
 */
export function isValidLabel(value: string | undefined): value is string {
  if (!value) return false
  if (value.startsWith("http://") || value.startsWith("https://")) return false
  if (value.includes("genid")) return false
  if (/^Q\d+$/.test(value)) return false
  return true
}

/**
 * Filter a comma-separated string of labels, removing invalid entries.
 * Returns null if no valid labels remain.
 */
function filterValidLabels(concatenated: string | undefined): string | null {
  if (!concatenated) return null
  const labels = concatenated.split(", ").filter((label) => isValidLabel(label))
  return labels.length > 0 ? labels.join(", ") : null
}

// ============================================================================
// Types
// ============================================================================

interface WikidataBioSparqlResponse {
  results: {
    bindings: WikidataBioBinding[]
  }
}

interface WikidataBioBinding {
  person?: { value: string }
  personLabel?: { value: string }
  education?: { value: string }
  spouses?: { value: string }
  children?: { value: string }
  fathers?: { value: string }
  mothers?: { value: string }
  siblings?: { value: string }
  militaryService?: { value: string }
  religions?: { value: string }
  birthPlaces?: { value: string }
  citizenships?: { value: string }
  occupations?: { value: string }
  awards?: { value: string }
  birthDate?: { value: string }
}

interface ParsedWikidataBio {
  education: string | null
  spouses: string | null
  children: string | null
  fathers: string | null
  mothers: string | null
  siblings: string | null
  militaryService: string | null
  religions: string | null
  birthPlaces: string | null
  citizenships: string | null
  occupations: string | null
  awards: string | null
  entityUrl: string | null
}

// ============================================================================
// Source Implementation
// ============================================================================

/**
 * Wikidata biography source for structured personal data via SPARQL.
 */
export class WikidataBiographySource extends BaseBiographySource {
  readonly name = "Wikidata Biography"
  readonly type = BiographySourceType.WIKIDATA_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.STRUCTURED_DATA

  protected minDelayMs = 500 // Wikidata rate limit

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Need birthday for reliable matching
    if (!actor.birthday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Missing birthday for Wikidata biography lookup",
      }
    }

    const birthYear = new Date(actor.birthday).getFullYear()
    const query = this.buildSparqlQuery(actor.name, birthYear)

    try {
      const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": this.userAgent,
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: query,
          }),
          data: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = (await response.json()) as WikidataBioSparqlResponse

      const parsed = this.parseResults(data.results.bindings, actor.name)

      if (!parsed) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: query,
            rawData: data,
          }),
          data: null,
          error: "No matching person found in Wikidata",
        }
      }

      const text = this.formatBiographyText(parsed)
      const confidence = this.calculateStructuredConfidence(parsed)

      const entityUrl = parsed.entityUrl

      const sourceData: RawBiographySourceData = {
        sourceName: this.name,
        sourceType: this.type,
        text,
        url: entityUrl ?? undefined,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: "Wikidata",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: entityUrl ?? undefined,
          queryUsed: query,
          rawData: data,
          publication: "Wikidata",
        }),
        data: sourceData,
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          queryUsed: query,
        }),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Build SPARQL query for biographical properties.
   */
  private buildSparqlQuery(name: string, birthYear: number): string {
    // Escape backslashes first, then double quotes for SPARQL string literal
    const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

    return `
      SELECT ?person ?personLabel
             (GROUP_CONCAT(DISTINCT ?educatedAtLabel; SEPARATOR=", ") AS ?education)
             (GROUP_CONCAT(DISTINCT ?spouseLabel; SEPARATOR=", ") AS ?spouses)
             (GROUP_CONCAT(DISTINCT ?childLabel; SEPARATOR=", ") AS ?children)
             (GROUP_CONCAT(DISTINCT ?fatherLabel; SEPARATOR=", ") AS ?fathers)
             (GROUP_CONCAT(DISTINCT ?motherLabel; SEPARATOR=", ") AS ?mothers)
             (GROUP_CONCAT(DISTINCT ?siblingLabel; SEPARATOR=", ") AS ?siblings)
             (GROUP_CONCAT(DISTINCT ?militaryBranchLabel; SEPARATOR=", ") AS ?militaryService)
             (GROUP_CONCAT(DISTINCT ?religionLabel; SEPARATOR=", ") AS ?religions)
             (GROUP_CONCAT(DISTINCT ?birthPlaceLabel; SEPARATOR=", ") AS ?birthPlaces)
             (GROUP_CONCAT(DISTINCT ?citizenshipLabel; SEPARATOR=", ") AS ?citizenships)
             (GROUP_CONCAT(DISTINCT ?occupationLabel; SEPARATOR=", ") AS ?occupations)
             (GROUP_CONCAT(DISTINCT ?awardLabel; SEPARATOR=", ") AS ?awards)
             ?birthDate
      WHERE {
        ?person wdt:P31 wd:Q5 .
        ?person rdfs:label "${escapedName}"@en .
        ?person wdt:P569 ?birthDate .
        FILTER(YEAR(?birthDate) = ${birthYear})

        OPTIONAL { ?person wdt:P69 ?educatedAt . ?educatedAt rdfs:label ?educatedAtLabel . FILTER(LANG(?educatedAtLabel) = "en") }
        OPTIONAL { ?person wdt:P26 ?spouse . ?spouse rdfs:label ?spouseLabel . FILTER(LANG(?spouseLabel) = "en") }
        OPTIONAL { ?person wdt:P40 ?child . ?child rdfs:label ?childLabel . FILTER(LANG(?childLabel) = "en") }
        OPTIONAL { ?person wdt:P22 ?father . ?father rdfs:label ?fatherLabel . FILTER(LANG(?fatherLabel) = "en") }
        OPTIONAL { ?person wdt:P25 ?mother . ?mother rdfs:label ?motherLabel . FILTER(LANG(?motherLabel) = "en") }
        OPTIONAL { ?person wdt:P3373 ?sibling . ?sibling rdfs:label ?siblingLabel . FILTER(LANG(?siblingLabel) = "en") }
        OPTIONAL { ?person wdt:P241 ?militaryBranch . ?militaryBranch rdfs:label ?militaryBranchLabel . FILTER(LANG(?militaryBranchLabel) = "en") }
        OPTIONAL { ?person wdt:P140 ?religion . ?religion rdfs:label ?religionLabel . FILTER(LANG(?religionLabel) = "en") }
        OPTIONAL { ?person wdt:P19 ?birthPlace . ?birthPlace rdfs:label ?birthPlaceLabel . FILTER(LANG(?birthPlaceLabel) = "en") }
        OPTIONAL { ?person wdt:P27 ?citizenship . ?citizenship rdfs:label ?citizenshipLabel . FILTER(LANG(?citizenshipLabel) = "en") }
        OPTIONAL { ?person wdt:P106 ?occupation . ?occupation rdfs:label ?occupationLabel . FILTER(LANG(?occupationLabel) = "en") }
        OPTIONAL { ?person wdt:P166 ?award . ?award rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en") }
      }
      GROUP BY ?person ?personLabel ?birthDate
      LIMIT 5
    `
  }

  /**
   * Parse SPARQL results into structured biography data.
   */
  private parseResults(
    bindings: WikidataBioBinding[],
    targetName: string
  ): ParsedWikidataBio | null {
    if (bindings.length === 0) {
      return null
    }

    for (const binding of bindings) {
      const personName = binding.personLabel?.value || ""

      if (!this.isNameMatch(targetName, personName)) {
        continue
      }

      const entityUrl = binding.person?.value ?? null

      return {
        education: filterValidLabels(binding.education?.value),
        spouses: filterValidLabels(binding.spouses?.value),
        children: filterValidLabels(binding.children?.value),
        fathers: filterValidLabels(binding.fathers?.value),
        mothers: filterValidLabels(binding.mothers?.value),
        siblings: filterValidLabels(binding.siblings?.value),
        militaryService: filterValidLabels(binding.militaryService?.value),
        religions: filterValidLabels(binding.religions?.value),
        birthPlaces: filterValidLabels(binding.birthPlaces?.value),
        citizenships: filterValidLabels(binding.citizenships?.value),
        occupations: filterValidLabels(binding.occupations?.value),
        awards: filterValidLabels(binding.awards?.value),
        entityUrl,
      }
    }

    return null
  }

  /**
   * Format parsed biography data into readable text for Claude synthesis.
   */
  private formatBiographyText(parsed: ParsedWikidataBio): string {
    const lines: string[] = []

    if (parsed.education) lines.push(`Education: ${parsed.education}`)
    if (parsed.spouses) lines.push(`Spouse: ${parsed.spouses}`)
    if (parsed.children) lines.push(`Children: ${parsed.children}`)
    if (parsed.fathers) lines.push(`Father: ${parsed.fathers}`)
    if (parsed.mothers) lines.push(`Mother: ${parsed.mothers}`)
    if (parsed.siblings) lines.push(`Siblings: ${parsed.siblings}`)
    if (parsed.militaryService) lines.push(`Military service: ${parsed.militaryService}`)
    if (parsed.birthPlaces) lines.push(`Place of birth: ${parsed.birthPlaces}`)
    if (parsed.citizenships) lines.push(`Citizenship: ${parsed.citizenships}`)
    if (parsed.occupations) lines.push(`Occupation: ${parsed.occupations}`)
    if (parsed.awards) lines.push(`Awards: ${parsed.awards}`)
    if (parsed.religions) lines.push(`Religion: ${parsed.religions}`)

    return lines.join("\n")
  }

  /**
   * Calculate confidence based on the number of populated biography sections.
   * 0.3 base + 0.1 per populated section, capped at 0.8.
   */
  private calculateStructuredConfidence(parsed: ParsedWikidataBio): number {
    let populatedCount = 0

    if (parsed.education) populatedCount++
    if (parsed.spouses) populatedCount++
    if (parsed.children) populatedCount++
    if (parsed.fathers || parsed.mothers) populatedCount++
    if (parsed.siblings) populatedCount++
    if (parsed.militaryService) populatedCount++
    if (parsed.religions) populatedCount++
    if (parsed.birthPlaces) populatedCount++
    if (parsed.citizenships) populatedCount++
    if (parsed.occupations) populatedCount++
    if (parsed.awards) populatedCount++

    return Math.min(0.8, 0.3 + populatedCount * 0.1)
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
