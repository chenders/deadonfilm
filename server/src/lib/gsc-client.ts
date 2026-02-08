/**
 * Google Search Console API client.
 *
 * Provides methods for fetching search analytics, sitemap status, and URL inspection data.
 * Uses a service account for authentication. Caches responses in Redis since GSC data
 * updates daily (no need for real-time).
 *
 * Setup:
 * 1. Create a service account in Google Cloud Console
 * 2. Enable the Search Console API
 * 3. Add the service account email as a user in Search Console
 * 4. Set GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY env vars
 */

import { google, type searchconsole_v1 } from "googleapis"
import { getCached, setCached } from "./cache.js"

// Cache TTL: 6 hours (GSC data updates ~daily)
const GSC_CACHE_TTL = 21600

const GSC_CACHE_PREFIX = "gsc"

// ============================================================================
// Types
// ============================================================================

export interface SearchPerformanceRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchPerformanceResult {
  rows: SearchPerformanceRow[]
  totals: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
}

export interface SitemapInfo {
  path: string
  lastSubmitted: string | null
  lastDownloaded: string | null
  isPending: boolean
  isIndex: boolean
  warnings: number
  errors: number
  contents: Array<{
    type: string
    submitted: number
    indexed: number
  }>
}

export interface UrlInspectionResult {
  url: string
  indexingState: string
  pageFetchState: string
  robotsTxtState: string
  lastCrawlTime: string | null
  crawledAs: string | null
  verdict: string
}

export type Dimension = "query" | "page" | "date" | "country" | "device"
export type SearchType = "web" | "image" | "video" | "news"

export interface SearchAnalyticsQuery {
  startDate: string
  endDate: string
  dimensions?: Dimension[]
  searchType?: SearchType
  rowLimit?: number
  startRow?: number
  dimensionFilterGroups?: Array<{
    filters: Array<{
      dimension: Dimension
      operator: "equals" | "contains" | "notContains"
      expression: string
    }>
  }>
}

// ============================================================================
// Client
// ============================================================================

let cachedClient: searchconsole_v1.Searchconsole | null = null

function getSiteUrl(): string {
  const siteUrl = process.env.GSC_SITE_URL
  if (!siteUrl) {
    throw new Error("GSC_SITE_URL environment variable is required")
  }
  return siteUrl
}

/**
 * Check if GSC integration is configured.
 */
export function isGscConfigured(): boolean {
  return !!(
    process.env.GSC_SERVICE_ACCOUNT_EMAIL &&
    process.env.GSC_PRIVATE_KEY &&
    process.env.GSC_SITE_URL
  )
}

/**
 * Get an authenticated Search Console API client.
 * Uses service account credentials from environment variables.
 */
function getClient(): searchconsole_v1.Searchconsole {
  if (cachedClient) return cachedClient

  const email = process.env.GSC_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GSC_PRIVATE_KEY

  if (!email || !privateKey) {
    throw new Error(
      "GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY environment variables are required"
    )
  }

  // Private key comes from env with escaped newlines
  const formattedKey = privateKey.replace(/\\n/g, "\n")

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ],
  })

  cachedClient = google.searchconsole({ version: "v1", auth })
  return cachedClient
}

// ============================================================================
// Search Analytics
// ============================================================================

/**
 * Query search analytics data from GSC.
 * Returns impressions, clicks, CTR, and position data.
 */
export async function querySearchAnalytics(
  query: SearchAnalyticsQuery
): Promise<SearchPerformanceResult> {
  const cacheKey = `${GSC_CACHE_PREFIX}:analytics:${JSON.stringify(query)}`
  const cached = await getCached<SearchPerformanceResult>(cacheKey)
  if (cached) return cached

  const client = getClient()
  const siteUrl = getSiteUrl()

  const response = await client.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: query.startDate,
      endDate: query.endDate,
      dimensions: query.dimensions,
      type: query.searchType || "web",
      rowLimit: query.rowLimit || 1000,
      startRow: query.startRow || 0,
      dimensionFilterGroups: query.dimensionFilterGroups,
    },
  })

  const rows = (response.data.rows || []).map((row) => ({
    keys: row.keys || [],
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))

  // Calculate totals
  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
      ctr: 0, // Recalculated below
      position: 0, // Recalculated below
    }),
    { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  )

  // CTR = total clicks / total impressions
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0

  // Average position weighted by impressions
  const weightedPosition = rows.reduce((sum, row) => sum + row.position * row.impressions, 0)
  totals.position = totals.impressions > 0 ? weightedPosition / totals.impressions : 0

  const result: SearchPerformanceResult = { rows, totals }

  await setCached(cacheKey, result, GSC_CACHE_TTL)
  return result
}

/**
 * Get search performance over time (by date).
 */
export async function getSearchPerformanceOverTime(
  startDate: string,
  endDate: string,
  searchType?: SearchType
): Promise<SearchPerformanceResult> {
  return querySearchAnalytics({
    startDate,
    endDate,
    dimensions: ["date"],
    searchType,
  })
}

/**
 * Get top queries by clicks.
 */
export async function getTopQueries(
  startDate: string,
  endDate: string,
  limit = 50
): Promise<SearchPerformanceResult> {
  return querySearchAnalytics({
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit: limit,
  })
}

/**
 * Get top pages by clicks.
 */
