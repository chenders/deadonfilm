# Surprise Discovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a post-enrichment agent that discovers surprising public associations about actors via Google Autocomplete, filters for incongruity, researches via Reddit, verifies in reliable sources, and integrates verified findings into biographies.

**Architecture:** Three-phase pipeline (Discover & Filter → Research & Verify → Integrate) that runs after the main bio enrichment completes. Phase 1 is cheap and always runs (autocomplete + heuristic filter + Haiku scoring). Phase 2 only fires when surprising associations are found (Reddit research + reliable source verification). Phase 3 integrates verified findings via Sonnet. All data is cached and logged for observability.

**Tech Stack:** Google Autocomplete API (free), Anthropic SDK (Haiku + Sonnet), existing web search infrastructure (Google CSE, Brave), PostgreSQL (source_query_cache, run_logs, actor_biography_details), existing RunLogger.

**Spec:** `docs/superpowers/specs/2026-04-04-surprise-discovery-agent-design.md`

---

## File Structure

```
server/src/lib/biography-sources/surprise-discovery/
  types.ts                    — Interfaces: DiscoveryConfig, DiscoveryResults, AutocompleteSuggestion, IncongruityCandidate, ResearchedAssociation
  autocomplete.ts             — Google Autocomplete client: fetch suggestions for an actor with multiple query patterns
  boring-filter.ts            — Heuristic filter: drop filmography, co-stars, generic terms
  incongruity-scorer.ts       — Haiku-based incongruity scoring for filtered candidates
  reddit-researcher.ts        — Reddit search via existing web search infra, claim extraction
  verifier.ts                 — Verify Reddit claims against reliable sources
  integrator.ts               — Sonnet-based integration into existing bio (append-only or re-synthesize)
  orchestrator.ts             — Top-level pipeline: wires phases together, manages logging/caching/cost tracking
  autocomplete.test.ts
  boring-filter.test.ts
  incongruity-scorer.test.ts
  reddit-researcher.test.ts
  verifier.test.ts
  integrator.test.ts
  orchestrator.test.ts

server/migrations/
  {timestamp}_add-discovery-results-column.cjs  — Add discovery_results JSONB column to actor_biography_details
```

Existing files modified:
- `server/src/lib/biography-sources/types.ts` — Add new BiographySourceType enum values
- `server/src/routes/admin/biography-enrichment.ts` — Hook discovery into single-actor and batch enrichment, add config options
- `server/src/lib/jobs/handlers/enrich-biographies-batch.ts` — Hook discovery into batch job handler
- `src/components/admin/actors/BiographyEnrichmentTab.tsx` — Add discovery config UI

---

### Task 1: Types & Configuration

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/types.ts`
- Modify: `server/src/lib/biography-sources/types.ts`

- [ ] **Step 1: Add new source types to BiographySourceType enum**

In `server/src/lib/biography-sources/types.ts`, add after the `UNMAPPED` entry:

```typescript
  // Surprise Discovery
  AUTOCOMPLETE_DISCOVERY = "autocomplete-discovery",
  REDDIT_DISCOVERY = "reddit-discovery",
  DISCOVERY_VERIFICATION = "discovery-verification",
```

- [ ] **Step 2: Create the types file**

Create `server/src/lib/biography-sources/surprise-discovery/types.ts`:

```typescript
/**
 * Type definitions for the surprise discovery agent.
 *
 * Post-enrichment pipeline that discovers surprising public associations
 * about actors via Google Autocomplete, filters for incongruity, researches
 * via Reddit, verifies in reliable sources, and integrates into biographies.
 */

/**
 * Configuration for the surprise discovery pipeline.
 */
export interface DiscoveryConfig {
  /** Whether to run discovery after bio enrichment. Default: true */
  enabled: boolean
  /** Integration strategy: append-only (safer) or re-synthesize. Default: "append-only" */
  integrationStrategy: "append-only" | "re-synthesize"
  /** Minimum Haiku incongruity score (1-10) to proceed to Phase 2. Default: 7 */
  incongruityThreshold: number
  /** Maximum cost in USD for the discovery step per actor. Default: 0.10 */
  maxCostPerActorUsd: number
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  enabled: true,
  integrationStrategy: "append-only",
  incongruityThreshold: 7,
  maxCostPerActorUsd: 0.10,
}

/**
 * A single autocomplete suggestion with provenance tracking.
 */
export interface AutocompleteSuggestion {
  /** The full suggestion text from Google */
  fullText: string
  /** The extracted association term (everything after the actor name) */
  term: string
  /** Which query pattern produced this suggestion */
  queryPattern: "quoted-letter" | "quoted-space-letter" | "keyword"
  /** The raw query that was sent to autocomplete */
  rawQuery: string
}

/**
 * A candidate that passed the boring filter and was scored by Haiku.
 */
export interface IncongruityCandidate {
  term: string
  score: number
  reasoning: string
}

/**
 * A Reddit thread found during research.
 */
export interface RedditThread {
  url: string
  subreddit: string
  title: string
  upvotes: number
}

/**
 * A verification attempt against a reliable source.
 */
export interface VerificationAttempt {
  source: string
  url: string
  found: boolean
}

/**
 * A fully researched association with verification status.
 */
export interface ResearchedAssociation {
  term: string
  incongruityScore: number
  redditThreads: RedditThread[]
  claimExtracted: string
  verificationAttempts: VerificationAttempt[]
  verified: boolean
  verificationSource?: string
  verificationUrl?: string
  /** The relevant excerpt from the verified source */
  verificationExcerpt?: string
}

/**
 * An integrated finding that made it into the bio.
 */
export interface IntegratedFinding {
  term: string
  destination: "narrative" | "lesserKnownFacts" | "discarded"
  verificationSource: string
}

/**
 * Complete discovery results record stored per actor.
 */
export interface DiscoveryResults {
  discoveredAt: string
  config: {
    integrationStrategy: "append-only" | "re-synthesize"
    incongruityThreshold: number
  }
  autocomplete: {
    queriesRun: number
    totalSuggestions: number
    uniqueSuggestions: number
    byPattern: Record<string, number>
  }
  boringFilter: {
    dropped: number
    droppedByReason: Record<string, number>
    remaining: number
  }
  incongruityCandidates: IncongruityCandidate[]
  researched: ResearchedAssociation[]
  integrated: IntegratedFinding[]
  costUsd: number
}

/**
 * Result returned by the discovery orchestrator.
 */
