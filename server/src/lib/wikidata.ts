import he from "he"
import { getCauseOfDeathFromClaude, isVagueCause, type ClaudeModel } from "./claude.js"
import newrelic from "newrelic"

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
const MAX_DEATH_DETAILS_LENGTH = 200

interface WikidataSparqlResponse {
  results: {
    bindings: WikidataBinding[]
  }
}

interface WikidataBinding {
  person?: { value: string }
  personLabel?: { value: string }
  causeOfDeathLabel?: { value: string }
  birthDate?: { value: string }
  deathDate?: { value: string }
  article?: { value: string }
}

export type DeathInfoSource = "claude" | "wikipedia" | null

export interface CauseOfDeathResult {
  causeOfDeath: string | null
  causeOfDeathSource: DeathInfoSource
  causeOfDeathDetails: string | null
  causeOfDeathDetailsSource: DeathInfoSource
  wikipediaUrl: string | null
}

export async function getCauseOfDeath(
  name: string,
  birthday: string | null,
  deathday: string,
  model: ClaudeModel = "sonnet"
): Promise<CauseOfDeathResult> {
  const birthYear = birthday ? new Date(birthday).getFullYear() : null
  const deathYear = new Date(deathday).getFullYear()

  // 1. Try Claude first (most accurate)
  const claudeResult = await getCauseOfDeathFromClaude(name, birthYear, deathYear, model)
  if (claudeResult.causeOfDeath && !isVagueCause(claudeResult.causeOfDeath)) {
    // Get Wikipedia URL from Wikidata for linking
    const wikiUrl = await getWikipediaUrl(name, birthYear, deathYear)
    console.log(`Claude result for ${name}: cause="${claudeResult.causeOfDeath}"`)

    // If Claude provided cause but no details, try to get details from Wikipedia
    let details = claudeResult.details
    let detailsSource: DeathInfoSource = claudeResult.details ? "claude" : null

    if (!details && wikiUrl) {
      const wikiDetails = await getWikipediaDeathDetails(wikiUrl)
      if (wikiDetails) {
        details = wikiDetails
        detailsSource = "wikipedia"
        console.log(`Wikipedia details for ${name}: "${wikiDetails}"`)
      }
    }

    const result = {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: "claude" as DeathInfoSource,
      causeOfDeathDetails: details,
      causeOfDeathDetailsSource: detailsSource,
      wikipediaUrl: wikiUrl,
    }

    newrelic.recordCustomEvent("CauseOfDeathLookup", {
      personName: name,
      source: result.causeOfDeathSource ?? "none",
      success: result.causeOfDeath !== null,
      hasDetails: result.causeOfDeathDetails !== null,
    })

    return result
  }

  // 2. Fall back to Wikidata/Wikipedia if Claude unavailable or returned vague answer
  if (!birthday) {
    const source: DeathInfoSource = claudeResult.causeOfDeath ? "claude" : null
    newrelic.recordCustomEvent("CauseOfDeathLookup", {
      personName: name,
      source: source ?? "none",
      success: claudeResult.causeOfDeath !== null,
      hasDetails: claudeResult.details !== null,
    })

    return {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: source,
      causeOfDeathDetails: claudeResult.details,
      causeOfDeathDetailsSource: claudeResult.details ? "claude" : null,
      wikipediaUrl: null,
    }
  }

  const query = buildSparqlQuery(name, birthYear!, deathYear)

  try {
    console.log(`Wikidata query for: ${name} (born ${birthYear}, died ${deathYear})`)

    const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) {
      console.log(`Wikidata error: ${response.status} ${response.statusText}`)
      const source: DeathInfoSource = claudeResult.causeOfDeath ? "claude" : null
      newrelic.recordCustomEvent("CauseOfDeathLookup", {
        personName: name,
        source: source ?? "none",
        success: claudeResult.causeOfDeath !== null,
        hasDetails: claudeResult.details !== null,
      })

      return {
        causeOfDeath: claudeResult.causeOfDeath,
        causeOfDeathSource: source,
        causeOfDeathDetails: claudeResult.details,
        causeOfDeathDetailsSource: claudeResult.details ? "claude" : null,
        wikipediaUrl: null,
      }
    }

    const data = (await response.json()) as WikidataSparqlResponse
    console.log(`Wikidata results for ${name}: ${data.results.bindings.length} bindings`)

    const wikidataResult = parseWikidataResult(data.results.bindings, name, deathYear)

    // Build final result with source tracking
    let causeOfDeath: string | null = null
    let causeOfDeathSource: DeathInfoSource = null
    let causeOfDeathDetails: string | null = null
    let causeOfDeathDetailsSource: DeathInfoSource = null

    // Use Claude's answer if we got one, otherwise try Wikidata's
    if (claudeResult.causeOfDeath) {
      causeOfDeath = claudeResult.causeOfDeath
      causeOfDeathSource = "claude"
      causeOfDeathDetails = claudeResult.details
      causeOfDeathDetailsSource = claudeResult.details ? "claude" : null
    } else if (wikidataResult.causeOfDeath) {
      causeOfDeath = wikidataResult.causeOfDeath
      causeOfDeathSource = "wikipedia"
    } else if (wikidataResult.wikipediaUrl) {
      // Try Wikipedia infobox as last resort
      const wikiCause = await getWikipediaInfoboxCauseOfDeath(wikidataResult.wikipediaUrl)
      if (wikiCause) {
        causeOfDeath = wikiCause
        causeOfDeathSource = "wikipedia"
        console.log(`Wikipedia fallback for ${name}: cause="${wikiCause}"`)
      }
    }

    // If we have a cause but no details, try to get details from Wikipedia
    if (causeOfDeath && !causeOfDeathDetails && wikidataResult.wikipediaUrl) {
      const wikiDetails = await getWikipediaDeathDetails(wikidataResult.wikipediaUrl)
      if (wikiDetails) {
        causeOfDeathDetails = wikiDetails
        causeOfDeathDetailsSource = "wikipedia"
        console.log(`Wikipedia details for ${name}: "${wikiDetails}"`)
      }
    }

    console.log(
      `Final result for ${name}: cause="${causeOfDeath}" (${causeOfDeathSource}), url="${wikidataResult.wikipediaUrl}"`
    )

    newrelic.recordCustomEvent("CauseOfDeathLookup", {
      personName: name,
      source: causeOfDeathSource ?? "none",
      success: causeOfDeath !== null,
      hasDetails: causeOfDeathDetails !== null,
    })

    return {
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl: wikidataResult.wikipediaUrl,
    }
  } catch (error) {
    console.log(`Wikidata error for ${name}:`, error)
    const source: DeathInfoSource = claudeResult.causeOfDeath ? "claude" : null
    newrelic.recordCustomEvent("CauseOfDeathLookup", {
      personName: name,
      source: source ?? "none",
      success: claudeResult.causeOfDeath !== null,
      hasDetails: claudeResult.details !== null,
    })

    return {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: source,
      causeOfDeathDetails: claudeResult.details,
      causeOfDeathDetailsSource: claudeResult.details ? "claude" : null,
      wikipediaUrl: null,
    }
  }
}

