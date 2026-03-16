# @debriefer/browser Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ~2,600 lines of browser automation infrastructure with `@debriefer/browser` 2.1.0 imports.

**Architecture:** Thin re-export wrappers preserve existing import paths for 40+ source files. `browser-auth/` becomes a barrel re-export, `archive-fallback.ts` and `fetch-page-with-fallbacks.ts` become thin wrappers, and `browser-fetch.ts` is thinned from ~700 to ~80 lines.

**Tech Stack:** `@debriefer/browser` 2.1.0, TypeScript, Playwright, vitest

**Spec:** `docs/plans/2026-03-15-debriefer-browser-migration.md`

---

## File Structure

| File | Action | Responsibility After Migration |
|------|--------|-------------------------------|
| `server/package.json` | Modify | Add `@debriefer/browser`, remove `fingerprint-injector` |
| `browser-auth/index.ts` | Rewrite | Barrel re-export from `@debriefer/browser` |
| `browser-auth/stealth.ts` | Delete | — |
| `browser-auth/types.ts` | Delete | — |
| `browser-auth/config.ts` | Delete | — |
| `browser-auth/session-manager.ts` | Delete | — |
| `browser-auth/captcha/detector.ts` | Delete | — |
| `browser-auth/captcha/solver.ts` | Delete | — |
| `browser-auth/login-handlers/base-handler.ts` | Delete | — |
| `browser-auth/login-handlers/nytimes.ts` | Delete | — |
| `browser-auth/login-handlers/washingtonpost.ts` | Delete | — |
| `browser-auth/**/*.test.ts` | Delete | — |
| `browser-fetch.ts` | Rewrite (~80 lines) | Singleton browser + orchestration, delegates to `@debriefer/browser` |
| `browser-fetch.test.ts` | Delete | — |
| `browser-fetch-lifecycle.test.ts` | Delete | — |
| `archive-fallback.ts` | Rewrite (~30 lines) | Re-export + local `shouldUseArchiveFallback()` |
| `archive-fallback.test.ts` | Delete | — |
| `shared/fetch-page-with-fallbacks.ts` | Rewrite (~25 lines) | Wrapper with type aliases + CAPTCHA config |
| `shared/fetch-page-with-fallbacks.test.ts` | Delete | — |
| `link-follower.ts` | Modify (3 lines) | Update deep `browser-auth/` imports to barrel |
| `death-sources/index.ts` | Modify (~6 lines) | Remove dead re-exports |
| `death-sources/debriefer/adapter.ts` | Modify (~10 lines) | Use `createBrowserFetchPage()` |
| `biography-sources/debriefer/adapter.ts` | Modify (~10 lines) | Use `createBrowserFetchPage()` |

All paths below are relative to `server/src/lib/` unless noted otherwise.

---

### Task 1: Add `@debriefer/browser` dependency

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Add dependency and remove fingerprint-injector**

In `server/package.json`, add `@debriefer/browser` and remove `fingerprint-injector`:

```diff
  "dependencies": {
+   "@debriefer/browser": "^2.1.0",
    "@debriefer/core": "^2.0.0",
    "@debriefer/sources": "^2.0.0",
-   "fingerprint-injector": "^2.1.80",
```

- [ ] **Step 2: Install**

Run: `cd server && npm install`
Expected: Clean install, lockfile updated.

- [ ] **Step 3: Verify import works**

Run: `cd server && node -e "import('@debriefer/browser').then(m => console.log(Object.keys(m).length + ' exports'))"`
Expected: Prints export count (e.g., "45 exports").

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "Add @debriefer/browser dependency, remove fingerprint-injector"
```

---

### Task 2: Replace `browser-auth/` with re-export barrel

**Files:**
- Rewrite: `death-sources/browser-auth/index.ts`
- Delete: `death-sources/browser-auth/stealth.ts`
- Delete: `death-sources/browser-auth/types.ts`
- Delete: `death-sources/browser-auth/config.ts`
- Delete: `death-sources/browser-auth/session-manager.ts`
- Delete: `death-sources/browser-auth/captcha/detector.ts`
- Delete: `death-sources/browser-auth/captcha/solver.ts`
- Delete: `death-sources/browser-auth/login-handlers/base-handler.ts`
- Delete: `death-sources/browser-auth/login-handlers/nytimes.ts`
- Delete: `death-sources/browser-auth/login-handlers/washingtonpost.ts`
- Delete: All test files in `death-sources/browser-auth/`
- Delete: `death-sources/browser-auth.test.ts` (in parent dir, imports deep submodule paths)

- [ ] **Step 1: Delete implementation files and tests**

```bash
cd server/src/lib/death-sources/browser-auth
# Delete implementation files (keep index.ts)
rm -f stealth.ts types.ts config.ts session-manager.ts
rm -rf captcha/ login-handlers/
# Delete test files
find . -name '*.test.ts' -delete
# Also delete the test file in the parent directory
rm -f ../browser-auth.test.ts
```

- [ ] **Step 2: Rewrite index.ts as re-export barrel**

Replace `server/src/lib/death-sources/browser-auth/index.ts` with:

```typescript
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
```

- [ ] **Step 3: Type check**

Run: `cd server && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors in files we haven't updated yet (`browser-fetch.ts`, `archive-fallback.ts`, `death-sources/index.ts`) — but NOT in `browser-auth/index.ts` itself or its consumers.

