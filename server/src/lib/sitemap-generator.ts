import { getPool } from "./db.js"
import { createActorSlug, createMovieSlug, createShowSlug } from "./slug-utils.js"

const BASE_URL = "https://deadonfilm.com"
export const URLS_PER_SITEMAP = 50000

interface SitemapPage {
  loc: string
  priority: string
  changefreq: string
}

/**
 * Generate paginated page entries for the sitemap (pages 2 through maxPage)
 */
function generatePaginatedPages(
  basePath: string,
  maxPage: number,
  priority: string
): SitemapPage[] {
  const pages: SitemapPage[] = []
  for (let i = 2; i <= maxPage; i++) {
    pages.push({ loc: `${basePath}?page=${i}`, priority, changefreq: "weekly" })
  }
  return pages
}

/**
 * Static pages configuration
 */
const staticPages = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  { loc: "/cursed-movies", priority: "0.8", changefreq: "weekly" },
  { loc: "/cursed-actors", priority: "0.8", changefreq: "weekly" },
  { loc: "/covid-deaths", priority: "0.6", changefreq: "weekly" },
  { loc: "/unnatural-deaths", priority: "0.6", changefreq: "weekly" },
  { loc: "/death-watch", priority: "0.7", changefreq: "daily" },
  { loc: "/forever-young", priority: "0.6", changefreq: "weekly" },
  { loc: "/deaths", priority: "0.5", changefreq: "weekly" },
  { loc: "/deaths/all", priority: "0.5", changefreq: "weekly" },
  { loc: "/deaths/notable", priority: "0.7", changefreq: "weekly" },
  { loc: "/movies/genres", priority: "0.5", changefreq: "weekly" },
  // Causes of death 3-level hierarchy
  { loc: "/causes-of-death", priority: "0.7", changefreq: "weekly" },
  { loc: "/causes-of-death/cancer", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/heart-disease", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/respiratory", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/neurological", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/overdose", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/accident", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/suicide", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/homicide", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/infectious", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/liver-kidney", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/natural", priority: "0.6", changefreq: "weekly" },
  { loc: "/causes-of-death/other", priority: "0.5", changefreq: "weekly" },
  // Authority/trust pages
  { loc: "/about", priority: "0.4", changefreq: "monthly" },
  { loc: "/faq", priority: "0.5", changefreq: "monthly" },
  { loc: "/methodology", priority: "0.5", changefreq: "monthly" },
  { loc: "/data-sources", priority: "0.4", changefreq: "monthly" },
  // Paginated pages (first few pages of major lists)
  ...generatePaginatedPages("/deaths/all", 5, "0.3"),
  ...generatePaginatedPages("/deaths/notable", 5, "0.4"),
  ...generatePaginatedPages("/cursed-movies", 5, "0.4"),
  ...generatePaginatedPages("/cursed-actors", 5, "0.4"),
]

/**
 * Escapes special XML characters in a string
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * Generates sitemap index entries for a content type with pagination support
 */
function generateSitemapIndexEntries(pageCount: number, pathPrefix: string): string {
  if (pageCount <= 1) {
    return `  <sitemap>
    <loc>${BASE_URL}/${pathPrefix}.xml</loc>
  </sitemap>
`
  }
  let entries = ""
  for (let i = 1; i <= pageCount; i++) {
    entries += `  <sitemap>
    <loc>${BASE_URL}/${pathPrefix}-${i}.xml</loc>
  </sitemap>
`
  }
  return entries
}

export interface PageCounts {
  movies: number
  actors: number
  shows: number
  deathDetails: number
}

/**
 * Get page counts for each content type based on current database content
 */
export async function getPageCounts(): Promise<PageCounts> {
  const db = getPool()

  const [moviesCount, actorsCount, showsCount, deathDetailsCount] = await Promise.all([
    db.query<{ count: string }>(
      "SELECT COUNT(*) FROM movies WHERE mortality_surprise_score IS NOT NULL"
    ),
    db.query<{ count: string }>("SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL"),
    db.query<{ count: string }>(
      "SELECT COUNT(*) FROM shows WHERE mortality_surprise_score IS NOT NULL"
    ),
    db.query<{ count: string }>(
      "SELECT COUNT(*) FROM actors WHERE has_detailed_death_info = true AND deathday IS NOT NULL"
    ),
  ])

  return {
    movies: Math.ceil(parseInt(moviesCount.rows[0].count) / URLS_PER_SITEMAP),
    actors: Math.ceil(parseInt(actorsCount.rows[0].count) / URLS_PER_SITEMAP),
    shows: Math.ceil(parseInt(showsCount.rows[0].count) / URLS_PER_SITEMAP),
    deathDetails: Math.ceil(parseInt(deathDetailsCount.rows[0].count) / URLS_PER_SITEMAP),
  }
}

