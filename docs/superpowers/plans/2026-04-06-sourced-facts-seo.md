# Sourced Facts SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize SEO value of source-attributed lesser-known facts through Person schema enrichment, FAQ structured data, semantic HTML, and conditional nofollow removal.

**Architecture:** Enrich the existing Person JSON-LD with `knowsAbout` entries that link to verifying articles. Add a separate FAQPage JSON-LD block. Wrap the facts section in semantic HTML (`<section>`, `<h2>`, `<cite>`). Remove `nofollow` from links to high-reliability sources. A new `sourceReliable` boolean in the API response drives frontend decisions. Both client-side and prerender schema builders are updated in lockstep.

**Tech Stack:** React 18, TypeScript, schema.org JSON-LD, Vitest, react-testing-library

---

### Task 1: Extract RELIABLE_DOMAINS to shared module

**Files:**
- Create: `server/src/lib/shared/reliable-domains.ts`
- Modify: `server/src/lib/biography-sources/surprise-discovery/verifier.ts`
- Test: `server/src/lib/shared/reliable-domains.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// server/src/lib/shared/reliable-domains.test.ts
import { describe, it, expect } from "vitest"
import { RELIABLE_DOMAINS, extractDomain, isReliableDomain } from "./reliable-domains.js"

describe("RELIABLE_DOMAINS", () => {
  it("contains Tier 1 News domains", () => {
    expect(RELIABLE_DOMAINS.has("theguardian.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("nytimes.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("bbc.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("reuters.com")).toBe(true)
  })

  it("contains Trade Press domains", () => {
    expect(RELIABLE_DOMAINS.has("variety.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("deadline.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("hollywoodreporter.com")).toBe(true)
  })

  it("does not contain lower-reliability domains", () => {
    expect(RELIABLE_DOMAINS.has("people.com")).toBe(false)
    expect(RELIABLE_DOMAINS.has("reddit.com")).toBe(false)
    expect(RELIABLE_DOMAINS.has("wikipedia.org")).toBe(false)
  })
})

describe("extractDomain", () => {
  it("extracts hostname and strips www", () => {
    expect(extractDomain("https://www.theguardian.com/article/123")).toBe("theguardian.com")
    expect(extractDomain("https://nytimes.com/2026/01/01/article")).toBe("nytimes.com")
  })

  it("returns empty string on invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("")
    expect(extractDomain("")).toBe("")
  })
})

describe("isReliableDomain", () => {
  it("returns true for exact matches", () => {
    expect(isReliableDomain("theguardian.com")).toBe(true)
    expect(isReliableDomain("variety.com")).toBe(true)
  })

  it("returns true for subdomains of reliable domains", () => {
    expect(isReliableDomain("news.bbc.co.uk")).toBe(true)
    expect(isReliableDomain("film.theguardian.com")).toBe(true)
  })

  it("returns false for non-reliable domains", () => {
    expect(isReliableDomain("people.com")).toBe(false)
    expect(isReliableDomain("reddit.com")).toBe(false)
    expect(isReliableDomain("example.com")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/shared/reliable-domains.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the shared module**

```typescript
// server/src/lib/shared/reliable-domains.ts
/**
 * Shared set of high-reliability source domains (ReliabilityTier >= 0.9).
 *
 * Used by:
 * - Surprise discovery verifier (claim verification)
 * - Actor API route (sourceReliable flag on lesser-known facts)
 * - Prerender data fetcher (sourceReliable for schema building)
 *
 * Based on Wikipedia's Reliable Sources Perennial list (RSP).
 * Tier 1 News (0.95), Trade Press (0.9), Quality Publications (0.9+).
 */
export const RELIABLE_DOMAINS = new Set([
  // Tier 1 News (0.95)
  "theguardian.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "apnews.com",
  "reuters.com",
  "washingtonpost.com",
  "latimes.com",
  // Trade Press (0.9)
  "variety.com",
  "deadline.com",
  "hollywoodreporter.com",
  // Quality Publications (0.9+)
  "newyorker.com",
  "theatlantic.com",
  "smithsonianmag.com",
  "rollingstone.com",
  "vanityfair.com",
  "time.com",
  "telegraph.co.uk",
  "independent.co.uk",
  "npr.org",
  "pbs.org",
])

