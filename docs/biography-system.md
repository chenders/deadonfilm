# Biography System

## Overview

Dead on Film generates AI-written biographies for actors using Claude. The biographies are designed to tell the person's story — not summarize their filmography. The goal is the kind of biography you'd want to read about someone you've never heard of: where they came from, what shaped them, what their life was actually like.

The **Biography Enrichment Pipeline** researches 37 sources to build rich, multi-paragraph personal narratives with structured data: family background, education, personal struggles, lesser-known facts, and life circumstance tags. These appear as the "Life" section on actor pages, shown in an expandable card.

### Three-Stage Content Pipeline

#### Stage 1: Mechanical Pre-Clean
- Strips HTML, navigation, ads, boilerplate
- Removes cookie banners, social media widgets
- Extracts article body text
- No API cost

#### Stage 2: Haiku AI Extraction (optional)
- Uses Claude Haiku to extract biographical passages
- Filters career-heavy content (filmography, awards)
- Returns relevance classification: `high`, `medium`, `low`, `none`
- Cost: ~$0.001 per page

#### Stage 3: Claude Synthesis
- Takes ALL accumulated raw source data
- Produces structured JSON: narrative, teaser, family, education, lesser-known facts, life tags
- Enforces personal life focus over career achievements
- Model: Claude Sonnet (configurable)
- Cost: ~$0.01-0.05 per actor

### Source Priority Order

#### Phase 1: Structured Data (free)
| Source | Method | Notes |
|--------|--------|-------|
| **Wikidata** | SPARQL query | Structured facts: birthplace, education, family |
| **Wikipedia** | MediaWiki parse API | Personal life sections via AI section selector |

#### Phase 2: Reference Sites
| Source | Method | Notes |
|--------|--------|-------|
| **Britannica** | DuckDuckGo `site:britannica.com` search | High-quality biographical content |
| **Biography.com** | DuckDuckGo `site:biography.com` search | Dedicated biography resource |
| **TCM** | DuckDuckGo `site:tcm.com` search | Classic film actor biographies |
| **AllMusic** | DuckDuckGo `site:allmusic.com` search | Professional music artist biographies |

#### Phase 2.5: Books/Publications
| Source | Method | Notes |
|--------|--------|-------|
| **Google Books** | Google Books API v1 snippets + descriptions | Requires `GOOGLE_BOOKS_API_KEY`, 1,000 req/day |
| **Open Library** | Person-subject search + Search Inside API | Free, no API key |
| **IA Books** | Internet Archive advanced search + OCR | Free, public domain full text |