/**
 * Generates the sitemap index XML pointing to individual sitemaps
 */
export async function generateSitemapIndex(): Promise<string> {
  const pageCounts = await getPageCounts()

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static.xml</loc>
  </sitemap>
`

  xml += generateSitemapIndexEntries(pageCounts.movies, "sitemap-movies")
  xml += generateSitemapIndexEntries(pageCounts.actors, "sitemap-actors")
  xml += generateSitemapIndexEntries(pageCounts.shows, "sitemap-shows")
  xml += generateSitemapIndexEntries(pageCounts.deathDetails, "sitemap-death-details")

  xml += `</sitemapindex>`

  return xml
}

/**
 * Generates the static pages sitemap XML
 */
export async function generateStaticSitemap(): Promise<string> {
  const today = new Date().toISOString().split("T")[0]

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

  for (const page of staticPages) {
    xml += `  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`
  }

  xml += `</urlset>`

  return xml
}

export interface SitemapResult {
  xml: string
  isEmpty: boolean
  notFound: boolean
}

/**
 * Generates movies sitemap XML for a specific page
 */
export async function generateMoviesSitemap(page: number): Promise<SitemapResult> {
  if (isNaN(page) || page < 1) {
    return { xml: "", isEmpty: false, notFound: false }
  }

  const offset = (page - 1) * URLS_PER_SITEMAP
  const db = getPool()

  const moviesResult = await db.query<{
    tmdb_id: number
    title: string
    release_year: number | null
    updated_at: Date
  }>(
    `
    SELECT tmdb_id, title, release_year, updated_at
    FROM movies
    WHERE mortality_surprise_score IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `,
    [URLS_PER_SITEMAP, offset]
  )

  if (moviesResult.rows.length === 0 && page > 1) {
    return { xml: "", isEmpty: false, notFound: true }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

  for (const movie of moviesResult.rows) {
    const slug = createMovieSlug(movie.title, movie.release_year, movie.tmdb_id)
    const lastmod = movie.updated_at.toISOString().split("T")[0]
    xml += `  <url>
    <loc>${BASE_URL}/movie/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`
  }

  xml += `</urlset>`

  return { xml, isEmpty: moviesResult.rows.length === 0, notFound: false }
}

/**
 * Generates actors sitemap XML for a specific page
 */
export async function generateActorsSitemap(page: number): Promise<SitemapResult> {
  if (isNaN(page) || page < 1) {
    return { xml: "", isEmpty: false, notFound: false }
  }

  const offset = (page - 1) * URLS_PER_SITEMAP
  const db = getPool()

  const actorsResult = await db.query<{
    id: number
    name: string
    updated_at: Date
  }>(
    `
    SELECT id, name, updated_at
    FROM actors
    WHERE deathday IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `,
    [URLS_PER_SITEMAP, offset]
  )

  if (actorsResult.rows.length === 0 && page > 1) {
    return { xml: "", isEmpty: false, notFound: true }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

  for (const actor of actorsResult.rows) {
    const slug = createActorSlug(actor.name, actor.id)
    const lastmod = actor.updated_at.toISOString().split("T")[0]
    xml += `  <url>
    <loc>${BASE_URL}/actor/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`
  }

  xml += `</urlset>`

  return { xml, isEmpty: actorsResult.rows.length === 0, notFound: false }
}

/**
 * Generates shows sitemap XML for a specific page
 */
export async function generateShowsSitemap(page: number): Promise<SitemapResult> {
  if (isNaN(page) || page < 1) {
    return { xml: "", isEmpty: false, notFound: false }
  }

  const offset = (page - 1) * URLS_PER_SITEMAP
  const db = getPool()

  const showsResult = await db.query<{
    tmdb_id: number
    name: string
    first_air_year: number | null
    updated_at: Date
  }>(
    `
    SELECT tmdb_id, name, EXTRACT(YEAR FROM first_air_date)::integer as first_air_year, updated_at
    FROM shows
    WHERE mortality_surprise_score IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `,
    [URLS_PER_SITEMAP, offset]
  )

  if (showsResult.rows.length === 0 && page > 1) {
    return { xml: "", isEmpty: false, notFound: true }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

  for (const show of showsResult.rows) {
    const slug = createShowSlug(show.name, show.first_air_year, show.tmdb_id)
    const lastmod = show.updated_at.toISOString().split("T")[0]
    xml += `  <url>
    <loc>${BASE_URL}/show/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`
  }

  xml += `</urlset>`

  return { xml, isEmpty: showsResult.rows.length === 0, notFound: false }
}

/**
 * Generates death details sitemap XML for a specific page
 * Only includes actors with has_detailed_death_info = true
 */
export async function generateDeathDetailsSitemap(page: number): Promise<SitemapResult> {
  if (isNaN(page) || page < 1) {
    return { xml: "", isEmpty: false, notFound: false }
  }

  const offset = (page - 1) * URLS_PER_SITEMAP
  const db = getPool()

  const actorsResult = await db.query<{
    id: number
    name: string
    updated_at: Date
  }>(
    `
    SELECT id, name, updated_at
    FROM actors
    WHERE has_detailed_death_info = true AND deathday IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `,
    [URLS_PER_SITEMAP, offset]
  )

  if (actorsResult.rows.length === 0 && page > 1) {
    return { xml: "", isEmpty: false, notFound: true }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

  for (const actor of actorsResult.rows) {
    const slug = createActorSlug(actor.name, actor.id)
    const lastmod = actor.updated_at.toISOString().split("T")[0]
    xml += `  <url>
    <loc>${BASE_URL}/actor/${escapeXml(slug)}/death</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`
  }

  xml += `</urlset>`

  return { xml, isEmpty: actorsResult.rows.length === 0, notFound: false }
}

export interface GeneratedSitemaps {
  files: Map<string, string>
  pageCounts: PageCounts
}

/**
 * Generates all sitemap files and returns them as a map of filename -> content
 */
export async function generateAllSitemaps(): Promise<GeneratedSitemaps> {
  const files = new Map<string, string>()
  const pageCounts = await getPageCounts()

  // Generate index
  files.set("sitemap.xml", await generateSitemapIndex())

  // Generate static sitemap
  files.set("sitemap-static.xml", await generateStaticSitemap())

  // Generate movie sitemaps
  if (pageCounts.movies <= 1) {
    const result = await generateMoviesSitemap(1)
    files.set("sitemap-movies.xml", result.xml)
  } else {
    for (let i = 1; i <= pageCounts.movies; i++) {
      const result = await generateMoviesSitemap(i)
      files.set(`sitemap-movies-${i}.xml`, result.xml)
    }
  }

  // Generate actor sitemaps
  if (pageCounts.actors <= 1) {
    const result = await generateActorsSitemap(1)
    files.set("sitemap-actors.xml", result.xml)
  } else {
    for (let i = 1; i <= pageCounts.actors; i++) {
      const result = await generateActorsSitemap(i)
      files.set(`sitemap-actors-${i}.xml`, result.xml)
    }
  }

  // Generate show sitemaps
  if (pageCounts.shows <= 1) {
    const result = await generateShowsSitemap(1)
    files.set("sitemap-shows.xml", result.xml)
  } else {
    for (let i = 1; i <= pageCounts.shows; i++) {
      const result = await generateShowsSitemap(i)
      files.set(`sitemap-shows-${i}.xml`, result.xml)
    }
  }

  // Generate death details sitemaps
  if (pageCounts.deathDetails <= 1) {
    const result = await generateDeathDetailsSitemap(1)
    files.set("sitemap-death-details.xml", result.xml)
  } else {
    for (let i = 1; i <= pageCounts.deathDetails; i++) {
      const result = await generateDeathDetailsSitemap(i)
      files.set(`sitemap-death-details-${i}.xml`, result.xml)
    }
  }

  return { files, pageCounts }
}
