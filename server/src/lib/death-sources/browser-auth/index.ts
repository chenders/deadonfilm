/**
 * Browser authentication re-exports from @debriefer/browser.
 *
 * This barrel preserves existing import paths for consumers like
 * link-follower.ts, duckduckgo-search.ts, and browser-fetch.ts.
 * All implementation now lives in @debriefer/browser.
 */

// Types
export type {
  BrowserAuthConfig,
  CaptchaType,
  CaptchaDetectionResult,
  CaptchaSolveResult,
  CaptchaSolverConfig,
  CaptchaSolverProvider,
  StoredSession,
  StoredCookie,
  SessionManagerConfig,
  SiteCredential,
  SiteCredentials,
  SupportedSite,
  LoginResult,
  LoginHandler,
  AuthenticatedContextResult,
} from "@debriefer/browser"

// Configuration
export {
  loadBrowserAuthConfig,
  getBrowserAuthConfig,
  setBrowserAuthConfig,
  resetBrowserAuthConfig,
  hasAnyCredentials,
  hasCredentialsForSite,
  hasCaptchaSolver,
} from "@debriefer/browser"

// Session management
export {
  loadSession,
  saveSession,
  isSessionValid,
  applySessionToContext,
  touchSession,
  deleteSession,
  listSessions,
  clearExpiredSessions,
  getSessionInfo,
} from "@debriefer/browser"

// CAPTCHA detection & solving
export { detectCaptcha, waitForCaptcha, isChallengePage } from "@debriefer/browser"
export { solveCaptcha, injectCaptchaToken, getBalance } from "@debriefer/browser"

// Stealth techniques
export {
  createStealthContext,
  applyStealthToContext,
  applyStealthToPage,
  getStealthLaunchArgs,
} from "@debriefer/browser"

// Login handlers
export { BaseLoginHandler } from "@debriefer/browser"
export { NYTimesLoginHandler } from "@debriefer/browser"
export { WashingtonPostLoginHandler } from "@debriefer/browser"
