/**
 * Wikidata demographic data fetcher for actor interestingness scoring.
 *
 * Fetches structured demographic properties via SPARQL:
 * - P21: sex or gender
 * - P172: ethnic group
 * - P19 → P17: place of birth → country
 * - P27: country of citizenship
 * - P241: military branch
 * - P106: occupation (non-acting)
 *
 * Uses the same name-matching and SPARQL patterns as existing Wikidata
 * sources in death-sources and biography-sources.
 */

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
const WIKIDATA_USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)"

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 2000
const SPARQL_TIMEOUT_MS = 15000
const MIN_REQUEST_DELAY_MS = 500

let lastRequestTime = 0
let _testMode = false

/** Reset internal state for testing (zeroes rate limiter, disables retry delays) */
export function _resetForTesting(): void {
  lastRequestTime = 0
  _testMode = true
}

async function waitForRateLimit(): Promise<void> {
  if (_testMode) return
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_DELAY_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

// ============================================================================
// Types
// ============================================================================

export interface ActorDemographics {
  gender: string | null
  ethnicity: string | null
  birthplaceCountry: string | null
  citizenship: string | null
  militaryService: string | null
  occupations: string | null
}

interface WikidataDemoSparqlResponse {
  results: {
    bindings: WikidataDemoBinding[]
  }
}

interface WikidataDemoBinding {
  person?: { value: string }
  personLabel?: { value: string }
  genderLabel?: { value: string }
  ethnicities?: { value: string }
  birthCountries?: { value: string }
  citizenships?: { value: string }
  militaryBranches?: { value: string }
  occupations?: { value: string }
  birthDate?: { value: string }
}

// ============================================================================
// SPARQL Query
// ============================================================================

/**
 * Build SPARQL query for demographic properties.
 * Matches actor by exact English name + birth year (±1).
 */
export function buildDemographicsSparqlQuery(name: string, birthYear: number): string {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  return `
    SELECT ?person ?personLabel
           (GROUP_CONCAT(DISTINCT ?genderLbl; SEPARATOR=", ") AS ?genderLabel)
           (GROUP_CONCAT(DISTINCT ?ethnicityLabel; SEPARATOR=", ") AS ?ethnicities)
           (GROUP_CONCAT(DISTINCT ?birthCountryLabel; SEPARATOR=", ") AS ?birthCountries)
           (GROUP_CONCAT(DISTINCT ?citizenLabel; SEPARATOR=", ") AS ?citizenships)
           (GROUP_CONCAT(DISTINCT ?militaryLabel; SEPARATOR=", ") AS ?militaryBranches)
           (GROUP_CONCAT(DISTINCT ?occupationLabel; SEPARATOR=", ") AS ?occupations)
           ?birthDate
    WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person rdfs:label "${escapedName}"@en .
      ?person wdt:P569 ?birthDate .
      FILTER(YEAR(?birthDate) >= ${birthYear - 1} && YEAR(?birthDate) <= ${birthYear + 1})

      OPTIONAL { ?person wdt:P21 ?gender . ?gender rdfs:label ?genderLbl . FILTER(LANG(?genderLbl) = "en") }
      OPTIONAL { ?person wdt:P172 ?ethnicity . ?ethnicity rdfs:label ?ethnicityLabel . FILTER(LANG(?ethnicityLabel) = "en") }
      OPTIONAL { ?person wdt:P19 ?birthPlace . ?birthPlace wdt:P17 ?birthCountry . ?birthCountry rdfs:label ?birthCountryLabel . FILTER(LANG(?birthCountryLabel) = "en") }
      OPTIONAL { ?person wdt:P27 ?citizen . ?citizen rdfs:label ?citizenLabel . FILTER(LANG(?citizenLabel) = "en") }
      OPTIONAL { ?person wdt:P241 ?military . ?military rdfs:label ?militaryLabel . FILTER(LANG(?militaryLabel) = "en") }
      OPTIONAL { ?person wdt:P106 ?occupation . ?occupation rdfs:label ?occupationLabel . FILTER(LANG(?occupationLabel) = "en") }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?person ?personLabel ?birthDate
    LIMIT 5
  `
}

// ============================================================================
// Name Matching (same logic as existing Wikidata sources)
// ============================================================================

function isNameMatch(tmdbName: string, wikidataName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
  const tmdbNorm = normalize(tmdbName)
  const wikiNorm = normalize(wikidataName)

  if (tmdbNorm === wikiNorm) return true
  if (tmdbNorm.includes(wikiNorm) || wikiNorm.includes(tmdbNorm)) return true

  const tmdbParts = tmdbName.toLowerCase().split(/\s+/)
  const wikiParts = wikidataName.toLowerCase().split(/\s+/)
  return tmdbParts[tmdbParts.length - 1] === wikiParts[wikiParts.length - 1]
}

/**
 * Check if a Wikidata label value is valid (not a URL, blank node, or raw entity ID).
 */
function isValidLabel(value: string | undefined): value is string {
  if (!value) return false
  if (value.startsWith("http://") || value.startsWith("https://")) return false
  if (value.includes("genid")) return false
  if (/^Q\d+$/.test(value)) return false
  return true
}

/**
 * Filter a comma-separated string of labels, removing invalid entries.
 */
function filterValidLabels(concatenated: string | undefined): string | null {
  if (!concatenated) return null
  const labels = concatenated.split(", ").filter((label) => isValidLabel(label))
  return labels.length > 0 ? labels.join(", ") : null
}

// Acting-related occupation labels to filter out when identifying "non-acting" occupations
const ACTING_OCCUPATIONS = new Set([
  "actor",
  "actress",
  "film actor",
  "film actress",
  "television actor",
  "television actress",
  "stage actor",
  "stage actress",
  "voice actor",
  "voice actress",
  "stunt performer",
  "stunt double",
  "extra",
  "body double",
  "motion capture artist",
])

/**
 * Filter out acting-related occupations, keeping only non-acting roles.
 */
function filterNonActingOccupations(occupations: string | null): string | null {
  if (!occupations) return null
  const labels = occupations
    .split(", ")
    .filter((label) => !ACTING_OCCUPATIONS.has(label.toLowerCase().trim()))
  return labels.length > 0 ? labels.join(", ") : null
}

// ============================================================================
// Fetch & Parse
// ============================================================================

/**
 * Execute a SPARQL query with retry, backoff, timeout, and rate limiting.
 * Returns null on persistent failure.
 */
async function sparqlFetch(query: string): Promise<WikidataDemoSparqlResponse | null> {
  let lastError: string | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit()

    try {
      const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": WIKIDATA_USER_AGENT,
        },
        signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
      })

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        lastError = `HTTP ${response.status}: ${response.statusText}`
        const delay = _testMode ? 0 : RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (!response.ok) {
        return null
      }

      return (await response.json()) as WikidataDemoSparqlResponse
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < MAX_RETRIES) {
        const delay = _testMode ? 0 : RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
    }
  }

  console.log(`Wikidata demographics SPARQL failed after ${MAX_RETRIES} retries: ${lastError}`)
  return null
}

