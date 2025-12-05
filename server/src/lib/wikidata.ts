import { getCauseOfDeathFromClaude, isVagueCause } from './claude.js'

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'

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

export interface CauseOfDeathResult {
  causeOfDeath: string | null
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
    return {
      causeOfDeath: claudeResult.causeOfDeath,
      wikipediaUrl: wikiUrl,
    }
  }

  // 2. Fall back to Wikidata/Wikipedia if Claude unavailable or returned vague answer
  if (!birthday) {
    return { causeOfDeath: claudeResult.causeOfDeath, wikipediaUrl: null }
  }

  const query = buildSparqlQuery(name, birthYear!, deathYear)

  try {
    console.log(`Wikidata query for: ${name} (born ${birthYear}, died ${deathYear})`)

    const response = await fetch(`${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)',
      },
    })

    if (!response.ok) {
      console.log(`Wikidata error: ${response.status} ${response.statusText}`)
      return { causeOfDeath: claudeResult.causeOfDeath, wikipediaUrl: null }
    }

    const data = (await response.json()) as WikidataSparqlResponse
    console.log(`Wikidata results for ${name}: ${data.results.bindings.length} bindings`)

    const result = parseWikidataResult(data.results.bindings, name, deathYear)

    // Use Claude's answer if we got one, otherwise try Wikidata's
    if (claudeResult.causeOfDeath) {
      result.causeOfDeath = claudeResult.causeOfDeath
    } else if (result.wikipediaUrl && !result.causeOfDeath) {
      // Try Wikipedia infobox as last resort
      const wikiCause = await getWikipediaInfoboxCauseOfDeath(result.wikipediaUrl)
      if (wikiCause) {
        result.causeOfDeath = wikiCause
        console.log(`Wikipedia fallback for ${name}: cause="${wikiCause}"`)
      }
    }

    console.log(
      `Final result for ${name}: cause="${result.causeOfDeath}", url="${result.wikipediaUrl}"`
    )

    return result
  } catch (error) {
    console.log(`Wikidata error for ${name}:`, error)
    return { causeOfDeath: claudeResult.causeOfDeath, wikipediaUrl: null }
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
        Accept: 'application/sparql-results+json',
        'User-Agent': 'DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)',
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

function parseWikidataResult(
  bindings: WikidataBinding[],
  targetName: string,
  deathYear: number
): CauseOfDeathResult {
  if (bindings.length === 0) {
    return { causeOfDeath: null, wikipediaUrl: null }
  }

  for (const binding of bindings) {
    const personName = binding.personLabel?.value || ''

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
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
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

// Wikipedia API fallback for cause of death from infobox
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
        'User-Agent': 'DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)',
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as WikipediaApiResponse
    const pages = data.query?.pages

    if (!pages) return null

    // Get the first (and only) page
    const pageId = Object.keys(pages)[0]
    if (!pageId || pageId === '-1') return null

    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.['*']
    if (!content) return null

    // Look for death_cause or cause of death in infobox
    // Common patterns: | death_cause = ..., | cause_of_death = ...
    const patterns = [
      /\|\s*death_cause\s*=\s*([^\n|]+)/i,
      /\|\s*cause_of_death\s*=\s*([^\n|]+)/i,
      /\|\s*death cause\s*=\s*([^\n|]+)/i,
    ]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        // Clean up the result - remove wiki markup
        const cause = match[1]
          .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
          .replace(/\{\{[^}]+\}\}/g, '') // Remove templates
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/&nbsp;/g, ' ')
          .trim()

        // Skip if it's just a reference or empty
        if (cause && cause.length > 0 && !cause.startsWith('<')) {
          return cause
        }
      }
    }

    return null
  } catch (error) {
    console.log('Wikipedia fallback error:', error)
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
              '*'?: string
            }
          }
        }>
      }
    >
  }
}
