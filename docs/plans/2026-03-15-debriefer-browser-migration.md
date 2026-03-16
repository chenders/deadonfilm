# Phase 3: Replace deadonfilm browser infrastructure with @debriefer/browser

## Context

Deadonfilm has ~3,000 lines of browser automation infrastructure: Playwright stealth with fingerprint-injector, CAPTCHA detection/solving (2Captcha + CapSolver), session persistence for paywalled sites (NYTimes, WaPo), and a 4-step fetch fallback chain (direct → archive.org → archive.is → browser + CAPTCHA solver). This was extracted into `@debriefer/browser` (PRs #24 and #25 in the debriefer repo, published as 2.1.0).

This plan replaces deadonfilm's local copies with `@debriefer/browser` imports. The infrastructure files are categorized into two groups:

1. **Pure infrastructure** (stealth, CAPTCHA, archives, sessions, login handlers) → delete and re-export from `@debriefer/browser`
2. **Deadonfilm orchestration** (`browser-fetch.ts`, `link-follower.ts`) → thin to ~80 lines, delegating infrastructure calls to `@debriefer/browser`

40+ source files keep their existing imports unchanged via thin re-export wrappers.

## Files Deleted

| File | Lines | Replacement |
|------|-------|-------------|
| `browser-auth/stealth.ts` | ~150 | `@debriefer/browser` stealth exports |
| `browser-auth/captcha/detector.ts` | ~400 | `@debriefer/browser` CAPTCHA detector |
| `browser-auth/captcha/solver.ts` | ~300 | `@debriefer/browser` CAPTCHA solver |
| `browser-auth/types.ts` | ~180 | `@debriefer/browser` types |
| `browser-auth/config.ts` | ~210 | `@debriefer/browser` auth config |
| `browser-auth/session-manager.ts` | ~250 | `@debriefer/browser` session manager |
| `browser-auth/login-handlers/base-handler.ts` | ~100 | `@debriefer/browser` BaseLoginHandler |
| `browser-auth/login-handlers/nytimes.ts` | ~150 | `@debriefer/browser` NYTimesLoginHandler |
| `browser-auth/login-handlers/washingtonpost.ts` | ~100 | `@debriefer/browser` WashingtonPostLoginHandler |
| Test files for all of the above | ~800 | Tested in `@debriefer/browser` package |

**Total deleted: ~2,600 lines**

## Files Kept as Re-export Wrappers

### 1. `browser-auth/index.ts` (~30 lines)

Barrel re-export of all types and functions from `@debriefer/browser`. Consumers like `link-follower.ts`, `duckduckgo-search.ts`, and `browser-fetch.ts` keep their existing `import { ... } from "../browser-auth/index.js"` unchanged.

```typescript
export {
  // Types
  type BrowserAuthConfig, type CaptchaType, type CaptchaDetectionResult,
  type CaptchaSolveResult, type CaptchaSolverConfig, type CaptchaSolverProvider,
  type StoredSession, type StoredCookie, type SessionManagerConfig,
  type SiteCredential, type SiteCredentials, type SupportedSite,
  type LoginResult, type LoginHandler, type AuthenticatedContextResult,
  // Config
  loadBrowserAuthConfig, getBrowserAuthConfig, setBrowserAuthConfig,
  resetBrowserAuthConfig, hasAnyCredentials, hasCredentialsForSite, hasCaptchaSolver,
  // Sessions
  loadSession, saveSession, isSessionValid, applySessionToContext,
  touchSession, deleteSession, listSessions, clearExpiredSessions, getSessionInfo,
  // CAPTCHA
  detectCaptcha, waitForCaptcha, isChallengePage,
  solveCaptcha, injectCaptchaToken, getBalance,
  // Stealth
  createStealthContext, applyStealthToContext, applyStealthToPage, getStealthLaunchArgs,
  // Login handlers
  BaseLoginHandler, NYTimesLoginHandler, WashingtonPostLoginHandler,
} from "@debriefer/browser"
```

### 2. `archive-fallback.ts` (~30 lines)

Re-exports archive functions from `@debriefer/browser`, plus keeps the deadonfilm-specific `shouldUseArchiveFallback()` domain list locally.

```typescript
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
  "nytimes.com", "washingtonpost.com", "wsj.com", "ft.com",
  "economist.com", "bloomberg.com", "latimes.com", "bostonglobe.com",
  "telegraph.co.uk", "imdb.com", "variety.com", "deadline.com",
  "apnews.com", "reuters.com", "legacy.com", "ibdb.com",
]

export function shouldUseArchiveFallback(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return ARCHIVE_FALLBACK_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
```

### 3. `shared/fetch-page-with-fallbacks.ts` (~20 lines)

Wraps `@debriefer/browser`'s `fetchPageWithFallbacks` with deadonfilm's type aliases. Passes CAPTCHA solver config from env vars so step 4 of the fallback chain (browser + CAPTCHA) works.

```typescript
import {
  fetchPageWithFallbacks as browserFetch,
  type BrowserFetchPageOptions,
  type BrowserFetchPageResult,
  type CaptchaSolverConfig,
} from "@debriefer/browser"

export type PageFetchOptions = BrowserFetchPageOptions
export type PageFetchResult = BrowserFetchPageResult

function getCaptchaSolverConfig(): CaptchaSolverConfig | undefined {
  const provider = process.env.CAPTCHA_SOLVER_PROVIDER as "2captcha" | "capsolver" | undefined
  const apiKey = process.env.TWOCAPTCHA_API_KEY || process.env.CAPSOLVER_API_KEY
  if (!provider || !apiKey) return undefined
  return { provider, apiKey }
}

export async function fetchPageWithFallbacks(
  url: string,
  options?: PageFetchOptions
): Promise<PageFetchResult> {
  return browserFetch(url, options, getCaptchaSolverConfig())
}
```

## Files Thinned (kept but rewritten to delegate)

### `browser-fetch.ts` (~700 → ~80 lines)

This file currently manages: browser singleton, idle timeouts, stale context cleanup, auth flows, paywall detection, and page fetching. After migration, it keeps the orchestration functions that `link-follower.ts`, `duckduckgo-search.ts`, `duckduckgo.ts`, and `death-sources/index.ts` depend on, but delegates all infrastructure to `@debriefer/browser`.

**Kept (deadonfilm-specific orchestration):**
- `getBrowserPage()` — creates a stealth page via `@debriefer/browser`'s `createStealthContext`, manages local browser singleton
- `browserFetchPage()` — delegates to `@debriefer/browser`'s `fetchPageWithFallbacks`
- `shouldUseBrowserFetch()` — deadonfilm-specific config check
- `isBlockedResponse()` — simple utility (HTTP status + soft-block pattern matching)
- `isBrowserFetchEnabled()` — env var check
- `shutdownBrowser()` / `registerBrowserCleanup()` — singleton cleanup

**Deleted (now in `@debriefer/browser`):**
- Stealth context creation implementation (~50 lines)
- Auth flow handling (~150 lines)
- Paywall detection (~60 lines)
- Config management (~40 lines)
- Context leak detection (~30 lines)
- Idle timeout management (~30 lines)

### `link-follower.ts` — update 3 import paths

Currently imports from deep `browser-auth/` submodule paths that are being deleted:
- `import { getBrowserAuthConfig } from "./browser-auth/config.js"` → `"./browser-auth/index.js"`
- `import { WashingtonPostLoginHandler } from "./browser-auth/login-handlers/washingtonpost.js"` → `"./browser-auth/index.js"`
- `import { loadSession, saveSession, applySessionToContext } from "./browser-auth/session-manager.js"` → `"./browser-auth/index.js"`

Three import lines change to use the barrel re-export. No logic changes.

### `death-sources/index.ts` — remove dead re-exports

The thinned `browser-fetch.ts` no longer exports auth/paywall functions. Remove these from the re-export block:
- `setBrowserConfig`, `getBrowserConfig`
- `isAuthEnabledForUrl`, `detectPaywall`
- `getAuthenticatedContext`, `handleAuthenticationFlow`

No external consumers import these functions from `death-sources/index.js`.

## Files Updated

### `shared/duckduckgo-search.ts`

Update lazy imports to pull from `@debriefer/browser` instead of local files:

- `import("../death-sources/browser-fetch.js")` → keep (still exists, thinned)
- `import("../death-sources/browser-auth/index.js")` → keep (still exists, re-export barrel)

Actually no changes needed — `duckduckgo-search.ts` imports from `browser-fetch.js` and `browser-auth/index.js`, both of which are kept. The lazy imports resolve to the same paths.

### Death enrichment adapter (`death-sources/debriefer/adapter.ts`)

Simplify `fetchPage` callback injection:

```typescript
// Before: manually builds fetch chain from local modules
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"
const fetchPage = async (url: string) => {
  const result = await fetchPageWithFallbacks(url)
  return { content: result.content, error: result.error }
}

// After: use factory from @debriefer/browser
import { createBrowserFetchPage } from "@debriefer/browser"
const fetchPage = createBrowserFetchPage({
  captchaSolver: process.env.CAPTCHA_SOLVER_PROVIDER
    ? { provider: process.env.CAPTCHA_SOLVER_PROVIDER as "2captcha" | "capsolver",
        apiKey: process.env.TWOCAPTCHA_API_KEY || process.env.CAPSOLVER_API_KEY || "" }
    : undefined,
})
```

### Biography enrichment adapter (`biography-sources/debriefer/adapter.ts`)

Same simplification as death adapter.

## Behavioral Changes

### Session path

`~/.deadonfilm/sessions/` → `~/.debriefer/sessions/`

No migration — sessions are ephemeral (24h TTL). Users re-login on next enrichment run.

### Environment variables

No env var names change. `@debriefer/browser` reads the same variables: `CAPTCHA_SOLVER_PROVIDER`, `TWOCAPTCHA_API_KEY`, `CAPSOLVER_API_KEY`, `NYTIMES_EMAIL`, `NYTIMES_PASSWORD`, `WAPO_EMAIL`, `WAPO_PASSWORD`, etc.

## Dependency Changes

### `server/package.json`

```diff
  "dependencies": {
+   "@debriefer/browser": "^2.1.0",
    "@debriefer/core": "^2.0.0",
    "@debriefer/sources": "^2.0.0",
-   "fingerprint-injector": "^2",
  }
```

`playwright-core` stays as a direct dependency — it's used by other deadonfilm code (screenshot scripts, e2e tests). `fingerprint-injector` moves to `@debriefer/browser`'s dependency tree.

## What Doesn't Change

- **40+ source files** — all death and biography sources keep existing imports
- **`duckduckgo-search.ts`** — lazy imports from `browser-fetch.js` and `browser-auth/index.js` still resolve
- **`duckduckgo.ts`** (death source) — lazy import of `getBrowserPage` from `browser-fetch.js` still works
- **Source rate limiting** — `SourceRateLimiter` in `shared/concurrency.ts` is unrelated
- **Source caching** — `death-sources/cache.ts` is unrelated
- **HTML utils** — `death-sources/html-utils.ts` is unrelated
- **Readability extract** — `shared/readability-extract.ts` is unrelated
- **Environment variable names** — all stay the same

## Implementation Tasks

### Task 1: Add `@debriefer/browser` dependency

Add `@debriefer/browser: "^2.1.0"` to `server/package.json`, remove `fingerprint-injector`. Run `npm install`.

### Task 2: Replace `browser-auth/` with re-export barrel

Delete all files in `browser-auth/` except `index.ts`. Replace `index.ts` content with re-exports from `@debriefer/browser`. Delete all `browser-auth/` test files.

### Task 3: Thin `browser-fetch.ts`

Rewrite `browser-fetch.ts` from ~700 lines to ~80 lines. Keep `getBrowserPage()`, `browserFetchPage()`, `shouldUseBrowserFetch()`, `isBlockedResponse()`, `isBrowserFetchEnabled()`, `shutdownBrowser()`, `registerBrowserCleanup()`. Delete auth flows, paywall detection, config management, context leak detection. Delegate stealth to `@debriefer/browser`'s `createStealthContext`. Delete `browser-fetch.test.ts` and `browser-fetch-lifecycle.test.ts`.

### Task 4: Replace `archive-fallback.ts` with re-export + `shouldUseArchiveFallback`

Gut the implementation (~300 lines), replace with re-exports from `@debriefer/browser` plus the local `shouldUseArchiveFallback()` domain list. Delete test file.

### Task 5: Replace `shared/fetch-page-with-fallbacks.ts` with wrapper

Gut the implementation, replace with ~25 lines wrapping `@debriefer/browser`'s `fetchPageWithFallbacks`. Include CAPTCHA solver config from env vars so step 4 of the fallback chain works. Delete test file.

### Task 6: Update `link-follower.ts` import paths

Change 3 deep `browser-auth/` imports to use the barrel `browser-auth/index.js`.

### Task 7: Clean up `death-sources/index.ts` re-exports

Remove 6 re-exported functions from `browser-fetch.js` that no longer exist in the thinned file.

### Task 8: Simplify debriefer adapters

Update both death and biography adapters to use `createBrowserFetchPage()` factory instead of manually building fetch chains.

### Task 9: Verify and test

- `npm run type-check` — clean
- `npm run lint` — clean
- `npm test` — all pass (tests for deleted files are also deleted; `@debriefer/browser` has its own tests)
- `npm run build` — clean

## Verification

1. All existing tests pass (source tests don't change since they mock browser functions)
2. Type check clean (re-export wrappers + thinned files maintain type compatibility)
3. `fingerprint-injector` no longer in `server/node_modules` directly (only via `@debriefer/browser`)
4. `link-follower.ts`, `duckduckgo-search.ts`, `duckduckgo.ts` compile and work unchanged
5. `death-sources/index.ts` re-exports resolve correctly
6. Manual: run enrichment on one actor, verify archive fallback still works