// Helper to just get Wikipedia URL from Wikidata
async function getWikipediaUrl(
  name: string,
  birthYear: number | null,
  deathYear: number
): Promise<string | null> {
  if (!birthYear) return null

  const query = buildSparqlQuery(name, birthYear, deathYear)

  try {
    const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as WikidataSparqlResponse
    const result = parseWikidataResult(data.results.bindings, name, deathYear)
    return result.wikipediaUrl
  } catch {
    return null
  }
}

function buildSparqlQuery(name: string, birthYear: number, deathYear: number): string {
  // Use exact label match for efficiency - CONTAINS is too slow
  // Escape backslashes first, then double quotes for SPARQL string literal
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  return `
    SELECT ?person ?personLabel ?causeOfDeathLabel ?birthDate ?deathDate ?article WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person rdfs:label "${escapedName}"@en .

      ?person wdt:P569 ?birthDate .
      FILTER(YEAR(?birthDate) = ${birthYear})

      ?person wdt:P570 ?deathDate .
      FILTER(YEAR(?deathDate) >= ${deathYear - 1} && YEAR(?deathDate) <= ${deathYear + 1})

      OPTIONAL { ?person wdt:P509 ?causeOfDeath . }
      OPTIONAL {
        ?article schema:about ?person .
        ?article schema:isPartOf <https://en.wikipedia.org/> .
      }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 5
  `
}

