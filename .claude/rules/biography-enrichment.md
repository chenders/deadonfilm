---
globs: ["server/src/lib/biography-sources/**", "server/src/lib/biography/**", "server/src/lib/biography-enrichment-db-writer.ts", "server/scripts/enrich-biographies.ts", "src/components/actor/BiographySection.*"]
---
# Biography Enrichment System

Enriches actor records with narrative personal life biographies from 37 active data sources (33 content sources + 4 web search providers), synthesized by Claude into structured fields.

## Adding New Sources

**IMPORTANT**: News sources exist in **both** the death enrichment and biography enrichment systems. When adding a new news source, always implement it in both:

1. **Biography source**: `server/src/lib/biography-sources/sources/{name}.ts` — searches for profiles/interviews, extracts biographical info
2. **Death source**: `server/src/lib/death-sources/sources/{name}.ts` — searches for obituaries, extracts death info
3. Register in **both** orchestrators
4. Add enum entries to **both** type files (`BiographySourceType` and `DataSourceType`)

See the death enrichment rules (`.claude/rules/death-enrichment.md`) for the full list of shared sources.

**Reliability tiers**: Both systems share the same `ReliabilityTier` enum from `server/src/lib/death-sources/types.ts`, based on Wikipedia's Reliable Sources Perennial list (RSP). See the death enrichment rules for the full tier table and guidance on assigning tiers to new sources.

## Key Difference from Death Enrichment

| Aspect | Death Enrichment | Biography Enrichment |
|--------|-----------------|---------------------|
| Merge strategy | Gather-all + Claude synthesis | Gather-all + Claude synthesis |
| Stopping | Source family count threshold | 3+ high-quality source families (dual threshold) |
| Content focus | Cause, manner, circumstances | Childhood, family, education, personal life |
| AI cleanup | Always Claude synthesis | Always Claude synthesis (Stage 3) |
| Monitoring | New Relic + StatusBar | New Relic custom events |

Both systems now share the same architecture: parallel source execution within phases, parallel actor processing, gather-all accumulation, and Claude synthesis.

## Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| Orchestrator | `server/src/lib/biography-sources/orchestrator.ts` | Tries sources in priority order, accumulates all raw data for synthesis |
| Base source | `server/src/lib/biography-sources/base-source.ts` | Caching, rate limiting, timeout, biographical confidence calculation |
| Content cleaner | `server/src/lib/biography-sources/content-cleaner.ts` | Stage 1 (mechanical) + Stage 2 (Haiku AI) content cleaning |
| Claude synthesis | `server/src/lib/biography-sources/claude-cleanup.ts` | Stage 3: Claude synthesizes multi-source data into structured biography |
| Wikipedia selector | `server/src/lib/biography-sources/wikipedia-section-selector.ts` | AI/regex selection of biography-relevant Wikipedia sections |
| Source implementations | `server/src/lib/biography-sources/sources/*.ts` | Individual data source lookup logic |
| Types | `server/src/lib/biography-sources/types.ts` | `BiographySourceType` enum, config interfaces, result types |
| DB writer | `server/src/lib/biography-enrichment-db-writer.ts` | COALESCE upsert to `actor_biography_details`, legacy archival |
| Golden tests | `server/src/lib/biography/golden-test-cases.ts` | 7 test actors with automated scoring (0-100) |

## Text Quality Pipeline

### Source-Level Extraction
- **Wikipedia**: Uses `wtf_wikipedia` for clean plaintext (no citation markers, footnotes, edit buttons, or HTML artifacts)
- **Web pages**: Uses `@mozilla/readability` + `jsdom` (Mozilla Reader View algorithm) for article body extraction, falling back to regex-based cleaning
- **Pre-prompt sanitization**: `sanitizeSourceText()` runs on ALL source text before Claude prompt assembly as a final safety net (strips citation markers, footnote blocks, navigation patterns, boilerplate phrases)

### Shared Utilities
| File | Purpose |
|------|---------|
| `server/src/lib/shared/readability-extract.ts` | Readability + jsdom wrapper for article extraction |
| `server/src/lib/shared/sanitize-source-text.ts` | Final text sanitization safety net |

## Three-Stage Content Pipeline

### Stage 1: Mechanical Pre-Clean
- Tries Readability extraction first for full web pages
- Falls back to regex-based HTML stripping, navigation removal, ad stripping
- Removes cookie banners, social media widgets
- Extracts article body text
- No API cost

### Stage 2: Haiku AI Extraction (optional)
- Uses Claude Haiku to extract biographical passages
- Filters career-heavy content (filmography, awards)
- Returns relevance classification: `high`, `medium`, `low`, `none`
- Cost: ~$0.001 per page

### Stage 3: Claude Synthesis
- Takes ALL accumulated raw source data
- Produces structured JSON: narrative, family, education, etc.
- Enforces personal life focus over career achievements
- Model: Claude Sonnet (configurable)
- Cost: ~$0.01-0.05 per actor

## Source Priority Order

