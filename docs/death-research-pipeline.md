# Death Research Pipeline

When an actor's death lacks cause-of-death information, the system dispatches a multi-stage research pipeline across 80+ sources. The pipeline is designed around a simple principle: try the cheapest, most reliable sources first, and stop when confidence is high enough.

## Pipeline Stages

### Stage 1: Free Structured Sources

The system starts with sources that provide structured, machine-readable data at no cost.

| Source | Method | Notes |
|---|---|---|
| **Wikidata** | SPARQL query by name + birth/death year | P509 (cause), P1196 (manner), P20 (place). 500ms rate limit |
| **Wikipedia** | API search, extract Death/Health sections | AI-assisted section selection optional |
| **IMDb** | Scrape `/name/{id}/bio` page | Uses known IMDb ID or suggestion API search. 3000ms rate limit |
| **BFI Sight & Sound** | Annual memoriam list URL by death year | Only covers 2015+ deaths |

### Stage 2: Search Engines with Link Following

Search engines find obituaries, news articles, and reference pages. The system then fetches and extracts content from each result, following up to 3 links per actor.

| Source | Method | Notes |
|---|---|---|
| **Google Custom Search** | Google Custom Search API | Requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| **Bing Web Search** | Bing Web Search API | Requires `BING_SEARCH_API_KEY` |
| **DuckDuckGo** | HTML search endpoint | Free fallback, no API key needed |
| **Brave Search** | Brave Search API | Free tier: 2K queries/month |

### Stage 3: News Sources

| Source | Method | Notes |
|---|---|---|
| **The Guardian** | API | Free |
| **New York Times** | API | Free tier |
| **AP News** | Web search | Free |
| **NewsAPI** | Aggregator API (80K+ sources) | Free: 100/day |
| **Variety** | Web search | Entertainment industry |
| **Deadline Hollywood** | Web search | Entertainment industry |
| **Hollywood Reporter** | Web search | Entertainment industry |
| **TMZ** | Web search | Celebrity news |
| **People** | Web search | Celebrity news |
| **BBC News** | Web search | International coverage |
| **Google News RSS** | RSS feed | Aggregated news |

### Stage 4: Obituary Sites

| Source | Method | Notes |
|---|---|---|
| **Find a Grave** | Direct API | Cemetery and memorial records |
| **Legacy.com** | DuckDuckGo `site:` search | Obituary database |

### Stage 5: Historical Archives

| Source | Method | Coverage |
|---|---|---|
| **Chronicling America** | Library of Congress API | US newspapers 1756–1963 |
| **Trove** | National Library of Australia API | Australian newspapers from 1803 |
| **Europeana** | European cultural heritage API | European archives |
| **Internet Archive** | Archive.org API | Books, documents, historical media |

### Stage 6: Genealogy

| Source | Method | Notes |
|---|---|---|
| **FamilySearch** | API | Requires API key |

### Stage 7: AI Models (ordered by ascending cost)

If structured sources and search haven't reached the confidence threshold, the system queries AI models — cheapest first.

| Model | Provider | Cost/Query | Notes |
|---|---|---|---|
| Gemini Flash | Google | ~$0.0001 | Cheapest |
| Groq/Llama 3.3 70B | Groq | ~$0.0002 | Fast inference |
| GPT-4o Mini | OpenAI | ~$0.0003 | Good balance |
| DeepSeek | DeepSeek | ~$0.0005 | |
| Mistral | Mistral | ~$0.001 | European training data |
| Gemini Pro | Google | ~$0.002 | Google Search grounding |
| Grok | xAI | ~$0.005 | X/Twitter data access |
| Perplexity (sonar-pro) | Perplexity | ~$0.005 | Built-in web search |
| GPT-4o | OpenAI | ~$0.01 | Highest quality |
| Claude | Anthropic | ~$0.01 | Used for final cleanup |
| Claude Batch | Anthropic | ~$0.005 | 50% discount, async |

## Confidence Scoring

Each source produces a confidence score (0.0–1.0):

- **0.0** — No death-related keywords found in text
- **0.5** — Base score from required keywords (died, death, passed away, etc.)
- **Up to 1.0** — Bonus from circumstance keywords (cancer, heart attack, accident, etc.)

The pipeline stops trying sources when confidence reaches the threshold (default: 0.5).

## Final Cleanup

After gathering raw data, Claude consolidates everything into structured output:

