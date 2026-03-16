/**
 * Page fetching with archive fallbacks — wrapper around @debriefer/browser.
 *
 * Preserves the existing fetchPageWithFallbacks() signature and type aliases
 * used by 20+ biography sources and debriefer adapters. Passes CAPTCHA solver
 * config from env vars so step 4 of the fallback chain (browser + CAPTCHA) works.
 */

import {
  fetchPageWithFallbacks as browserFetch,
  type BrowserFetchPageOptions,
  type BrowserFetchPageResult,
} from "@debriefer/browser"
import { getCaptchaSolverConfig } from "./captcha-config.js"

/** @deprecated Use BrowserFetchPageOptions from @debriefer/browser directly. */
export type PageFetchOptions = BrowserFetchPageOptions

/** @deprecated Use BrowserFetchPageResult from @debriefer/browser directly. */
export type PageFetchResult = BrowserFetchPageResult

/**
 * Fetch a page with automatic archive fallbacks.
 *
 * Fallback chain: direct fetch → archive.org → archive.is → archive.is + browser/CAPTCHA.
 */
export async function fetchPageWithFallbacks(
  url: string,
  options?: PageFetchOptions
): Promise<PageFetchResult> {
  return browserFetch(url, options, getCaptchaSolverConfig())
}
