---
globs: ["server/src/lib/death-sources/**", "server/scripts/*death*", "server/scripts/*enrich*", "server/scripts/*cause*"]
---
# Death Enrichment System

Enriches actor death records with cause, manner, location, and circumstances from ~40 active data sources.

## Adding New Sources

**IMPORTANT**: News sources (Guardian, NYT, AP, BBC, Reuters, WaPo, etc.) exist in **both** the death enrichment and biography enrichment systems. When adding a new news source, always implement it in both:

1. **Death source**: `server/src/lib/death-sources/sources/{name}.ts` — searches for obituaries, extracts death info
2. **Biography source**: `server/src/lib/biography-sources/sources/{name}.ts` — searches for profiles/interviews, extracts biographical info
3. Register in **both** orchestrators
4. Add enum entries to **both** type files (`DataSourceType` and `BiographySourceType`)

Sources shared between both systems: Guardian, NYTimes, AP News, BBC News, Reuters, People, Washington Post, LA Times, Rolling Stone, The Telegraph, The Independent, NPR, Time, PBS, The New Yorker, National Geographic, Legacy, Find a Grave, Google Books, Open Library, IA Books, Internet Archive, Chronicling America, Trove, Europeana, and all web search sources (Google, Bing, DuckDuckGo, Brave).

## Reliability Tiers

Source reliability is based on **Wikipedia's Reliable Sources Perennial list (RSP)** — a community-maintained assessment of source trustworthiness for encyclopedic use. Our `ReliabilityTier` enum in `server/src/lib/death-sources/types.ts` maps these assessments to numeric scores (0.0–1.0).

**Reliability vs confidence**: These are independent axes. Reliability measures *publisher trustworthiness* (is Reuters a credible outlet?). Confidence measures *content relevance* (does this specific page contain death information?). A Reuters page about weather has high reliability but zero confidence for death enrichment.

| Tier | Score | RSP Equivalent | Examples |
|------|-------|----------------|----------|
| STRUCTURED_DATA | 1.0 | N/A | Wikidata |
| TIER_1_NEWS | 0.95 | "Generally reliable" | AP, NYT, BBC, Guardian, Reuters, WaPo |
| TRADE_PRESS | 0.9 | "Generally reliable" (domain) | Variety, Deadline, THR, BFI |
| ARCHIVAL | 0.9 | Primary sources | Trove, Europeana, Chronicling America |
| SECONDARY_COMPILATION | 0.85 | Wikipedia's self-assessment | Wikipedia |
| SEARCH_AGGREGATOR | 0.7 | Depends on linked sources | Google, Bing, DDG, Brave, NewsAPI |
| ARCHIVE_MIRROR | 0.7 | Mirrors | Internet Archive |
| MARGINAL_EDITORIAL | 0.65 | "Use with caution" | People Magazine |
| MARGINAL_MIXED | 0.6 | Mixed editorial + UGC | Legacy.com, FamilySearch |
| AI_MODEL | 0.55 | No RSP equivalent | Claude, GPT, Gemini |
| UNRELIABLE_FAST | 0.5 | "Generally unreliable" | TMZ |
| UNRELIABLE_UGC | 0.35 | User-generated content | Find a Grave (IMDb removed) |