- [ ] **Step 4: Commit**

```bash
git add -A server/src/lib/death-sources/browser-auth/
git add -u server/src/lib/death-sources/browser-auth.test.ts
git commit -m "Replace browser-auth/ with @debriefer/browser re-export barrel"
```

---

### Task 3: Thin `browser-fetch.ts`

**Files:**
- Rewrite: `death-sources/browser-fetch.ts` (~700 → ~80 lines)
- Delete: `death-sources/browser-fetch.test.ts`
- Delete: `death-sources/browser-fetch-lifecycle.test.ts`

- [ ] **Step 1: Delete test files**

```bash
rm -f server/src/lib/death-sources/browser-fetch.test.ts
rm -f server/src/lib/death-sources/browser-fetch-lifecycle.test.ts
```

- [ ] **Step 2: Rewrite browser-fetch.ts**

Replace `server/src/lib/death-sources/browser-fetch.ts` with thinned version that keeps the 7 functions consumers depend on, delegates stealth/browser to `@debriefer/browser`:

```typescript
/**
 * Browser fetch orchestration for deadonfilm.
 *
 * Manages a browser singleton and provides page fetching with bot-detection
 * bypass. Infrastructure (stealth, CAPTCHA, archives) delegated to @debriefer/browser.
 */

import type { Browser, BrowserContext, Page } from "playwright-core"
import { chromium } from "playwright-core"
import { createStealthContext, getStealthLaunchArgs, fetchPageWithFallbacks } from "@debriefer/browser"
import type { BrowserFetchConfig } from "./types.js"

// ============================================================================
// Browser singleton
// ============================================================================

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: process.env.BROWSER_FETCH_HEADLESS !== "false",
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
      args: getStealthLaunchArgs(),
    })
  }
  return browserInstance
}

/**
 * Get a fresh stealth browser page and context.
 * Caller is responsible for closing the context when done.
 */
export async function getBrowserPage(): Promise<{ page: Page; context: BrowserContext }> {
  const browser = await getBrowser()
  const context = await createStealthContext(browser)
  const page = await context.newPage()
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  })
  return { page, context }
}

/**
 * Shut down the browser singleton cleanly.
 */
export async function shutdownBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close()
    } catch {
      // Ignore errors during shutdown
    }
    browserInstance = null
  }
}

/**
 * Register SIGINT/SIGTERM handlers to close the browser on process exit.
 */
export function registerBrowserCleanup(): void {
  const cleanup = () => {
    shutdownBrowser().catch(() => {})
  }
  process.once("SIGINT", cleanup)
  process.once("SIGTERM", cleanup)
}

// ============================================================================
// Fetch utilities
// ============================================================================

/** Check if browser fetching is enabled via env var. */
export function isBrowserFetchEnabled(): boolean {
  return process.env.BROWSER_FETCH_ENABLED !== "false"
}

/** Check if a URL should use browser-based fetching (domain is commonly blocked). */
export function shouldUseBrowserFetch(_url: string, _config?: BrowserFetchConfig): boolean {
  return isBrowserFetchEnabled()
}

/** HTTP status codes that indicate blocking. */
const BLOCKED_STATUS_CODES = new Set([401, 403, 429, 451])

const SOFT_BLOCK_PATTERNS = [
  "captcha", "please verify you are human", "access denied", "bot detection",
  "unusual traffic", "cloudflare", "just a moment", "recaptcha", "hcaptcha",
]

/** Detect if a response indicates blocking (HTTP status or soft-block patterns). */
export function isBlockedResponse(status: number, body?: string): boolean {
  if (BLOCKED_STATUS_CODES.has(status)) return true
  if (body && status === 200 && body.length < 50_000) {
    const lower = body.toLowerCase()
    return SOFT_BLOCK_PATTERNS.some((p) => lower.includes(p))
  }
  return false
}

/** Fetch a page using browser with full fallback chain (delegates to @debriefer/browser). */
export async function browserFetchPage(
  url: string,
  _config?: BrowserFetchConfig
): Promise<{ url: string; title: string; content: string; contentLength: number; fetchTimeMs: number; fetchMethod: string; error?: string }> {
  const startTime = Date.now()
  const result = await fetchPageWithFallbacks(url, { timeoutMs: 15_000 })
  return {
    url: result.url,
    title: result.title,
    content: result.content,
    contentLength: result.content.length,
    fetchTimeMs: Date.now() - startTime,
    fetchMethod: result.fetchMethod,
    error: result.error,
  }
}
```

