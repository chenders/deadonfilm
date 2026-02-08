/**
 * Prerender middleware for serving fully-rendered HTML to search engine crawlers.
 *
 * When Nginx detects a bot user agent, it sets X-Prerender: 1 and proxies
 * the request to Express. This middleware checks Redis for cached HTML,
 * or calls the prerender service to render the page via headless Chrome.
 */

import type { Request, Response, NextFunction } from "express"
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from "../lib/cache.js"
import { logger } from "../lib/logger.js"

const PRERENDER_SERVICE_URL = process.env.PRERENDER_SERVICE_URL || "http://prerender:3001"

const PRERENDER_FETCH_TIMEOUT_MS = 15_000

/** Paths that should never be prerendered */
const SKIP_PATH_PREFIXES = ["/api/", "/admin/", "/health", "/sitemap", "/nr-browser.js"]

/** Paths with frequently changing content get shorter cache TTL */
const DYNAMIC_PATH_PREFIXES = ["/death-watch", "/deaths/"]

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function getTtl(path: string): number {
  if (DYNAMIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return CACHE_TTL.PRERENDER_DYNAMIC
  }
  return CACHE_TTL.PRERENDER
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

  const cacheKey = CACHE_KEYS.prerender(req.path).html

  try {
    // Check Redis cache first
    const cached = await getCached<string>(cacheKey)
    if (cached) {
      res.set("Content-Type", "text/html")
      res.set("X-Prerender-Cache", "HIT")
      res.send(cached)
      return
    }

    // Cache miss — call prerender service
    const renderUrl = `${PRERENDER_SERVICE_URL}/render?url=${encodeURIComponent(req.path)}`
    const response = await fetch(renderUrl, {
      signal: AbortSignal.timeout(PRERENDER_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      logger.warn(
        { path: req.path, status: response.status },
        "Prerender service returned non-OK status"
      )
      next()
      return
    }

    const html = await response.text()

    // Cache the rendered HTML
    const ttl = getTtl(req.path)
    await setCached(cacheKey, html, ttl)

    res.set("Content-Type", "text/html")
    res.set("X-Prerender-Cache", "MISS")
    res.send(html)
  } catch (err) {
    // On any failure, fall through — Nginx error_page will serve index.html
    logger.warn(
      { err: (err as Error).message, path: req.path },
      "Prerender failed, falling through"
    )
    next()
  }
}