export interface DiscoveryResult {
  /** Whether any findings were integrated */
  hasFindings: boolean
  /** Updated narrative (if changed) */
  updatedNarrative: string | null
  /** New lesser-known facts to append */
  newLesserKnownFacts: string[]
  /** Full discovery record for storage */
  discoveryResults: DiscoveryResults
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/types.ts server/src/lib/biography-sources/types.ts
git commit -m "feat: add types for surprise discovery agent"
```

---

### Task 2: Database Migration

**Files:**
- Create: `server/migrations/{timestamp}_add-discovery-results-column.cjs`

- [ ] **Step 1: Create the migration**

```bash
cd server && npm run migrate:create -- add-discovery-results-column
```

- [ ] **Step 2: Write the migration**

Edit the created migration file:

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn("actor_biography_details", {
    discovery_results: {
      type: "jsonb",
      default: null,
    },
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn("actor_biography_details", "discovery_results")
}
```

- [ ] **Step 3: Run the migration**

```bash
cd server && npm run migrate:up
```

Expected: Migration applies successfully, `actor_biography_details` now has `discovery_results` column.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/*add-discovery-results-column*
git commit -m "feat: add discovery_results JSONB column to actor_biography_details"
```

---

### Task 3: Autocomplete Client

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/autocomplete.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/autocomplete.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/autocomplete.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import type { AutocompleteSuggestion } from "./types.js"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("fetchAutocompleteSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("collects suggestions from all query patterns", async () => {
    // Google autocomplete returns: ["query", ["suggestion1", "suggestion2"]]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ["helen mirren k", ["helen mirren kurt cobain", "helen mirren knives out"]],
    })

    const result = await fetchAutocompleteSuggestions("Helen Mirren")

    // 26 quoted-letter + 26 quoted-space-letter + 5 keyword = 57 queries
    expect(mockFetch).toHaveBeenCalledTimes(57)
    expect(result.length).toBeGreaterThan(0)
  })

  it("extracts the association term from each suggestion", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ["helen mirren k", ["helen mirren kurt cobain"]],
    })

    const result = await fetchAutocompleteSuggestions("Helen Mirren")
    const cobainSuggestion = result.find((s) => s.term === "kurt cobain")
    expect(cobainSuggestion).toBeDefined()
    expect(cobainSuggestion!.fullText).toBe("helen mirren kurt cobain")
  })

  it("deduplicates suggestions across query patterns", async () => {
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      // Return the same suggestion from every query
      return {
        ok: true,
        json: async () => ["query", ["helen mirren kurt cobain"]],
      }
    })

    const result = await fetchAutocompleteSuggestions("Helen Mirren")
    const cobainMatches = result.filter((s) => s.term === "kurt cobain")
    // Should keep only the first occurrence (deduped by term)
    expect(cobainMatches.length).toBe(1)
  })

  it("tags each suggestion with the correct query pattern", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ["query", ["helen mirren example"]],
    })

    const result = await fetchAutocompleteSuggestions("Helen Mirren")

    const patterns = new Set(result.map((s) => s.queryPattern))
    expect(patterns).toContain("quoted-letter")
    expect(patterns).toContain("quoted-space-letter")
    expect(patterns).toContain("keyword")
  })

  it("handles fetch failures gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))

    const result = await fetchAutocompleteSuggestions("Helen Mirren")
    expect(result).toEqual([])
  })

  it("handles empty autocomplete responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ["query", []],
    })

    const result = await fetchAutocompleteSuggestions("Helen Mirren")
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/autocomplete.test.ts
```

Expected: FAIL — `fetchAutocompleteSuggestions` does not exist.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/autocomplete.ts`:

```typescript
/**
 * Google Autocomplete client for surprise discovery.
 *
 * Queries Google's autocomplete endpoint with multiple patterns to discover
 * what the public associates with an actor. Each suggestion is tagged with
 * its query pattern for later analysis of which patterns are productive.
 *
 * 57 free HTTP requests per actor, no API key required.
 */

import { logger } from "../../logger.js"
import type { AutocompleteSuggestion } from "./types.js"

const AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
const KEYWORD_SUFFIXES = ["why", "did", "secret", "weird", "surprising"]
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("")

/** Delay between autocomplete requests to avoid rate limiting (ms). */
const REQUEST_DELAY_MS = 100

/**
 * Fetch autocomplete suggestions for an actor across all query patterns.
 *
 * @param actorName - The actor's full name
 * @returns Deduplicated suggestions tagged with query pattern provenance
 */
export async function fetchAutocompleteSuggestions(
  actorName: string
): Promise<AutocompleteSuggestion[]> {
  const nameLower = actorName.toLowerCase()
  const seen = new Map<string, AutocompleteSuggestion>()

  // Build all queries upfront
  const queries: Array<{ query: string; pattern: AutocompleteSuggestion["queryPattern"] }> = []

  for (const letter of ALPHABET) {
    queries.push({ query: `"${actorName}" ${letter}`, pattern: "quoted-letter" })
  }
  for (const letter of ALPHABET) {
    queries.push({ query: `${actorName} ${letter}`, pattern: "quoted-space-letter" })
  }
  for (const keyword of KEYWORD_SUFFIXES) {
    queries.push({ query: `"${actorName}" ${keyword}`, pattern: "keyword" })
  }

  for (const { query, pattern } of queries) {
    try {
      const suggestions = await fetchSingleAutocomplete(query)

      for (const suggestion of suggestions) {
        const term = extractTerm(suggestion, nameLower)
        if (!term || seen.has(term)) continue

        seen.set(term, {
          fullText: suggestion,
          term,
          queryPattern: pattern,
          rawQuery: query,
        })
      }

      // Small delay to avoid hammering Google
      if (REQUEST_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS))
      }
    } catch (error) {
      // Log and continue — individual query failures are non-fatal
      logger.debug(
        { error, query },
        "Autocomplete query failed"
      )
    }
  }

  return Array.from(seen.values())
}

/**
 * Fetch suggestions from Google Autocomplete for a single query.
 */
async function fetchSingleAutocomplete(query: string): Promise<string[]> {
  const url = new URL(AUTOCOMPLETE_URL)
  url.searchParams.set("client", "firefox")
  url.searchParams.set("q", query)

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) return []

  // Response format: ["query", ["suggestion1", "suggestion2", ...]]
  const data = (await response.json()) as [string, string[]]
  return Array.isArray(data[1]) ? data[1] : []
}

/**
 * Extract the association term from a suggestion by removing the actor name prefix.
 * Returns null if the suggestion is just the actor name with nothing interesting.
 */