interface WikidataParseResult {
  causeOfDeath: string | null
  wikipediaUrl: string | null
}

function parseWikidataResult(
  bindings: WikidataBinding[],
  targetName: string,
  deathYear: number
): WikidataParseResult {
  if (bindings.length === 0) {
    return { causeOfDeath: null, wikipediaUrl: null }
  }

  for (const binding of bindings) {
    const personName = binding.personLabel?.value || ""

    if (!isNameMatch(targetName, personName)) {
      continue
    }

    if (binding.deathDate?.value) {
      const wikidataDeathYear = new Date(binding.deathDate.value).getFullYear()
      if (Math.abs(wikidataDeathYear - deathYear) > 1) {
        continue
      }
    }

    return {
      causeOfDeath: binding.causeOfDeathLabel?.value || null,
      wikipediaUrl: binding.article?.value || null,
    }
  }

  return { causeOfDeath: null, wikipediaUrl: null }
}

function isNameMatch(tmdbName: string, wikidataName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
  const tmdbNorm = normalize(tmdbName)
  const wikiNorm = normalize(wikidataName)

  if (tmdbNorm === wikiNorm) {
    return true
  }

  if (tmdbNorm.includes(wikiNorm) || wikiNorm.includes(tmdbNorm)) {
    return true
  }

  const tmdbParts = tmdbName.toLowerCase().split(/\s+/)
  const wikiParts = wikidataName.toLowerCase().split(/\s+/)
  const tmdbLast = tmdbParts[tmdbParts.length - 1]
  const wikiLast = wikiParts[wikiParts.length - 1]

  return tmdbLast === wikiLast
}

// Wikipedia API fallback for cause of death from infobox or article text
async function getWikipediaInfoboxCauseOfDeath(wikipediaUrl: string): Promise<string | null> {
  try {
    // Extract article title from URL
    const urlMatch = wikipediaUrl.match(/\/wiki\/(.+)$/)
    if (!urlMatch) return null

    const title = decodeURIComponent(urlMatch[1])

    // Use Wikipedia API to get wikitext of the article
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as WikipediaApiResponse
    const pages = data.query?.pages

    if (!pages) return null

    // Get the first (and only) page
    const pageId = Object.keys(pages)[0]
    if (!pageId || pageId === "-1") return null

    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.["*"]
    if (!content) return null

    // 1. First try infobox fields
    const infoboxPatterns = [
      /\|\s*death_cause\s*=\s*([^\n|]+)/i,
      /\|\s*cause_of_death\s*=\s*([^\n|]+)/i,
      /\|\s*death cause\s*=\s*([^\n|]+)/i,
    ]

    for (const pattern of infoboxPatterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        const cause = cleanWikiMarkup(match[1])
        if (cause) return cause
      }
    }

    // 2. Try to extract from death-related sections
    // Match various section titles that might contain death info
    // Note: Using [^=\n]* to prevent ReDoS; eslint-disable for remaining safe patterns
    /* eslint-disable security/detect-unsafe-regex */
    const sectionPatterns = [
      /==\s*Death(?:\s+and[^=\n]*)?\s*==\s*([\s\S]*?)(?===\s*\w|$)/i,
      /==\s*(?:Personal\s+life|Later\s+(?:life|years)|Final\s+years)(?:\s+and[^=\n]*)?\s*==\s*([\s\S]*?)(?===\s*\w|$)/i,
    ]
    /* eslint-enable security/detect-unsafe-regex */

    for (const sectionPattern of sectionPatterns) {
      const sectionMatch = content.match(sectionPattern)
      if (sectionMatch) {
        const sectionText = cleanWikiMarkup(sectionMatch[1])
        const extracted = extractCauseFromText(sectionText)
        if (extracted) return extracted
      }
    }

    // 3. Try opening paragraph for "died of X" or "died from X"
    // Skip past infobox to get to actual article content
    const afterInfobox = content.replace(/\{\{Infobox[\s\S]*?\}\}/gi, "")
    const firstParagraph = afterInfobox.match(/'''[^']+'''.{0,500}/s)
    if (firstParagraph) {
      const paragraphText = cleanWikiMarkup(firstParagraph[0])
      const extracted = extractCauseFromText(paragraphText)
      if (extracted) return extracted
    }

    return null
  } catch (error) {
    console.log("Wikipedia fallback error:", error)
    return null
  }
}

