import { Request, Response, NextFunction } from "express"
import { getPool } from "../lib/db/pool.js"
import { logger } from "../lib/logger.js"
import { randomUUID } from "crypto"

// Paths that should not be tracked (API endpoints, static assets, etc.)
const EXCLUDED_PATHS = [
  "/api/",
  "/admin/api/",
  "/assets/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/.well-known/",
]

// Session cookie name
const SESSION_COOKIE_NAME = "visitor_session"

// Session cookie max age (30 days in milliseconds)
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000

/**
 * Checks if a path should be tracked
 */
function shouldTrackPath(path: string): boolean {
  // Only track GET requests for HTML pages
  // Exclude API endpoints, static assets, and special files
  return !EXCLUDED_PATHS.some((excluded) => path.startsWith(excluded))
}

/**
 * Gets or creates a session ID from cookies
 */
function getOrCreateSessionId(req: Request, res: Response): string {
  let sessionId = req.cookies?.[SESSION_COOKIE_NAME]

  if (!sessionId || typeof sessionId !== "string") {
    // Generate new session ID
    sessionId = randomUUID()

    // Set cookie with 30-day expiration
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      maxAge: SESSION_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      // Don't set secure in development
      secure: process.env.NODE_ENV === "production",
    })
  }

  return sessionId
}

/**
 * Extracts the path from a full URL referrer
 * Returns null if the referrer is from a different domain
 */
function extractReferrerPath(referrer: string | undefined, hostname: string): string | null {
  if (!referrer) {
    return null
  }

  try {
    const referrerUrl = new URL(referrer)

    // Check if referrer is from same hostname (internal)
    if (referrerUrl.hostname !== hostname) {
      return null
    }

    // Return the path (including query string if present)
    return referrerUrl.pathname + referrerUrl.search
  } catch {
    // Invalid URL
    return null
  }
}

/**
 * Page visit tracking middleware
 * Records page visits for analytics, tracking internal navigation patterns
 */
export function pageVisitTracker(req: Request, res: Response, next: NextFunction): void {
  // Only track GET requests
  if (req.method !== "GET") {
    next()
    return
  }

  // Check if this path should be tracked
  if (!shouldTrackPath(req.path)) {
    next()
    return
  }

  // Get or create session ID
  const sessionId = getOrCreateSessionId(req, res)

  // Extract referrer information
  const referrerHeader = req.headers.referer || req.headers.referrer
  const hostname = req.hostname
  const referrerPath = extractReferrerPath(
    typeof referrerHeader === "string" ? referrerHeader : referrerHeader?.[0],
    hostname
  )

  // Determine if this is an internal referral
  const isInternalReferral = referrerPath !== null

  // Get visited path (including query string)
  const visitedPath = req.path + (req.url.includes("?") ? req.url.substring(req.path.length) : "")

  // Get user agent
  const userAgent = req.headers["user-agent"] || null

  // Insert page visit asynchronously (don't block the request)
  const pool = getPool()
  pool
    .query(
      `INSERT INTO page_visits (visited_path, referrer_path, is_internal_referral, session_id, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [visitedPath, referrerPath, isInternalReferral, sessionId, userAgent]
    )
    .catch((error) => {
      // Log error but don't fail the request
      logger.error({ error, visitedPath, referrerPath }, "Failed to record page visit")
    })

  // Continue with request
  next()
}
