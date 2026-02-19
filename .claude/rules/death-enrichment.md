---
globs: ["server/src/lib/death-sources/**", "server/scripts/*death*", "server/scripts/*enrich*", "server/scripts/*cause*"]
---
# Death Enrichment System

Enriches actor death records with cause, manner, location, and circumstances from ~25 active data sources.

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
| **IMDb** | Scrape `/name/{id}/bio` page | YES | Uses known IMDb ID or suggestion API search |
| BFI Sight & Sound | Annual memoriam list URL by death year | LOW | Only covers 2015+ deaths |

### Phase 2: Web Search (with link following)
| Source | Method | Notes |
|--------|--------|-------|
| Google Search | Custom Search API | Requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| Bing Search | Bing Web Search API | Requires `BING_SEARCH_API_KEY` |
| DuckDuckGo | HTML search endpoint | Free fallback, no API key |
| Brave Search | Brave Search API | Requires `BRAVE_SEARCH_API_KEY`, $0.005/query |

### Phase 3: News Sources
Guardian, NYTimes, AP News, NewsAPI, Deadline, Variety, Hollywood Reporter, TMZ, People, BBC News, Google News RSS

### Phase 4: Obituary Sites
Find a Grave (direct API), Legacy.com (DuckDuckGo search)

### Phase 5: Historical Archives
Trove (Australian newspapers), Europeana, Internet Archive, Chronicling America (1756-1963 only)

### Phase 6: Genealogy
FamilySearch (requires API key)

### Phase 7: AI Models (optional, by ascending cost)
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
- **AlloCine, Douban, Soompi** — 0% success rate
- **FilmiBeat** — consistently returns 403
- **Television Academy, IBDB** — return `circumstances: null` by design (career DBs, not obituary DBs)
- **BAFTA, WGA, DGA** — career tributes via fragile DuckDuckGo `site:` search, no death circumstances

Source files still exist in `sources/` but are not instantiated in the orchestrator.

### Coverage Limits
- **Chronicling America** — hard fails for deaths after 1963
- **BFI Sight & Sound** — hard fails for deaths before 2015

### DuckDuckGo HTML Search Fragility
Legacy.com still uses `https://html.duckduckgo.com/html/?q=site:legacy.com ...` — this deprecated endpoint may block requests.

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
- IMDb: 3000ms (respectful scraping)
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