// Clean wiki markup from text
function cleanWikiMarkup(text: string): string {
  // Remove nested templates with a loop (handles arbitrary nesting depth)
  let cleaned = text
  let prevCleaned = ""
  let maxIterations = 10
  while (cleaned !== prevCleaned && maxIterations-- > 0) {
    prevCleaned = cleaned
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, "")
  }

  cleaned = cleaned
    // Remove any remaining template fragments
    .replace(/\{\{[^}]*$/g, "")
    .replace(/^[^{]*\}\}/g, "")
    // Remove file/image links entirely: [[File:...|...]] or [[Image:...]]
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "")
    // Remove category links
    .replace(/\[\[Category:[^\]]*\]\]/gi, "")
    // Convert wiki links to plain text: [[link|text]] -> text, [[link]] -> link
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    // Remove any remaining [[ or ]] fragments
    .replace(/\[\[|\]\]/g, "")
    // Remove image/thumb markup that might be floating
    .replace(/thumb\|[^|]*\|?/gi, "")
    .replace(/\|?thumb\|?/gi, "")
    .replace(/upright=[0-9.]+\|?/gi, "")
    .replace(/\|right|\|left|\|center/gi, "")
    .replace(/\d+px\|?/gi, "")
    // Remove references
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^/]*\/>/gi, "")
    .replace(/<ref[^>]*>/gi, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Remove bold/italic wiki markup
    .replace(/'{2,5}/g, "")
    // Remove section headers
    .replace(/^=+\s*|\s*=+$/gm, "")
    // Remove leading pipes or equals (from partially parsed templates)
    .replace(/^\s*[|=]\s*/gm, "")
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, " ")
    .trim()

  // Decode HTML entities (handles &nbsp;, &ndash;, &mdash;, &amp;, etc.)
  cleaned = he.decode(cleaned)

  // Remove any sentence fragments that look like leftover markup
  // (starting with lowercase after period, or very short fragments)
  const sentences = cleaned.split(/(?<=[.!?])\s+/)
  const cleanSentences = sentences.filter((s) => {
    const trimmed = s.trim()
    // Skip empty or very short fragments
    if (trimmed.length < 10) return false
    // Skip fragments that look like markup residue
    if (/^[a-z]/.test(trimmed) && trimmed.length < 30) return false
    if (/^\d+$/.test(trimmed)) return false
    return true
  })

  return cleanSentences.join(" ").trim()
}