### Phase 1: Structured Data (free)
| Source | Method | Notes |
|--------|--------|-------|
| **Wikidata** | SPARQL query | Structured facts: birthplace, education, family |
| **Wikipedia** | `wtf_wikipedia` parser | Personal life sections via AI section selector; clean plaintext output |

### Phase 2: Reference Sites
| Source | Method | Notes |
|--------|--------|-------|
| **Britannica** | DuckDuckGo `site:britannica.com` search | High-quality biographical content |
| **Biography.com** | DuckDuckGo `site:biography.com` search | Dedicated biography resource |
| **TCM** | DuckDuckGo `site:tcm.com` search | Classic film actor biographies |
| **AllMusic** | DuckDuckGo `site:allmusic.com` search | Professional music artist biographies |

### Phase 2.5: Books/Publications
| Source | Method | Notes |
|--------|--------|-------|
| **Google Books** | Google Books API v1 snippets + descriptions | Requires `GOOGLE_BOOKS_API_KEY`, 1,000 req/day |
| **Open Library** | Person-subject search + Search Inside API | Free, no API key |
| **IA Books** | Internet Archive advanced search + OCR | Free, public domain full text |

### Phase 3: Web Search (with link following)
| Source | Method | Notes |
|--------|--------|-------|
| Google Search | Custom Search API | Requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| Bing Search | Bing Web Search API | Requires `BING_SEARCH_API_KEY` |
| DuckDuckGo | HTML search endpoint | Free fallback |
| Brave Search | Brave Search API | Requires `BRAVE_SEARCH_API_KEY` |

### Phase 4: News Sources
Guardian, NYTimes, AP News, Reuters, Washington Post, LA Times, BBC News, NPR, PBS, People, The Independent, The Telegraph, Time, The New Yorker, Rolling Stone, National Geographic, Smithsonian Magazine, History.com

### Phase 5: Obituary Sites
Legacy.com, Find a Grave

### DuckDuckGo Browser Fallback

All DDG-dependent sources (Phases 2-5) use a shared search utility (`server/src/lib/shared/duckduckgo-search.ts`) with a multi-tier fallback chain:

1. **fetch-based DDG** — free, fast (~1s)
2. **Browser-based DDG** — Playwright with `fingerprint-injector` stealth mode, bypasses DDG anomaly-modal CAPTCHA
3. **CAPTCHA solver** — 2Captcha/CapSolver as last resort (if configured)