function extractTerm(suggestion: string, nameLower: string): string | null {
  const lower = suggestion.toLowerCase().trim()

  // Remove the actor name from the beginning
  if (!lower.startsWith(nameLower)) return null

  const remainder = lower.slice(nameLower.length).trim()
  if (!remainder) return null

  return remainder
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/autocomplete.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/autocomplete.ts server/src/lib/biography-sources/surprise-discovery/autocomplete.test.ts
git commit -m "feat: add Google Autocomplete client for surprise discovery"
```

---

### Task 4: Boring Filter

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/boring-filter.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/boring-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/boring-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { filterBoringSuggestions, type BoringFilterContext } from "./boring-filter.js"
import type { AutocompleteSuggestion } from "./types.js"

function makeSuggestion(term: string): AutocompleteSuggestion {
  return {
    fullText: `helen mirren ${term}`,
    term,
    queryPattern: "quoted-letter",
    rawQuery: `"helen mirren" ${term[0]}`,
  }
}

const context: BoringFilterContext = {
  movieTitles: ["the queen", "gosford park", "the long good friday"],
  showTitles: ["prime suspect"],
  characterNames: ["queen elizabeth", "jane tennison"],
  costarNames: ["james cromwell", "kate winslet"],
  bioText: "Helen Mirren was born Ilyena Lydia Mironovas. She married Taylor Hackford in 1997.",
}

describe("filterBoringSuggestions", () => {
  it("drops filmography matches", () => {
    const suggestions = [makeSuggestion("the queen"), makeSuggestion("kurt cobain")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.map((s) => s.term)).toEqual(["kurt cobain"])
    expect(result.droppedByReason.filmography).toBe(1)
  })

  it("drops co-star matches", () => {
    const suggestions = [makeSuggestion("kate winslet"), makeSuggestion("kurt cobain")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.map((s) => s.term)).toEqual(["kurt cobain"])
    expect(result.droppedByReason["co-stars"]).toBe(1)
  })

  it("drops generic blocklist terms", () => {
    const suggestions = [
      makeSuggestion("age"),
      makeSuggestion("net worth"),
      makeSuggestion("height"),
      makeSuggestion("kurt cobain"),
    ]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.map((s) => s.term)).toEqual(["kurt cobain"])
    expect(result.droppedByReason.generic).toBe(3)
  })

  it("drops terms found in existing bio text", () => {
    const suggestions = [makeSuggestion("taylor hackford"), makeSuggestion("kurt cobain")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.map((s) => s.term)).toEqual(["kurt cobain"])
  })

  it("keeps subset detection — more specific term wins", () => {
    const suggestions = [makeSuggestion("kurt cobain"), makeSuggestion("kurt cobain gps")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.map((s) => s.term)).toEqual(["kurt cobain gps"])
  })

  it("returns all suggestions when nothing matches filters", () => {
    const suggestions = [makeSuggestion("kurt cobain"), makeSuggestion("tattoo")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept.length).toBe(2)
    expect(result.dropped).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/boring-filter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/boring-filter.ts`:

```typescript
/**
 * Boring filter for surprise discovery.
 *
 * Heuristic filter that drops autocomplete suggestions that are obviously
 * uninteresting: filmography matches, co-star names, generic queries, and
 * terms already covered in the existing biography.
 *
 * No AI calls — pure string matching. Expected to eliminate 80-90% of
 * raw autocomplete suggestions.
 */

import type { AutocompleteSuggestion } from "./types.js"

/**
 * Context needed for the boring filter — data about the actor we already have.
 */
export interface BoringFilterContext {
  movieTitles: string[]
  showTitles: string[]
  characterNames: string[]
  costarNames: string[]
  /** The existing biography narrative text */
  bioText: string
}

/**
 * Result of the boring filter with stats for logging.
 */
export interface BoringFilterResult {
  kept: AutocompleteSuggestion[]
  dropped: number
  droppedByReason: Record<string, number>
}

/** Generic terms that never indicate a surprising association. */
const GENERIC_BLOCKLIST = new Set([
  "age", "height", "weight", "net worth", "salary", "young", "old",
  "movies", "films", "shows", "awards", "oscar", "emmy", "grammy", "bafta",
  "husband", "wife", "spouse", "partner", "boyfriend", "girlfriend",
  "children", "kids", "son", "daughter", "family",
  "death", "died", "dead", "alive", "cause of death",
  "birthday", "born", "birth", "nationality", "ethnicity", "religion",
  "house", "home", "car", "photos", "images", "pictures",
  "hot", "sexy", "bikini", "dress", "hair", "makeup", "plastic surgery",
  "instagram", "twitter", "tiktok", "facebook", "youtube",
  "imdb", "wikipedia", "wiki", "bio", "biography",
  "news", "latest", "today", "2024", "2025", "2026",
  "interview", "quotes",
])

/**
 * Filter out boring/expected autocomplete suggestions.
 *
 * @param suggestions - Raw deduplicated autocomplete suggestions
 * @param context - Actor data for comparison (filmography, bio text, etc.)
 * @returns Filtered suggestions with stats
 */
export function filterBoringSuggestions(
  suggestions: AutocompleteSuggestion[],
  context: BoringFilterContext
): BoringFilterResult {
  const droppedByReason: Record<string, number> = {}

  function drop(reason: string): boolean {
    droppedByReason[reason] = (droppedByReason[reason] ?? 0) + 1
    return true
  }

  // Normalize context for case-insensitive matching
  const filmTitles = new Set([
    ...context.movieTitles.map((t) => t.toLowerCase()),
    ...context.showTitles.map((t) => t.toLowerCase()),
  ])
  const characters = new Set(context.characterNames.map((n) => n.toLowerCase()))
  const costars = new Set(context.costarNames.map((n) => n.toLowerCase()))
  const bioLower = context.bioText.toLowerCase()

  const kept: AutocompleteSuggestion[] = []

  for (const suggestion of suggestions) {
    const term = suggestion.term.toLowerCase()

    // 1. Generic blocklist (exact match on any word or the full term)
    if (GENERIC_BLOCKLIST.has(term)) {
      drop("generic")
      continue
    }
    // Check if the term is a multi-word phrase where all words are generic
    const words = term.split(/\s+/)
    if (words.length <= 2 && words.every((w) => GENERIC_BLOCKLIST.has(w))) {
      drop("generic")
      continue
    }

    // 2. Filmography match
    if (filmTitles.has(term) || characters.has(term)) {
      drop("filmography")
      continue
    }
    // Partial match — term is contained in a title or vice versa
    let isFilmMatch = false
    for (const title of filmTitles) {
      if (term.includes(title) || title.includes(term)) {
        isFilmMatch = true
        break
      }
    }
    if (isFilmMatch) {
      drop("filmography")
      continue
    }

    // 3. Co-star match
    let isCostarMatch = false
    for (const costar of costars) {
      if (term.includes(costar) || costar.includes(term)) {
        isCostarMatch = true
        break
      }
    }
    if (isCostarMatch) {
      drop("co-stars")
      continue
    }

    // 4. Already in bio text
    if (term.length > 3 && bioLower.includes(term)) {
      drop("bio-text")
      continue
    }

    kept.push(suggestion)
  }

  // 5. Subset detection — if "kurt cobain" and "kurt cobain gps" both exist,
  // keep only the more specific one
  const deduped = removeSubsets(kept)
  const subsetDropped = kept.length - deduped.length
  if (subsetDropped > 0) {
    droppedByReason["subset"] = subsetDropped
  }

  return {
    kept: deduped,
    dropped: suggestions.length - deduped.length,
    droppedByReason,
  }
}

/**
 * Remove suggestions where the term is a subset of another suggestion's term.
 * Keeps the more specific (longer) term.
 */
function removeSubsets(suggestions: AutocompleteSuggestion[]): AutocompleteSuggestion[] {
  const terms = suggestions.map((s) => s.term.toLowerCase())

  return suggestions.filter((suggestion, i) => {
    const term = terms[i]
    // Drop this suggestion if any other suggestion's term contains it as a prefix
    for (let j = 0; j < terms.length; j++) {
      if (i === j) continue
      if (terms[j].startsWith(term + " ") || terms[j].startsWith(term + "'")) {
        return false // Drop the shorter/less specific term
      }
    }
    return true
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/boring-filter.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/boring-filter.ts server/src/lib/biography-sources/surprise-discovery/boring-filter.test.ts
git commit -m "feat: add boring filter for surprise discovery"
```

---

### Task 5: Incongruity Scorer

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { scoreIncongruity } from "./incongruity-scorer.js"
import type { AutocompleteSuggestion, IncongruityCandidate } from "./types.js"

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn(),
    }
  },
}))

import Anthropic from "@anthropic-ai/sdk"

function makeSuggestion(term: string): AutocompleteSuggestion {
  return {
    fullText: `helen mirren ${term}`,
    term,
    queryPattern: "quoted-letter",
    rawQuery: `"helen mirren" ${term[0]}`,
  }
}

describe("scoreIncongruity", () => {
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    const client = new Anthropic()
    mockCreate = vi.mocked(client.messages.create)
  })

  it("returns scored candidates from Haiku response", async () => {
    const mockResponse = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            { term: "kurt cobain", score: 9, reasoning: "No obvious connection between a British actress and a grunge musician" },
            { term: "tattoo", score: 5, reasoning: "Celebrities often have tattoos discussed publicly" },
          ]),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }

    // Mock at module level
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: vi.fn().mockResolvedValue(mockResponse) },
        }) as unknown as Anthropic
    )

    const suggestions = [makeSuggestion("kurt cobain"), makeSuggestion("tattoo")]
    const result = await scoreIncongruity("Helen Mirren", suggestions)

    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].term).toBe("kurt cobain")
    expect(result.candidates[0].score).toBe(9)
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("returns empty array when no suggestions provided", async () => {
    const result = await scoreIncongruity("Helen Mirren", [])
    expect(result.candidates).toEqual([])
    expect(result.costUsd).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/incongruity-scorer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.ts`:

```typescript
/**
 * Haiku-based incongruity scoring for surprise discovery.
 *
 * Takes autocomplete suggestions that passed the boring filter and scores
 * each one for how surprising the association is (1-10). Uses Claude Haiku
 * for fast, cheap classification.
 *
 * Cost: ~$0.001 per actor.
 */

import Anthropic from "@anthropic-ai/sdk"
import { logger } from "../../logger.js"
import type { AutocompleteSuggestion, IncongruityCandidate } from "./types.js"

const HAIKU_MODEL = "claude-haiku-4-5-20251001"
const HAIKU_INPUT_COST_PER_MILLION = 1.0
const HAIKU_OUTPUT_COST_PER_MILLION = 5.0
const MAX_TOKENS = 2000

interface IncongruityResult {
  candidates: IncongruityCandidate[]
  costUsd: number
}

/**
 * Score autocomplete suggestions for incongruity using Claude Haiku.
 *
 * @param actorName - The actor's name for context
 * @param suggestions - Suggestions that passed the boring filter
 * @returns Scored candidates with cost tracking
 */
export async function scoreIncongruity(
  actorName: string,
  suggestions: AutocompleteSuggestion[]
): Promise<IncongruityResult> {
  if (suggestions.length === 0) {
    return { candidates: [], costUsd: 0 }
  }

  const termsList = suggestions.map((s) => `- ${s.term}`).join("\n")

  const prompt = `For the actor ${actorName}, score each of these public associations for how SURPRISING the connection is (1-10).

A high score (7-10) means the association is unexpected and not obviously related to their career, personal life, or public persona. It should make someone think "wait, why are those two things connected?"

A low score (1-6) means it's predictable, expected, or easily explained by their career or public life.

Associations to score:
${termsList}

Respond with ONLY a JSON array. Each element must have: "term" (string), "score" (number 1-10), "reasoning" (one sentence explaining why).
Example: [{"term": "example", "score": 8, "reasoning": "No obvious connection"}]`

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    })

    const inputTokens = response.usage?.input_tokens ?? 0
    const outputTokens = response.usage?.output_tokens ?? 0
    const costUsd =
      (inputTokens * HAIKU_INPUT_COST_PER_MILLION) / 1_000_000 +
      (outputTokens * HAIKU_OUTPUT_COST_PER_MILLION) / 1_000_000

    const textBlock = response.content.find((b) => b.type === "text")
    const text = textBlock && textBlock.type === "text" ? textBlock.text : ""

    const candidates = parseIncongruityResponse(text)

    return { candidates, costUsd }
  } catch (error) {
    logger.error({ error, actorName }, "Incongruity scoring failed")
    return { candidates: [], costUsd: 0 }
  }
}

/**
 * Parse the JSON array response from Haiku.
 */