// Extract cause of death from natural language text
function extractCauseFromText(text: string): string | null {
  // Common patterns for cause of death in article text
  const patterns = [
    // "died of X" or "died from X"
    /died (?:of|from) (?:a |an )?([^,.;()]+?)(?:\.|,|;| at | in | on |\()/i,
    // "death was caused by X"
    /death was (?:caused by|due to|attributed to) (?:a |an )?([^,.;()]+?)(?:\.|,|;|\()/i,
    // "cause of death was X"
    /cause of death (?:was|is) (?:a |an )?([^,.;()]+?)(?:\.|,|;|\()/i,
    // "died in his/her sleep"
    /(died in (?:his|her|their) sleep)/i,
    // "succumbed to X"
    /succumbed to (?:a |an )?([^,.;()]+?)(?:\.|,|;|\()/i,
    // "killed by X" or "killed in X"
    /(?:was |were )?killed (?:by|in) (?:a |an )?([^,.;()]+?)(?:\.|,|;|\()/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      let cause = match[1].trim()
      // Clean up common trailing words
      cause = cause
        .replace(/\s+(?:aged?|at age|years old|after|following|while|when).*$/i, "")
        .trim()
      // Skip if too short or just contains common filler
      if (cause.length >= 3 && !/^(the|his|her|their|a|an)$/i.test(cause)) {
        return cause
      }
    }
  }

  return null
}

// Get death details from Wikipedia article (1-2 sentences about circumstances)
export async function getWikipediaDeathDetails(wikipediaUrl: string): Promise<string | null> {
  try {
    // Extract article title from URL
    const urlMatch = wikipediaUrl.match(/\/wiki\/(.+)$/)
    if (!urlMatch) return null

    const title = decodeURIComponent(urlMatch[1])

    // Use Wikipedia API to get wikitext of the article
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as WikipediaApiResponse
    const pages = data.query?.pages

    if (!pages) return null

    // Get the first (and only) page
    const pageId = Object.keys(pages)[0]
    if (!pageId || pageId === "-1") return null

    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.["*"]
    if (!content) return null

    // Look for death-related sections and extract details
    // Note: Using [^=\n]* to prevent ReDoS; eslint-disable for remaining safe patterns
    /* eslint-disable security/detect-unsafe-regex */
    const sectionPatterns = [
      /==\s*Death(?:\s+and[^=\n]*)?\s*==\s*([\s\S]*?)(?===\s*\w|$)/i,
      /==\s*(?:Personal\s+life|Later\s+(?:life|years)|Final\s+years)(?:\s+and[^=\n]*)?\s*==\s*([\s\S]*?)(?===\s*\w|$)/i,
    ]
    /* eslint-enable security/detect-unsafe-regex */

    for (const sectionPattern of sectionPatterns) {
      const sectionMatch = content.match(sectionPattern)
      if (sectionMatch) {
        const sectionText = cleanWikiMarkup(sectionMatch[1])
        // Get first 1-2 sentences that mention death
        const sentences = sectionText.split(/(?<=[.!?])\s+/)
        const deathSentences = sentences.filter((s) =>
          /died|death|passed away|succumbed|fatal|killed/i.test(s)
        )

        if (deathSentences.length > 0) {
          // Take first 1-2 relevant sentences, max MAX_DEATH_DETAILS_LENGTH chars
          let details = deathSentences.slice(0, 2).join(" ")
          if (details.length > MAX_DEATH_DETAILS_LENGTH) {
            details = details.substring(0, MAX_DEATH_DETAILS_LENGTH - 3) + "..."
          }
          return details
        }
      }
    }

    // Try opening paragraph for death details
    const afterInfobox = content.replace(/\{\{Infobox[\s\S]*?\}\}/gi, "")
    const firstParagraph = afterInfobox.match(/'''[^']+'''.{0,1000}/s)
    if (firstParagraph) {
      const paragraphText = cleanWikiMarkup(firstParagraph[0])
      const sentences = paragraphText.split(/(?<=[.!?])\s+/)
      const deathSentences = sentences.filter((s) =>
        /died|death|passed away|succumbed|fatal|killed/i.test(s)
      )

      if (deathSentences.length > 0) {
        let details = deathSentences.slice(0, 2).join(" ")
        if (details.length > MAX_DEATH_DETAILS_LENGTH) {
          details = details.substring(0, MAX_DEATH_DETAILS_LENGTH - 3) + "..."
        }
        return details
      }
    }

    return null
  } catch (error) {
    console.log("Wikipedia details error:", error)
    return null
  }
}

interface WikipediaApiResponse {
  query?: {
    pages?: Record<
      string,
      {
        revisions?: Array<{
          slots?: {
            main?: {
              "*"?: string
            }
          }
        }>
      }
    >
  }
}

// ============================================================================
// Death Date Verification
// ============================================================================

export interface DeathDateVerification {
  verified: boolean
  wikidataDeathDate: string | null
  confidence: "verified" | "unverified" | "conflicting"
  conflictDetails?: string
}

/**
 * Verify a death date from TMDB against Wikidata.
 *
 * Returns:
 * - verified: true if Wikidata confirms the death (within 30 days)
 * - confidence: 'verified' (exact/close match), 'unverified' (no Wikidata data), 'conflicting' (dates differ significantly)
 * - wikidataDeathDate: the death date from Wikidata if found
 * - conflictDetails: description of the conflict if dates don't match
 */
export async function verifyDeathDate(
  name: string,
  birthYear: number | null,
  tmdbDeathDate: string
): Promise<DeathDateVerification> {
  const tmdbDeathDateObj = new Date(tmdbDeathDate)
  const tmdbDeathYear = tmdbDeathDateObj.getFullYear()

  // If no birth year, we can still try to look up by name and death year
  const query = buildDeathDateVerificationQuery(name, birthYear, tmdbDeathYear)

  try {
    const response = await fetch(WIKIDATA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": "DeadOnFilm/1.0 (contact@deadonfilm.com)",
      },
      body: `query=${encodeURIComponent(query)}`,
    })

    if (!response.ok) {
      console.log(`Wikidata death verification failed: ${response.status}`)
      return {
        verified: false,
        wikidataDeathDate: null,
        confidence: "unverified",
      }
    }

    const data = (await response.json()) as WikidataSparqlResponse
    const result = parseDeathDateVerificationResult(data.results.bindings, name, tmdbDeathDateObj)

    newrelic.recordCustomEvent("DeathDateVerification", {
      personName: name,
      tmdbDeathDate,
      wikidataDeathDate: result.wikidataDeathDate ?? "unknown",
      verified: result.verified,
      confidence: result.confidence,
    })

    return result
  } catch (error) {
    console.log(`Wikidata death verification error for ${name}:`, error)
    return {
      verified: false,
      wikidataDeathDate: null,
      confidence: "unverified",
    }
  }
}

/**
 * Build SPARQL query to find person's death date in Wikidata.
 * More lenient than the cause-of-death query since we're just verifying the date.
 */
function buildDeathDateVerificationQuery(
  name: string,
  birthYear: number | null,
  tmdbDeathYear: number
): string {
  // Escape backslashes first, then double quotes for SPARQL string literal
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  // If we have birth year, use it for more accurate matching
  const birthYearFilter = birthYear
    ? `?person wdt:P569 ?birthDate .
       FILTER(YEAR(?birthDate) >= ${birthYear - 1} && YEAR(?birthDate) <= ${birthYear + 1})`
    : ""

  return `
    SELECT ?person ?personLabel ?deathDate ?birthDate WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person rdfs:label "${escapedName}"@en .

      ${birthYearFilter}

      ?person wdt:P570 ?deathDate .
      FILTER(YEAR(?deathDate) >= ${tmdbDeathYear - 2} && YEAR(?deathDate) <= ${tmdbDeathYear + 2})

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 5
  `
}

/**
 * Parse Wikidata results and compare death dates.
 */
function parseDeathDateVerificationResult(
  bindings: WikidataBinding[],
  targetName: string,
  tmdbDeathDate: Date
): DeathDateVerification {
  if (bindings.length === 0) {
    // No Wikidata record found - cannot verify
    return {
      verified: false,
      wikidataDeathDate: null,
      confidence: "unverified",
    }
  }

  for (const binding of bindings) {
    const personName = binding.personLabel?.value || ""

    // Check if name matches
    if (!isNameMatch(targetName, personName)) {
      continue
    }

    if (!binding.deathDate?.value) {
      continue
    }

    const wikidataDeathDate = new Date(binding.deathDate.value)
    const daysDiff = Math.abs(
      (tmdbDeathDate.getTime() - wikidataDeathDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Format Wikidata death date as ISO string (YYYY-MM-DD)
    const wikidataDeathDateStr = wikidataDeathDate.toISOString().split("T")[0]

    if (daysDiff <= 30) {
      // Dates match within 30 days - verified
      return {
        verified: true,
        wikidataDeathDate: wikidataDeathDateStr,
        confidence: "verified",
      }
    } else if (daysDiff <= 365) {
      // Within a year but not exact - still consider verified but note discrepancy
      return {
        verified: true,
        wikidataDeathDate: wikidataDeathDateStr,
        confidence: "verified",
        conflictDetails: `TMDB: ${tmdbDeathDate.toISOString().split("T")[0]}, Wikidata: ${wikidataDeathDateStr} (${Math.round(daysDiff)} days apart)`,
      }
    } else {
      // More than a year apart - conflicting data
      return {
        verified: false,
        wikidataDeathDate: wikidataDeathDateStr,
        confidence: "conflicting",
        conflictDetails: `TMDB: ${tmdbDeathDate.toISOString().split("T")[0]}, Wikidata: ${wikidataDeathDateStr} (${Math.round(daysDiff / 365)} years apart)`,
      }
    }
  }

  // No matching person found in Wikidata
  return {
    verified: false,
    wikidataDeathDate: null,
    confidence: "unverified",
  }
}

// ============================================================================
// Actor Image Sources
// ============================================================================

/**
 * Fetch an actor's image URL from Wikidata.
 * Uses the P18 (image) property and converts to a Commons URL.
 *
 * @param name - Actor's name
 * @param birthYear - Year of birth (optional, but improves matching)
 * @param deathYear - Year of death (optional, but improves matching)
 * @returns URL to the actor's image on Wikimedia Commons, or null if not found
 */
export async function getActorImageFromWikidata(
  name: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<string | null> {
  // Escape backslashes first, then double quotes for SPARQL string literal
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  // Build query with optional birth/death year filters
  let filters = ""
  if (birthYear) {
    filters += `
      ?person wdt:P569 ?birthDate .
      FILTER(YEAR(?birthDate) = ${birthYear})
    `
  }
  if (deathYear) {
    filters += `
      ?person wdt:P570 ?deathDate .
      FILTER(YEAR(?deathDate) >= ${deathYear - 1} && YEAR(?deathDate) <= ${deathYear + 1})
    `
  }

  const query = `
    SELECT ?person ?personLabel ?image WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person rdfs:label "${escapedName}"@en .
      ?person wdt:P18 ?image .
      ${filters}
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 5
  `

  try {
    const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      results: {
        bindings: Array<{
          personLabel?: { value: string }
          image?: { value: string }
        }>
      }
    }

    // Find matching result
    for (const binding of data.results.bindings) {
      const personName = binding.personLabel?.value || ""

      // Verify name matches
      if (!isNameMatch(name, personName)) {
        continue
      }

      // Get the image URL
      const imageUrl = binding.image?.value
      if (imageUrl) {
        // Wikidata returns Commons URL like:
        // http://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg
        // We can use this directly or convert to https
        return imageUrl.replace("http://", "https://")
      }
    }

    return null
  } catch (error) {
    console.error(`Error fetching Wikidata image for ${name}:`, error)
    return null
  }
}

/**
 * Extract actor's image URL from Wikipedia infobox.
 * Uses the Wikipedia API to get article content and parses the infobox for image field.
 *
 * @param wikipediaUrl - Full URL to the actor's Wikipedia article
 * @returns URL to the actor's image on Wikimedia Commons, or null if not found
 */
export async function getActorImageFromWikipediaInfobox(
  wikipediaUrl: string
): Promise<string | null> {
  try {
    // Extract article title from URL
    const urlMatch = wikipediaUrl.match(/\/wiki\/(.+)$/)
    if (!urlMatch) return null

    const title = decodeURIComponent(urlMatch[1])

    // Use Wikipedia API to get wikitext of the article
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as WikipediaApiResponse
    const pages = data.query?.pages

    if (!pages) return null

    const pageId = Object.keys(pages)[0]
    if (!pageId || pageId === "-1") return null

    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.["*"]
    if (!content) return null

    // Look for image in infobox - try various field names
    const imagePatterns = [
      /\|\s*image\s*=\s*([^\n|]+)/i,
      /\|\s*image_name\s*=\s*([^\n|]+)/i,
      /\|\s*img\s*=\s*([^\n|]+)/i,
      /\|\s*photo\s*=\s*([^\n|]+)/i,
      /\|\s*picture\s*=\s*([^\n|]+)/i,
    ]

    for (const pattern of imagePatterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        let imageName = match[1].trim()

        // Skip empty or placeholder images
        if (!imageName || /^(none|no|n\/a|–|—|-|placeholder)/i.test(imageName)) {
          continue
        }

        // Remove any wiki formatting and file: prefix
        imageName = imageName
          .replace(/\[\[|\]\]/g, "")
          .replace(/^(?:File|Image):/i, "")
          .split("|")[0] // Take just the filename before any caption
          .trim()

        if (imageName && imageName.length > 3) {
          // Convert filename to Commons FilePath URL
          // Spaces in filenames need to be underscores in the URL
          const encodedName = encodeURIComponent(imageName.replace(/ /g, "_"))
          return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}`
        }
      }
    }

    return null
  } catch (error) {
    console.error(`Error fetching Wikipedia infobox image:`, error)
    return null
  }
}

// Patterns that indicate non-person images (places, buildings, etc.)
const NON_PERSON_PATTERNS = [
  /\bwalk\b/i, // street walks
  /\bstreet\b/i,
  /\bbuilding\b/i,
  /\bhouse\b/i,
  /\bschool\b/i,
  /\bpark\b/i,
  /\bplaza\b/i,
  /\bbridge\b/i,
  /\bstatue\b/i,
  /\bmonument\b/i,
  /\blogo\b/i,
  /\bcover\b/i, // album/book covers
  /\bposter\b/i,
  /\bsignature\b/i,
  /\bautograph\b/i,
  /\bgrave\b/i,
  /\btombstone\b/i,
  /\bmemorial\b/i,
  /\bplaque\b/i,
  /\bmap\b/i,
  /\baerial\b/i,
  /\bskyline\b/i,
  /\blandscape\b/i,
  /\bfrom\s+\d+/i, // "from 210" (street address)
]

// Patterns that indicate person photos (preferred)
const PERSON_PHOTO_PATTERNS = [
  /\bportrait\b/i,
  /\bheadshot\b/i,
  /\bphoto\s+of\b/i,
  /\bat\b.*\b(event|conference|premiere|festival|award)/i,
  /\bin\s+\d{4}\b/i, // "in 2018" - event photos
  /\bcropped\b/i, // usually person photos
  /\bby\s+\w+/i, // "by [photographer]"
]

/**
 * Search Wikimedia Commons for actor images by name.
 * Uses the MediaWiki API to search for files matching the actor's name.
 * Only returns images where the filename contains the actor's name and
 * appears to be a photo of a person (not a place, building, etc.).
 *
 * @param name - Actor's name
 * @returns URL to a matching image on Wikimedia Commons, or null if not found
 */
export async function getActorImageFromCommonsSearch(name: string): Promise<string | null> {
  try {
    // Search Commons for files matching the actor's name exactly
    // Use quotes around the name for exact phrase matching
    const searchQuery = encodeURIComponent(`"${name}"`)
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&srnamespace=6&srlimit=20&format=json&origin=*`

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)",
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      query?: {
        search?: Array<{
          title: string
          snippet: string
        }>
      }
    }

    const results = data.query?.search
    if (!results || results.length === 0) return null

    // Normalize actor name for matching (remove non-alpha, lowercase)
    const normalizedName = name.toLowerCase().replace(/[^a-z]/g, "")

    // Also check last name for partial matches
    const nameParts = name.toLowerCase().split(/\s+/)
    const lastName = nameParts[nameParts.length - 1].replace(/[^a-z]/g, "")
    const firstName = nameParts[0].replace(/[^a-z]/g, "")

    // Score and filter results
    const candidates: Array<{ title: string; score: number }> = []

    for (const result of results) {
      const title = result.title

      // Skip non-image files
      if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(title)) {
        continue
      }

      // Check if the filename contains the actor's full name or last name + first name
      const normalizedTitle = title.toLowerCase().replace(/[^a-z]/g, "")

      // Require the filename to contain the full name OR both first and last name
      const hasFullName = normalizedTitle.includes(normalizedName)
      const hasFirstAndLast =
        lastName.length > 2 &&
        firstName.length > 2 &&
        normalizedTitle.includes(lastName) &&
        normalizedTitle.includes(firstName)

      if (!hasFullName && !hasFirstAndLast) {
        continue
      }

      // Check for non-person patterns (skip these)
      const isNonPerson = NON_PERSON_PATTERNS.some((pattern) => pattern.test(title))
      if (isNonPerson) {
        continue
      }

      // Score based on person-photo patterns
      let score = 0
      for (const pattern of PERSON_PHOTO_PATTERNS) {
        if (pattern.test(title)) {
          score += 10
        }
      }

      // Prefer exact full name matches
      if (hasFullName) {
        score += 5
      }

      candidates.push({ title, score })
    }

    // Sort by score (highest first) and return the best match
    candidates.sort((a, b) => b.score - a.score)

    if (candidates.length > 0) {
      const filename = candidates[0].title.replace(/^File:/i, "")
      const encodedName = encodeURIComponent(filename.replace(/ /g, "_"))
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}`
    }

    // No match found
    return null
  } catch (error) {
    console.error(`Error searching Commons for ${name}:`, error)
    return null
  }
}
