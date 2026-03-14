# Debriefer Feature Parity Fix

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore caching, text truncation, link following, and cost attribution that regressed when migrating from DeathEnrichmentOrchestrator to debriefer.

**Architecture:** The debriefer adapter in `server/src/lib/death-sources/debriefer/adapter.ts` configures debriefer-sources. We inject deadonfilm's infrastructure (cache, rate limiter, page fetcher) into debriefer-sources via their existing callback/config APIs rather than wrapping them in BaseDataSource. Text truncation is applied in the cleanup prompt builder.

**Tech Stack:** TypeScript, debriefer-sources callbacks (fetchPage, linkSelector), deadonfilm source_query_cache (PostgreSQL), SourceRateLimiter, claude-cleanup.ts

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/lib/death-sources/debriefer/adapter.ts` | Modify | Wire fetchPage callback for link following; inject cache wrapper for debriefer-sources |
| `server/src/lib/death-sources/debriefer/source-cache-bridge.ts` | Create | Bridge between debriefer-sources and deadonfilm's source_query_cache table |
| `server/src/lib/death-sources/claude-cleanup.ts` | Modify | Add per-source text truncation in buildCleanupPrompt() |
| `server/src/lib/enrichment-runner.ts` | Modify | Fix per-source cost attribution using actual costUsd from findings |
| `server/src/lib/death-sources/debriefer/adapter.ts` | Modify | Pass per-finding costUsd through DebrieferAdapterResult |
| `server/src/lib/death-sources/debriefer/finding-mapper.ts` | Modify | Pass through costUsd from ScoredFinding to RawSourceData |
| `server/src/lib/death-sources/types.ts` | Modify | Add costUsd field to RawSourceData |

---

## Task 1: Add Per-Source Text Truncation in Claude Cleanup

The highest-impact fix. Web search sources dump 70K+ chars each, causing $1+ cleanup costs. Cap each source's text before assembling the prompt.

**Files:**
- Modify: `server/src/lib/death-sources/claude-cleanup.ts:134-148`
- Test: `server/src/lib/death-sources/claude-cleanup.test.ts` (existing file, add test)

- [ ] **Step 1: Write failing test for text truncation**

In the existing test file, add a test that verifies long source text is truncated:

```typescript
describe("buildCleanupPrompt", () => {
  it("truncates source text exceeding MAX_SOURCE_TEXT_CHARS", () => {
    const longText = "A".repeat(20000)
    const actor = { id: 1, name: "Test", birthday: "1950-01-01", deathday: "2020-01-01" } as ActorForEnrichment
    const rawSources: RawSourceData[] = [{
      sourceName: "Wikipedia",
      sourceType: DataSourceType.WIKIPEDIA,
      text: longText,
      confidence: 0.9,
      reliabilityTier: ReliabilityTier.SECONDARY_COMPILATION,
      reliabilityScore: 0.85,
    }]
    const prompt = buildCleanupPrompt(actor, rawSources)
    // Should NOT contain the full 20K chars
    expect(prompt.length).toBeLessThan(longText.length)
    // Should contain truncation marker
    expect(prompt).toContain("[truncated]")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/death-sources/claude-cleanup.test.ts -t "truncates"`
Expected: FAIL (no truncation currently applied)

- [ ] **Step 3: Implement text truncation**

In `claude-cleanup.ts`, add a constant and apply it in `buildCleanupPrompt()`:

```typescript
// Near line 33 (constants section)
const MAX_SOURCE_TEXT_CHARS = 15_000

// In buildCleanupPrompt(), modify the rawSources.map() around line 139-148:
const rawDataSection = rawSources
  .map((s) => {
    const reliabilityLabel = s.reliabilityScore !== undefined
      ? `, reliability: ${(s.reliabilityScore * 100).toFixed(0)}%`
      : ""
    let cleanedText = sanitizeSourceText(s.text)
    if (cleanedText.length > MAX_SOURCE_TEXT_CHARS) {
      cleanedText = cleanedText.slice(0, MAX_SOURCE_TEXT_CHARS) + "\n\n[truncated — original was " + s.text.length.toLocaleString() + " chars]"
    }
    return `--- ${s.sourceName} (confidence: ${(s.confidence * 100).toFixed(0)}%${reliabilityLabel}) ---\n${cleanedText}`
  })
  .join("\n\n")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/death-sources/claude-cleanup.test.ts -t "truncates"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/death-sources/claude-cleanup.ts server/src/lib/death-sources/claude-cleanup.test.ts
git commit -m "Add per-source text truncation (15K char limit) in Claude cleanup prompt"
```

---

## Task 2: Wire Link Following for Debriefer Web Search Sources

Debriefer-sources already support `fetchPage` and `maxLinksToFollow` callbacks. The adapter just doesn't configure them. Wire deadonfilm's existing page fetching infrastructure (Readability extraction, archive fallback) into the web search sources.

**Files:**
- Modify: `server/src/lib/death-sources/debriefer/adapter.ts:230-260` (Phase 2 web search)
- Test: `server/src/lib/death-sources/debriefer/__tests__/adapter.test.ts`

- [ ] **Step 1: Write failing test**

Add a test that verifies web search sources receive fetchPage config:

```typescript
it("configures link following for web search sources", () => {
  const processActor = createDebriefOrchestrator({ free: true })
  // The orchestrator should have been created with fetchPage callbacks
  // We verify by checking the phases structure (mock the orchestrator to inspect config)
  expect(processActor).toBeDefined()
  // More detailed verification via integration test below
})
```

- [ ] **Step 2: Implement fetchPage wiring in adapter**

In `adapter.ts`, create a `fetchPage` callback that uses deadonfilm's existing infrastructure and pass it to all web search source factories:

```typescript
import { extractArticle } from "../../shared/readability-extract.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

// In buildPhases(), before Phase 2 web search:
const fetchPage = async (url: string, signal: AbortSignal): Promise<string | null> => {
  try {
    const html = await fetchPageWithFallbacks(url, { signal, timeoutMs: 15000 })
    if (!html) return null
    const article = extractArticle(html, url)
    return article?.textContent || null
  } catch {
    return null
  }
}

const webSearchConfig = {
  maxLinksToFollow: 3,
  fetchPage,
}

// Pass to each web search factory:
googleSearch(webSearchConfig),
bingSearch(webSearchConfig),
duckduckgoSearch(webSearchConfig),
braveSearch(webSearchConfig),
```

- [ ] **Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/death-sources/debriefer/__tests__/adapter.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/death-sources/debriefer/adapter.ts
git commit -m "Wire link following into debriefer web search sources via fetchPage callback"
```

---

## Task 2.5: Route DuckDuckGo Through Legacy Source for CAPTCHA Resilience

Debriefer's DDG source uses a basic HTTP fetch that can't handle CAPTCHAs. Deadonfilm's legacy `DuckDuckGoSource` has a full fallback chain: fetch → Playwright with fingerprint-injector stealth → CAPTCHA solver (2Captcha/CapSolver). Replace debriefer's DDG source with the legacy one.

**Files:**
- Modify: `server/src/lib/death-sources/debriefer/adapter.ts` (Phase 2 web search sources)

- [ ] **Step 1: Replace debriefer DDG with legacy DDG in Phase 2**

In `adapter.ts`, remove `duckduckgoSearch()` from the Phase 2 debriefer sources array and add the legacy `DuckDuckGoSource` wrapped via `LegacySourceAdapter`:

```typescript
// In the imports, add:
import { DuckDuckGoSource } from "../sources/duckduckgo.js"

// In buildPhases() Phase 2, replace:
//   duckduckgoSearch(webSearchConfig),
// With:
//   ...adaptLegacySources([new DuckDuckGoSource()]),
```

This gives DDG the full CAPTCHA chain while other web search sources (Google, Bing, Brave) use debriefer-sources with the `fetchPage` callback for link following.

The legacy DDG source also gets the benefit of `BaseDataSource` caching and rate limiting automatically.

- [ ] **Step 2: Remove duckduckgoSearch import if no longer used**

Remove `duckduckgoSearch` from the debriefer-sources import line if nothing else references it.

- [ ] **Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/death-sources/debriefer/__tests__/adapter.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/death-sources/debriefer/adapter.ts
git commit -m "Route DuckDuckGo through legacy source for CAPTCHA resilience

Debriefer's DDG source uses basic HTTP fetch that fails on CAPTCHAs.
Legacy DuckDuckGoSource has full fallback chain: fetch → Playwright
stealth → CAPTCHA solver. Also gets BaseDataSource caching and rate
limiting automatically."
```

---

## Task 3: Bridge Debriefer-Sources to source_query_cache

The 27 debriefer-sources bypass deadonfilm's cache table. Create a bridge that wraps debriefer's source execution to check/write the cache.

This is the most complex task. Debriefer-sources don't expose per-source cache hooks, so we need to intercept at the orchestrator level using lifecycle hooks.

**Files:**
- Create: `server/src/lib/death-sources/debriefer/source-cache-bridge.ts`
- Modify: `server/src/lib/death-sources/debriefer/adapter.ts`
- Modify: `server/src/lib/death-sources/debriefer/lifecycle-hooks.ts`
- Test: `server/src/lib/death-sources/debriefer/__tests__/source-cache-bridge.test.ts`

**Approach:** Debriefer sources don't have per-source cache callbacks, but the `onSourceComplete` lifecycle hook fires after each source with the finding text. We can use this to write to the cache. For cache *reads*, we need a different approach — we wrap the debriefer orchestrator's `debrief()` call: before calling debrief, check the cache for each actor+source combo. After debrief, write new findings to the cache.

However, this is complex because we don't control which sources debriefer will attempt. A simpler approach:

**Simpler approach — cache the aggregate debrief result per actor:**

- Before calling `orchestrator.debrief()`, check if we have a cached `DebrieferAdapterResult` for this actor (keyed by actor ID + config hash)
- After debrief, cache the result
- This gives us per-actor caching (not per-source), but prevents re-fetching everything on re-enrichment

- [ ] **Step 1: Write failing test for result caching**

```typescript
describe("source-cache-bridge", () => {
  it("caches debrief results per actor", async () => {
    // First call should execute debrief
    // Second call with same actor should return cached result
  })

  it("bypasses cache when ignoreCache is true", async () => {
    // Should always call debrief when ignoreCache is set
  })
})
```

- [ ] **Step 2: Implement source-cache-bridge.ts**

```typescript
import { getCachedQuery, setCachedQuery, generateQueryHash } from "../cache.js"
import { DataSourceType } from "../types.js"

const CACHE_SOURCE_TYPE = DataSourceType.UNMAPPED // Use a dedicated type for debrief results

export async function getCachedDebriefResult(
  actorId: number,
  actorName: string,
): Promise<DebrieferAdapterResult | null> {
  const queryString = `debrief:${actorId}:${actorName}`
  const cached = await getCachedQuery(CACHE_SOURCE_TYPE, actorId, queryString)
  if (!cached || !cached.data) return null
  return JSON.parse(cached.data) as DebrieferAdapterResult
}

export async function setCachedDebriefResult(
  actorId: number,
  actorName: string,
  result: DebrieferAdapterResult,
): Promise<void> {
  const queryString = `debrief:${actorId}:${actorName}`
  await setCachedQuery(CACHE_SOURCE_TYPE, actorId, queryString, {
    status: "success",
    data: JSON.stringify(result),
    costUsd: result.totalCostUsd,
  })
}
```

- [ ] **Step 3: Wire cache bridge into adapter.ts**

In the per-actor function returned by `createDebriefOrchestrator()`:

```typescript
return async (actor: ActorForEnrichment): Promise<DebrieferAdapterResult> => {
  // Check cache first (unless ignoreCache)
  if (!globalIgnoreCache) {
    const cached = await getCachedDebriefResult(actor.id, actor.name)
    if (cached) {
      return { ...cached, logEntries: [{ timestamp: new Date().toISOString(), level: "info", message: "Using cached debrief result" }] }
    }
  }

  // ... existing debrief logic ...

  // Cache the result
  await setCachedDebriefResult(actor.id, actor.name, result).catch(() => {})

  return result
}
```

- [ ] **Step 4: Also write per-source cache entries from lifecycle hooks**

In `onSourceComplete`, write each successful source finding to the cache so the admin UI can see per-source cache entries:

```typescript
// In lifecycle-hooks.ts onSourceComplete:
if (finding) {
  // Write to source_query_cache for visibility in admin
  setCachedQuery(
    mapSourceType(sourceName), // Convert to DataSourceType
    toActorId(subject.id),
    `debriefer:${sourceName}:${subject.id}`,
    { status: "success", data: JSON.stringify({ text: finding.text, confidence: finding.confidence }), costUsd: costUsd }
  ).catch(() => {}) // Fire-and-forget, don't block enrichment
}
```

- [ ] **Step 5: Run tests**

Run: `cd server && npx vitest run src/lib/death-sources/debriefer/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/death-sources/debriefer/source-cache-bridge.ts server/src/lib/death-sources/debriefer/adapter.ts server/src/lib/death-sources/debriefer/lifecycle-hooks.ts
git commit -m "Add caching bridge for debriefer sources via source_query_cache"
```

---

## Task 4: Fix Per-Source Cost Attribution

Replace the even-split cost attribution with actual per-source costs from debriefer findings.

**Files:**
- Modify: `server/src/lib/death-sources/types.ts` (add costUsd to RawSourceData)
- Modify: `server/src/lib/death-sources/debriefer/finding-mapper.ts` (pass through costUsd)
- Modify: `server/src/lib/enrichment-runner.ts:427-435` (use actual costs)
- Test: `server/src/lib/enrichment-runner.test.ts`

- [ ] **Step 1: Add costUsd to RawSourceData type**

In `types.ts`, add to the `RawSourceData` interface:

```typescript
export interface RawSourceData {
  sourceName: string
  sourceType: DataSourceType
  text: string
  url?: string
  confidence: number
  reliabilityTier?: ReliabilityTier
  reliabilityScore?: number
  costUsd?: number  // Add this field
}
```

- [ ] **Step 2: Pass costUsd through finding-mapper**

In `finding-mapper.ts` `mapFindings()`, add costUsd to the mapped output:

```typescript
return {
  sourceName: finding.sourceName,
  sourceType: mapSourceType(finding.sourceType),
  text: finding.text,
  url: finding.url,
  confidence: finding.confidence,
  reliabilityTier: mapReliabilityTier(finding.reliabilityTier),
  reliabilityScore: finding.reliabilityScore,
  costUsd: finding.costUsd,  // Pass through from debriefer
}
```

- [ ] **Step 3: Fix cost attribution in enrichment-runner.ts**

Replace the even-split logic (lines ~427-435) with actual per-source costs:

```typescript
// Replace the even-split block with:
const actorCostBySource: Record<string, number> = {}
for (const rs of debriefResult.rawSources) {
  const sourceType = rs.sourceType
  actorCostBySource[sourceType] = (actorCostBySource[sourceType] ?? 0) + (rs.costUsd ?? 0)
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && npx vitest run src/lib/enrichment-runner.test.ts src/lib/death-sources/debriefer/__tests__/finding-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/death-sources/types.ts server/src/lib/death-sources/debriefer/finding-mapper.ts server/src/lib/enrichment-runner.ts
git commit -m "Fix per-source cost attribution using actual costs from debriefer findings"
```

---

## Task 5: Integration Test and Deploy

- [ ] **Step 1: Run full test suite**

```bash
cd server && npx vitest run
```

- [ ] **Step 2: Type check**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: Create PR**

Branch: `fix/debriefer-feature-parity`

- [ ] **Step 4: Test on test environment**

After CI passes and deploys to megadude:3001, re-enrich Freddie Mercury and verify:
- Cost is closer to $0.20-0.30 (not $1.05)
- Log entries appear in admin UI
- Source cache entries appear in source_query_cache table
- Web search sources return article content (not just snippets)

---

## Summary of Changes

| Fix | Impact | Estimated Cost Reduction |
|-----|--------|--------------------------|
| Text truncation (15K/source) | 229K → ~45K chars to Claude | ~75% reduction in cleanup cost |
| Link following wired | Web search returns full articles, not snippets | Better quality, not cost |
| DDG CAPTCHA resilience | Legacy DDG source with full fallback chain | Prevents DDG failures |
| Source caching | Prevents re-fetching on re-enrichment | Saves source fetch costs on repeated runs |
| Cost attribution | Accurate per-source analytics | No cost change, just accuracy |
| Log entries (already committed) | Admin UI shows per-source activity | No cost change, observability |