- [ ] **Step 3: Type check**

Run: `cd server && npx tsc --noEmit 2>&1 | head -20`
Expected: May still have errors in index.ts re-exports (Task 7). No errors in browser-fetch.ts itself.

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/death-sources/browser-fetch.ts
git add -u server/src/lib/death-sources/browser-fetch.test.ts server/src/lib/death-sources/browser-fetch-lifecycle.test.ts
git commit -m "Thin browser-fetch.ts: delegate infrastructure to @debriefer/browser"
```

---

### Task 4: Replace `archive-fallback.ts` with re-export wrapper

**Files:**
- Rewrite: `death-sources/archive-fallback.ts`
- Delete: `death-sources/archive-fallback.test.ts` (if exists)

- [ ] **Step 1: Delete test file**

```bash
rm -f server/src/lib/death-sources/archive-fallback.test.ts
```

- [ ] **Step 2: Rewrite archive-fallback.ts**

Replace `server/src/lib/death-sources/archive-fallback.ts` with:

```typescript
/**
 * Archive fallback re-exports from @debriefer/browser.
 *
 * Preserves existing import paths for link-follower.ts and other consumers.
 * Keeps the deadonfilm-specific domain list for shouldUseArchiveFallback().
 */

export {
  fetchFromArchiveOrg as fetchFromArchive,
  fetchFromArchiveIs,
  searchArchiveIsWithBrowser,
  checkArchiveAvailability,
  checkArchiveIsAvailability,
  getArchiveUrl,
  type ArchiveAvailability,
  type ArchiveFetchResult,
} from "@debriefer/browser"

// Deadonfilm-specific: domains worth trying archive fallbacks for
const ARCHIVE_FALLBACK_DOMAINS = [
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "latimes.com",
  "bostonglobe.com",
  "telegraph.co.uk",
  "imdb.com",
  "variety.com",
  "deadline.com",
  "apnews.com",
  "reuters.com",
  "legacy.com",
  "ibdb.com",
]

/** Check if a URL's domain is in the list of sites worth trying archive fallbacks for. */
export function shouldUseArchiveFallback(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return ARCHIVE_FALLBACK_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/death-sources/archive-fallback.ts
git add -u server/src/lib/death-sources/archive-fallback.test.ts
git commit -m "Replace archive-fallback.ts with @debriefer/browser re-exports"
```

---

### Task 5: Replace `shared/fetch-page-with-fallbacks.ts` with wrapper

**Files:**
- Rewrite: `shared/fetch-page-with-fallbacks.ts`
- Delete: `shared/fetch-page-with-fallbacks.test.ts` (if exists)

- [ ] **Step 1: Delete test file**

```bash
rm -f server/src/lib/shared/fetch-page-with-fallbacks.test.ts
```

- [ ] **Step 2: Rewrite fetch-page-with-fallbacks.ts**

Replace `server/src/lib/shared/fetch-page-with-fallbacks.ts` with:

```typescript
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
  type CaptchaSolverConfig,
} from "@debriefer/browser"

/** @deprecated Use BrowserFetchPageOptions from @debriefer/browser directly. */
export type PageFetchOptions = BrowserFetchPageOptions

/** @deprecated Use BrowserFetchPageResult from @debriefer/browser directly. */
export type PageFetchResult = BrowserFetchPageResult

