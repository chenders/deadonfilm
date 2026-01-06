import type { Request, Response } from "express"
import {
  generateSitemapIndex,
  generateStaticSitemap,
  generateMoviesSitemap,
  generateActorsSitemap,
  generateShowsSitemap,
  generateDeathDetailsSitemap,
} from "../lib/sitemap-generator.js"

/**
 * Sets common sitemap response headers
 */
function setSitemapHeaders(res: Response): void {
  res.set("Content-Type", "application/xml")
  res.set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
}

/**
 * GET /sitemap.xml
 * Returns a sitemap index pointing to individual sitemaps for each content type
 */
export async function getSitemapIndex(_req: Request, res: Response) {
  try {
    const xml = await generateSitemapIndex()
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
    const xml = await generateStaticSitemap()
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

    const result = await generateMoviesSitemap(page)

    if (result.notFound) {
      res.status(404).send("Sitemap page not found")
      return
    }

    setSitemapHeaders(res)
    res.send(result.xml)
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

    const result = await generateActorsSitemap(page)

    if (result.notFound) {
      res.status(404).send("Sitemap page not found")
      return
    }

    setSitemapHeaders(res)
    res.send(result.xml)
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

    const result = await generateShowsSitemap(page)

    if (result.notFound) {
      res.status(404).send("Sitemap page not found")
      return
    }

    setSitemapHeaders(res)
    res.send(result.xml)
  } catch (error) {
    console.error("Shows sitemap generation error:", error)
    res.status(500).send("Error generating shows sitemap")
  }
}

/**
 * GET /sitemap-death-details.xml or /sitemap-death-details-{page}.xml
 * Returns sitemap for death details pages (actors with has_detailed_death_info = true)
 */
export async function getDeathDetailsSitemap(req: Request, res: Response) {
  try {
    const page = parseInt(req.params.page || "1", 10)
    if (isNaN(page) || page < 1) {
      res.status(400).send("Invalid page number")
      return
    }

    const result = await generateDeathDetailsSitemap(page)

    if (result.notFound) {
      res.status(404).send("Sitemap page not found")
      return
    }

    setSitemapHeaders(res)
    res.send(result.xml)
  } catch (error) {
    console.error("Death details sitemap generation error:", error)
    res.status(500).send("Error generating death details sitemap")
  }
}