Browser stealth uses `fingerprint-injector` (from Apify's fingerprint-suite) for statistically realistic, randomized fingerprints per session — replacing the previous hardcoded Chrome 120 UA / 1920x1080 viewport.

### Phase 6: Historical Archives
Internet Archive, Chronicling America, Trove, Europeana

## Parallel Execution Model

Sources are organized into sequential **phases**. Sources within each phase run concurrently via `Promise.allSettled()`. Multiple actors are processed in parallel with configurable concurrency (default 5, range 1-20).

A shared `SourceRateLimiter` (`server/src/lib/shared/concurrency.ts`) enforces per-domain request spacing across all concurrent actors. Each source declares a `domain` property. Sources sharing a domain share rate limits.

DuckDuckGo is limited to 2-3 concurrent requests across all sources to prevent CAPTCHA triggers.

## Orchestrator Flow

1. Initialize sources organized into sequential **phases** (structured → reference → books → web search → news → obituary → archives)
2. Process multiple actors concurrently via `ParallelBatchRunner` (configurable concurrency, default 5)
3. For each actor, execute phases sequentially; within each phase, fire all sources concurrently via `Promise.allSettled()`
4. Accumulate ALL successful results across phases
5. **Early stopping between phases**: After 3+ high-quality source families meeting dual threshold (confidence ≥ 0.6 AND reliability ≥ 0.6)
6. Send all accumulated raw data to Claude synthesis (Stage 3)
7. Claude produces structured BiographyData JSON
8. DB writer upserts to `actor_biography_details` with COALESCE (preserves existing non-null values)

## Configuration

```typescript
{
  concurrency: 5,                // Actors processed in parallel (1-20)
  confidenceThreshold: 0.6,      // Content confidence threshold for high-quality counting
  reliabilityThreshold: 0.6,     // Source reliability threshold
  useReliabilityThreshold: true, // Enforce reliability threshold
  synthesisModel: "claude-sonnet-4-20250514",
  sourceCategories: {
    free: true,                  // Wikidata, Wikipedia
    reference: true,             // Britannica, Biography.com, TCM, AllMusic
    books: true,                 // Google Books, Open Library, IA Books
    webSearch: true,             // Google, Bing, DuckDuckGo, Brave
    news: true,                  // Guardian, NYT, AP, Reuters, WaPo, LA Times, BBC, NPR, PBS, People, Independent, Telegraph, Time, New Yorker, Rolling Stone, Nat Geo, Smithsonian Magazine, History.com
    obituary: true,              // Legacy, FindAGrave
    archives: true,              // Internet Archive, Chronicling America, Trove, Europeana
  },
  contentCleaning: {
    mechanicalOnly: false,       // Skip AI cleaning
    haikuEnabled: true,          // Use Haiku for Stage 2
  },
  costLimits: {
    maxCostPerActor: 0.50,
    maxTotalCost: 50.0,
  },
}
```

## Biography Content Guidelines

The biography system is designed to produce **personal narratives**, not career profiles:

- Open with childhood/family background, NOT "born on [date] in [city]"
- Weave in education, early struggles, formative experiences
- Mention career in 1-2 sentences MAX (like describing anyone's job)
- Include personal life: relationships, family, challenges
- End with something human, not a career summary
- No superlatives: avoid "renowned", "acclaimed", "legendary"
- No filmography, awards, box office numbers

## Database Tables

| Table | Purpose |
|-------|---------|
| `actor_biography_details` | Enriched biography: narrative, family, education, factors, sources |
| `biography_legacy` | One-time archive of old `actors.biography` before first enrichment |
| `actors.biography` | Updated with `narrative` from enrichment |
| `actors.biography_version` | Incremented on each enrichment |

## BiographyData Fields

| Field | Type | Description |
|-------|------|-------------|
| `narrative` | string | Full personal life biography |
| `narrativeConfidence` | enum | `high`, `medium`, `low` |
| `lifeNotableFactors` | string[] | Tags: orphaned, military_service, immigrant, etc. |
| `birthplaceDetails` | string | Rich context about where they grew up |
| `familyBackground` | string | Parents, siblings, family circumstances |
| `education` | string | Schools, degrees, scholarships (narrative) |
| `educationInstitutions` | string[] | Formal institution names for schema.org `alumniOf` |
| `preFameLife` | string | What they did before public recognition |
| `fameCatalyst` | string | What launched them into public life |
| `personalStruggles` | string | Addiction, legal issues, health challenges |
| `relationships` | string | Marriages, partnerships, children |
| `lesserKnownFacts` | string[] | Surprising or little-known facts |
| `hasSubstantiveContent` | boolean | Whether biography has enough personal detail |
| `alternateNames` | string[] | Stage names, maiden names, nicknames |
| `gender` | string \| null | Gender identity |
| `nationality` | string \| null | Primary nationality |
| `occupations` | string[] | All known occupations |
| `awards` | string[] | Notable awards (max 5) |

## Key Patterns

- All sources extend `BaseBiographySource` which provides caching, rate limiting (via shared `SourceRateLimiter`), confidence calculation
- Each source declares a `domain` property for rate limit coordination across concurrent actors
- Sources requiring API keys override `isAvailable()` to check env vars
- Web search sources extend `BiographyWebSearchBase` which handles link following, content cleaning, career filtering
- `isCareerHeavyContent()` filters out pages dominated by filmography/awards
- `calculateBiographicalConfidence()` scores based on biographical keyword presence
- Sources within the same phase run concurrently via `Promise.allSettled()`
- `ParallelBatchRunner` from `server/src/lib/shared/concurrency.ts` handles actor-level concurrency
- DB writer uses COALESCE so re-enrichment preserves existing non-null values
- Empty arrays are converted to null before SQL for COALESCE to work correctly

## Scripts

| Script | Purpose |
|--------|---------|
| `server/scripts/enrich-biographies.ts` | Main enrichment CLI (Commander) |
| `cd server && npm run enrich:biographies` | npm shortcut |

### CLI Options

```bash
cd server && npm run enrich:biographies -- \
  --limit 10 \
  --concurrency 5 \
  --actor-id 12345 \
  --golden-test \
  --dry-run \
  --disable-web-search \
  --max-cost-per-actor 0.25 \
  --confidence 0.7 \
  --ignore-cache
```

## Admin Integration

| Route | Purpose |
|-------|---------|
| `GET /admin/api/biography-enrichment` | List actors with enrichment status, pagination, stats |
| `POST /admin/api/biography-enrichment/enrich` | Single-actor synchronous enrichment |
| `POST /admin/api/biography-enrichment/enrich-batch` | Queue batch job via BullMQ |
| `POST /admin/api/biography-enrichment/golden-test` | Run golden tests with scoring |
| `POST /admin/api/actors/:id/enrich-bio-inline` | Inline enrichment from actor toolbar |

## Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `BiographySection` | `src/components/actor/BiographySection.tsx` | Expandable narrative, life factors pills, lesser-known facts |
| `BiographyEnrichmentTab` | `src/components/admin/actors/BiographyEnrichmentTab.tsx` | Admin tab for managing biography enrichment |

## Golden Test Framework

7 test actors with known biographical facts for automated quality scoring:

| Actor | Key Tests |
|-------|-----------|
| Richard Nixon | Father's lemon ranch, Whittier College, Navy service |
| Jimmy Stewart | Princeton architecture, father's hardware store |
| Audrey Hepburn | Dutch resistance, ballet training, malnutrition |
| Christopher Lee | RAF service, SAS/SOE, spoke 6+ languages |
| Steve McQueen | Boys Republic reform school, Marines |
| Hedy Lamarr | Frequency-hopping patent, fled Nazi husband |
| James Earl Jones | Childhood stutter overcome through poetry |

Scoring algorithm (0-100): fact recall (70pts), factor accuracy (20pts), unwanted content penalty (10pts).