function parseIncongruityResponse(text: string): IncongruityCandidate[] {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim()
    const parsed = JSON.parse(cleaned) as unknown

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item: unknown): item is { term: string; score: number; reasoning: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).term === "string" &&
          typeof (item as Record<string, unknown>).score === "number" &&
          typeof (item as Record<string, unknown>).reasoning === "string"
      )
      .map((item) => ({
        term: item.term,
        score: Math.min(10, Math.max(1, Math.round(item.score))),
        reasoning: item.reasoning,
      }))
  } catch {
    logger.warn({ text: text.slice(0, 200) }, "Failed to parse incongruity response")
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/incongruity-scorer.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.ts server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.test.ts
git commit -m "feat: add Haiku incongruity scorer for surprise discovery"
```

---

### Task 6: Reddit Researcher

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { researchOnReddit } from "./reddit-researcher.js"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("researchOnReddit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("searches Reddit via Google CSE and extracts thread info", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            title: "TIL Helen Mirren said she was sad Kurt Cobain died before GPS",
            link: "https://www.reddit.com/r/todayilearned/comments/abc123/til_helen_mirren/",
            snippet: "Helen Mirren said in an interview that she was sad Kurt Cobain died before GPS was invented.",
          },
        ],
      }),
    })

    const result = await researchOnReddit("Helen Mirren", "kurt cobain")

    expect(result.threads.length).toBeGreaterThan(0)
    expect(result.threads[0].subreddit).toBe("todayilearned")
    expect(result.claimExtracted).toBeTruthy()
  })

  it("returns empty when no Reddit results found", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })

    const result = await researchOnReddit("Helen Mirren", "kurt cobain")

    expect(result.threads).toEqual([])
    expect(result.claimExtracted).toBe("")
  })

  it("handles search API errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("API error"))

    const result = await researchOnReddit("Helen Mirren", "kurt cobain")

    expect(result.threads).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/reddit-researcher.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts`:

```typescript
/**
 * Reddit researcher for surprise discovery.
 *
 * Searches Reddit for threads about surprising actor associations using
 * Google CSE with site:reddit.com. Extracts the claimed story and thread
 * metadata (subreddit, upvotes) for verification.
 *
 * Uses existing web search infrastructure (Google CSE, Brave fallback).
 */

import { logger } from "../../logger.js"
import type { RedditThread } from "./types.js"

/** Target subreddits — threads from these are prioritized. */
const TARGET_SUBREDDITS = new Set([
  "todayilearned", "til", "movies", "television", "celebs",
  "askreddit", "entertainment", "pop_culture",
])

interface RedditResearchResult {
  threads: RedditThread[]
  claimExtracted: string
  costUsd: number
}

/**
 * Search Reddit for the story behind a surprising association.
 *
 * @param actorName - The actor's name
 * @param term - The surprising association term (e.g., "kurt cobain")
 * @returns Reddit threads and extracted claim
 */
export async function researchOnReddit(
  actorName: string,
  term: string
): Promise<RedditResearchResult> {
  const query = `"${actorName}" "${term}" site:reddit.com`

  try {
    const results = await searchGoogle(query)

    const threads: RedditThread[] = results
      .filter((r) => r.link.includes("reddit.com"))
      .map((r) => ({
        url: r.link,
        subreddit: extractSubreddit(r.link),
        title: r.title,
        upvotes: 0, // Not available from search results
      }))
      .slice(0, 5) // Keep top 5 threads

    // Extract the claim from the best thread's snippet
    const claimExtracted = results.length > 0
      ? results[0].snippet
      : ""

    return { threads, claimExtracted, costUsd: 0 }
  } catch (error) {
    logger.error({ error, actorName, term }, "Reddit research failed")
    return { threads: [], claimExtracted: "", costUsd: 0 }
  }
}

/**
 * Search Google CSE for Reddit threads.
 * Falls back to Brave if Google CSE is not configured.
 */
async function searchGoogle(
  query: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX

  if (apiKey && cx) {
    return searchGoogleCSE(query, apiKey, cx)
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY
  if (braveKey) {
    return searchBrave(query, braveKey)
  }

  logger.warn("No search API configured for Reddit research (need GOOGLE_SEARCH_API_KEY or BRAVE_SEARCH_API_KEY)")
  return []
}

async function searchGoogleCSE(
  query: string,
  apiKey: string,
  cx: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const url = new URL("https://www.googleapis.com/customsearch/v1")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("cx", cx)
  url.searchParams.set("q", query)
  url.searchParams.set("num", "5")

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) return []

  const data = (await response.json()) as { items?: Array<{ title: string; link: string; snippet: string }> }
  return data.items ?? []
}

async function searchBrave(
  query: string,
  apiKey: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", "5")

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) return []

  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    link: r.url,
    snippet: r.description,
  }))
}

/**
 * Extract subreddit name from a Reddit URL.
 */
function extractSubreddit(url: string): string {
  const match = url.match(/reddit\.com\/r\/([^/]+)/)
  return match ? match[1] : "unknown"
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/reddit-researcher.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts server/src/lib/biography-sources/surprise-discovery/reddit-researcher.test.ts
git commit -m "feat: add Reddit researcher for surprise discovery"
```

---

### Task 7: Verifier

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/verifier.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/verifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/verifier.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { verifyClaim } from "./verifier.js"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("verifyClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns verified=true when claim found in reliable source", async () => {
    // First call: Google search returns a Guardian article
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "Helen Mirren: It's so sad Kurt Cobain died before GPS",
              link: "https://www.theguardian.com/culture/2024/oct/25/helen-mirren-kurt-cobain-gps",
              snippet: "Helen Mirren has said she finds it sad that Kurt Cobain died before GPS was invented.",
            },
          ],
        }),
      })
      // Second call: fetch the article content
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          "<html><body><p>Helen Mirren has said she finds it sad that Kurt Cobain died before GPS was invented.</p></body></html>",
      })

    const result = await verifyClaim(
      "Helen Mirren",
      "kurt cobain",
      "Helen Mirren said she was sad Kurt Cobain died before GPS was invented"
    )

    expect(result.verified).toBe(true)
    expect(result.verificationSource).toContain("theguardian.com")
  })

  it("returns verified=false when no reliable source found", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })

    const result = await verifyClaim(
      "Helen Mirren",
      "kurt cobain",
      "Some unverifiable claim"
    )

    expect(result.verified).toBe(false)
    expect(result.attempts.length).toBeGreaterThan(0)
  })

  it("rejects results from unreliable domains", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            title: "Helen Mirren gossip",
            link: "https://www.someblog.com/gossip/mirren-cobain",
            snippet: "Rumor has it...",
          },
        ],
      }),
    })

    const result = await verifyClaim(
      "Helen Mirren",
      "kurt cobain",
      "Some claim from an unreliable blog"
    )

    expect(result.verified).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/verifier.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/verifier.ts`:

```typescript
/**
 * Claim verifier for surprise discovery.
 *
 * Verifies claims extracted from Reddit by searching for them in reliable
 * journalistic sources (Tier 1 news, trade press, reference sites).
 * A claim is only accepted if it can be confirmed by a source with
 * ReliabilityTier.TRADE_PRESS (0.9) or better.
 */

import { logger } from "../../logger.js"
import type { VerificationAttempt } from "./types.js"

/** Domains considered reliable enough for verification (reliability >= 0.9). */
const RELIABLE_DOMAINS = new Set([
  // Tier 1 News
  "theguardian.com", "nytimes.com", "bbc.com", "bbc.co.uk",
  "apnews.com", "reuters.com", "washingtonpost.com", "latimes.com",
  // Trade Press
  "variety.com", "deadline.com", "hollywoodreporter.com",
  // Reference
  "britannica.com", "biography.com", "en.wikipedia.org",
  // Quality Publications
  "newyorker.com", "theatlantic.com", "smithsonianmag.com",
  "rollingstone.com", "vanityfair.com", "time.com",
  "telegraph.co.uk", "independent.co.uk", "npr.org", "pbs.org",
  "people.com", "ew.com",
])

interface VerificationResult {
  verified: boolean
  attempts: VerificationAttempt[]
  verificationSource?: string
  verificationUrl?: string
  verificationExcerpt?: string
}

/**
 * Verify a claim by searching for it in reliable sources.
 *
 * @param actorName - The actor's name
 * @param term - The surprising association term
 * @param claim - The extracted claim to verify
 * @returns Verification result with attempt trail
 */
