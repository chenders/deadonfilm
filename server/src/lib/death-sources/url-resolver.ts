/**
 * URL Resolution Utility
 *
 * Resolves redirect URLs (like Gemini grounding URLs) to their final destinations
 * and extracts human-readable source names from domains.
 */

import { extractDomain } from "./link-follower.js"

export interface ResolvedUrl {
  originalUrl: string
  finalUrl: string
  domain: string
  sourceName: string
  error?: string
}

/**
 * Map domains to human-readable source names.
 * Extends the domain scoring pattern from link-follower.ts.
 */
export const SOURCE_NAMES: Record<string, string> = {
  // Entertainment news
  "people.com": "People",
  "tmz.com": "TMZ",
  "variety.com": "Variety",
  "hollywoodreporter.com": "Hollywood Reporter",
  "deadline.com": "Deadline",
  "ew.com": "Entertainment Weekly",
  "usmagazine.com": "Us Weekly",
  "eonline.com": "E! News",

  // Major news
  "bbc.com": "BBC News",
  "bbc.co.uk": "BBC News",
  "nytimes.com": "New York Times",
  "washingtonpost.com": "Washington Post",
  "theguardian.com": "The Guardian",
  "cnn.com": "CNN",
  "foxnews.com": "Fox News",
  "nbcnews.com": "NBC News",
  "cbsnews.com": "CBS News",
  "abcnews.go.com": "ABC News",
  "apnews.com": "AP News",
  "reuters.com": "Reuters",
  "usatoday.com": "USA Today",
  "latimes.com": "Los Angeles Times",

  // Obituary & reference sites
  "legacy.com": "Legacy.com",
  "findagrave.com": "Find a Grave",
  "tributes.com": "Tributes",
  "obituaries.com": "Obituaries.com",
  "wikipedia.org": "Wikipedia",
  "en.wikipedia.org": "Wikipedia",
  "wikidata.org": "Wikidata",
  "britannica.com": "Britannica",
  "biography.com": "Biography.com",

  // International news
  "theage.com.au": "The Age",
  "smh.com.au": "Sydney Morning Herald",
  "news.com.au": "News.com.au",
  "dailymail.co.uk": "Daily Mail",
  "telegraph.co.uk": "The Telegraph",
  "independent.co.uk": "The Independent",
  "mirror.co.uk": "The Mirror",
  "metro.co.uk": "Metro UK",

  // Other entertainment
  "rollingstone.com": "Rolling Stone",
  "billboard.com": "Billboard",
  "pitchfork.com": "Pitchfork",
  "vulture.com": "Vulture",
  "avclub.com": "The A.V. Club",
  "indiewire.com": "IndieWire",
  "screenrant.com": "Screen Rant",
  "cinemablend.com": "CinemaBlend",
}

/**
 * Get a human-readable source name from a domain.
 */
export function getSourceName(domain: string): string {
  // Check exact match first
  if (SOURCE_NAMES[domain]) {
    return SOURCE_NAMES[domain]
  }

  // Check without www prefix
  const domainWithoutWww = domain.replace(/^www\./, "")
  if (SOURCE_NAMES[domainWithoutWww]) {
    return SOURCE_NAMES[domainWithoutWww]
  }

  // Format as title case domain name
  return formatDomainAsName(domainWithoutWww)
}

/**
 * Format a domain as a human-readable name.
 * "people.com" -> "People.com"
 * "hollywoodreporter.com" -> "Hollywoodreporter.com"
 */
function formatDomainAsName(domain: string): string {
  if (!domain) return "Unknown"
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}

const URL_RESOLUTION_TIMEOUT_MS = 5000

/**
 * Resolve a single redirect URL to its final destination.
 * Uses HEAD request with redirect following.
 */
export async function resolveRedirectUrl(url: string): Promise<ResolvedUrl> {
  const originalUrl = url

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), URL_RESOLUTION_TIMEOUT_MS)

    // Use HEAD request to follow redirects without downloading full content
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DeadOnFilm/1.0; +https://deadonfilm.com)",
      },
    })

    clearTimeout(timeoutId)

    // The final URL after all redirects
    const finalUrl = response.url
    const domain = extractDomain(finalUrl)
    const sourceName = getSourceName(domain)

    return {
      originalUrl,
      finalUrl,
      domain,
      sourceName,
    }
  } catch (error) {
    // On timeout or error, return the original URL
    const domain = extractDomain(originalUrl)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    return {
      originalUrl,
      finalUrl: originalUrl,
      domain,
      sourceName: getSourceName(domain),
      error: errorMessage.includes("abort") ? "Timeout" : errorMessage,
    }
  }
}

/**
 * Resolve multiple redirect URLs in parallel.
 * Uses Promise.allSettled to handle individual failures gracefully.
 */
export async function resolveRedirectUrls(urls: string[]): Promise<ResolvedUrl[]> {
  if (!urls || urls.length === 0) {
    return []
  }

  const results = await Promise.allSettled(urls.map((url) => resolveRedirectUrl(url)))

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value
    }

    // On rejection, return a placeholder with error
    const originalUrl = urls[index]
    const domain = extractDomain(originalUrl)
    return {
      originalUrl,
      finalUrl: originalUrl,
      domain,
      sourceName: getSourceName(domain),
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    }
  })
}

/**
 * Check if a URL is a Gemini grounding redirect URL.
 */
export function isGeminiRedirectUrl(url: string): boolean {
  return url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect")
}

/**
 * Filter and resolve only the Gemini redirect URLs from a list.
 * Non-redirect URLs are returned as-is.
 */
export async function resolveGeminiUrls(urls: string[]): Promise<ResolvedUrl[]> {
  const results: ResolvedUrl[] = []

  const redirectUrls: string[] = []
  const directUrls: string[] = []

  for (const url of urls) {
    if (isGeminiRedirectUrl(url)) {
      redirectUrls.push(url)
    } else {
      directUrls.push(url)
    }
  }

  // Add direct URLs as-is (no resolution needed)
  for (const url of directUrls) {
    const domain = extractDomain(url)
    results.push({
      originalUrl: url,
      finalUrl: url,
      domain,
      sourceName: getSourceName(domain),
    })
  }

  // Resolve redirect URLs
  if (redirectUrls.length > 0) {
    const resolved = await resolveRedirectUrls(redirectUrls)
    results.push(...resolved)
  }

  return results
}
