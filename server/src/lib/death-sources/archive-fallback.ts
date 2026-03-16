/**
 * Archive fallback re-exports from @debriefer/browser.
 *
 * Preserves existing import paths for link-follower.ts and other consumers.
 * Keeps the deadonfilm-specific domain list for shouldUseArchiveFallback().
 */

export {
  fetchFromArchiveOrg as fetchFromArchive,
  fetchFromArchiveIs,
  searchArchiveIsWithBrowser,
  checkArchiveAvailability,
  checkArchiveIsAvailability,
  getArchiveUrl,
  type ArchiveAvailability,
  type ArchiveFetchResult,
} from "@debriefer/browser"

// Deadonfilm-specific: domains worth trying archive fallbacks for
const ARCHIVE_FALLBACK_DOMAINS = [
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "latimes.com",
  "bostonglobe.com",
  "telegraph.co.uk",
  "imdb.com",
  "variety.com",
  "deadline.com",
  "apnews.com",
  "reuters.com",
  "legacy.com",
  "ibdb.com",
]

/** Check if a URL's domain is in the list of sites worth trying archive fallbacks for. */
export function shouldUseArchiveFallback(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return ARCHIVE_FALLBACK_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