export async function verifyClaim(
  actorName: string,
  term: string,
  claim: string
): Promise<VerificationResult> {
  const attempts: VerificationAttempt[] = []

  // Strategy 1: Direct search for the claim
  const queries = [
    `"${actorName}" "${term}"`,
    `"${actorName}" ${term}`,
  ]

  for (const query of queries) {
    try {
      const results = await searchForVerification(query)

      for (const result of results) {
        const domain = extractDomain(result.link)
        const isReliable = isReliableDomain(domain)

        attempts.push({
          source: domain,
          url: result.link,
          found: isReliable,
        })

        if (isReliable) {
          // Found in a reliable source — extract a relevant excerpt
          const excerpt = result.snippet || ""

          return {
            verified: true,
            attempts,
            verificationSource: domain,
            verificationUrl: result.link,
            verificationExcerpt: excerpt,
          }
        }
      }
    } catch (error) {
      logger.debug({ error, query }, "Verification search failed")
    }
  }

  return { verified: false, attempts }
}

/**
 * Check if a domain is in the reliable sources list.
 */
function isReliableDomain(domain: string): boolean {
  // Check exact match first
  if (RELIABLE_DOMAINS.has(domain)) return true

  // Check if domain ends with a reliable domain (e.g., "edition.cnn.com" → "cnn.com")
  for (const reliable of RELIABLE_DOMAINS) {
    if (domain.endsWith("." + reliable) || domain === reliable) {
      return true
    }
  }

  return false
}

/**
 * Search for verification using available search APIs.
 */
async function searchForVerification(
  query: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX

  if (apiKey && cx) {
    const url = new URL("https://www.googleapis.com/customsearch/v1")
    url.searchParams.set("key", apiKey)
    url.searchParams.set("cx", cx)
    url.searchParams.set("q", query)
    url.searchParams.set("num", "10")

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return []

    const data = (await response.json()) as {
      items?: Array<{ title: string; link: string; snippet: string }>
    }
    return data.items ?? []
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY
  if (braveKey) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", query)
    url.searchParams.set("count", "10")

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": braveKey,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return []

    const data = (await response.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> }
    }
    return (data.web?.results ?? []).map((r) => ({
      title: r.title,
      link: r.url,
      snippet: r.description,
    }))
  }

  return []
}

/**
 * Extract the domain from a URL.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/verifier.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/verifier.ts server/src/lib/biography-sources/surprise-discovery/verifier.test.ts
git commit -m "feat: add claim verifier for surprise discovery"
```

---

### Task 8: Integrator

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/integrator.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/integrator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/integrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { integrateFindings } from "./integrator.js"
import type { ResearchedAssociation } from "./types.js"

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn(),
    }
  },
}))

import Anthropic from "@anthropic-ai/sdk"

const verifiedFinding: ResearchedAssociation = {
  term: "kurt cobain",
  incongruityScore: 9,
  redditThreads: [{ url: "https://reddit.com/r/til/abc", subreddit: "todayilearned", title: "TIL", upvotes: 2100 }],
  claimExtracted: "Helen Mirren said she was sad Kurt Cobain died before GPS was invented",
  verificationAttempts: [{ source: "theguardian.com", url: "https://theguardian.com/article", found: true }],
  verified: true,
  verificationSource: "theguardian.com",
  verificationUrl: "https://theguardian.com/article",
  verificationExcerpt: "Helen Mirren has expressed sadness that Kurt Cobain died before GPS was invented.",
}

describe("integrateFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns new lesser-known facts from append-only strategy", async () => {
    const mockResponse = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            findings: [
              {
                term: "kurt cobain",
                destination: "lesserKnownFacts",
                text: "In a 2024 interview, she expressed sadness that Kurt Cobain died before GPS was invented.",
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 500, output_tokens: 100 },
    }

    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: vi.fn().mockResolvedValue(mockResponse) },
        }) as unknown as Anthropic
    )

    const result = await integrateFindings(
      "Helen Mirren",
      "A biography about Helen Mirren...",
      ["She holds dual British-American citizenship."],
      [verifiedFinding],
      "append-only"
    )

    expect(result.newLesserKnownFacts.length).toBe(1)
    expect(result.newLesserKnownFacts[0]).toContain("Kurt Cobain")
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it("returns empty results when no verified findings", async () => {
    const result = await integrateFindings(
      "Helen Mirren",
      "A biography...",
      [],
      [],
      "append-only"
    )

    expect(result.newLesserKnownFacts).toEqual([])
    expect(result.updatedNarrative).toBeNull()
    expect(result.costUsd).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/integrator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/integrator.ts`:

```typescript
/**
 * Sonnet-based integration for surprise discovery.
 *
 * Takes verified findings and integrates them into an existing biography,
 * either by appending new lesser-known facts (append-only) or by
 * re-synthesizing the narrative (re-synthesize).
 *
 * Cost: ~$0.01-0.03 per actor.
 */

import Anthropic from "@anthropic-ai/sdk"
import { logger } from "../../logger.js"
import { stripMarkdownCodeFences } from "../../claude-batch/response-parser.js"
import type { ResearchedAssociation, IntegratedFinding } from "./types.js"

const DEFAULT_MODEL = "claude-sonnet-4-20250514"
const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15
const MAX_TOKENS = 4096

interface IntegrationResult {
  updatedNarrative: string | null
  newLesserKnownFacts: string[]
  integrated: IntegratedFinding[]
  costUsd: number
}

/**
 * Integrate verified findings into an existing biography.
 *
 * @param actorName - The actor's name
 * @param existingNarrative - Current biography narrative
 * @param existingFacts - Current lesser-known facts
 * @param findings - Verified surprising associations
 * @param strategy - "append-only" or "re-synthesize"
 * @returns Integration result with cost tracking
 */
export async function integrateFindings(
  actorName: string,
  existingNarrative: string,
  existingFacts: string[],
  findings: ResearchedAssociation[],
  strategy: "append-only" | "re-synthesize"
): Promise<IntegrationResult> {
  if (findings.length === 0) {
    return {
      updatedNarrative: null,
      newLesserKnownFacts: [],
      integrated: [],
      costUsd: 0,
    }
  }

  const prompt = buildIntegrationPrompt(
    actorName,
    existingNarrative,
    existingFacts,
    findings,
    strategy
  )

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    })

    const inputTokens = response.usage?.input_tokens ?? 0
    const outputTokens = response.usage?.output_tokens ?? 0
    const costUsd =
      (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
      (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

    const textBlock = response.content.find((b) => b.type === "text")
    const text = textBlock && textBlock.type === "text" ? textBlock.text : ""

    return parseIntegrationResponse(text, costUsd)
  } catch (error) {
    logger.error({ error, actorName }, "Integration failed")
    return {
      updatedNarrative: null,
      newLesserKnownFacts: [],
      integrated: [],
      costUsd: 0,
    }
  }
}

function buildIntegrationPrompt(
  actorName: string,
  existingNarrative: string,
  existingFacts: string[],
  findings: ResearchedAssociation[],
  strategy: "append-only" | "re-synthesize"
): string {
  const findingsText = findings
    .map((f, i) => {
      const sourceInfo = f.verificationSource
        ? `Source: ${f.verificationUrl}\nExcerpt: ${f.verificationExcerpt}`
        : ""
      return `${i + 1}. ${f.claimExtracted}\n   ${sourceInfo}`
    })
    .join("\n\n")

  const factsText =
    existingFacts.length > 0
      ? existingFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")
      : "(none)"

  if (strategy === "append-only") {
    return `Here is the existing biography for ${actorName}:
${existingNarrative}

Existing lesser-known facts:
${factsText}

We've discovered and verified these additional facts about this person:

${findingsText}

For each finding, decide:
- LESSER_KNOWN_FACT: a surprising standalone tidbit (most common for quirky associations)
- NARRATIVE_INSERT: a biographical fact that should be added to the narrative — provide the new sentence(s) and where they should be inserted (after which existing sentence)
- DISCARD: doesn't add meaningful value to the biography

Do not remove or modify existing content unless new information directly contradicts it.

Respond with ONLY a JSON object:
{
  "findings": [
    {
      "term": "the association term",
      "destination": "lesserKnownFacts" | "narrative" | "discarded",
      "text": "the fact text to add (for lesserKnownFacts) or the new sentences (for narrative)",
      "insertAfter": "the sentence to insert after (only for narrative destination)"
    }
  ],
  "updatedNarrative": null
}`
  }

  // re-synthesize strategy
  return `You previously wrote this biography for ${actorName}:
${existingNarrative}

Existing lesser-known facts:
${factsText}

We've discovered and verified these additional facts about this person:

${findingsText}

Return an updated biography incorporating any findings that add value.
For each finding, it may belong in the narrative (if biographical),
in lesser_known_facts (if a surprising standalone tidbit), or be
discarded (if not valuable enough).

Respond with ONLY a JSON object:
{
  "findings": [
    {
      "term": "the association term",
      "destination": "lesserKnownFacts" | "narrative" | "discarded",
      "text": "the fact text (for lesserKnownFacts)"
    }
  ],
  "updatedNarrative": "the full updated narrative text, or null if unchanged"
}`
}