/**
 * Extracts the bare domain from a URL, stripping the www. prefix.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * Checks if a domain matches any entry in RELIABLE_DOMAINS.
 * Matches exact hostname or subdomains (e.g. "news.bbc.co.uk" matches "bbc.co.uk").
 */
export function isReliableDomain(domain: string): boolean {
  if (RELIABLE_DOMAINS.has(domain)) {
    return true
  }
  const parts = domain.split(".")
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".")
    if (RELIABLE_DOMAINS.has(candidate)) {
      return true
    }
  }
  return false
}

/**
 * Checks if a source URL belongs to a reliable domain.
 * Convenience function combining extractDomain + isReliableDomain.
 */
export function isReliableSourceUrl(url: string): boolean {
  const domain = extractDomain(url)
  return domain !== "" && isReliableDomain(domain)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/shared/reliable-domains.test.ts`
Expected: PASS

- [ ] **Step 5: Update verifier.ts to import from shared module**

In `server/src/lib/biography-sources/surprise-discovery/verifier.ts`, replace the local `RELIABLE_DOMAINS` set, `extractDomain`, and `isReliableDomain` with imports from the shared module:

```typescript
// Replace these lines at the top of verifier.ts:
//   const RELIABLE_DOMAINS = new Set([...])
//   export function extractDomain(url: string): string { ... }
//   export function isReliableDomain(domain: string): boolean { ... }
// With:
import { RELIABLE_DOMAINS, extractDomain, isReliableDomain } from "../../shared/reliable-domains.js"

// Keep the re-exports so existing tests/callers still work:
export { extractDomain, isReliableDomain }
```

Remove the local `RELIABLE_DOMAINS` constant, `extractDomain` function, and `isReliableDomain` function from verifier.ts. Keep the JSDoc comment block above where `RELIABLE_DOMAINS` was, but change it to reference the shared module.

- [ ] **Step 6: Run verifier tests to confirm nothing broke**

Run: `cd server && npx vitest run src/lib/biography-sources/surprise-discovery/verifier.test.ts`
Expected: PASS — all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/shared/reliable-domains.ts server/src/lib/shared/reliable-domains.test.ts server/src/lib/biography-sources/surprise-discovery/verifier.ts
git commit -m "Extract RELIABLE_DOMAINS to shared module

Move domain set, extractDomain, and isReliableDomain from verifier.ts
to server/src/lib/shared/reliable-domains.ts so the actor route and
prerender data fetcher can use them without importing from the discovery
module.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add sourceReliable to API response and frontend type

**Files:**
- Modify: `server/src/routes/actor.ts`
- Modify: `src/types/actor.ts`
- Modify: `server/src/routes/actor.test.ts` (if exists, otherwise create)

- [ ] **Step 1: Update the frontend type**

In `src/types/actor.ts`, add `sourceReliable` to the `BiographyDetails` interface:

```typescript
// In the BiographyDetails interface, change lesserKnownFacts from:
lesserKnownFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>
// To:
lesserKnownFacts: Array<{
  text: string
  sourceUrl: string | null
  sourceName: string | null
  sourceReliable?: boolean
}>
```

Note: `sourceReliable` is optional (`?`) for backwards compatibility with cached API responses that don't include it yet.

- [ ] **Step 2: Update the server-side response type**

In `server/src/routes/actor.ts`, update the `BiographyDetailsResponse` interface to include `sourceReliable`:

```typescript
// In the BiographyDetailsResponse interface, change lesserKnownFacts type to:
lesserKnownFacts: Array<{
  text: string
  sourceUrl: string | null
  sourceName: string | null
  sourceReliable: boolean
}>
```

- [ ] **Step 3: Add the sourceReliable computation in the route handler**

In `server/src/routes/actor.ts`, add the import and map facts to include `sourceReliable`:

```typescript
// Add import at top of file:
import { isReliableSourceUrl } from "../lib/shared/reliable-domains.js"

// In the response building section, change:
//   lesserKnownFacts: bioRow.lesser_known_facts || [],
// To:
lesserKnownFacts: (bioRow.lesser_known_facts || []).map((fact) => ({
  ...fact,
  sourceReliable: fact.sourceUrl ? isReliableSourceUrl(fact.sourceUrl) : false,
})),
```

- [ ] **Step 4: Run type check to ensure consistency**

Run: `npm run type-check && cd server && npx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 5: Commit**

```bash
git add src/types/actor.ts server/src/routes/actor.ts
git commit -m "Add sourceReliable flag to lesser-known facts API response

Server computes sourceReliable by checking sourceUrl domain against
RELIABLE_DOMAINS (Tier 1 News + Trade Press, reliability >= 0.9).
Frontend type uses optional field for backwards compatibility with
cached responses.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add knowsAbout to client-side Person schema builder

**Files:**
- Modify: `src/utils/schema.ts`
- Modify: `src/utils/schema.test.ts`

- [ ] **Step 1: Write failing tests for knowsAbout**

Add these tests to `src/utils/schema.test.ts` inside the existing `describe("buildPersonSchema")` block:

```typescript
it("includes knowsAbout for sourced facts", () => {
  const facts = [
    {
      text: "Holds a karate black belt",
      sourceUrl: "https://theguardian.com/karate",
      sourceName: "The Guardian",
      sourceReliable: true,
    },
    {
      text: "Begged to be in Fast & Furious",
      sourceUrl: "https://people.com/furious",
      sourceName: "People",
      sourceReliable: false,
    },
  ]
  const result = buildPersonSchema(
    { ...baseActor, lesserKnownFacts: facts },
    "john-wayne-4165"
  )
  const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
  expect(knowsAbout).toHaveLength(2)
  expect(knowsAbout[0]).toEqual({
    "@type": "Thing",
    name: "Holds a karate black belt",
    description: "Holds a karate black belt",
    subjectOf: {
      "@type": "Article",
      url: "https://theguardian.com/karate",
      publisher: { "@type": "Organization", name: "The Guardian" },
    },
  })
})

it("excludes facts without sourceUrl from knowsAbout", () => {
  const facts = [
    { text: "No source fact", sourceUrl: null, sourceName: null },
    {
      text: "Sourced fact",
      sourceUrl: "https://bbc.com/article",
      sourceName: "BBC",
      sourceReliable: true,
    },
  ]
  const result = buildPersonSchema(
    { ...baseActor, lesserKnownFacts: facts },
    "john-wayne-4165"
  )
  const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
  expect(knowsAbout).toHaveLength(1)
  expect((knowsAbout[0].subjectOf as Record<string, unknown>).url).toBe("https://bbc.com/article")
})

it("limits knowsAbout to 10 facts", () => {
  const facts = Array.from({ length: 15 }, (_, i) => ({
    text: `Fact ${i}`,
    sourceUrl: `https://nytimes.com/${i}`,
    sourceName: "NYT",
    sourceReliable: true,
  }))
  const result = buildPersonSchema(
    { ...baseActor, lesserKnownFacts: facts },
    "john-wayne-4165"
  )
  expect((result.knowsAbout as unknown[]).length).toBe(10)
})

it("omits knowsAbout when no sourced facts exist", () => {
  const result = buildPersonSchema(baseActor, "john-wayne-4165")
  expect(result.knowsAbout).toBeUndefined()
})

it("omits knowsAbout when lesserKnownFacts is empty", () => {
  const result = buildPersonSchema(
    { ...baseActor, lesserKnownFacts: [] },
    "john-wayne-4165"
  )
  expect(result.knowsAbout).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/schema.test.ts`
Expected: FAIL — `lesserKnownFacts` not in `PersonSchemaInput`, `knowsAbout` is undefined

- [ ] **Step 3: Update buildPersonSchema to accept and render knowsAbout**

In `src/utils/schema.ts`:

1. Add `lesserKnownFacts` to the `PersonSchemaInput` interface:

```typescript
interface PersonSchemaInput {
  // ...existing fields...
  lesserKnownFacts?: Array<{
    text: string
    sourceUrl: string | null
    sourceName: string | null
    sourceReliable?: boolean
  }> | null
}
```

2. Add `knowsAbout` generation at the end of `buildPersonSchema`, before the `return schema` line:

```typescript
  // Build knowsAbout from sourced lesser-known facts
  const sourcedFacts = (actor.lesserKnownFacts ?? [])
    .filter((f) => f.sourceUrl && f.sourceName)
    .slice(0, 10)

  if (sourcedFacts.length > 0) {
    schema.knowsAbout = sourcedFacts.map((f) => ({
      "@type": "Thing",
      name: f.text,
      description: f.text,
      subjectOf: {
        "@type": "Article",
        url: f.sourceUrl,
        publisher: {
          "@type": "Organization",
          name: f.sourceName,
        },
      },
    }))
  }

  return schema
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/schema.ts src/utils/schema.test.ts
git commit -m "Add knowsAbout to Person schema for sourced lesser-known facts

Each sourced fact becomes a Thing with a linked Article and publisher
Organization. Only facts with sourceUrl AND sourceName are included.
Maximum 10 facts in knowsAbout array.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add buildFactsFAQSchema to client-side schema

**Files:**
- Modify: `src/utils/schema.ts`
- Modify: `src/utils/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `src/utils/schema.test.ts`:

```typescript
describe("buildFactsFAQSchema", () => {
  it("builds FAQPage with aggregated sourced facts", () => {
    const facts = [
      {
        text: "Holds a karate black belt",
        sourceUrl: "https://theguardian.com/karate",
        sourceName: "The Guardian",
      },
      {
        text: "Begged to be in Fast & Furious",
        sourceUrl: "https://people.com/furious",
        sourceName: "People",
      },
    ]
    const result = buildFactsFAQSchema("Helen Mirren", facts)

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("FAQPage")
    const mainEntity = result.mainEntity as Array<Record<string, unknown>>
    expect(mainEntity).toHaveLength(1)
    expect(mainEntity[0].name).toBe("What are some lesser-known facts about Helen Mirren?")
    const answer = mainEntity[0].acceptedAnswer as Record<string, unknown>
    expect(answer.text).toContain("Holds a karate black belt (The Guardian)")
    expect(answer.text).toContain("Begged to be in Fast & Furious (People)")
  })

  it("excludes facts without sources from the answer", () => {
    const facts = [
      { text: "No source", sourceUrl: null, sourceName: null },
      {
        text: "Has a source",
        sourceUrl: "https://bbc.com/1",
        sourceName: "BBC",
      },
    ]
    const result = buildFactsFAQSchema("John Wayne", facts)
    const answer = (result.mainEntity as Array<Record<string, unknown>>)[0]
      .acceptedAnswer as Record<string, unknown>
    expect(answer.text).not.toContain("No source")
    expect(answer.text).toContain("Has a source (BBC)")
  })

  it("returns null when no sourced facts exist", () => {
    expect(buildFactsFAQSchema("Nobody", [])).toBeNull()
    expect(
      buildFactsFAQSchema("Nobody", [{ text: "Unsourced", sourceUrl: null, sourceName: null }])
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/schema.test.ts`
Expected: FAIL — `buildFactsFAQSchema` not exported

- [ ] **Step 3: Implement buildFactsFAQSchema**

Add to `src/utils/schema.ts`:

```typescript
/**
 * Build FAQPage schema for actor lesser-known facts.
 * Aggregates sourced facts into a single Q&A entry.
 * Returns null when no sourced facts exist.
 */
export function buildFactsFAQSchema(
  actorName: string,
  facts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>
): Record<string, unknown> | null {
  const sourced = facts.filter((f) => f.sourceUrl && f.sourceName)
  if (sourced.length === 0) return null

  const answerText = sourced.map((f) => `${f.text} (${f.sourceName})`).join(". ") + "."

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What are some lesser-known facts about ${actorName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerText,
        },
      },
    ],
  }
}
```

Also add the import in the test file:

```typescript
import {
  buildPersonSchema,
  buildTVSeriesSchema,
  buildTVEpisodeSchema,
  buildCollectionPageSchema,
  buildWebsiteSchema,
  buildFactsFAQSchema,  // ADD THIS
} from "./schema"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/schema.ts src/utils/schema.test.ts
git commit -m "Add buildFactsFAQSchema for actor lesser-known facts

Single Q&A entry aggregating all sourced facts with inline source names.
Returns null when no sourced facts exist. Keeps answer concise for Google.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire schema changes into ActorPage

**Files:**
- Modify: `src/pages/ActorPage.tsx`

- [ ] **Step 1: Update imports**

Add `buildFactsFAQSchema` to the existing schema import:

```typescript
import { buildPersonSchema, buildBreadcrumbSchema, buildFactsFAQSchema } from "@/utils/schema"
```

- [ ] **Step 2: Pass lesserKnownFacts to buildPersonSchema**

In the `<JsonLd data={buildPersonSchema(...)} />` call (around line 304), add `lesserKnownFacts`:

```typescript
<JsonLd
  data={buildPersonSchema(
    {
      name: actor.name,
      birthday: actor.birthday,
      deathday: actor.deathday,
      biography: actor.biography,
      profilePath: actor.profilePath,
      placeOfBirth: actor.placeOfBirth,
      tmdbId: actor.tmdbId,
      knownForDepartment: actor.knownForDepartment,
      causeOfDeath: deathInfo?.causeOfDeath,
      alternateNames: data.biographyDetails?.alternateNames,
      gender: data.biographyDetails?.gender,
      nationality: data.biographyDetails?.nationality,
      occupations: data.biographyDetails?.occupations,
      awards: data.biographyDetails?.awards,
      educationInstitutions: data.biographyDetails?.educationInstitutions,
      lesserKnownFacts: data.biographyDetails?.lesserKnownFacts,  // ADD THIS
    },
    slug!
  )}
/>
```

- [ ] **Step 3: Add FAQ JSON-LD block**

After the breadcrumb `<JsonLd>` block (around line 330), add:

```typescript
{data.biographyDetails?.lesserKnownFacts && (
  (() => {
    const faqSchema = buildFactsFAQSchema(
      actor.name,
      data.biographyDetails.lesserKnownFacts
    )
    return faqSchema ? <JsonLd data={faqSchema} /> : null
  })()
)}
```

- [ ] **Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ActorPage.tsx
git commit -m "Wire knowsAbout and FAQ schema into ActorPage

Pass lesserKnownFacts to buildPersonSchema for knowsAbout generation.
Add conditional FAQPage JSON-LD block when sourced facts exist.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update LesserKnownFacts HTML semantics and conditional nofollow

**Files:**
- Modify: `src/pages/ActorPage.tsx` (LesserKnownFacts component)
- Modify: `src/pages/ActorPage.test.tsx`

- [ ] **Step 1: Write failing tests for semantic HTML and conditional nofollow**

Add to the existing `describe("LesserKnownFacts")` block in `src/pages/ActorPage.test.tsx`:

```typescript
it("wraps facts in a section with h2 heading", async () => {
  mockActorWithFacts(factsData)
  render(<ActorPage />, { wrapper: TestWrapper })
  await screen.findByTestId("biography-facts")

  const section = screen.getByRole("region", { name: "Lesser-Known Facts" })
  expect(section).toBeInTheDocument()
  const heading = within(section).getByRole("heading", { level: 2, name: "Lesser-Known Facts" })
  expect(heading).toBeInTheDocument()
})

it("wraps source links in cite elements", async () => {
  mockActorWithFacts(factsData)
  render(<ActorPage />, { wrapper: TestWrapper })
  await screen.findByTestId("biography-facts")

  const cites = document.querySelectorAll("cite")
  // factsData has 4 facts with sources visible in first 5
  expect(cites.length).toBeGreaterThanOrEqual(4)
})

it("omits nofollow for reliable sources", async () => {
  mockActorWithFacts([
    {
      text: "Verified fact",
      sourceUrl: "https://theguardian.com/article",
      sourceName: "The Guardian",
      sourceReliable: true,
    },
  ])
  render(<ActorPage />, { wrapper: TestWrapper })
  await screen.findByTestId("biography-facts")

  const link = screen.getByLabelText("Source: The Guardian (opens in new tab)")
  expect(link).toHaveAttribute("rel", "noopener noreferrer")
  // Should NOT contain nofollow
  expect(link.getAttribute("rel")).not.toContain("nofollow")
})

it("keeps nofollow for non-reliable sources", async () => {
  mockActorWithFacts([
    {
      text: "Unverified fact",
      sourceUrl: "https://reddit.com/r/movies",
      sourceName: "Reddit",
      sourceReliable: false,
    },
  ])
  render(<ActorPage />, { wrapper: TestWrapper })
  await screen.findByTestId("biography-facts")

  const link = screen.getByLabelText("Source: Reddit (opens in new tab)")
  expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer")
})

it("defaults to nofollow when sourceReliable is missing", async () => {
  mockActorWithFacts([
    {
      text: "Legacy fact",
      sourceUrl: "https://example.com/old",
      sourceName: "Example",
      // sourceReliable not present (cached response)
    },
  ])
  render(<ActorPage />, { wrapper: TestWrapper })
  await screen.findByTestId("biography-facts")

  const link = screen.getByLabelText("Source: Example (opens in new tab)")
  expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/ActorPage.test.tsx`
Expected: FAIL — no `region` role, no `cite` elements, `rel` still contains `nofollow` for all

- [ ] **Step 3: Update LesserKnownFacts component**

Replace the `LesserKnownFacts` function in `src/pages/ActorPage.tsx`:

```tsx
function LesserKnownFacts({ facts }: { facts: BiographyDetails["lesserKnownFacts"] }) {
  const [showAll, setShowAll] = useState(false)
  const visibleFacts = showAll ? facts : facts.slice(0, INITIAL_FACTS_SHOWN)
  const hiddenCount = facts.length - INITIAL_FACTS_SHOWN

  return (
    <section
      aria-labelledby="lesser-known-facts"
      className="mb-6 rounded-lg bg-surface-elevated p-4"
      data-testid="biography-facts"
    >
      <h2 id="lesser-known-facts" className="mb-2 font-display text-lg text-brown-dark">
        Lesser-Known Facts
      </h2>
      <ul className="space-y-1.5">
        {visibleFacts.map((fact, i) => (
          <li key={i} className="flex items-start gap-2 text-text-primary">
            <span className="mt-1 text-brown-medium">&bull;</span>
            <span>
              {fact.text}
              {fact.sourceUrl && fact.sourceName && isSafeUrl(fact.sourceUrl) && (
                <>
                  {" "}
                  <cite className="not-italic">
                    <a
                      href={fact.sourceUrl}
                      target="_blank"
                      rel={
                        fact.sourceReliable
                          ? "noopener noreferrer"
                          : "nofollow noopener noreferrer"
                      }
                      className="inline-flex items-baseline gap-0.5 whitespace-nowrap text-xs text-text-muted hover:text-brown-dark"
                      aria-label={`Source: ${fact.sourceName} (opens in new tab)`}
                    >
                      — {fact.sourceName}
                      <svg
                        className="inline h-2.5 w-2.5 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                    </a>
                  </cite>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-sm text-brown-medium hover:text-brown-dark"
          data-testid="facts-toggle"
        >
          {showAll ? "Show fewer" : `Show ${hiddenCount} more`}
        </button>
      )}
    </section>
  )
}
```

Key changes:
- Outer `<div>` → `<section aria-labelledby="lesser-known-facts">`
- New `<h2 id="lesser-known-facts">` (same styles as before)
- Source link wrapped in `<cite className="not-italic">` (`not-italic` overrides browser default italic)
- `rel` attribute is conditional: `fact.sourceReliable ? "noopener noreferrer" : "nofollow noopener noreferrer"`

- [ ] **Step 4: Update existing test assertions that check the old `rel` value**

The existing test on line ~910 checks `expect(sourceLink).toHaveAttribute("rel", "nofollow noopener noreferrer")`. Since `factsData` doesn't include `sourceReliable`, the default behavior (nofollow) still applies. The existing test should still pass without changes. Verify by running.

- [ ] **Step 5: Run all ActorPage tests**

Run: `npx vitest run src/pages/ActorPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/ActorPage.tsx src/pages/ActorPage.test.tsx
git commit -m "Add semantic HTML and conditional nofollow to LesserKnownFacts

Wrap facts in <section> with <h2> for featured snippet eligibility.
Add <cite> around source links for E-E-A-T HTML signal.
Remove nofollow from links where sourceReliable is true (Tier 1 News
and Trade Press). Default to nofollow when flag is missing (backwards
compatible with cached responses).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Mirror schema changes in prerender pipeline

**Files:**
- Modify: `server/src/lib/prerender/schema.ts`
- Modify: `server/src/lib/prerender/data-fetchers.ts`
- Modify: `server/src/lib/prerender/schema.test.ts`

- [ ] **Step 1: Write failing tests for server-side knowsAbout and FAQ schema**

Add to `server/src/lib/prerender/schema.test.ts`:

```typescript
import { buildFactsFAQSchema } from "./schema.js"

// Inside existing describe("buildPersonSchema"):
it("includes knowsAbout for sourced facts", () => {
  const result = buildPersonSchema(
    {
      ...baseActor,
      lesser_known_facts: [
        {
          text: "Holds a karate black belt",
          sourceUrl: "https://theguardian.com/karate",
          sourceName: "The Guardian",
        },
        { text: "No source", sourceUrl: null, sourceName: null },
      ],
    },
    "john-wayne-4165"
  )
  const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
  expect(knowsAbout).toHaveLength(1)
  expect(knowsAbout[0]).toEqual({
    "@type": "Thing",
    name: "Holds a karate black belt",
    description: "Holds a karate black belt",
    subjectOf: {
      "@type": "Article",
      url: "https://theguardian.com/karate",
      publisher: { "@type": "Organization", name: "The Guardian" },
    },
  })
})

it("omits knowsAbout when no sourced facts", () => {
  const result = buildPersonSchema(baseActor, "john-wayne-4165")
  expect(result.knowsAbout).toBeUndefined()
})

// New describe block:
describe("buildFactsFAQSchema", () => {
  it("builds FAQPage with sourced facts", () => {
    const result = buildFactsFAQSchema("John Wayne", [
      {
        text: "Was a college football player",
        sourceUrl: "https://latimes.com/article",
        sourceName: "LA Times",
      },
    ])
    expect(result).not.toBeNull()
    expect(result!["@type"]).toBe("FAQPage")
    const answer = ((result!.mainEntity as unknown[])[0] as Record<string, unknown>)
      .acceptedAnswer as Record<string, unknown>
    expect(answer.text).toContain("Was a college football player (LA Times)")
  })

  it("returns null when no sourced facts", () => {
    expect(buildFactsFAQSchema("Nobody", [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/prerender/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Update server-side schema builders**

In `server/src/lib/prerender/schema.ts`:

1. Add `lesser_known_facts` to the `buildPersonSchema` input type:

```typescript
export function buildPersonSchema(
  actor: {
    // ...existing fields...
    lesser_known_facts?: Array<{
      text: string
      sourceUrl: string | null
      sourceName: string | null
    }> | null
  },
  slug: string
): Record<string, unknown> {
```

2. Add `knowsAbout` generation before the `return` statement:

```typescript
  // Build knowsAbout from sourced lesser-known facts
  const sourcedFacts = (actor.lesser_known_facts ?? [])
    .filter((f) => f.sourceUrl && f.sourceName)
    .slice(0, 10)

  if (sourcedFacts.length > 0) {
    schema.knowsAbout = sourcedFacts.map((f) => ({
      "@type": "Thing",
      name: f.text,
      description: f.text,
      subjectOf: {
        "@type": "Article",
        url: f.sourceUrl,
        publisher: {
          "@type": "Organization",
          name: f.sourceName,
        },
      },
    }))
  }

  return schema
```

3. Add `buildFactsFAQSchema` function (identical logic to client-side):

```typescript
export function buildFactsFAQSchema(
  actorName: string,
  facts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>
): Record<string, unknown> | null {
  const sourced = facts.filter((f) => f.sourceUrl && f.sourceName)
  if (sourced.length === 0) return null

  const answerText = sourced.map((f) => `${f.text} (${f.sourceName})`).join(". ") + "."

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What are some lesser-known facts about ${actorName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerText,
        },
      },
    ],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/prerender/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Update data-fetchers.ts to fetch facts and build schemas**

In `server/src/lib/prerender/data-fetchers.ts`, update `getActorPageData`:

1. Add `lesser_known_facts` to the biography details query:

```typescript
  const bioSeoRow = await getPool()
    .query<{
      alternate_names: string[] | null
      gender: string | null
      nationality: string | null
      occupations: string[] | null
      awards: string[] | null
      education_institutions: string[] | null
      lesser_known_facts: Array<{
        text: string
        sourceUrl: string | null
        sourceName: string | null
      }> | null
    }>(
      `SELECT alternate_names, gender, nationality, occupations, awards, education_institutions, lesser_known_facts
       FROM actor_biography_details
       WHERE actor_id = $1`,
      [actor.id]
    )
    .then((r) => r.rows[0] ?? null)
```

2. Add `lesser_known_facts` to `schemaInput`:

```typescript
  const schemaInput = {
    ...actor,
    alternate_names: bioSeoRow?.alternate_names ?? null,
    gender: bioSeoRow?.gender ?? null,
    nationality: bioSeoRow?.nationality ?? null,
    occupations: bioSeoRow?.occupations ?? null,
    awards: bioSeoRow?.awards ?? null,
    education_institutions: bioSeoRow?.education_institutions ?? null,
    lesser_known_facts: bioSeoRow?.lesser_known_facts ?? null,  // ADD THIS
  }
```

3. Add FAQ schema to the `jsonLd` array:

```typescript
  // Build FAQ schema from sourced facts
  const faqSchema = bioSeoRow?.lesser_known_facts
    ? buildFactsFAQSchema(actor.name, bioSeoRow.lesser_known_facts)
    : null

  return {
    title: `${actor.name} — Dead on Film`,
    description,
    ogType: "profile",
    imageUrl,
    canonicalUrl,
    jsonLd: [
      buildPersonSchema(schemaInput, slug),
      buildBreadcrumbSchema([
        { name: "Home", url: BASE_URL },
        { name: actor.name, url: canonicalUrl },
      ]),
      ...(faqSchema ? [faqSchema] : []),
    ],
    heading: actor.name,
    subheading: description,
  }
```

Also add the import at the top of `data-fetchers.ts`:

```typescript
import { buildPersonSchema, buildBreadcrumbSchema, buildFactsFAQSchema } from "./schema.js"
```

(Update the existing import line to include `buildFactsFAQSchema`.)

- [ ] **Step 6: Run server type check and tests**

Run: `cd server && npx tsc --noEmit && npx vitest run src/lib/prerender/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/prerender/schema.ts server/src/lib/prerender/schema.test.ts server/src/lib/prerender/data-fetchers.ts
git commit -m "Mirror schema changes in prerender pipeline

Server-side buildPersonSchema now includes knowsAbout from sourced facts.
New buildFactsFAQSchema generates FAQPage JSON-LD. Data fetcher queries
lesser_known_facts and passes them to both schema builders. Bots now see
the same structured data as the React app.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full integration test and final verification

- [ ] **Step 1: Run all tests**

Run: `npm test && cd server && npm test`
Expected: All tests PASS

- [ ] **Step 2: Run type checks**

Run: `npm run type-check && cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors (pre-existing CJS/rule-definition errors are ok)

- [ ] **Step 4: Commit any remaining changes**

If there are formatting changes from lint-staged or other minor fixups:

```bash
git add -A && git commit -m "Final formatting and lint fixes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