When adding a new source, consult [Wikipedia's RSP list](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources) to determine the appropriate tier. The RSP page rates sources as "generally reliable", "no consensus", "generally unreliable", or "deprecated" — map to the closest tier above.

## Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| Orchestrator | `server/src/lib/death-sources/orchestrator.ts` | Tries sources in priority order, stops at confidence threshold |
| Base source | `server/src/lib/death-sources/base-source.ts` | Caching, rate limiting, timeout, confidence calculation |
| Claude cleanup | `server/src/lib/death-sources/claude-cleanup.ts` | AI synthesis of multi-source raw data into clean narrative |
| Source implementations | `server/src/lib/death-sources/sources/*.ts` | Individual data source lookup logic |
| AI providers | `server/src/lib/death-sources/ai-providers/*.ts` | AI model integrations (Gemini, GPT, Groq, etc.) |
| Types | `server/src/lib/death-sources/types.ts` | `DataSourceType` enum, config interfaces, result types |
| HTML utils | `server/src/lib/death-sources/html-utils.ts` | `htmlToText()` sanitization pipeline |
| Link follower | `server/src/lib/death-sources/link-follower.ts` | Follows URLs from web search results; uses Readability for article extraction |
| Archive fallback | `server/src/lib/death-sources/archive-fallback.ts` | archive.org fallback for blocked sites |

## Orchestrator Flow

1. Initialize sources by category (free first, then AI by cost)
2. For each actor, try sources sequentially
3. **Stop when:** confidence >= threshold (default 0.5), cost limit hit, or all sources exhausted
4. Optional "gather-all" mode: collect from ALL sources, then Claude cleanup synthesizes
5. Merge strategy: first-wins for each field (only merge non-null values not already set)

## Source Priority Order

Sources are tried in this order:

### Phase 1: Structured Data (free)
| Source | Method | Can Find Death Cause? | Notes |
|--------|--------|:---------------------:|-------|
| **Wikidata** | SPARQL query by name + birth/death year | YES | P509 (cause), P1196 (manner), P20 (place) |
| **Wikipedia** | `wtf_wikipedia` parser, extract Death/Health sections | YES | AI section selection optional; clean plaintext output |
| BFI Sight & Sound | Annual memoriam list URL by death year | LOW | Only covers 2015+ deaths |

### Phase 2: Web Search (with link following)
| Source | Method | Notes |
|--------|--------|-------|
| Google Search | Custom Search API | Requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| Bing Search | Bing Web Search API | Requires `BING_SEARCH_API_KEY` |
| DuckDuckGo | HTML search endpoint | Free fallback, no API key |
| Brave Search | Brave Search API | Requires `BRAVE_SEARCH_API_KEY`, $0.005/query |

### Phase 3: News Sources
Guardian, NYTimes, AP News, Reuters, Washington Post, LA Times, Rolling Stone, The Telegraph, The Independent, NPR, Time, PBS, The New Yorker, National Geographic, NewsAPI, Deadline, Variety, Hollywood Reporter, TMZ, People, BBC News, Google News RSS

### Phase 4: Obituary Sites
Find a Grave (direct API), Legacy.com (DuckDuckGo search)

### Phase 5: Books/Publications
| Source | Method | Notes |
|--------|--------|-------|
| Google Books | Google Books API v1 snippets + descriptions | Requires `GOOGLE_BOOKS_API_KEY`, 1,000 req/day |
| Open Library | Person-subject search + Search Inside API | Free, no API key |
| IA Books | Internet Archive advanced search + OCR | Free, public domain full text |

### Phase 6: Historical Archives
Trove (Australian newspapers), Europeana, Internet Archive, Chronicling America (1756-1963 only)

### Phase 7: Genealogy
FamilySearch (requires API key)

### Phase 8: AI Models (optional, by ascending cost)
Gemini Flash (~$0.0001) → Groq (~$0.0002) → GPT-4o Mini (~$0.0003) → DeepSeek → Mistral → Gemini Pro → Grok → Perplexity → GPT-4o (~$0.01)

## Text Quality Pipeline

- **Wikipedia**: Uses `wtf_wikipedia` for clean plaintext (no citation markers, footnotes, edit buttons, or HTML artifacts)
- **Web pages (link-follower)**: Uses `@mozilla/readability` + `jsdom` for article body extraction, falling back to `htmlToText()` regex pipeline
- **Pre-prompt sanitization**: `sanitizeSourceText()` runs on ALL source text before Claude prompt assembly as a final safety net

### Shared Utilities
| File | Purpose |
|------|---------|
| `server/src/lib/shared/readability-extract.ts` | Readability + jsdom wrapper for article extraction |
| `server/src/lib/shared/sanitize-source-text.ts` | Final text sanitization safety net |

## Known Issues & Disabled Sources

### Removed from orchestrator
- **IMDb** — user-generated content, rated "unreliable" by Wikipedia RSP; scrapes bio pages but poor fact-checking
- **AlloCine, Douban, Soompi** — 0% success rate
- **FilmiBeat** — consistently returns 403
- **Television Academy, IBDB** — return `circumstances: null` by design (career DBs, not obituary DBs)
- **BAFTA, WGA, DGA** — career tributes via fragile DuckDuckGo `site:` search, no death circumstances

Source files still exist in `sources/` but are not instantiated in the orchestrator.

### Coverage Limits
- **Chronicling America** — hard fails for deaths after 1963
- **BFI Sight & Sound** — hard fails for deaths before 2015

### DuckDuckGo HTML Search Fragility
DDG's deprecated HTML endpoint (`html.duckduckgo.com/html/`) increasingly returns CAPTCHA (anomaly-modal). All DDG-dependent sources now use a shared utility (`server/src/lib/shared/duckduckgo-search.ts`) with automatic browser fallback: fetch → Playwright with `fingerprint-injector` stealth → CAPTCHA solver. The `news-utils.ts` `searchWeb()` function adds Google CSE as a final fallback after the DDG chain.

## Configuration

```typescript
{
  limit: 100,                    // Max actors per batch
  confidenceThreshold: 0.5,      // Stop trying sources when this confidence is reached
  sourceCategories: {
    free: true,                  // Free web sources
    paid: false,                 // Paid API sources
    ai: false,                   // AI model sources
  },
  costLimits: {
    maxCostPerActor: number,     // Stop trying sources for this actor
    maxTotalCost: number,        // Stop entire batch
  },
  linkFollow: {
    enabled: true,
    maxLinksPerActor: 3,
    aiLinkSelection: false,      // Use AI to pick which links to follow
    aiContentExtraction: false,  // Use AI to extract death info from pages
  },
  claudeCleanup: {
    enabled: false,
    gatherAllSources: false,     // Collect all sources then synthesize vs first-wins
  },
}
```

## Rate Limiting & Caching

- Default rate limit: 1000ms between requests per source
- Wikidata/Wikipedia: 500ms
- Results are cached per source+actor (prevents redundant lookups across runs)
- `SourceAccessBlockedError` (403/429) is cached to avoid re-hitting blocked sources

## Base Source Confidence Calculation

`calculateConfidence()` in `base-source.ts`:
- 0.0 if no death keywords found in text
- 0.5 base from required keywords (died, death, passed away, etc.)
- Up to +0.5 bonus from circumstance keywords (cancer, heart attack, accident, etc.)

## Key Patterns

- All sources extend `BaseDataSource` which provides caching, rate limiting, timeouts
- Sources requiring API keys override `isAvailable()` to check env vars
- Web search sources extend `WebSearchBase` which handles link following
- DuckDuckGo-dependent sources use `searchWeb()` from `web-search-base.ts`
- `htmlToText()` from `html-utils.ts` is the standard HTML sanitization pipeline

## Database Tables

| Table | Purpose |
|-------|---------|
| `enrichment_runs` | Batch-level stats: actors processed, fill rate, cost, source hit rates |
| `enrichment_run_actors` | Per-actor: sources attempted (JSONB), winning source, confidence, cost |
| `actor_death_circumstances` | Final enriched data: circumstances, manner, location, notable factors |
| `actors` | `enriched_at`, `enrichment_source`, `enrichment_version` metadata |

## Scripts

| Script | Purpose |
|--------|---------|
| `server/scripts/enrich-death-details.ts` | Main enrichment script (Commander CLI) |
| `server/scripts/run-cause-of-death-batch.ts` | Batch cause-of-death processing |
| `server/scripts/backfill-cause-of-death-batch.ts` | Backfill with checkpointing |
| `server/scripts/fix-death-details.ts` | Fix/re-enrich specific actors |
| `server/scripts/refetch-death-details.ts` | Re-fetch from specific sources |