function getCaptchaSolverConfig(): CaptchaSolverConfig | undefined {
  const provider = process.env.CAPTCHA_SOLVER_PROVIDER as "2captcha" | "capsolver" | undefined
  const apiKey = process.env.TWOCAPTCHA_API_KEY || process.env.CAPSOLVER_API_KEY
  if (!provider || !apiKey) return undefined
  return { provider, apiKey }
}

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
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/shared/fetch-page-with-fallbacks.ts
git add -u server/src/lib/shared/fetch-page-with-fallbacks.test.ts
git commit -m "Replace fetch-page-with-fallbacks.ts with @debriefer/browser wrapper"
```

---

### Task 6: Update `link-follower.ts` import paths

**Files:**
- Modify: `death-sources/link-follower.ts` (lines 27-29)

- [ ] **Step 1: Update 3 deep browser-auth imports to use barrel**

In `server/src/lib/death-sources/link-follower.ts`, change lines 27-29 from:

```typescript
import { getBrowserAuthConfig } from "./browser-auth/config.js"
import { WashingtonPostLoginHandler } from "./browser-auth/login-handlers/washingtonpost.js"
import { loadSession, saveSession, applySessionToContext } from "./browser-auth/session-manager.js"
```

To:

```typescript
import {
  getBrowserAuthConfig,
  WashingtonPostLoginHandler,
  loadSession,
  saveSession,
  applySessionToContext,
} from "./browser-auth/index.js"
```

- [ ] **Step 2: Commit**

```bash
git add server/src/lib/death-sources/link-follower.ts
git commit -m "Update link-follower.ts to use browser-auth barrel import"
```

---

### Task 7: Clean up `death-sources/index.ts` re-exports

**Files:**
- Modify: `death-sources/index.ts` (lines ~84-98)

- [ ] **Step 1: Remove dead re-exports from browser-fetch.js block**

In `server/src/lib/death-sources/index.ts`, remove these 6 re-exports from the `browser-fetch.js` block (they no longer exist in the thinned file):

```typescript
// REMOVE these lines:
  setBrowserConfig,
  getBrowserConfig,
  isAuthEnabledForUrl,
  detectPaywall,
  getAuthenticatedContext,
  handleAuthenticationFlow,
```

The kept re-exports (`shouldUseBrowserFetch`, `isBlockedResponse`, `browserFetchPage`, `shutdownBrowser`, `registerBrowserCleanup`, `isBrowserFetchEnabled`) still work.

Also remove `type PaywallDetectionResult` from the `browser-auth/index.js` re-export block — this type doesn't exist in `@debriefer/browser` and was only used by the deleted `detectPaywall` function.

- [ ] **Step 2: Type check**

Run: `cd server && npx tsc --noEmit`
Expected: Clean — no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/death-sources/index.ts
git commit -m "Remove dead re-exports from death-sources/index.ts"
```

---

### Task 8: Simplify debriefer adapters

**Files:**
- Modify: `death-sources/debriefer/adapter.ts` (~lines 231-243)
- Modify: `biography-sources/debriefer/adapter.ts` (~lines 266-279)

- [ ] **Step 1: Update death enrichment adapter**

In `server/src/lib/death-sources/debriefer/adapter.ts`, replace the fetchPage callback construction.

Remove the import:
```typescript
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"
```

Add the import:
```typescript
import { createBrowserFetchPage } from "@debriefer/browser"
```

Replace the fetchPage callback (~lines 231-243):
```typescript
// Before:
const fetchPage = async (url: string, signal: AbortSignal): Promise<string | null> => {
  try {
    const result = await fetchPageWithFallbacks(url, { signal, timeoutMs: 15000 })
    if (!result.content || result.fetchMethod === "none") return null
    if (result.fetchMethod !== "direct") return result.content
    const article = extractArticleContent(result.content, result.url)
    return article?.text || null
  } catch {
    return null
  }
}

// After:
const fetchPage = createBrowserFetchPage({
  captchaSolver: process.env.CAPTCHA_SOLVER_PROVIDER
    ? {
        provider: process.env.CAPTCHA_SOLVER_PROVIDER as "2captcha" | "capsolver",
        apiKey: process.env.TWOCAPTCHA_API_KEY || process.env.CAPSOLVER_API_KEY || "",
      }
    : undefined,
})
```

Note: `createBrowserFetchPage` already handles Readability extraction for direct fetches via its built-in `htmlToText()`. The `extractArticleContent` import can be removed if this was its only call site in this file — check first.

- [ ] **Step 2: Update biography enrichment adapter**

Same change in `server/src/lib/biography-sources/debriefer/adapter.ts` (~lines 266-279).

- [ ] **Step 3: Type check**

Run: `cd server && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/death-sources/debriefer/adapter.ts
git add server/src/lib/biography-sources/debriefer/adapter.ts
git commit -m "Simplify debriefer adapters: use createBrowserFetchPage factory"
```

---

### Task 9: Verify and test

- [ ] **Step 1: Type check**

Run: `cd server && npm run type-check`
Expected: Clean — no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: Clean (only pre-existing warnings).

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass. Tests for deleted files are gone. Source tests still pass since they mock browser functions.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Verify fingerprint-injector moved to transitive dep**

Run: `ls server/node_modules/fingerprint-injector/package.json && echo "exists (via @debriefer/browser)"`
Expected: File exists (installed as transitive dependency of `@debriefer/browser`).

Run: `grep fingerprint-injector server/package.json`
Expected: No output (not a direct dependency anymore).

- [ ] **Step 6: Final commit if any fixups needed**

```bash
git add -A
git commit -m "Fix post-migration issues"
```