#### Phase 3: Web Search (with link following)
| Source | Method | Notes |
|--------|--------|-------|
| Google Search | Custom Search API | Requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` |
| Bing Search | Bing Web Search API | Requires `BING_SEARCH_API_KEY` |
| DuckDuckGo | HTML search endpoint | Free fallback |
| Brave Search | Brave Search API | Requires `BRAVE_SEARCH_API_KEY` |

#### Phase 4: News Sources
Guardian, NYTimes, AP News, Reuters, Washington Post, LA Times, BBC News, NPR, PBS, People, The Independent, The Telegraph, Time, The New Yorker, Rolling Stone, National Geographic, Smithsonian Magazine, History.com

#### Phase 5: Obituary Sites
Legacy.com, Find a Grave

#### Phase 6: Historical Archives
Internet Archive, Chronicling America, Trove, Europeana

### Orchestrator Flow

1. Initialize sources organized into sequential **phases** (structured → reference → books → web search → news → obituary → archives)
2. Process multiple actors concurrently (configurable concurrency, default 5)
3. For each actor, execute phases sequentially; within each phase, fire all sources concurrently via `Promise.allSettled()`
4. Accumulate ALL successful results across phases
5. **Early stopping between phases**: After 3+ high-quality source families meeting dual threshold (confidence ≥ 0.6 AND reliability ≥ 0.6)
6. Send all accumulated raw data to Claude synthesis (Stage 3)
7. Claude produces structured `BiographyData` JSON
8. DB writer upserts to `actor_biography_details` with COALESCE (preserves existing non-null values)

### Parallel Execution

Sources within each phase run concurrently, respecting per-domain rate limits via a shared `SourceRateLimiter`. Multiple actors are processed in parallel with configurable concurrency (default 5, range 1-20, via `--concurrency` CLI flag or admin UI).

| Batch Size | Sequential (legacy) | Parallel (concurrency=5) |
|-----------|---------------------|-------------------------|
| 10 actors | ~5-10 min | ~30-60s |
| 100 actors | ~50-100 min | ~5-10 min |
| 1000 actors | ~8-16 hrs | ~30-60 min |

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `narrative` | string | Full personal life biography (multi-paragraph) |
| `narrativeConfidence` | enum | `high`, `medium`, `low` |
| `lifeNotableFactors` | string[] | Life circumstance tags (see below) |
| `birthplaceDetails` | string | Rich context about where they grew up |
| `familyBackground` | string | Parents, siblings, family circumstances |
| `education` | string | Schools, degrees, scholarships |
| `preFameLife` | string | What they did before public recognition |
| `fameCatalyst` | string | What launched them into public life |
| `personalStruggles` | string | Addiction, legal issues, health challenges |
| `relationships` | string | Marriages, partnerships, children |
| `lesserKnownFacts` | string[] | Surprising or little-known facts |
| `hasSubstantiveContent` | boolean | Whether biography has enough personal detail |

### Database Tables

| Table | Purpose |
|-------|---------|
| `actor_biography_details` | Enriched biography: narrative, family, education, factors, sources |
| `biography_legacy` | One-time archive of old `actors.biography` before first enrichment |
| `actors.biography` | Updated with `narrative` from enrichment |
| `actors.biography_version` | Semver string set on enrichment (e.g., "5.0.0") |

## Lesser-Known Facts

The enrichment pipeline extracts surprising personal facts that most biographies never mention. These are displayed as a bullet-point list on actor pages under the heading "Lesser-Known Facts."

Examples from Robert Redford's page:
- Got fired from his first job as a supermarket box boy and again from a position his father found him at Standard Oil
- Was expelled from University of Colorado after becoming what he called "the campus drunk"
- Lived as a bohemian in 1950s Paris, where French students challenged him politically about the Algerian War
- Received death threats in the 1970s for his environmental activism against Utah developments

The facts are produced by Claude during Stage 3 synthesis. The prompt instructs Claude to identify facts that are genuinely surprising or little-known — not standard career achievements or widely repeated anecdotes.

## Life Circumstance Tags

Color-coded badges displayed on actor profile pages alongside death-related badges. Life tags are rendered in muted teal (`bg-life-factor-bg`); death tags in the existing reddish deceased color (`bg-deceased-bg`).

### Valid Life Tags

The system enforces a controlled vocabulary — only tags in `VALID_LIFE_NOTABLE_FACTORS` are stored:

| Tag | Description |
|-----|-------------|
| `orphaned` | Lost one or both parents young |
| `adopted` | Was adopted |
| `foster_child` | Grew up in foster care |
| `single_parent` | Raised by a single parent |
| `poverty` | Grew up in poverty |
| `wealth` | Born into wealth |
| `immigrant` | Immigrated to another country |
| `refugee` | Fled conflict or persecution |
| `military_service` | Served in the military |
| `war_veteran` | Saw combat |
| `combat_wounded` | Wounded in combat |
| `pow` | Prisoner of war |
| `scholar` | Academic achievement |
| `self_taught` | Largely self-educated |
| `dropout` | Left formal education early |
| `child_star` | Famous as a child |
| `child_labor` | Worked as a child |
| `incarcerated` | Served time in prison |
| `wrongfully_convicted` | Wrongfully imprisoned |
| `addiction_recovery` | Overcame addiction |
| `disability` | Lived with a disability |
| `chronic_illness` | Lived with chronic illness |
| `civil_rights_activist` | Active in civil rights |
| `political_figure` | Held political office or influence |
| `athlete` | Professional or serious amateur athlete |
| `multiple_careers` | Had significant careers outside acting |
| `turned_down_fame` | Deliberately avoided fame |
| `rags_to_riches` | Rose from poverty to prominence |
| `prodigy` | Exceptional talent from a young age |
| `polyglot` | Speaks multiple languages |
| `clergy` | Religious vocation |
| `royalty` | Royal family |
| `nobility` | Aristocratic background |
| `espionage` | Intelligence work |
| `survivor` | Survived a notable disaster or event |
| `whistleblower` | Exposed wrongdoing |
| `philanthropist` | Significant charitable work |

### Rendering

The `FactorBadge` component (`src/components/death/FactorBadge.tsx`) renders both life and death badges with a `variant` prop:

```tsx
<FactorBadge factor="dropout" variant="life" />        // Muted teal
<FactorBadge factor="natural_causes" variant="death" /> // Reddish (default)
```

On the actor page, life factors from `biographyDetails.lifeNotableFactors` are rendered first, followed by death factors from `deathInfo.notableFactors`.

## Editorial Philosophy

The biography prompt enforces specific editorial constraints:

### What to include
- Pre-fame background: childhood, education, career before acting
- Career highlights: notable roles, genres, career trajectory (brief — 1-2 sentences max in enriched bios)
- One brief sentence about cause of death (if deceased)

### What to exclude
- Specific birth dates (displayed separately on the page)
- Source attributions ("From Wikipedia")
- Citation markers ([1], [2])
- URLs or external links
- Filmography listings, awards, box office numbers (in enriched bios)

### Tone
- **Neutral, factual language** — no superlatives
- **Banned words**: "renowned", "acclaimed", "legendary", "beloved", "masterful", "commanding", "extraordinary"
- Third person voice
- The biography should read like a well-written encyclopedia entry, not a press release

### Length
- Multi-paragraph narrative (no hard limit, but focused on personal life)

## Cost Tracking

Every biography generation records:
- Input/output token counts
- Cost in USD
- Latency in milliseconds
- Result quality (high if substantive content, low otherwise)

Metrics are stored in the `ai_usage` table for monitoring spend and quality over time.

## Scripts

| Script | Purpose |
|---|---|
| `server/scripts/enrich-biographies.ts` | Multi-source biography enrichment CLI |
| Admin Biography Enrichment tab | Manage enrichment, run golden tests, queue batch jobs |

## Entity Linking

After biographies and death narratives are generated, the entity linker scans narrative text for actor names and links them to their profiles in the database. This creates a web of connections — reading one person's death narrative naturally leads you to others mentioned in it. The linker uses both exact and fuzzy matching against the full actor database.
