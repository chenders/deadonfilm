/**
 * Configuration loading for browser authentication.
 *
 * Loads credentials and settings from environment variables.
 * Validates configuration and provides type-safe access.
 */

import os from "os"
import path from "path"

import type {
  BrowserAuthConfig,
  CaptchaSolverConfig,
  CaptchaSolverProvider,
  SiteCredentials,
} from "./types.js"
import { DEFAULT_BROWSER_AUTH_CONFIG } from "./types.js"

// Environment variable names
const ENV = {
  // Master switch
  BROWSER_AUTH_ENABLED: "BROWSER_AUTH_ENABLED",

  // Session settings
  SESSION_STORAGE_PATH: "BROWSER_AUTH_SESSION_PATH",
  SESSION_TTL_HOURS: "BROWSER_AUTH_SESSION_TTL_HOURS",

  // NYTimes credentials (support both naming conventions)
  NYTIMES_EMAIL: "NYTIMES_AUTH_EMAIL",
  NYTIMES_EMAIL_ALT: "NYTIMES_EMAIL",
  NYTIMES_PASSWORD: "NYTIMES_AUTH_PASSWORD",
  NYTIMES_PASSWORD_ALT: "NYTIMES_PASSWORD",

  // Washington Post credentials (support both naming conventions)
  WAPO_EMAIL: "WASHPOST_AUTH_EMAIL",
  WAPO_EMAIL_ALT: "WAPO_EMAIL",
  WAPO_PASSWORD: "WASHPOST_AUTH_PASSWORD",
  WAPO_PASSWORD_ALT: "WAPO_PASSWORD",

  // CAPTCHA solver
  CAPTCHA_SOLVER_PROVIDER: "CAPTCHA_SOLVER_PROVIDER",
  TWOCAPTCHA_API_KEY: "TWOCAPTCHA_API_KEY",
  CAPSOLVER_API_KEY: "CAPSOLVER_API_KEY",
  CAPTCHA_TIMEOUT_MS: "CAPTCHA_TIMEOUT_MS",
  CAPTCHA_MAX_COST: "CAPTCHA_MAX_COST",
} as const

// Default values
const DEFAULT_SESSION_TTL_HOURS = 24
const DEFAULT_CAPTCHA_TIMEOUT_MS = 120000
const DEFAULT_CAPTCHA_MAX_COST = 0.01

/**
 * Expand ~ to home directory in a path.
 */
function expandHomePath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}

/**
 * Load site credentials from environment variables.
 * Supports multiple naming conventions for backwards compatibility.
 */
function loadCredentials(): SiteCredentials {
  const credentials: SiteCredentials = {}

  // NYTimes - try primary names first, fall back to alternatives
  const nytimesEmail = process.env[ENV.NYTIMES_EMAIL] || process.env[ENV.NYTIMES_EMAIL_ALT]
  const nytimesPassword = process.env[ENV.NYTIMES_PASSWORD] || process.env[ENV.NYTIMES_PASSWORD_ALT]
  if (nytimesEmail && nytimesPassword) {
    credentials.nytimes = { email: nytimesEmail, password: nytimesPassword }
  }

  // Washington Post - try primary names first, fall back to alternatives
  const wapoEmail = process.env[ENV.WAPO_EMAIL] || process.env[ENV.WAPO_EMAIL_ALT]
  const wapoPassword = process.env[ENV.WAPO_PASSWORD] || process.env[ENV.WAPO_PASSWORD_ALT]
  if (wapoEmail && wapoPassword) {
    credentials.washingtonpost = { email: wapoEmail, password: wapoPassword }
  }

  return credentials
}

/**
 * Load CAPTCHA solver configuration from environment variables.
 */
function loadCaptchaSolverConfig(): CaptchaSolverConfig | undefined {
  const provider = process.env[ENV.CAPTCHA_SOLVER_PROVIDER] as CaptchaSolverProvider | undefined

  if (!provider) {
    return undefined
  }

  // Validate provider
  if (provider !== "2captcha" && provider !== "capsolver") {
    console.warn(`Invalid CAPTCHA_SOLVER_PROVIDER: ${provider}. Must be "2captcha" or "capsolver"`)
    return undefined
  }

  // Get API key based on provider
  let apiKey: string | undefined
  if (provider === "2captcha") {
    apiKey = process.env[ENV.TWOCAPTCHA_API_KEY]
  } else if (provider === "capsolver") {
    apiKey = process.env[ENV.CAPSOLVER_API_KEY]
  }

  if (!apiKey) {
    console.warn(`CAPTCHA_SOLVER_PROVIDER set to ${provider} but no API key provided`)
    return undefined
  }

  const timeoutMs = parseInt(process.env[ENV.CAPTCHA_TIMEOUT_MS] || "", 10)
  const maxCostPerSolve = parseFloat(process.env[ENV.CAPTCHA_MAX_COST] || "")

  return {
    provider,
    apiKey,
    timeoutMs: isNaN(timeoutMs) ? DEFAULT_CAPTCHA_TIMEOUT_MS : timeoutMs,
    maxCostPerSolve: isNaN(maxCostPerSolve) ? DEFAULT_CAPTCHA_MAX_COST : maxCostPerSolve,
  }
}

/**
 * Load complete browser auth configuration from environment.
 */
export function loadBrowserAuthConfig(): BrowserAuthConfig {
  const enabled = process.env[ENV.BROWSER_AUTH_ENABLED] === "true"

  if (!enabled) {
    return { ...DEFAULT_BROWSER_AUTH_CONFIG }
  }

  const sessionTtlHours = parseInt(process.env[ENV.SESSION_TTL_HOURS] || "", 10)

  const config: BrowserAuthConfig = {
    enabled: true,
    sessionStoragePath: expandHomePath(
      process.env[ENV.SESSION_STORAGE_PATH] || DEFAULT_BROWSER_AUTH_CONFIG.sessionStoragePath
    ),
    sessionTtlHours: isNaN(sessionTtlHours) ? DEFAULT_SESSION_TTL_HOURS : sessionTtlHours,
    credentials: loadCredentials(),
    captchaSolver: loadCaptchaSolverConfig(),
  }

  return config
}

// Singleton configuration instance
let configInstance: BrowserAuthConfig | null = null

/**
 * Get the browser auth configuration.
 * Loads from environment on first call, then returns cached instance.
 */
export function getBrowserAuthConfig(): BrowserAuthConfig {
  if (!configInstance) {
    configInstance = loadBrowserAuthConfig()
  }
  return configInstance
}

/**
 * Override the browser auth configuration.
 * Useful for testing or programmatic configuration.
 */
export function setBrowserAuthConfig(config: Partial<BrowserAuthConfig>): void {
  configInstance = {
    ...DEFAULT_BROWSER_AUTH_CONFIG,
    ...config,
  }
}

/**
 * Reset configuration to force reload from environment.
 */
export function resetBrowserAuthConfig(): void {
  configInstance = null
}

/**
 * Check if any site credentials are configured.
 */
export function hasAnyCredentials(): boolean {
  const config = getBrowserAuthConfig()
  return !!(config.credentials.nytimes || config.credentials.washingtonpost)
}

/**
 * Check if credentials are configured for a specific site.
 */
export function hasCredentialsForSite(site: keyof SiteCredentials): boolean {
  const config = getBrowserAuthConfig()
  return !!config.credentials[site]
}

/**
 * Check if CAPTCHA solving is configured.
 */
export function hasCaptchaSolver(): boolean {
  const config = getBrowserAuthConfig()
  return !!config.captchaSolver
}
