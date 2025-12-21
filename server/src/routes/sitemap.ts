import type { Request, Response } from "express"
import { getPool } from "../lib/db.js"
import { createActorSlug, createMovieSlug, createShowSlug } from "../lib/slug-utils.js"

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

    // Get all TV shows with mortality data
    const showsResult = await db.query<{
      tmdb_id: number
      name: string
      first_air_year: number | null
      updated_at: Date
    }>(`
      SELECT tmdb_id, name, EXTRACT(YEAR FROM first_air_date)::integer as first_air_year, updated_at
      FROM shows
      WHERE mortality_surprise_score IS NOT NULL
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
      { loc: "/unnatural-deaths", priority: "0.6", changefreq: "weekly" },
      { loc: "/death-watch", priority: "0.7", changefreq: "daily" },
      { loc: "/forever-young", priority: "0.6", changefreq: "weekly" },
      { loc: "/deaths", priority: "0.5", changefreq: "weekly" },
      { loc: "/movies/genres", priority: "0.5", changefreq: "weekly" },
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

    // Add TV show pages
    for (const show of showsResult.rows) {
      const slug = createShowSlug(show.name, show.first_air_year, show.tmdb_id)
      const lastmod = show.updated_at.toISOString().split("T")[0]
      xml += `  <url>
    <loc>${baseUrl}/show/${escapeXml(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
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