- **Cause of death** — Specific medical cause with confidence level
- **Details** — 2–4 sentence summary adapted to manner of death
- **Circumstances** — Comprehensive narrative structured by death type (natural, violent, suicide, overdose)
- **Rumored circumstances** — Alternative accounts, disputed information, conspiracy theories
- **Notable factors** — Tags from a controlled vocabulary (on_set, overdose, assassination, etc.)
- **Manner** — Medical examiner classification (natural, accident, suicide, homicide, undetermined)
- **Location** — City, state/province, country
- **Career context** — Status at death, last project, posthumous releases
- **Related celebrities** — People connected to the death circumstances

A `has_substantive_content` gate prevents creating death pages that just say "cause unknown."

## Paywall Bypass

Two strategies for accessing content behind paywalls:

1. **Archive services** — Archive.org Wayback Machine and archive.is/archive.today as fallbacks for paywalled sites (NYT, Washington Post, WSJ, Financial Times, The Economist, Bloomberg, LA Times, Boston Globe, The Telegraph, Variety, Deadline, AP News, Legacy.com, IBDB)

2. **Browser automation** — Playwright-based headless browser with session persistence for sites requiring login. Optional CAPTCHA solving via 2Captcha or CapSolver.

## Rate Limiting & Caching

- Default rate limit: 1000ms between requests per source
- IMDb: 3000ms (respectful scraping)
- Wikidata/Wikipedia: 500ms
- Results are cached per source+actor to prevent redundant lookups across runs
- Blocked responses (403/429) are cached to avoid re-hitting blocked sources

## Configuration

```typescript
{
  limit: 100,                    // Max actors per batch
  confidenceThreshold: 0.5,      // Stop trying sources at this confidence
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
    gatherAllSources: false,     // Collect all sources then synthesize
  },
}
```

## Data Pipeline

The full data pipeline from raw TMDB data to enriched death records:

1. **TMDB Sync** (every 2 hours) — Import movie/TV metadata, cast lists, and death dates from The Movie Database
2. **Death Enrichment** — For each known death without cause information, run the research pipeline
3. **Claude Cleanup** — Consolidate raw source data into structured, confidence-scored output
4. **Entity Linking** — Auto-detect actor names in narrative text and link them to profiles
5. **Actuarial Calculations** — SSA period life tables produce expected mortality figures for every cast
6. **Field Sync** — Derive death_manner, death_categories, covid_related, age_at_death, expected_lifespan, years_lost

## Database Tables

| Table | Purpose |
|---|---|
| `enrichment_runs` | Batch-level stats: actors processed, fill rate, cost, source hit rates |
| `enrichment_run_actors` | Per-actor: sources attempted (JSONB), winning source, confidence, cost |
| `actor_death_circumstances` | Final enriched data: circumstances, manner, location, notable factors |
| `actors` | `enriched_at`, `enrichment_source`, `enrichment_version` metadata |

## Source Inventory

**AI Models (11):** Claude (Anthropic), Gemini Flash, Gemini Pro (Google), GPT-4o, GPT-4o Mini (OpenAI), Perplexity (sonar-pro), Grok (xAI), DeepSeek, Mistral, Groq/Llama 3.3 70B, Claude Batch

**Knowledge Bases (4):** Wikidata (SPARQL), Wikipedia, IMDb, TMDB

**Film Industry Archives (2):** BFI Sight & Sound, IMDb bio pages

**Search Engines (4):** DuckDuckGo, Google Custom Search, Bing Web Search, Brave Search

**News Sources (11+):** The Guardian (API), New York Times (API), AP News, NewsAPI (80K+ sources), Variety, Deadline Hollywood, Hollywood Reporter, TMZ, People, BBC News, Google News RSS — plus dozens more via search engine link-following

**Cemetery & Obituary Sites (2):** Find a Grave, Legacy.com

**Historical Archives (4):** Chronicling America / Library of Congress (US newspapers 1756–1963), Trove / National Library of Australia (newspapers from 1803), Europeana (European cultural heritage), Internet Archive

**Genealogy (1):** FamilySearch

**Paywall Bypass (2):** Archive.org Wayback Machine, archive.is/archive.today

**Browser Automation:** Playwright-based headless browser with session persistence and CAPTCHA solving

**Actuarial Data:** U.S. Social Security Administration period life tables and cohort life expectancy data
