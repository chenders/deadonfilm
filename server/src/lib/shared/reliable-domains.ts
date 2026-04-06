/**
 * Shared reliable-domain registry for source credibility checks.
 *
 * Used by the surprise discovery verifier (claim corroboration) and the actor
 * API route / prerender data fetcher (sourceReliable flag on sourced facts).
 *
 * Reliability tiers are based on Wikipedia's Reliable Sources Perennial list
 * (RSP). Only domains with ReliabilityTier >= 0.9 are included:
 *   - Tier 1 News (0.95): AP, NYT, BBC, Guardian, Reuters, WaPo, LA Times
 *   - Trade Press (0.9): Variety, Deadline, Hollywood Reporter
 *   - Quality Publications (0.9+): New Yorker, Atlantic, Smithsonian, etc.
 *
 * Excluded: SECONDARY_COMPILATION (0.85, e.g. Wikipedia), MARGINAL_EDITORIAL
 * (0.65, e.g. people.com), SEARCH_AGGREGATOR (0.7), AI_MODEL (0.55), UGC.
 */

/**
 * High-reliability domains (ReliabilityTier >= 0.9).
 */
export const RELIABLE_DOMAINS = new Set([
  // Tier 1 News (0.95)
  "theguardian.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "apnews.com",
  "reuters.com",
  "washingtonpost.com",
  "latimes.com",
  // Trade Press (0.9)
  "variety.com",
  "deadline.com",
  "hollywoodreporter.com",
  // Quality Publications (0.9+)
  "newyorker.com",
  "theatlantic.com",
  "smithsonianmag.com",
  "rollingstone.com",
  "vanityfair.com",
  "time.com",
  "telegraph.co.uk",
  "independent.co.uk",
  "npr.org",
  "pbs.org",
])

/**
 * Extracts the bare domain from a URL, stripping the www. prefix.
 *
 * @param url - Full URL string
 * @returns Normalized hostname without www., or empty string on parse error
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * Checks if a domain matches any entry in RELIABLE_DOMAINS.
 *
 * Matches exact hostname (after www. strip) or any subdomain of a reliable
 * domain (e.g. "edition.cnn.com" won't match, but "news.bbc.co.uk" would
 * match "bbc.co.uk").
 *
 * @param domain - Normalized hostname (www. already stripped)
 * @returns true if the domain is considered reliable
 */
export function isReliableDomain(domain: string): boolean {
  if (RELIABLE_DOMAINS.has(domain)) {
    return true
  }
  // Check subdomain: strip leading label(s) until we find a match or run out
  const parts = domain.split(".")
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".")
    if (RELIABLE_DOMAINS.has(candidate)) {
      return true
    }
  }
  return false
}

/**
 * Convenience function combining extractDomain + isReliableDomain.
 *
 * @param url - Full URL string
 * @returns true if the URL's domain is considered reliable
 */
export function isReliableSourceUrl(url: string): boolean {
  return isReliableDomain(extractDomain(url))
}
