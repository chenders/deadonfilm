/* eslint-disable security/detect-non-literal-fs-filename -- All filesystem paths are constructed from controlled config values */
/**
 * Session management for browser authentication.
 *
 * Handles cookie persistence to disk, session expiration,
 * and applying/extracting cookies from Playwright browser contexts.
 */

import fs from "fs/promises"
import path from "path"

import type { BrowserContext, Cookie } from "playwright-core"

import type { SessionManagerConfig, StoredCookie, StoredSession } from "./types.js"
import { getBrowserAuthConfig } from "./config.js"

import { consoleLog } from "../logger.js"

// Default TTL in hours
const DEFAULT_TTL_HOURS = 24

/**
 * Get the session file path for a domain.
 * Only allows valid domain characters to prevent path traversal.
 */
function getSessionFilePath(storagePath: string, domain: string): string {
  // Normalize domain (remove www. prefix)
  const normalizedDomain = domain.replace(/^www\./, "").toLowerCase()
  // Validate domain contains only safe characters (alphanumeric, dots, hyphens)
  if (!/^[a-z0-9.-]+$/.test(normalizedDomain)) {
    throw new Error(`Invalid domain for session storage: ${domain}`)
  }
  return path.join(storagePath, `${normalizedDomain}.json`) // nosemgrep: path-join-resolve-traversal
}

/**
 * Ensure the session storage directory exists.
 */
async function ensureStorageDir(storagePath: string): Promise<void> {
  try {
    await fs.mkdir(storagePath, { recursive: true })
  } catch (error) {
    // Ignore EEXIST errors
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error
    }
  }
}

/**
 * Convert a Playwright cookie to a stored cookie format.
 */
function toStoredCookie(cookie: Cookie): StoredCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }
}

/**
 * Convert a stored cookie back to Playwright format.
 */
function fromStoredCookie(cookie: StoredCookie): Cookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }
}

/**
 * Load a stored session from disk.
 *
 * @param domain - Domain to load session for (e.g., "nytimes.com")
 * @param config - Optional configuration override
 * @returns Stored session or null if not found/expired
 */
export async function loadSession(
  domain: string,
  config?: Partial<SessionManagerConfig>
): Promise<StoredSession | null> {
  const authConfig = getBrowserAuthConfig()
  const storagePath = config?.storagePath || authConfig.sessionStoragePath
  const ttlHours = config?.ttlHours || authConfig.sessionTtlHours || DEFAULT_TTL_HOURS

  const filePath = getSessionFilePath(storagePath, domain)

  try {
    const data = await fs.readFile(filePath, "utf-8")
    const session: StoredSession = JSON.parse(data)

    // Check if session is valid
    if (!isSessionValid(session, ttlHours)) {
      consoleLog(`Session for ${domain} has expired, removing...`)
      await deleteSession(domain, config)
      return null
    }

    return session
  } catch (error) {
    // File doesn't exist or is corrupted
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to load session for ${domain}:`, error)
    }
    return null
  }
}

/**
 * Save a session to disk from a browser context.
 *
 * @param domain - Domain to save session for
 * @param context - Playwright browser context to extract cookies from
 * @param loginEmail - Optional email used for login (for debugging)
 * @param config - Optional configuration override
 */
export async function saveSession(
  domain: string,
  context: BrowserContext,
  loginEmail?: string,
  config?: Partial<SessionManagerConfig>
): Promise<void> {
  const authConfig = getBrowserAuthConfig()
  const storagePath = config?.storagePath || authConfig.sessionStoragePath

  await ensureStorageDir(storagePath)

  // Get all cookies from the context
  const cookies = await context.cookies()

  // Filter to cookies for this domain
  const normalizedDomain = domain.replace(/^www\./, "").toLowerCase()
  const domainCookies = cookies.filter((c) => {
    const cookieDomain = c.domain.replace(/^\./, "").toLowerCase()
    return cookieDomain === normalizedDomain || cookieDomain.endsWith(`.${normalizedDomain}`)
  })

  if (domainCookies.length === 0) {
    console.warn(`No cookies found for domain ${domain}, skipping session save`)
    return
  }

  const session: StoredSession = {
    domain: normalizedDomain,
    cookies: domainCookies.map(toStoredCookie),
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    loginEmail,
  }

  const filePath = getSessionFilePath(storagePath, domain)

  try {
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8")
    consoleLog(`Saved session for ${domain} (${domainCookies.length} cookies)`)
  } catch (error) {
    console.error(`Failed to save session for ${domain}:`, error)
    throw error
  }
}

/**
 * Check if a stored session is still valid based on TTL.
 *
 * @param session - Session to check
 * @param ttlHours - Maximum age in hours (default: 24)
 * @returns true if session is within TTL
 */
export function isSessionValid(
  session: StoredSession,
  ttlHours: number = DEFAULT_TTL_HOURS
): boolean {
  const createdAt = new Date(session.createdAt)
  const now = new Date()
  const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

  return ageHours < ttlHours
}

/**
 * Apply stored session cookies to a browser context.
 *
 * @param session - Session to apply
 * @param context - Playwright browser context to add cookies to
 */
export async function applySessionToContext(
  session: StoredSession,
  context: BrowserContext
): Promise<void> {
  if (!session.cookies || session.cookies.length === 0) {
    return
  }

  const cookies = session.cookies.map(fromStoredCookie)

  try {
    await context.addCookies(cookies)
    consoleLog(`Applied ${cookies.length} cookies for ${session.domain}`)
  } catch (error) {
    console.error(`Failed to apply session cookies for ${session.domain}:`, error)
    throw error
  }
}

/**
 * Update the lastUsedAt timestamp for a session.
 *
 * @param domain - Domain to update
 * @param config - Optional configuration override
 */
export async function touchSession(
  domain: string,
  config?: Partial<SessionManagerConfig>
): Promise<void> {
  const authConfig = getBrowserAuthConfig()
  const storagePath = config?.storagePath || authConfig.sessionStoragePath

  const filePath = getSessionFilePath(storagePath, domain)

  try {
    const data = await fs.readFile(filePath, "utf-8")
    const session: StoredSession = JSON.parse(data)

    session.lastUsedAt = new Date().toISOString()

    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8")
  } catch (error) {
    // Silently ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to touch session for ${domain}:`, error)
    }
  }
}

