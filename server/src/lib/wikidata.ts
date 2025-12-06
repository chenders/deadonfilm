import { getCauseOfDeathFromClaude, isVagueCause } from "./claude.js"

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

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
  deathday: string
): Promise<CauseOfDeathResult> {
  const birthYear = birthday ? new Date(birthday).getFullYear() : null
  const deathYear = new Date(deathday).getFullYear()

  // 1. Try Claude first (most accurate)
  const claudeResult = await getCauseOfDeathFromClaude(name, birthYear, deathYear)
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

    return {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: "claude",
      causeOfDeathDetails: details,
      causeOfDeathDetailsSource: detailsSource,
      wikipediaUrl: wikiUrl,
    }
  }

  // 2. Fall back to Wikidata/Wikipedia if Claude unavailable or returned vague answer
  if (!birthday) {
    return {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: claudeResult.causeOfDeath ? "claude" : null,
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
      return {
        causeOfDeath: claudeResult.causeOfDeath,
        causeOfDeathSource: claudeResult.causeOfDeath ? "claude" : null,
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

    return {
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl: wikidataResult.wikipediaUrl,
    }
  } catch (error) {
    console.log(`Wikidata error for ${name}:`, error)
    return {
      causeOfDeath: claudeResult.causeOfDeath,
      causeOfDeathSource: claudeResult.causeOfDeath ? "claude" : null,
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
  const escapedName = name.replace(/"/g, '\\"')

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
    const sectionPatterns = [
      /==\s*Death(?:\s+and\s+[\w\s]+)?\s*==\s*([\s\S]*?)(?:==\s*\w|$)/i,
      /==\s*(?:Personal\s+life|Later\s+(?:life|years)|Final\s+years)(?:\s+and\s+[\w\s]+)?\s*==\s*([\s\S]*?)(?:==\s*\w|$)/i,
    ]

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
  let cleaned = text
    // Remove nested templates (handle up to 3 levels of nesting)
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
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
    // Clean up entities and whitespace
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    // Remove leading pipes or equals (from partially parsed templates)
    .replace(/^\s*[|=]\s*/gm, "")
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, " ")
    .trim()

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
async function getWikipediaDeathDetails(wikipediaUrl: string): Promise<string | null> {
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
    const sectionPatterns = [
      /==\s*Death(?:\s+and\s+[\w\s]+)?\s*==\s*([\s\S]*?)(?:==\s*\w|$)/i,
      /==\s*(?:Personal\s+life|Later\s+(?:life|years)|Final\s+years)(?:\s+and\s+[\w\s]+)?\s*==\s*([\s\S]*?)(?:==\s*\w|$)/i,
    ]

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
          // Take first 1-2 relevant sentences, max 200 chars
          let details = deathSentences.slice(0, 2).join(" ")
          if (details.length > 200) {
            details = details.substring(0, 197) + "..."
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
        if (details.length > 200) {
          details = details.substring(0, 197) + "..."
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

// Export for use in backfill script
export { getWikipediaDeathDetails }

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