export async function getTopPages(
  startDate: string,
  endDate: string,
  limit = 50
): Promise<SearchPerformanceResult> {
  return querySearchAnalytics({
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit: limit,
  })
}

/**
 * Get performance broken down by page type.
 * Filters by URL pattern to categorize pages.
 */
export async function getPerformanceByPageType(
  startDate: string,
  endDate: string
): Promise<Record<string, { clicks: number; impressions: number; ctr: number; position: number }>> {
  const result = await querySearchAnalytics({
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit: 5000,
  })

  const siteUrl = getSiteUrl().replace(/\/$/, "")

  // Categorize pages by URL pattern
  const categories: Record<
    string,
    { clicks: number; impressions: number; totalPosition: number; totalImpressions: number }
  > = {}

  for (const row of result.rows) {
    const url = row.keys[0] || ""
    let path: string
    try {
      path = new URL(url).pathname
    } catch {
      path = url.replace(siteUrl, "")
    }
    const category = categorizeUrl(path)

    if (!categories[category]) {
      categories[category] = { clicks: 0, impressions: 0, totalPosition: 0, totalImpressions: 0 }
    }

    categories[category].clicks += row.clicks
    categories[category].impressions += row.impressions
    categories[category].totalPosition += row.position * row.impressions
    categories[category].totalImpressions += row.impressions
  }

  // Convert to final format
  const output: Record<
    string,
    { clicks: number; impressions: number; ctr: number; position: number }
  > = {}

  for (const [category, data] of Object.entries(categories)) {
    output[category] = {
      clicks: data.clicks,
      impressions: data.impressions,
      ctr: data.impressions > 0 ? data.clicks / data.impressions : 0,
      position: data.totalImpressions > 0 ? data.totalPosition / data.totalImpressions : 0,
    }
  }

  return output
}

/**
 * Categorize a URL path into a page type.
 */
export function categorizeUrl(path: string): string {
  if (path === "/" || path === "") return "home"
  if (path.startsWith("/actor/") && path.includes("/death")) return "actor-death"
  if (path.startsWith("/actor/")) return "actor"
  if (path.startsWith("/movie/")) return "movie"
  if (path.startsWith("/show/")) return "show"
  if (path.startsWith("/episode/")) return "episode"
  if (path.startsWith("/deaths/")) return "deaths"
  if (path.startsWith("/causes-of-death")) return "causes-of-death"
  if (path.startsWith("/movies/genre")) return "genre"
  if (path === "/forever-young") return "curated"
  if (path === "/covid-deaths") return "curated"
  if (path === "/unnatural-deaths") return "curated"
  if (path === "/death-watch") return "curated"
  return "other"
}

// ============================================================================
// Sitemaps
// ============================================================================

/**
 * Get sitemap submission status.
 */
export async function getSitemaps(): Promise<SitemapInfo[]> {
  const cacheKey = `${GSC_CACHE_PREFIX}:sitemaps`
  const cached = await getCached<SitemapInfo[]>(cacheKey)
  if (cached) return cached

  const client = getClient()
  const siteUrl = getSiteUrl()

  const response = await client.sitemaps.list({ siteUrl })

  const sitemaps: SitemapInfo[] = (response.data.sitemap || []).map((sm) => ({
    path: sm.path || "",
    lastSubmitted: sm.lastSubmitted || null,
    lastDownloaded: sm.lastDownloaded || null,
    isPending: sm.isPending || false,
    isIndex: sm.isSitemapsIndex || false,
    warnings: Number(sm.warnings) || 0,
    errors: Number(sm.errors) || 0,
    contents: (sm.contents || []).map((c) => ({
      type: c.type || "unknown",
      submitted: Number(c.submitted) || 0,
      indexed: Number(c.indexed) || 0,
    })),
  }))

  await setCached(cacheKey, sitemaps, GSC_CACHE_TTL)
  return sitemaps
}

// ============================================================================
// URL Inspection
// ============================================================================

/**
 * Inspect a specific URL's indexing status.
 * Note: This has a quota of 2000 requests/day, use sparingly.
 */
export async function inspectUrl(url: string): Promise<UrlInspectionResult> {
  const cacheKey = `${GSC_CACHE_PREFIX}:inspect:${url}`
  const cached = await getCached<UrlInspectionResult>(cacheKey)
  if (cached) return cached

  const client = getClient()
  const siteUrl = getSiteUrl()

  const response = await client.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl: url,
      siteUrl,
    },
  })

  const inspectionResult = response.data.inspectionResult

  const result: UrlInspectionResult = {
    url,
    indexingState: inspectionResult?.indexStatusResult?.coverageState || "unknown",
    pageFetchState: inspectionResult?.indexStatusResult?.pageFetchState || "unknown",
    robotsTxtState: inspectionResult?.indexStatusResult?.robotsTxtState || "unknown",
    lastCrawlTime: inspectionResult?.indexStatusResult?.lastCrawlTime || null,
    crawledAs: inspectionResult?.indexStatusResult?.crawledAs || null,
    verdict: inspectionResult?.indexStatusResult?.verdict || "unknown",
  }

  await setCached(cacheKey, result, GSC_CACHE_TTL)
  return result
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get date string N days ago in YYYY-MM-DD format.
 */
export function daysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString().split("T")[0]
}

/**
 * Reset the cached client (useful for testing).
 */
export function resetGscClient(): void {
  cachedClient = null
}