/**
 * Parse SPARQL results into structured ActorDemographics.
 * Matches by name, filters invalid labels, removes acting-related occupations.
 */
export function parseDemographicsResults(
  bindings: WikidataDemoBinding[],
  targetName: string
): ActorDemographics | null {
  if (bindings.length === 0) return null

  for (const binding of bindings) {
    const personName = binding.personLabel?.value || ""
    if (!isNameMatch(targetName, personName)) continue

    const gender = filterValidLabels(binding.genderLabel?.value)
    const ethnicity = filterValidLabels(binding.ethnicities?.value)
    const birthplaceCountry = filterValidLabels(binding.birthCountries?.value)
    const citizenship = filterValidLabels(binding.citizenships?.value)
    const militaryService = filterValidLabels(binding.militaryBranches?.value)
    const rawOccupations = filterValidLabels(binding.occupations?.value)
    const occupations = filterNonActingOccupations(rawOccupations)

    return {
      gender,
      ethnicity,
      birthplaceCountry,
      citizenship,
      militaryService,
      occupations,
    }
  }

  return null
}

/**
 * Fetch demographic data for an actor from Wikidata.
 *
 * @param name - Actor name (English)
 * @param birthYear - Year of birth for matching
 * @returns Demographic data or null if not found
 */
export async function fetchActorDemographics(
  name: string,
  birthYear: number
): Promise<ActorDemographics | null> {
  const query = buildDemographicsSparqlQuery(name, birthYear)
  const data = await sparqlFetch(query)

  if (!data) return null

  return parseDemographicsResults(data.results.bindings, name)
}
