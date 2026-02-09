/**
 * Prerender middleware for serving template-based HTML to search engine crawlers.
 *
 * When Nginx detects a bot user agent, it sets X-Prerender: 1 and proxies
 * the request to Express. This middleware:
 *   1. Checks Redis for cached HTML
 *   2. Matches the URL against known frontend routes
 *   3. Fetches minimal data from the database
 *   4. Renders an HTML template with meta tags, OG/Twitter Cards, and JSON-LD
 *   5. Caches the result in Redis
 *
 * On any error, serves fallback HTML with generic site metadata —
 * strictly better than the empty SPA shell.
 */

import type { Request, Response, NextFunction } from "express"
import rateLimit from "express-rate-limit"
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from "../lib/cache.js"
import { logger } from "../lib/logger.js"
import { matchUrl } from "../lib/prerender/url-patterns.js"
import { fetchPageData } from "../lib/prerender/data-fetchers.js"
import { renderPrerenderHtml, renderFallbackHtml } from "../lib/prerender/renderer.js"

/** Rate limit for prerender requests: 20 per minute per IP */
const PRERENDER_RATE_LIMIT = 20
const RATE_LIMIT_WINDOW_MS = 60 * 1000

export const prerenderRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: PRERENDER_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many prerender requests" } },
  skip: (req) => req.headers["x-prerender"] !== "1",
})

/** Paths that should never be prerendered */
const SKIP_PATH_PREFIXES = ["/api", "/admin", "/health", "/sitemap", "/nr-browser.js", "/assets"]

/** Paths with frequently changing content get shorter cache TTL */
const DYNAMIC_PATH_PREFIXES = ["/death-watch", "/deaths", "/covid-deaths", "/unnatural-deaths"]

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function getTtl(path: string): number {
  if (path === "/") return CACHE_TTL.PRERENDER_DYNAMIC // 1 hour for home page
  if (DYNAMIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return CACHE_TTL.PRERENDER_DYNAMIC
  }
  return CACHE_TTL.PRERENDER
}

function sendHtml(res: Response, html: string, cacheHeader: string): void {
  res.set("Content-Type", "text/html")
  res.set("X-Prerender-Cache", cacheHeader)
  res.send(html)
}

export async function prerenderMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only handle requests flagged as bot by Nginx
  if (req.headers["x-prerender"] !== "1") {
    next()
    return
  }

  // Skip non-GET requests
  if (req.method !== "GET") {
    next()
    return
  }

  // Skip paths that shouldn't be prerendered
  if (shouldSkip(req.path)) {
    next()
    return
  }

  // Normalize path: strip trailing slash (except root) to match matchUrl() behavior
  // and avoid duplicate cache entries for /path vs /path/
  const normalizedPath = req.path.replace(/\/$/, "") || "/"

  // Cache key uses normalized path only (not query string) because rendered HTML
  // doesn't vary by query params — matchUrl() and fetchPageData() are path-based.
  // This prevents Redis bloat from distinct ?page=N or ?q=... variants.
  const cacheKey = CACHE_KEYS.prerender(normalizedPath).html

  try {
    // Check Redis cache first
    const cached = await getCached<string>(cacheKey)
    if (cached) {
      sendHtml(res, cached, "HIT")
      return
    }

    // Match URL against known routes
    const match = matchUrl(normalizedPath)
    if (!match) {
      // Unrecognized path — serve prerender fallback HTML directly to bots
      const fallbackHtml = renderFallbackHtml(normalizedPath)
      sendHtml(res, fallbackHtml, "FALLBACK")
      return
    }

    // Fetch page data from database
    const pageData = await fetchPageData(match)
    if (!pageData) {
      // Entity not found — return 404 so Nginx @spa_fallback serves index.html
      res.status(404).send("")
      return
    }

    // Render HTML
    const html = renderPrerenderHtml(pageData)

    // Cache the rendered HTML (fire-and-forget)
    const ttl = getTtl(normalizedPath)
    setCached(cacheKey, html, ttl).catch((err) => {
      logger.warn(
        { err: (err as Error).message, url: req.originalUrl },
        "Failed to cache prerender"
      )
    })

    sendHtml(res, html, "MISS")
  } catch (err) {
    // On any error, serve fallback HTML — better than empty SPA shell
    logger.warn(
      { err: (err as Error).message, url: req.originalUrl },
      "Prerender error, serving fallback"
    )
    try {
      const fallbackHtml = renderFallbackHtml(normalizedPath)
      sendHtml(res, fallbackHtml, "ERROR-FALLBACK")
    } catch {
      // If even fallback fails, let Nginx handle it
      next()
    }
  }
}
