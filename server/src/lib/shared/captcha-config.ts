/**
 * Shared CAPTCHA solver configuration from environment variables.
 *
 * Used by fetch-page-with-fallbacks.ts, browser-fetch.ts, and debriefer adapters
 * to configure the CAPTCHA solving step of the fetch fallback chain.
 */

import type { CaptchaSolverConfig } from "@debriefer/browser"

/**
 * Build CAPTCHA solver config from environment variables.
 * Returns undefined if provider is not configured or the matching API key is missing.
 *
 * Validates that CAPTCHA_SOLVER_PROVIDER is exactly "2captcha" or "capsolver",
 * and selects the API key that matches the provider (not the other one).
 */
export function getCaptchaSolverConfig(): CaptchaSolverConfig | undefined {
  const provider = process.env.CAPTCHA_SOLVER_PROVIDER
  if (provider !== "2captcha" && provider !== "capsolver") return undefined

  const apiKey =
    provider === "2captcha" ? process.env.TWOCAPTCHA_API_KEY : process.env.CAPSOLVER_API_KEY

  if (!apiKey) return undefined
  return { provider, apiKey }
}
