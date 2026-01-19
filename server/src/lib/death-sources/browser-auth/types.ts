/**
 * Type definitions for browser authentication and CAPTCHA solving.
 *
 * This module provides types for:
 * - Site credentials and authentication configuration
 * - Session persistence and cookie management
 * - CAPTCHA detection and solving services
 * - Login handler interfaces
 */

import type { BrowserContext, Page } from "playwright-core"

// ============================================================================
// Site Credentials
// ============================================================================

/**
 * Credentials for a single site.
 */
export interface SiteCredential {
  email: string
  password: string
}

/**
 * Collection of site credentials.
 */
export interface SiteCredentials {
  nytimes?: SiteCredential
  washingtonpost?: SiteCredential
}

/**
 * Supported site identifiers for authentication.
 */
export type SupportedSite = keyof SiteCredentials

// ============================================================================
// Session Management
// ============================================================================

/**
 * Serialized cookie for storage.
 */
export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
}

/**
 * Persisted session data for a domain.
 */
export interface StoredSession {
  domain: string
  cookies: StoredCookie[]
  createdAt: string // ISO timestamp
  lastUsedAt: string // ISO timestamp
  loginEmail?: string // For debugging - which account
}

/**
 * Session manager configuration.
 */
export interface SessionManagerConfig {
  /** Directory to store session files (default: ~/.deadonfilm/sessions/) */
  storagePath: string
  /** Session TTL in hours (default: 24) */
  ttlHours: number
}

// ============================================================================
// CAPTCHA Types
// ============================================================================

/**
 * Types of CAPTCHAs we can detect and solve.
 */
export type CaptchaType = "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "perimeterx" | "unknown"

/**
 * Result from CAPTCHA detection.
 */
export interface CaptchaDetectionResult {
  detected: boolean
  type: CaptchaType | null
  siteKey: string | null
  /** CSS selector where the CAPTCHA is located */
  selector: string | null
  /** Additional context about the CAPTCHA */
  context?: string
}

/**
 * CAPTCHA solving service provider.
 */
export type CaptchaSolverProvider = "2captcha" | "capsolver"

/**
 * Configuration for CAPTCHA solving service.
 */
export interface CaptchaSolverConfig {
  provider: CaptchaSolverProvider
  apiKey: string
  /** Timeout in milliseconds for solving (default: 120000) */
  timeoutMs: number
  /** Maximum cost per solve in USD (default: 0.01) */
  maxCostPerSolve: number
}

/**
 * Result from CAPTCHA solving.
 */
export interface CaptchaSolveResult {
  success: boolean
  token: string | null
  type: CaptchaType
  /** Cost incurred in USD */
  costUsd: number
  /** Time taken in milliseconds */
  solveTimeMs: number
  error?: string
}

// ============================================================================
// Login Handler Types
// ============================================================================

/**
 * Result from a login attempt.
 */
export interface LoginResult {
  success: boolean
  /** Error message if login failed */
  error?: string
  /** Whether CAPTCHA was encountered */
  captchaEncountered: boolean
  /** Whether CAPTCHA was solved successfully */
  captchaSolved?: boolean
  /** Cost incurred for CAPTCHA solving */
  captchaCostUsd?: number
}

/**
 * Interface for site-specific login handlers.
 */
export interface LoginHandler {
  /** Domain this handler manages (e.g., "nytimes.com") */
  readonly domain: string
  /** Human-readable site name */
  readonly siteName: string

  /**
   * Check if credentials are configured for this site.
   */
  hasCredentials(): boolean

  /**
   * Perform login on the given page.
   *
   * @param page - Playwright page to perform login on
   * @param captchaSolver - Optional CAPTCHA solver configuration
   * @returns Result of the login attempt
   */
  login(page: Page, captchaSolver?: CaptchaSolverConfig): Promise<LoginResult>

  /**
   * Verify if the current page indicates a valid session.
   * Used to check if session cookies are still valid.
   *
   * @param page - Playwright page to check
   * @returns true if user appears logged in
   */
  verifySession(page: Page): Promise<boolean>
}

// ============================================================================
// Browser Auth Configuration
// ============================================================================

/**
 * Complete configuration for browser authentication.
 */
export interface BrowserAuthConfig {
  /** Master switch for authentication features */
  enabled: boolean
  /** Path to store session files */
  sessionStoragePath: string
  /** Session TTL in hours */
  sessionTtlHours: number
  /** Site credentials */
  credentials: SiteCredentials
  /** Optional CAPTCHA solver configuration */
  captchaSolver?: CaptchaSolverConfig
}

/**
 * Default browser auth configuration.
 */
export const DEFAULT_BROWSER_AUTH_CONFIG: BrowserAuthConfig = {
  enabled: false,
  sessionStoragePath: "~/.deadonfilm/sessions",
  sessionTtlHours: 24,
  credentials: {},
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Result from getting an authenticated context.
 */
export interface AuthenticatedContextResult {
  context: BrowserContext
  /** Whether we had to perform a login */
  loginPerformed: boolean
  /** Whether session was restored from disk */
  sessionRestored: boolean
  /** Cost incurred (CAPTCHA solving, etc.) */
  costUsd: number
  /** Site we authenticated with, if any */
  site?: SupportedSite
}

/**
 * Paywall detection result.
 */
export interface PaywallDetectionResult {
  detected: boolean
  /** Type of paywall (soft = dismissable, hard = requires login) */
  type: "soft" | "hard" | null
  /** Site that owns the paywall */
  site?: SupportedSite
}
