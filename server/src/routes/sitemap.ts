import type { Request, Response } from "express"
import { getPool } from "../lib/db.js"

/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * (Server-side version of the frontend utility)
 */
function createMovieSlug(title: string, releaseYear: number | null, tmdbId: number): string {
  const year = releaseYear?.toString() || "unknown"
  const slug = title
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove apostrophes
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

  return `${slug}-${year}-${tmdbId}`
}

/**
 * Creates a URL-safe slug from an actor name and ID
 * (Server-side version of the frontend utility)
 */
function createActorSlug(name: string, tmdbId: number): string {
  const slug = name
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove apostrophes
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

  return `${slug}-${tmdbId}`
}

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
 * GET /sitemap.xml
 * Generates a dynamic XML sitemap including all movies and actors
 */
export async function getSitemap(_req: Request, res: Response) {
  try {
    const db = getPool()

    // Get all movies with mortality data
    const moviesResult = await db.query<{
      tmdb_id: number
      title: string
      release_year: number | null
      updated_at: Date
    }>(`
      SELECT tmdb_id, title, release_year, updated_at
      FROM movies
      WHERE mortality_surprise_score IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 50000
    `)

    // Get all deceased persons (actors)
    const actorsResult = await db.query<{
      tmdb_id: number
      name: string
      updated_at: Date
    }>(`
      SELECT tmdb_id, name, updated_at
      FROM deceased_persons
      ORDER BY updated_at DESC
      LIMIT 50000
    `)

    const baseUrl = "https://deadonfilm.com"
    const today = new Date().toISOString().split("T")[0]

    // Static pages
    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/cursed-movies", priority: "0.8", changefreq: "weekly" },
      { loc: "/cursed-actors", priority: "0.8", changefreq: "weekly" },
      { loc: "/covid-deaths", priority: "0.6", changefreq: "weekly" },
      { loc: "/death-watch", priority: "0.7", changefreq: "daily" },
    ]

    // Build sitemap XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`

    // Add static pages
    for (const page of staticPages) {
      xml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`
    }

    // Add movie pages
    for (const movie of moviesResult.rows) {
      const slug = createMovieSlug(movie.title, movie.release_year, movie.tmdb_id)
      const lastmod = movie.updated_at.toISOString().split("T")[0]
      xml += `  <url>
    <loc>${baseUrl}/movie/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`
    }

    // Add actor pages
    for (const actor of actorsResult.rows) {
      const slug = createActorSlug(actor.name, actor.tmdb_id)
      const lastmod = actor.updated_at.toISOString().split("T")[0]
      xml += `  <url>
    <loc>${baseUrl}/actor/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`
    }

    xml += `</urlset>`

    res.set("Content-Type", "application/xml")
    res.set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
    res.send(xml)
  } catch (error) {
    console.error("Sitemap generation error:", error)
    res.status(500).send("Error generating sitemap")
  }
}