/**
 * Delete a stored session.
 *
 * @param domain - Domain to delete session for
 * @param config - Optional configuration override
 */
export async function deleteSession(
  domain: string,
  config?: Partial<SessionManagerConfig>
): Promise<void> {
  const authConfig = getBrowserAuthConfig()
  const storagePath = config?.storagePath || authConfig.sessionStoragePath

  const filePath = getSessionFilePath(storagePath, domain)

  try {
    await fs.unlink(filePath)
    consoleLog(`Deleted session for ${domain}`)
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to delete session for ${domain}:`, error)
    }
  }
}

/**
 * List all stored sessions.
 *
 * @param config - Optional configuration override
 * @returns Array of session domains
 */
export async function listSessions(config?: Partial<SessionManagerConfig>): Promise<string[]> {
  const authConfig = getBrowserAuthConfig()
  const storagePath = config?.storagePath || authConfig.sessionStoragePath

  try {
    const files = await fs.readdir(storagePath)
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
  } catch (error) {
    // Directory doesn't exist
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

/**
 * Clear all expired sessions.
 *
 * @param config - Optional configuration override
 * @returns Number of sessions cleared
 */
export async function clearExpiredSessions(
  config?: Partial<SessionManagerConfig>
): Promise<number> {
  const domains = await listSessions(config)
  let cleared = 0

  for (const domain of domains) {
    // loadSession already deletes expired sessions based on config TTL
    const session = await loadSession(domain, config)
    if (!session) {
      cleared++
    }
  }

  return cleared
}

/**
 * Get session info without loading full cookies.
 *
 * @param domain - Domain to get info for
 * @param config - Optional configuration override
 * @returns Session metadata or null
 */
export async function getSessionInfo(
  domain: string,
  config?: Partial<SessionManagerConfig>
): Promise<{
  createdAt: string
  lastUsedAt: string
  cookieCount: number
  loginEmail?: string
} | null> {
  const session = await loadSession(domain, config)
  if (!session) {
    return null
  }

  return {
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    cookieCount: session.cookies.length,
    loginEmail: session.loginEmail,
  }
}
