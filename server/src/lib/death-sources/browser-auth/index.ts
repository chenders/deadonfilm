/**
 * Browser Authentication Module
 *
 * Provides authenticated browser access for paywalled content:
 * - Session persistence with cookie storage
 * - CAPTCHA detection and solving
 * - Site-specific login handlers
 */

// Types
export * from "./types.js"

// Configuration
export {
  loadBrowserAuthConfig,
  getBrowserAuthConfig,
  setBrowserAuthConfig,
  resetBrowserAuthConfig,
  hasAnyCredentials,
  hasCredentialsForSite,
  hasCaptchaSolver,
} from "./config.js"

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
} from "./session-manager.js"

// CAPTCHA detection
export { detectCaptcha, waitForCaptcha, isChallengePage } from "./captcha/detector.js"

// CAPTCHA solving
export { solveCaptcha, injectCaptchaToken, getBalance } from "./captcha/solver.js"

// Login handlers
export { BaseLoginHandler } from "./login-handlers/base-handler.js"
export { NYTimesLoginHandler } from "./login-handlers/nytimes.js"
export { WashingtonPostLoginHandler } from "./login-handlers/washingtonpost.js"

// Stealth techniques
export {
  createStealthContext,
  applyStealthToContext,
  applyStealthToPage,
  getStealthLaunchArgs,
} from "./stealth.js"

// Re-export key types for convenience
export type {
  BrowserAuthConfig,
  SiteCredentials,
  SiteCredential,
  SupportedSite,
  CaptchaSolverConfig,
  CaptchaSolverProvider,
  CaptchaType,
  CaptchaDetectionResult,
  CaptchaSolveResult,
  LoginHandler,
  LoginResult,
  StoredSession,
  StoredCookie,
} from "./types.js"