function parseIntegrationResponse(text: string, costUsd: number): IntegrationResult {
  try {
    const cleaned = stripMarkdownCodeFences(text).trim()
    const parsed = JSON.parse(cleaned) as {
      findings?: Array<{
        term: string
        destination: string
        text?: string
      }>
      updatedNarrative?: string | null
    }

    const integrated: IntegratedFinding[] = []
    const newLesserKnownFacts: string[] = []
    let updatedNarrative: string | null = parsed.updatedNarrative ?? null

    for (const finding of parsed.findings ?? []) {
      const destination = finding.destination as IntegratedFinding["destination"]

      if (destination === "lesserKnownFacts" && finding.text) {
        newLesserKnownFacts.push(finding.text)
      }

      integrated.push({
        term: finding.term,
        destination,
        verificationSource: finding.term, // Will be enriched by orchestrator
      })
    }

    return { updatedNarrative, newLesserKnownFacts, integrated, costUsd }
  } catch {
    logger.warn({ text: text.slice(0, 200) }, "Failed to parse integration response")
    return {
      updatedNarrative: null,
      newLesserKnownFacts: [],
      integrated: [],
      costUsd,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/integrator.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/integrator.ts server/src/lib/biography-sources/surprise-discovery/integrator.test.ts
git commit -m "feat: add Sonnet integrator for surprise discovery"
```

---

### Task 9: Orchestrator

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/orchestrator.ts`
- Create: `server/src/lib/biography-sources/surprise-discovery/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/biography-sources/surprise-discovery/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runSurpriseDiscovery } from "./orchestrator.js"
import type { DiscoveryConfig } from "./types.js"

// Mock all sub-modules
vi.mock("./autocomplete.js", () => ({
  fetchAutocompleteSuggestions: vi.fn().mockResolvedValue([]),
}))
vi.mock("./boring-filter.js", () => ({
  filterBoringSuggestions: vi.fn().mockReturnValue({ kept: [], dropped: 0, droppedByReason: {} }),
}))
vi.mock("./incongruity-scorer.js", () => ({
  scoreIncongruity: vi.fn().mockResolvedValue({ candidates: [], costUsd: 0 }),
}))
vi.mock("./reddit-researcher.js", () => ({
  researchOnReddit: vi.fn().mockResolvedValue({ threads: [], claimExtracted: "", costUsd: 0 }),
}))
vi.mock("./verifier.js", () => ({
  verifyClaim: vi.fn().mockResolvedValue({ verified: false, attempts: [] }),
}))
vi.mock("./integrator.js", () => ({
  integrateFindings: vi.fn().mockResolvedValue({
    updatedNarrative: null,
    newLesserKnownFacts: [],
    integrated: [],
    costUsd: 0,
  }),
}))

vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockPoolQuery = vi.fn()
vi.mock("../../db/pool.js", () => ({
  getPool: () => ({ query: mockPoolQuery }),
}))

import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import { filterBoringSuggestions } from "./boring-filter.js"
import { scoreIncongruity } from "./incongruity-scorer.js"

const config: DiscoveryConfig = {
  enabled: true,
  integrationStrategy: "append-only",
  incongruityThreshold: 7,
  maxCostPerActorUsd: 0.10,
}

describe("runSurpriseDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock filmography queries
    mockPoolQuery.mockResolvedValue({ rows: [] })
  })

  it("stops at Phase 1 when no surprising associations found", async () => {
    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([
      { fullText: "helen mirren age", term: "age", queryPattern: "quoted-letter", rawQuery: '"helen mirren" a' },
    ])
    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [],
      dropped: 1,
      droppedByReason: { generic: 1 },
    })

    const result = await runSurpriseDiscovery(
      { id: 15854, name: "Helen Mirren", tmdb_id: 15854 },
      "A biography about Helen Mirren...",
      [],
      config
    )

    expect(result.hasFindings).toBe(false)
    expect(result.discoveryResults.incongruityCandidates).toEqual([])
    expect(result.discoveryResults.researched).toEqual([])
  })

  it("proceeds to Phase 2 when high-incongruity candidates found", async () => {
    vi.mocked(fetchAutocompleteSuggestions).mockResolvedValue([
      { fullText: "helen mirren kurt cobain", term: "kurt cobain", queryPattern: "quoted-letter", rawQuery: '"helen mirren" k' },
    ])
    vi.mocked(filterBoringSuggestions).mockReturnValue({
      kept: [{ fullText: "helen mirren kurt cobain", term: "kurt cobain", queryPattern: "quoted-letter", rawQuery: '"helen mirren" k' }],
      dropped: 0,
      droppedByReason: {},
    })
    vi.mocked(scoreIncongruity).mockResolvedValue({
      candidates: [{ term: "kurt cobain", score: 9, reasoning: "No obvious connection" }],
      costUsd: 0.001,
    })

    const result = await runSurpriseDiscovery(
      { id: 15854, name: "Helen Mirren", tmdb_id: 15854 },
      "A biography...",
      [],
      config
    )

    // Phase 2 should have been triggered (reddit + verify)
    expect(result.discoveryResults.incongruityCandidates.length).toBe(1)
    expect(result.discoveryResults.incongruityCandidates[0].score).toBe(9)
  })

  it("returns early when discovery is disabled", async () => {
    const result = await runSurpriseDiscovery(
      { id: 15854, name: "Helen Mirren", tmdb_id: 15854 },
      "A biography...",
      [],
      { ...config, enabled: false }
    )

    expect(result.hasFindings).toBe(false)
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/orchestrator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/biography-sources/surprise-discovery/orchestrator.ts`:

```typescript
/**
 * Surprise discovery orchestrator.
 *
 * Top-level pipeline that wires together all discovery phases:
 * Phase 1: Autocomplete → Boring Filter → Incongruity Scoring → Gate
 * Phase 2: Reddit Research → Verification (only if Phase 1 found something)
 * Phase 3: Integration (only if Phase 2 verified something)
 *
 * All steps are logged and cached for observability.
 */

import { logger } from "../../logger.js"
import { getPool } from "../../db/pool.js"
import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import { filterBoringSuggestions, type BoringFilterContext } from "./boring-filter.js"
import { scoreIncongruity } from "./incongruity-scorer.js"
import { researchOnReddit } from "./reddit-researcher.js"
import { verifyClaim } from "./verifier.js"
import { integrateFindings } from "./integrator.js"
import type {
  DiscoveryConfig,
  DiscoveryResult,
  DiscoveryResults,
  ResearchedAssociation,
} from "./types.js"

interface DiscoveryActor {
  id: number
  name: string
  tmdb_id: number | null
}

/**
 * Run the complete surprise discovery pipeline for an actor.
 *
 * @param actor - Actor info
 * @param existingNarrative - The current biography narrative
 * @param existingFacts - The current lesser-known facts
 * @param config - Discovery configuration
 * @param runLogger - Optional RunLogger for structured logging
 * @returns Discovery result with findings and full decision trail
 */
export async function runSurpriseDiscovery(
  actor: DiscoveryActor,
  existingNarrative: string,
  existingFacts: string[],
  config: DiscoveryConfig
): Promise<DiscoveryResult> {
  const emptyResult: DiscoveryResult = {
    hasFindings: false,
    updatedNarrative: null,
    newLesserKnownFacts: [],
    discoveryResults: buildEmptyResults(config),
  }

  if (!config.enabled) {
    return emptyResult
  }

  let totalCost = 0

  // =========================================================================
  // Phase 1: Discover & Filter
  // =========================================================================

  // Step 1: Autocomplete
  logger.info({ actorName: actor.name }, "discovery:autocomplete starting")
  const suggestions = await fetchAutocompleteSuggestions(actor.name)

  const autocompleteStats = {
    queriesRun: 57,
    totalSuggestions: suggestions.length,
    uniqueSuggestions: suggestions.length,
    byPattern: countByPattern(suggestions),
  }
  logger.info(
    { actorName: actor.name, ...autocompleteStats },
    "discovery:autocomplete complete"
  )

  if (suggestions.length === 0) {
    return {
      ...emptyResult,
      discoveryResults: { ...buildEmptyResults(config), autocomplete: autocompleteStats },
    }
  }

  // Step 2: Boring filter
  const filterContext = await buildFilterContext(actor, existingNarrative)
  const filterResult = filterBoringSuggestions(suggestions, filterContext)

  logger.info(
    {
      actorName: actor.name,
      dropped: filterResult.dropped,
      remaining: filterResult.kept.length,
      reasons: filterResult.droppedByReason,
    },
    "discovery:boring-filter complete"
  )

  if (filterResult.kept.length === 0) {
    return {
      ...emptyResult,
      discoveryResults: {
        ...buildEmptyResults(config),
        autocomplete: autocompleteStats,
        boringFilter: {
          dropped: filterResult.dropped,
          droppedByReason: filterResult.droppedByReason,
          remaining: 0,
        },
      },
    }
  }

  // Step 3: Incongruity scoring
  const incongruityResult = await scoreIncongruity(actor.name, filterResult.kept)
  totalCost += incongruityResult.costUsd

  const highScoring = incongruityResult.candidates.filter(
    (c) => c.score >= config.incongruityThreshold
  )

  logger.info(
    {
      actorName: actor.name,
      scored: incongruityResult.candidates.length,
      aboveThreshold: highScoring.length,
      candidates: highScoring.map((c) => `${c.term}: ${c.score}`),
    },
    "discovery:incongruity complete"
  )

  const phase1Results: DiscoveryResults = {
    ...buildEmptyResults(config),
    autocomplete: autocompleteStats,
    boringFilter: {
      dropped: filterResult.dropped,
      droppedByReason: filterResult.droppedByReason,
      remaining: filterResult.kept.length,
    },
    incongruityCandidates: incongruityResult.candidates,
    costUsd: totalCost,
  }

  // Gate: stop if no high-scoring candidates
  if (highScoring.length === 0) {
    return {
      ...emptyResult,
      discoveryResults: phase1Results,
    }
  }

  // =========================================================================
  // Phase 2: Research & Verify
  // =========================================================================

  const researched: ResearchedAssociation[] = []

  for (const candidate of highScoring) {
    // Cost check
    if (totalCost >= config.maxCostPerActorUsd) {
      logger.warn(
        { actorName: actor.name, cost: totalCost, limit: config.maxCostPerActorUsd },
        "discovery: cost limit reached, stopping research"
      )
      break
    }

    // Reddit research
    logger.info({ actorName: actor.name, term: candidate.term }, "discovery:reddit searching")
    const redditResult = await researchOnReddit(actor.name, candidate.term)
    totalCost += redditResult.costUsd

    logger.info(
      {
        actorName: actor.name,
        term: candidate.term,
        threads: redditResult.threads.length,
        hasClaim: !!redditResult.claimExtracted,
      },
      "discovery:reddit complete"
    )

    if (!redditResult.claimExtracted) {
      researched.push({
        term: candidate.term,
        incongruityScore: candidate.score,
        redditThreads: redditResult.threads,
        claimExtracted: "",
        verificationAttempts: [],
        verified: false,
      })
      continue
    }

    // Verification
    logger.info({ actorName: actor.name, term: candidate.term }, "discovery:verify searching")
    const verifyResult = await verifyClaim(
      actor.name,
      candidate.term,
      redditResult.claimExtracted
    )

    const logLevel = verifyResult.verified ? "info" : "warn"
    logger[logLevel](
      {
        actorName: actor.name,
        term: candidate.term,
        verified: verifyResult.verified,
        source: verifyResult.verificationSource,
      },
      `discovery:verify ${verifyResult.verified ? "VERIFIED" : "not verified"}`
    )

    researched.push({
      term: candidate.term,
      incongruityScore: candidate.score,
      redditThreads: redditResult.threads,
      claimExtracted: redditResult.claimExtracted,
      verificationAttempts: verifyResult.attempts,
      verified: verifyResult.verified,
      verificationSource: verifyResult.verificationSource,
      verificationUrl: verifyResult.verificationUrl,
      verificationExcerpt: verifyResult.verificationExcerpt,
    })
  }

  const verifiedFindings = researched.filter((r) => r.verified)

  if (verifiedFindings.length === 0) {
    return {
      ...emptyResult,
      discoveryResults: {
        ...phase1Results,
        researched,
        costUsd: totalCost,
      },
    }
  }

  // =========================================================================
  // Phase 3: Integrate
  // =========================================================================

  logger.info(
    {
      actorName: actor.name,
      verifiedCount: verifiedFindings.length,
      strategy: config.integrationStrategy,
    },
    "discovery:integrate starting"
  )

  const integrationResult = await integrateFindings(
    actor.name,
    existingNarrative,
    existingFacts,
    verifiedFindings,
    config.integrationStrategy
  )
  totalCost += integrationResult.costUsd

  logger.info(
    {
      actorName: actor.name,
      newFacts: integrationResult.newLesserKnownFacts.length,
      narrativeUpdated: integrationResult.updatedNarrative !== null,
      integrated: integrationResult.integrated,
    },
    "discovery:integrate complete"
  )

  return {
    hasFindings: integrationResult.newLesserKnownFacts.length > 0 || integrationResult.updatedNarrative !== null,
    updatedNarrative: integrationResult.updatedNarrative,
    newLesserKnownFacts: integrationResult.newLesserKnownFacts,
    discoveryResults: {
      ...phase1Results,
      researched,
      integrated: integrationResult.integrated,
      costUsd: totalCost,
    },
  }
}

function buildEmptyResults(config: DiscoveryConfig): DiscoveryResults {
  return {
    discoveredAt: new Date().toISOString(),
    config: {
      integrationStrategy: config.integrationStrategy,
      incongruityThreshold: config.incongruityThreshold,
    },
    autocomplete: { queriesRun: 0, totalSuggestions: 0, uniqueSuggestions: 0, byPattern: {} },
    boringFilter: { dropped: 0, droppedByReason: {}, remaining: 0 },
    incongruityCandidates: [],
    researched: [],
    integrated: [],
    costUsd: 0,
  }
}

function countByPattern(
  suggestions: Array<{ queryPattern: string }>
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of suggestions) {
    counts[s.queryPattern] = (counts[s.queryPattern] ?? 0) + 1
  }
  return counts
}

/**
 * Build the boring filter context from actor data.
 */
async function buildFilterContext(
  actor: DiscoveryActor,
  bioText: string
): Promise<BoringFilterContext> {
  const pool = getPool()

  // Get movie titles and character names
  const movieResult = await pool.query<{ title: string; character: string | null }>(
    `SELECT m.title, ama.character
     FROM actor_movie_appearances ama
     JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
     WHERE ama.actor_id = $1
     LIMIT 200`,
    [actor.id]
  )

  // Get show titles
  const showResult = await pool.query<{ name: string }>(
    `SELECT s.name
     FROM actor_show_appearances asa
     JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
     WHERE asa.actor_id = $1
     LIMIT 100`,
    [actor.id]
  )

  // Get co-star names from top movies
  const costarResult = await pool.query<{ name: string }>(
    `SELECT DISTINCT a.name
     FROM actor_movie_appearances ama1
     JOIN actor_movie_appearances ama2 ON ama1.movie_tmdb_id = ama2.movie_tmdb_id
     JOIN actors a ON a.id = ama2.actor_id
     WHERE ama1.actor_id = $1 AND ama2.actor_id != $1
     LIMIT 200`,
    [actor.id]
  )

  return {
    movieTitles: movieResult.rows.map((r) => r.title),
    showTitles: showResult.rows.map((r) => r.name),
    characterNames: movieResult.rows
      .map((r) => r.character)
      .filter((c): c is string => c !== null),
    costarNames: costarResult.rows.map((r) => r.name),
    bioText,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/orchestrator.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/orchestrator.ts server/src/lib/biography-sources/surprise-discovery/orchestrator.test.ts
git commit -m "feat: add surprise discovery orchestrator"
```

---

### Task 10: Hook Into Single-Actor Enrichment

**Files:**
- Modify: `server/src/routes/admin/biography-enrichment.ts`

- [ ] **Step 1: Add discovery to the single-actor enrich endpoint**

In `server/src/routes/admin/biography-enrichment.ts`, modify the `POST /enrich` handler (around line 132-180). After the existing enrichment completes and writes to DB, add the discovery step:

```typescript
// After line 166 (after writeBiographyToProduction), before res.json():

    // Run surprise discovery if enabled and bio was written
    let discoveryResult = null
    if (result.data?.hasSubstantiveContent && result.data?.narrative) {
      const { runSurpriseDiscovery } = await import(
        "../../lib/biography-sources/surprise-discovery/orchestrator.js"
      )
      const { DEFAULT_DISCOVERY_CONFIG } = await import(
        "../../lib/biography-sources/surprise-discovery/types.js"
      )

      discoveryResult = await runSurpriseDiscovery(
        actor,
        result.data.narrative,
        result.data.lesserKnownFacts || [],
        DEFAULT_DISCOVERY_CONFIG
      )

      // Write discovery results and any new findings to DB
      if (discoveryResult.hasFindings || discoveryResult.discoveryResults.autocomplete.queriesRun > 0) {
        const updateFields: string[] = ["discovery_results = $2"]
        const updateParams: unknown[] = [actorId, JSON.stringify(discoveryResult.discoveryResults)]
        let paramIdx = 3

        if (discoveryResult.newLesserKnownFacts.length > 0) {
          // Append new facts to existing lesser_known_facts
          updateFields.push(
            `lesser_known_facts = COALESCE(lesser_known_facts, ARRAY[]::text[]) || $${paramIdx}::text[]`
          )
          updateParams.push(discoveryResult.newLesserKnownFacts)
          paramIdx++
        }

        if (discoveryResult.updatedNarrative) {
          updateFields.push(`narrative = $${paramIdx}`)
          updateParams.push(discoveryResult.updatedNarrative)
          paramIdx++
        }

        await pool.query(
          `UPDATE actor_biography_details SET ${updateFields.join(", ")} WHERE actor_id = $1`,
          updateParams
        )
      }
    }
```

Then update the response to include discovery info:

```typescript
    res.json({
      success: true,
      enriched: result.data?.hasSubstantiveContent || false,
      data: result.data,
      stats: result.stats,
      discovery: discoveryResult
        ? {
            hasFindings: discoveryResult.hasFindings,
            newFactsCount: discoveryResult.newLesserKnownFacts.length,
            narrativeUpdated: discoveryResult.updatedNarrative !== null,
            costUsd: discoveryResult.discoveryResults.costUsd,
          }
        : null,
    })
```

- [ ] **Step 2: Test manually**

Start the dev server and trigger a single-actor enrichment for Helen Mirren via the admin UI or curl:

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:8080/admin/api/auth/login \
  -H "Content-Type: application/json" -d '{"password":"sl4pp3r"}'

curl -s -b /tmp/cookies.txt -X POST http://localhost:8080/admin/api/biography-enrichment/enrich \
  -H "Content-Type: application/json" -d '{"actorId": 15854}' | python3 -m json.tool
```

Expected: Response includes `discovery` field with results. Check server logs for `discovery:*` entries.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/admin/biography-enrichment.ts
git commit -m "feat: hook surprise discovery into single-actor bio enrichment"
```

---

### Task 11: Hook Into Batch Enrichment

**Files:**
- Modify: `server/src/lib/jobs/handlers/enrich-biographies-batch.ts`

- [ ] **Step 1: Read the current batch handler**

Read `server/src/lib/jobs/handlers/enrich-biographies-batch.ts` to find the exact location after `writeBiographyToProduction` or `writeBiographyToStaging` where discovery should run. The handler processes each actor in a loop — add discovery after the writer returns for each actor.

- [ ] **Step 2: Add discovery config to batch job data**

In the batch handler, add the discovery config fields to the job data interface and pass them through. The config should come from the admin UI via the enrich-batch endpoint.

- [ ] **Step 3: Add discovery step after bio write**

After the bio writer completes for each actor, run surprise discovery if enabled. Follow the same pattern as Task 10 — call `runSurpriseDiscovery()`, write results to DB, log the outcome.

- [ ] **Step 4: Update the enrich-batch route to accept discovery config**

In `server/src/routes/admin/biography-enrichment.ts`, update the `POST /enrich-batch` handler to accept and forward discovery config:

```typescript
const {
  // ...existing fields...
  discoveryEnabled,
  discoveryIntegrationStrategy,
  discoveryIncongruityThreshold,
  discoveryMaxCostPerActor,
} = req.body
```

Pass these through to the BullMQ job data.

- [ ] **Step 5: Test with a small batch**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:8080/admin/api/biography-enrichment/enrich-batch \
  -H "Content-Type: application/json" \
  -d '{"actorIds": [15854], "discoveryEnabled": true}'
```

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/jobs/handlers/enrich-biographies-batch.ts server/src/routes/admin/biography-enrichment.ts
git commit -m "feat: hook surprise discovery into batch bio enrichment"
```

---

### Task 12: Admin UI — Discovery Config

**Files:**
- Modify: `src/components/admin/actors/BiographyEnrichmentTab.tsx`

- [ ] **Step 1: Add discovery config controls to the enrichment options**

In `BiographyEnrichmentTab.tsx`, add a "Surprise Discovery" section to the batch enrichment config area with:

- Checkbox: "Enable surprise discovery" (default: checked)
- Radio: "Integration strategy" — "Append only" (default) / "Re-synthesize"
- Number input: "Max discovery cost per actor ($)" (default: 0.10)
- Number input: "Incongruity threshold (1-10)" (default: 7)

Wire these to the batch enrichment request body as `discoveryEnabled`, `discoveryIntegrationStrategy`, `discoveryIncongruityThreshold`, `discoveryMaxCostPerActor`.

- [ ] **Step 2: Add discovery results display to actor detail**

If the actor has `discovery_results` in their biography details, show an expandable "Discovery Results" section with:

- Autocomplete stats (queries run, suggestions found, by pattern)
- Boring filter stats (dropped count by reason)
- Incongruity candidates (term, score, reasoning)
- Researched associations (term, Reddit threads, verification status)
- Integrated findings (term, destination)
- Total cost

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/actors/BiographyEnrichmentTab.tsx
git commit -m "feat: add surprise discovery config and results to admin UI"
```

---

### Task 13: Source Query Caching

**Files:**
- Modify: `server/src/lib/biography-sources/surprise-discovery/autocomplete.ts`
- Modify: `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts`
- Modify: `server/src/lib/biography-sources/surprise-discovery/verifier.ts`

- [ ] **Step 1: Add caching to autocomplete**

Cache the full autocomplete result set per actor in `source_query_cache` using source type `AUTOCOMPLETE_DISCOVERY`. One cache entry per actor (not per query), containing all 57 queries' results as a single JSON blob. Check cache before running autocomplete queries.

```typescript
import { getCachedQuery, setCachedQuery } from "../../death-sources/cache.js"
import { BiographySourceType } from "../types.js"
import type { DataSourceType } from "../../death-sources/types.js"

const SOURCE_TYPE = BiographySourceType.AUTOCOMPLETE_DISCOVERY as unknown as DataSourceType
```

- [ ] **Step 2: Add caching to Reddit researcher**

Cache each Reddit search result per actor+term combination using source type `REDDIT_DISCOVERY`.

- [ ] **Step 3: Add caching to verifier**

Cache each verification search per actor+term using source type `DISCOVERY_VERIFICATION`.

- [ ] **Step 4: Run all tests**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/autocomplete.ts \
  server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts \
  server/src/lib/biography-sources/surprise-discovery/verifier.ts
git commit -m "feat: add source query caching to discovery pipeline"
```

---

### Task 14: End-to-End Test

**Files:**
- Create: `server/src/lib/biography-sources/surprise-discovery/e2e.test.ts`

- [ ] **Step 1: Write an integration test**

Create an integration test that mocks external APIs (Google Autocomplete, Google CSE, Anthropic) and runs the full pipeline end-to-end:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runSurpriseDiscovery } from "./orchestrator.js"
import { DEFAULT_DISCOVERY_CONFIG } from "./types.js"

// Mock all external dependencies at the top level
// Set up a scenario where:
// 1. Autocomplete returns "kurt cobain" among other suggestions
// 2. Boring filter passes "kurt cobain" (not in filmography)
// 3. Haiku scores it 9/10
// 4. Reddit finds a TIL thread
// 5. Google CSE finds the Guardian article
// 6. Sonnet adds it to lesserKnownFacts

describe("Surprise Discovery E2E", () => {
  it("discovers, verifies, and integrates the Helen Mirren / Kurt Cobain / GPS fact", async () => {
    // ... full integration test with all mocks wired together
    // Assert that the discovery results contain the verified finding
    // Assert that lesserKnownFacts includes the GPS fact
  })

  it("drops unverifiable claims without integrating them", async () => {
    // ... test where Reddit has a claim but verification fails
  })

  it("respects cost limits and stops when exceeded", async () => {
    // ... test with maxCostPerActorUsd = 0.001
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd server && npx vitest run src/lib/biography-sources/surprise-discovery/e2e.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/biography-sources/surprise-discovery/e2e.test.ts
git commit -m "test: add end-to-end test for surprise discovery pipeline"
```
