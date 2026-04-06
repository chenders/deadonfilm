# Sourced Facts SEO Design

Maximize SEO value of source-attributed lesser-known facts by enriching Person schema, adding FAQ structured data, using semantic HTML, and removing `nofollow` from verified high-reliability source links.

## Goals

1. **Rich results** — Enrich Google knowledge panel via Person schema `knowsAbout` with cited sources
2. **E-E-A-T signals** — Demonstrate expertise/trustworthiness through `<cite>` elements, publisher attribution in JSON-LD, and followed links to Tier 1 news sources
3. **Featured snippet capture** — Proper `<h2>` + `<ul>` structure for "[actor] facts" queries, plus FAQ schema as secondary signal

## Approach

Schema + HTML Semantics (no new routes, no visual changes, no database migrations).

### 1. Person Schema Enrichment

Add `knowsAbout` array to the existing Person JSON-LD. Each sourced fact becomes a `Thing` with a linked source article:

```json
{
  "@type": "Person",
  "name": "Helen Mirren",
  ...existing fields...
  "knowsAbout": [
    {
      "@type": "Thing",
      "name": "Karate black belt",
      "description": "Helen Mirren holds a karate black belt",
      "subjectOf": {
        "@type": "Article",
        "url": "https://theguardian.com/helen-mirren-karate",
        "publisher": {
          "@type": "Organization",
          "name": "The Guardian"
        }
      }
    }
  ]
}
```

Rules:
- Only facts with a non-null `sourceUrl` AND `sourceName` are included in schema
- Maximum 10 facts in the `knowsAbout` array
- Publisher `Organization` name derived from `sourceName`

### 2. FAQ Schema

Add a separate FAQPage JSON-LD block with a single Q&A entry that aggregates all sourced facts:

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What are some lesser-known facts about Helen Mirren?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Helen Mirren holds a karate black belt (The Guardian). She personally begged Vin Diesel to cast her in Fast & Furious (People)..."
      }
    }
  ]
}
```

- Single question entry — keeps it concise for Google (under 300 words)
- Inline source names in parentheses within the answer text
- Only generated when actor has 1+ sourced facts

### 3. HTML Semantic Changes

#### LesserKnownFacts component

Wrap in `<section>` with a proper `<h2>` heading. Add `<cite>` around source links:

```html
<section aria-labelledby="lesser-known-facts">
  <h2 id="lesser-known-facts">Lesser-Known Facts</h2>
  <ul>
    <li>
      She holds a karate black belt.
      <cite>
        <a href="https://theguardian.com/..."
           target="_blank"
           rel="noopener noreferrer">
          The Guardian
        </a>
      </cite>
    </li>
  </ul>
</section>
```

- `<h2>` styled to match current visual appearance (no visible change)
- `<cite>` is a semantic signal only — browsers don't style it by default
- `aria-labelledby` links the section to its heading for accessibility

#### nofollow removal

Remove `nofollow` from source links where the source domain has ReliabilityTier >= 0.9 (Tier 1 News + Trade Press). Keep `noopener noreferrer` for security.

Followed (rel="noopener noreferrer"):
- theguardian.com, nytimes.com, bbc.com, bbc.co.uk, apnews.com, reuters.com, washingtonpost.com, latimes.com (Tier 1 News, 0.95)
- variety.com, deadline.com, hollywoodreporter.com (Trade Press, 0.9)
- newyorker.com, theatlantic.com, smithsonianmag.com, rollingstone.com, vanityfair.com, time.com, telegraph.co.uk, independent.co.uk, npr.org, pbs.org (Quality Publications, 0.9+)

Not followed (rel="nofollow noopener noreferrer"):
- people.com, reddit.com, biography.com, wikipedia.org, and all other sources below 0.9

### 4. API Response Change

Add `sourceReliable` boolean to each fact object in the actor API response:

```typescript
{
  text: string
  sourceUrl: string | null
  sourceName: string | null
  sourceReliable: boolean  // NEW — true when sourceUrl domain has ReliabilityTier >= 0.9
}
```

Server computes this by parsing the hostname from `sourceUrl` and checking it against the `RELIABLE_DOMAINS` set (already defined in `verifier.ts`). Frontend uses the flag for conditional `nofollow` and schema inclusion. Missing field treated as `false` for backwards compatibility with cached responses.

### 5. Prerender Pipeline

Mirror all schema changes server-side so search engine bots see the same structured data:

- `data-fetchers.ts`: Fetch `lesser_known_facts` from `actor_biography_details`, compute `sourceReliable`
- `schema.ts`: Add `knowsAbout` to `buildPersonSchema`, new `buildFactsFAQSchema` function
- `renderer.ts`: No changes needed — already handles arrays of JSON-LD blocks

## Files Changed

| File | Change |
|------|--------|
| `src/utils/schema.ts` | Add `knowsAbout` to `buildPersonSchema`, new `buildFactsFAQSchema` |
| `src/pages/ActorPage.tsx` | Pass sourced facts to schema builders, render FAQ JSON-LD block |
| `src/pages/ActorPage.tsx` (LesserKnownFacts) | `<section>` + `<h2>` wrapper, `<cite>` on sources, conditional `nofollow` |
| `src/types/actor.ts` | Add `sourceReliable` to fact type |
| `server/src/routes/actor.ts` | Compute and add `sourceReliable` to each fact in API response |
| `server/src/lib/prerender/schema.ts` | Mirror: `knowsAbout` in Person schema, `buildFactsFAQSchema` |
| `server/src/lib/prerender/data-fetchers.ts` | Fetch `lesser_known_facts`, compute `sourceReliable`, pass to schema builders |
| `src/utils/schema.test.ts` | Test `knowsAbout` generation, FAQ schema, sourced-only filtering |
| `src/pages/ActorPage.test.tsx` | Test `<cite>` rendering, conditional nofollow, H2 heading |
| `server/src/lib/prerender/schema.test.ts` | Test server-side schema mirrors client-side |

## Not Changing

- No new routes or pages
- No visual appearance changes
- No database migrations
- No changes to the discovery pipeline or enrichment process
- No changes to death pages or death schema
- Redis cache keys unchanged (cached responses serve without `sourceReliable` until TTL expires)

## Shared Constants

The `RELIABLE_DOMAINS` set currently lives in `server/src/lib/biography-sources/surprise-discovery/verifier.ts`. For this feature, extract it to a shared location (e.g., `server/src/lib/shared/reliable-domains.ts`) so both the verifier, the actor route, and the prerender data-fetcher can import it without depending on the discovery module.
