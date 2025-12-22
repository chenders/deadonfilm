import type { Request, Response } from "express"
import { getPool } from "../lib/db.js"
import { createActorSlug, createMovieSlug, createShowSlug } from "../lib/slug-utils.js"

const BASE_URL = "https://deadonfilm.com"
const URLS_PER_SITEMAP = 50000

/**
 * Escapes special XML characters in a string
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
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
  { loc: "/movies/genres", priority: "0.5", changefreq: "weekly" },
]

/**
 * Sets common sitemap response headers
 */
function setSitemapHeaders(res: Response): void {
  res.set("Content-Type", "application/xml")
  res.set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
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

/**
 * GET /sitemap.xml
 * Returns a sitemap index pointing to individual sitemaps for each content type
 */
export async function getSitemapIndex(_req: Request, res: Response) {
  try {
    const db = getPool()

    // Get counts for each content type to determine pagination
    const [moviesCount, actorsCount, showsCount] = await Promise.all([
      db.query<{ count: string }>(
        "SELECT COUNT(*) FROM movies WHERE mortality_surprise_score IS NOT NULL"
      ),
      db.query<{ count: string }>("SELECT COUNT(*) FROM deceased_persons"),
      db.query<{ count: string }>(
        "SELECT COUNT(*) FROM shows WHERE mortality_surprise_score IS NOT NULL"
      ),
    ])

    const moviePages = Math.ceil(parseInt(moviesCount.rows[0].count) / URLS_PER_SITEMAP)
    const actorPages = Math.ceil(parseInt(actorsCount.rows[0].count) / URLS_PER_SITEMAP)
    const showPages = Math.ceil(parseInt(showsCount.rows[0].count) / URLS_PER_SITEMAP)

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static.xml</loc>
  </sitemap>
`

    xml += generateSitemapIndexEntries(moviePages, "sitemap-movies")
    xml += generateSitemapIndexEntries(actorPages, "sitemap-actors")
    xml += generateSitemapIndexEntries(showPages, "sitemap-shows")

    xml += `</sitemapindex>`

    setSitemapHeaders(res)
    res.send(xml)
  } catch (error) {
    console.error("Sitemap index generation error:", error)
    res.status(500).send("Error generating sitemap index")
  }
}

/**
 * GET /sitemap-static.xml
 * Returns sitemap for static pages
 */
export async function getStaticSitemap(_req: Request, res: Response) {
  try {
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

    setSitemapHeaders(res)
    res.send(xml)
  } catch (error) {
    console.error("Static sitemap generation error:", error)
    res.status(500).send("Error generating static sitemap")
  }
}

/**
 * GET /sitemap-movies.xml or /sitemap-movies-{page}.xml
 * Returns sitemap for movie pages (paginated if >50k entries)
 */
export async function getMoviesSitemap(req: Request, res: Response) {
  try {
    const page = parseInt(req.params.page || "1", 10)
    if (isNaN(page) || page < 1) {
      res.status(400).send("Invalid page number")
      return
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
      res.status(404).send("Sitemap page not found")
      return
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

    setSitemapHeaders(res)
    res.send(xml)
  } catch (error) {
    console.error("Movies sitemap generation error:", error)
    res.status(500).send("Error generating movies sitemap")
  }
}

/**
 * GET /sitemap-actors.xml or /sitemap-actors-{page}.xml
 * Returns sitemap for actor pages (paginated if >50k entries)
 */
export async function getActorsSitemap(req: Request, res: Response) {
  try {
    const page = parseInt(req.params.page || "1", 10)
    if (isNaN(page) || page < 1) {
      res.status(400).send("Invalid page number")
      return
    }

    const offset = (page - 1) * URLS_PER_SITEMAP
    const db = getPool()

    const actorsResult = await db.query<{
      tmdb_id: number
      name: string
      updated_at: Date
    }>(
      `
      SELECT tmdb_id, name, updated_at
      FROM deceased_persons
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `,
      [URLS_PER_SITEMAP, offset]
    )

    if (actorsResult.rows.length === 0 && page > 1) {
      res.status(404).send("Sitemap page not found")
      return
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

    for (const actor of actorsResult.rows) {
      const slug = createActorSlug(actor.name, actor.tmdb_id)
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

    setSitemapHeaders(res)
    res.send(xml)
  } catch (error) {
    console.error("Actors sitemap generation error:", error)
    res.status(500).send("Error generating actors sitemap")
  }
}

/**
 * GET /sitemap-shows.xml or /sitemap-shows-{page}.xml
 * Returns sitemap for TV show pages (paginated if >50k entries)
 */
export async function getShowsSitemap(req: Request, res: Response) {
  try {
    const page = parseInt(req.params.page || "1", 10)
    if (isNaN(page) || page < 1) {
      res.status(400).send("Invalid page number")
      return
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
      res.status(404).send("Sitemap page not found")
      return
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

    setSitemapHeaders(res)
    res.send(xml)
  } catch (error) {
    console.error("Shows sitemap generation error:", error)
    res.status(500).send("Error generating shows sitemap")
  }
}
