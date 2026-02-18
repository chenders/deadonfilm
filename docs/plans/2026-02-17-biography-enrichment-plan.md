# Biography Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-source biography enrichment system that produces human-focused biographies emphasizing personal life over fame, with a three-stage content cleaning pipeline, golden test cases for quality iteration, and source attribution with publication metadata.

**Architecture:** Fork the death enrichment orchestrator pattern into a parallel `biography-sources/` directory. Sources are tried in priority order (Wikidata → Wikipedia → web search → news → archives). Raw HTML is cleaned in three stages: mechanical pre-clean → Haiku AI extraction → Opus/Sonnet final synthesis. Results stored in new `actor_biography_details` table.

**Tech Stack:** Node.js, TypeScript, PostgreSQL, Redis, Anthropic API (Haiku + Opus/Sonnet), Gemini Flash (section selection), BullMQ, Commander.js, React, TanStack Query, Tailwind CSS.

**Design doc:** `docs/plans/2026-02-17-biography-enrichment-design.md`

---

## Task Group A: Database Foundation

### Task 1: Create database migration for `actor_biography_details` table

**Files:**
- Create: `server/migrations/XXXX_add-biography-details-table.cjs` (use `npm run migrate:create`)

**Step 1: Generate migration file**

Run: `cd server && npm run migrate:create -- add-biography-details-table`

**Step 2: Write the migration**

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Archive column for old biography
  pgm.addColumns('actors', {
    biography_legacy: { type: 'text' },
    biography_version: { type: 'integer' },
  })

  // New biography details table
  pgm.createTable('actor_biography_details', {
    id: 'id', // serial PK
    actor_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: 'actors(id)',
      onDelete: 'CASCADE',
    },
    narrative_teaser: { type: 'text' },
    narrative: { type: 'text' },
    narrative_confidence: { type: 'text' }, // high, medium, low
    life_notable_factors: { type: 'text[]' },
    birthplace_details: { type: 'text' },
    family_background: { type: 'text' },
    education: { type: 'text' },
    pre_fame_life: { type: 'text' },
    fame_catalyst: { type: 'text' },
    personal_struggles: { type: 'text' },
    relationships: { type: 'text' },
    lesser_known_facts: { type: 'text[]' },
    sources: { type: 'jsonb' },
    entity_links: { type: 'jsonb' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  })

  // Index for finding actors needing biography enrichment
  pgm.createIndex('actor_biography_details', 'actor_id', {
    name: 'idx_actor_biography_details_actor_id',
  })

  // Index for filtering by life notable factors
  pgm.createIndex('actor_biography_details', 'life_notable_factors', {
    name: 'idx_actor_biography_details_life_factors',
    method: 'gin',
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('actor_biography_details')
  pgm.dropColumns('actors', ['biography_legacy', 'biography_version'])
}
```

**Step 3: Run migration**

Run: `cd server && npm run migrate:up`
Expected: Migration completes successfully.

**Step 4: Verify migration**

Run: `cd server && npm run migrate:up` (should say "No migrations to run")

**Step 5: Commit**

```bash
git add server/migrations/*add-biography-details-table*
git commit -m "feat: add actor_biography_details table and biography archive columns

New table stores enriched biography data: narrative with teaser,
life notable factors, structured personal fields (education,
family background, pre-fame life, etc.), lesser-known facts,
and per-field source tracking with publication metadata.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task Group B: Types & Shared Infrastructure

### Task 2: Define biography enrichment types

**Files:**
- Create: `server/src/lib/biography-sources/types.ts`

This file defines all types for the biography enrichment system. Model it on `server/src/lib/death-sources/types.ts` but adapted for biography data.

**Step 1: Create the types file**

Define these types:
- `BiographySourceType` enum — all biography source identifiers (WIKIDATA_BIO, WIKIPEDIA_BIO, BRITANNICA, BIOGRAPHY_COM, GOOGLE_SEARCH_BIO, BING_SEARCH_BIO, BRAVE_SEARCH_BIO, DUCKDUCKGO_BIO, GUARDIAN_BIO, NYTIMES_BIO, AP_NEWS_BIO, BBC_NEWS_BIO, PEOPLE_BIO, LEGACY_BIO, FINDAGRAVE_BIO, INTERNET_ARCHIVE_BIO, CHRONICLING_AMERICA_BIO, TROVE_BIO, EUROPEANA_BIO, GEMINI_BIO, GPT_BIO, GROQ_BIO, GEMINI_BIO_SECTION_SELECTOR, HAIKU_CONTENT_CLEANER)
- `VALID_LIFE_NOTABLE_FACTORS` — Set of valid tags (orphaned, adopted, foster_child, single_parent, poverty, wealth, immigrant, refugee, military_service, war_veteran, combat_wounded, pow, scholar, self_taught, dropout, child_star, child_labor, incarcerated, wrongfully_convicted, addiction_recovery, disability, chronic_illness, civil_rights_activist, political_figure, athlete, multiple_careers, turned_down_fame, rags_to_riches, prodigy, polyglot, clergy, royalty, nobility, espionage, survivor, whistleblower, philanthropist)
- `BiographySourceEntry` — extends pattern from `EnrichmentSourceEntry` but adds `publication`, `articleTitle`, `author`, `publishDate`, `domain`, `contentType`
- `BiographyData` — the fields Claude produces (narrative_teaser, narrative, narrative_confidence, life_notable_factors, birthplace_details, family_background, education, pre_fame_life, fame_catalyst, personal_struggles, relationships, lesser_known_facts, has_substantive_content)
- `BiographyResult` — per-actor result with data + sources + stats
- `ActorForBiography` — actor fields needed (id, tmdbId, imdbPersonId, name, birthday, deathday, wikipediaUrl, biography_raw_tmdb, biography)
- `BiographyEnrichmentConfig` — config interface (limit, confidenceThreshold, reliabilityThreshold, sourceCategories, costLimits, contentCleaning with haiku enabled flag)
- `CleanedContent` — output of content cleaner (extracted_text, article_title, publication, author, publish_date, relevance, content_type, url, domain, originalBytes, cleanedBytes)
- Reuse `ReliabilityTier` from death-sources types directly (import, don't duplicate)

**Step 2: Write test for type validation**

Create `server/src/lib/biography-sources/types.test.ts`:
- Test that `VALID_LIFE_NOTABLE_FACTORS` contains expected tags
- Test that all tags are lowercase snake_case
- Test no duplicates in the set

**Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/biography-sources/types.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/lib/biography-sources/types.ts server/src/lib/biography-sources/types.test.ts
git commit -m "feat: add biography enrichment type definitions

Defines BiographySourceType enum, VALID_LIFE_NOTABLE_FACTORS,
BiographyData, BiographyResult, CleanedContent, and config types.
Reuses ReliabilityTier from death-sources.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Build content cleaner — Stage 1 (mechanical pre-clean)

**Files:**
- Create: `server/src/lib/biography-sources/content-cleaner.ts`
- Create: `server/src/lib/biography-sources/content-cleaner.test.ts`

This is the shared cleaning pipeline that processes raw HTML before any AI. It should be usable by both biography and death enrichment.

**Step 1: Write failing tests**

Test cases for `mechanicalPreClean(html: string)`:
- Strips `<script>`, `<style>`, `<noscript>`, `<iframe>`, `<svg>` tags and content
- Extracts `<article>` content when present (ignoring nav/footer/sidebar outside it)
- Falls back to `<main>`, then `<body>` when no `<article>`
- Removes elements matching noise selectors: `<nav>`, `<footer>`, `<header>`, `<aside>`, elements with class containing "ad", "cookie", "newsletter", "comments", "related", "social-share", "breadcrumb", "pagination"
- Decodes HTML entities
- Removes citation markers `[1]`, `[edit]`, `[citation needed]`
- Collapses whitespace
- Detects and strips code fragments

Test cases for `extractMetadata(html: string)`:
- Extracts `<title>` content
- Extracts `og:site_name` from meta tag
- Extracts author from `<meta name="author">`
- Extracts publish date from `<time datetime="...">`
- Returns null for missing fields

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/biography-sources/content-cleaner.test.ts`
Expected: FAIL

**Step 3: Implement mechanical pre-clean**

Key implementation notes:
- Use regex-based tag removal (same state-machine approach as `removeScriptTags` in `html-utils.ts`)
- For article body extraction, use regex to match `<article[^>]*>` ... `</article>` — we're server-side so no DOM. Use a priority list of container patterns.
- For noise removal, strip common patterns by tag name and class/id attributes using regex
- Import and reuse `decodeHtmlEntities`, `looksLikeCode`, `stripCodeFromText` from `../death-sources/html-utils.js`
- Export `mechanicalPreClean(html: string): { text: string, metadata: PageMetadata }`
- Export `PageMetadata` interface: `{ title, publication, author, publishDate, domain }`

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/biography-sources/content-cleaner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/content-cleaner.ts server/src/lib/biography-sources/content-cleaner.test.ts
git commit -m "feat: add mechanical pre-clean stage for content cleaning pipeline

Strips structural HTML noise (scripts, styles, nav, ads, cookies,
sidebars, comments), extracts article body via selector cascade,
removes citation markers, and extracts page metadata (title,
publication, author, date). Reuses html-utils from death-sources.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Build content cleaner — Stage 2 (Haiku AI extraction)

**Files:**
- Modify: `server/src/lib/biography-sources/content-cleaner.ts`
- Modify: `server/src/lib/biography-sources/content-cleaner.test.ts`

**Step 1: Write failing tests**

Test cases for `aiExtractBiographicalContent(input: MechanicallyCleanedPage, actorName: string)`:
- Returns `CleanedContent` with extracted_text, metadata, relevance, content_type
- Returns `relevance: "none"` for pages with no biographical content
- Returns `relevance: "high"` for pages with rich personal detail
- Handles API failures gracefully (returns input text as fallback)
- Tracks cost in result
- Mock the Anthropic client for all tests

Test cases for `shouldPassToSynthesis(relevance: string)`:
- Returns true for "high" and "medium"
- Returns false for "low" and "none"

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/biography-sources/content-cleaner.test.ts`
Expected: New tests FAIL

**Step 3: Implement Haiku AI extraction**

Key implementation notes:
- Use `@anthropic-ai/sdk` with model `claude-haiku-4-5-20251001`
- Build prompt from design doc Section 2, Stage 2
- Parse JSON response, handle markdown fences
- Track token usage and calculate cost (Haiku rates)
- On failure, return mechanically-cleaned text as fallback with `relevance: "medium"`
- Export `aiExtractBiographicalContent(input, actorName): Promise<CleanedContent>`
- Export `shouldPassToSynthesis(relevance): boolean`

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/biography-sources/content-cleaner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/content-cleaner.ts server/src/lib/biography-sources/content-cleaner.test.ts
git commit -m "feat: add Haiku AI extraction stage to content cleaning pipeline

Stage 2 uses Haiku to extract only biographical content from
mechanically pre-cleaned text. Removes ads, boilerplate, career
lists. Returns relevance score to gate what passes to final
synthesis. Extracts article title and publication metadata.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Build biography-focused Wikipedia section selector

**Files:**
- Create: `server/src/lib/biography-sources/wikipedia-section-selector.ts`
- Create: `server/src/lib/biography-sources/wikipedia-section-selector.test.ts`

**Step 1: Write failing tests**

Test cases for `selectBiographySections(actorName, sections)`:
- Selects "Early life", "Personal life", "Education" sections
- Skips "Filmography", "Awards and nominations", "Selected filmography", "Discography", "References", "External links", "See also"
- For actors like Nixon, selects personal sections but skips "Presidency", "Impeachment"
- Handles non-standard section names (AI should catch "Background and youth", "Childhood in Kansas")
- Falls back to regex patterns when Gemini API unavailable
- Returns `SectionSelectionResult` with selectedSections, reasoning, costUsd, usedAI

Regex fallback patterns to test:
- Primary personal sections: `/early life/i`, `/personal life/i`, `/education/i`, `/family/i`, `/childhood/i`, `/background/i`, `/youth/i`, `/upbringing/i`, `/military/i`
- Skip patterns: `/filmography/i`, `/awards/i`, `/discography/i`, `/references/i`, `/external links/i`, `/see also/i`, `/bibliography/i`, `/notes/i`, `/selected works/i`

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/biography-sources/wikipedia-section-selector.test.ts`
Expected: FAIL

**Step 3: Implement biography section selector**

Model on `server/src/lib/death-sources/wikipedia-section-selector.ts` but with biography-focused prompt:
- Reuse same Gemini Flash API pattern and cost tracking
- Change prompt to focus on personal life sections (see design doc Section 3)
- Implement regex fallback with biography-specific section patterns
- Export `selectBiographySections(actorName, sections, options): Promise<SectionSelectionResult>`
- Reuse `SectionSelectionResult` interface from death-sources or define compatible one

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/biography-sources/wikipedia-section-selector.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/wikipedia-section-selector.ts server/src/lib/biography-sources/wikipedia-section-selector.test.ts
git commit -m "feat: add biography-focused Wikipedia section selector

Uses Gemini Flash to select personal life sections (early life,
education, family, military service) and skip career/fame sections
(filmography, awards, discography). Falls back to regex patterns
when Gemini API unavailable.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task Group C: Base Source & Core Sources

### Task 6: Create biography base source

**Files:**
- Create: `server/src/lib/biography-sources/base-source.ts`
- Create: `server/src/lib/biography-sources/base-source.test.ts`

**Step 1: Write failing tests**

Test cases:
- Source has caching (lookup returns cached result on second call)
- Source respects rate limiting (delays between requests)
- Source tracks cost in source entry
- Source calculates biographical confidence from keywords (childhood, education, family, parents, grew up, married, etc.)
- Confidence is 0 when no biographical keywords found
- Confidence increases with more biographical keyword matches
- Source creates BiographySourceEntry with publication metadata fields

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/biography-sources/base-source.test.ts`
Expected: FAIL

**Step 3: Implement base source**

Fork from `server/src/lib/death-sources/base-source.ts` and adapt:
- Replace `DEATH_KEYWORDS` and `CIRCUMSTANCE_KEYWORDS` with biography equivalents:
  - `BIO_REQUIRED_KEYWORDS`: ["childhood", "grew up", "born in", "early life", "parents", "family", "education", "school", "married", "personal"]
  - `BIO_BONUS_KEYWORDS`: ["scholarship", "struggled", "poverty", "military", "served", "orphan", "adopted", "immigrant", "self-taught", "before fame", "first job", "siblings", "divorce", "children"]
- Same caching pattern using Redis (getCachedQuery/setCachedQuery)
- Same rate limiting pattern
- Same timeout handling
- Add `publication`, `articleTitle`, `domain` fields to source entry creation
- Export abstract `BaseBiographySource` class

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/biography-sources/base-source.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/base-source.ts server/src/lib/biography-sources/base-source.test.ts
git commit -m "feat: add biography base source with caching and biographical confidence

Forks death enrichment BaseDataSource pattern with biography-specific
confidence keywords (childhood, education, family, etc.). Includes
caching, rate limiting, timeout handling, and source entry tracking
with publication metadata.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Implement Wikidata biography source

**Files:**
- Create: `server/src/lib/biography-sources/sources/wikidata.ts`
- Create: `server/src/lib/biography-sources/sources/wikidata.test.ts`

**Step 1: Write failing tests**

Test cases:
- Extracts education (P69), spouse (P26), children (P40), military branch (P241), religion (P140), birthplace details
- Returns structured data as formatted text for Claude synthesis
- Handles actors with no Wikidata entry gracefully
- Handles actors with partial data (some fields missing)
- Rate limits at 500ms

**Step 2: Implement Wikidata biography source**

Model on `server/src/lib/death-sources/sources/wikidata.ts` but query different properties:
- P69: educated at (→ education)
- P26: spouse (→ relationships)
- P40: child (→ relationships)
- P241: military branch (→ pre_fame_life)
- P140: religion (→ family_background)
- P19: place of birth (→ birthplace_details)
- P27: country of citizenship (→ birthplace_details)
- P106: occupation (→ pre_fame_life, for non-acting occupations)
- P166: award received — ONLY for non-entertainment awards (military decorations, scholarships, etc.)

SPARQL query should return labels not just IDs. Format results as readable text.

**Step 3-5: Test, verify, commit** (same pattern)

---

### Task 8: Implement Wikipedia biography source

**Files:**
- Create: `server/src/lib/biography-sources/sources/wikipedia.ts`
- Create: `server/src/lib/biography-sources/sources/wikipedia.test.ts`

**Step 1: Write failing tests**

Test cases:
- Fetches section list from Wikipedia API
- Uses biography section selector to pick personal sections
- Fetches selected sections and cleans HTML
- Runs content through mechanical pre-clean
- Returns combined text from all selected sections with section headers
- Handles articles with no personal sections (fallback to intro)
- Handles disambiguation pages

**Step 2: Implement Wikipedia biography source**

Model on `server/src/lib/death-sources/sources/wikipedia.ts` but:
- Use `selectBiographySections()` instead of `selectRelevantSections()` (death-focused)
- Fetch sections selected by biography selector (Early life, Personal life, Education, etc.)
- Clean HTML using existing `extractTextFromHtml` and `cleanWikipediaText` patterns
- Run result through Stage 1 mechanical pre-clean from content-cleaner
- Combine section texts with `[Section Title]` headers

**Step 3-5: Test, verify, commit**

---

### Task 9: Implement web search base for biography queries

**Files:**
- Create: `server/src/lib/biography-sources/sources/web-search-base.ts`
- Create: `server/src/lib/biography-sources/sources/web-search-base.test.ts`

**Step 1: Write failing tests**

Test cases:
- Builds biographical search queries from templates:
  - `"{name}" childhood OR "early life" OR "grew up" OR education`
  - `"{name}" "before fame" OR "early career" OR "first job"`
  - `"{name}" family parents siblings`
  - `"{name}" interview personal life`
  - `"{name}" "little known" OR "lesser known" OR "fun fact"`
- Uses heuristic link selection with biography-specific domain scores (biography.com: 95, britannica.com: 90, people.com: 85, legacy.com: 80, etc.)
- Follows selected links, runs through three-stage cleaning pipeline
- Filters out career-focused results (high filmography/awards keyword density)
- Returns cleaned content with source metadata

**Step 2: Implement web search base**

Fork from `server/src/lib/death-sources/sources/web-search-base.ts` and adapt:
- Replace death-focused query templates with biography templates
- Replace domain scores (biography.com high, obituary sites high, trade press low)
- Replace death keyword boosting with biographical keyword boosting in link selection
- Integrate content-cleaner pipeline (Stage 1 + Stage 2 Haiku) into page processing
- Reuse existing `fetchPage`/`fetchPages` from `../death-sources/link-follower.js`

**Step 3-5: Test, verify, commit**

---

### Task 10: Implement Google, Bing, Brave, DuckDuckGo biography sources

**Files:**
- Create: `server/src/lib/biography-sources/sources/google-search.ts`
- Create: `server/src/lib/biography-sources/sources/bing-search.ts`
- Create: `server/src/lib/biography-sources/sources/brave-search.ts`
- Create: `server/src/lib/biography-sources/sources/duckduckgo.ts`
- Create tests for each

These are thin wrappers around the web search base, each using their respective search API (same as death enrichment sources but extending biography web search base instead).

**Step 1-5: Implement, test, commit each source**

Model each on its death-sources counterpart:
- `server/src/lib/death-sources/sources/google-search.ts` → biography version
- Same API calls, same authentication
- Different: extends biography web search base, uses biography query templates

Commit all four together since they follow the same pattern.

---

### Task 11: Implement Britannica and Biography.com sources

**Files:**
- Create: `server/src/lib/biography-sources/sources/britannica.ts`
- Create: `server/src/lib/biography-sources/sources/biography-com.ts`
- Create tests for each

These are new sources not in death enrichment.

**Step 1: Write failing tests**

For Britannica:
- Searches `site:britannica.com "{name}" biography` via DuckDuckGo HTML search
- Fetches article page
- Runs through content cleaner
- Returns cleaned biographical content with metadata
- Handles 404 / no results gracefully
- Reliability tier: TIER_1_NEWS (0.95)

For Biography.com:
- Searches `site:biography.com "{name}"` via DuckDuckGo
- Fetches profile page
- Runs through content cleaner
- Returns cleaned content
- Reliability tier: SECONDARY_COMPILATION (0.85)

**Step 2-5: Implement, test, commit**

---

### Task 12: Adapt remaining sources from death enrichment

**Files:**
- Create: `server/src/lib/biography-sources/sources/guardian.ts`
- Create: `server/src/lib/biography-sources/sources/nytimes.ts`
- Create: `server/src/lib/biography-sources/sources/ap-news.ts`
- Create: `server/src/lib/biography-sources/sources/bbc-news.ts`
- Create: `server/src/lib/biography-sources/sources/people.ts`
- Create: `server/src/lib/biography-sources/sources/legacy.ts`
- Create: `server/src/lib/biography-sources/sources/findagrave.ts`
- Create: `server/src/lib/biography-sources/sources/internet-archive.ts`
- Create: `server/src/lib/biography-sources/sources/chronicling-america.ts`
- Create: `server/src/lib/biography-sources/sources/trove.ts`
- Create: `server/src/lib/biography-sources/sources/europeana.ts`

For each source:
1. Fork from death-sources counterpart
2. Change search queries to biography-focused (e.g., Guardian: search for profiles/interviews about the person, not obituaries)
3. Extend biography base source instead of death base source
4. Integrate content cleaning pipeline
5. Keep same reliability tiers
6. Write basic test for each

Group into sub-commits:
- News sources (Guardian, NYT, AP, BBC, People) — one commit
- Obituary sources (Legacy, Find a Grave) — one commit
- Archive sources (Internet Archive, Chronicling America, Trove, Europeana) — one commit

---

## Task Group D: Orchestrator & Claude Synthesis

### Task 13: Build Claude biography synthesis prompt

**Files:**
- Create: `server/src/lib/biography-sources/claude-cleanup.ts`
- Create: `server/src/lib/biography-sources/claude-cleanup.test.ts`

**Step 1: Write failing tests**

Test cases for `synthesizeBiography(actor, rawSources)`:
- Returns BiographyData with all fields populated from mock Claude response
- Validates life_notable_factors against VALID_LIFE_NOTABLE_FACTORS (strips invalid)
- Returns has_substantive_content: false when Claude indicates thin content
- Handles malformed JSON responses (fallback parsing)
- Tracks token usage and cost
- Builds prompt correctly with source material sorted by reliability

Test cases for `buildBiographySynthesisPrompt(actor, sources)`:
- Includes structured Wikidata data when available
- Includes source reliability percentages
- Includes all source texts with headers
- Limits total prompt size (truncate lowest-reliability sources first)

**Step 2: Implement Claude biography synthesis**

- Use the full prompt from design doc Section 4
- Model: configurable, default `claude-sonnet-4-20250514` (cheaper for iteration, upgrade to Opus for production)
- Parse JSON response, validate notable factors against `VALID_LIFE_NOTABLE_FACTORS`
- Handle markdown fence stripping (same pattern as death cleanup)
- Track costs via AI usage tracker
- Export `synthesizeBiography(actor, rawSources, config): Promise<BiographySynthesisResult>`

**Step 3-5: Test, verify, commit**

---

### Task 14: Build biography enrichment orchestrator

**Files:**
- Create: `server/src/lib/biography-sources/orchestrator.ts`
- Create: `server/src/lib/biography-sources/orchestrator.test.ts`

**Step 1: Write failing tests**

Test cases for `BiographyEnrichmentOrchestrator`:
- Initializes sources by category (free → biographical reference → web search → news → archives → AI)
- Tries sources in priority order for a single actor
- Stops when confidence + reliability thresholds met
- Respects cost limits per actor and total
- Runs content through three-stage cleaning pipeline
- Calls Claude synthesis with only high/medium relevance cleaned content
- Returns `Map<number, BiographyResult>` keyed by actor ID
- Handles source errors gracefully (continues to next source)
- Tracks batch statistics

**Step 2: Implement orchestrator**

Fork from `server/src/lib/death-sources/orchestrator.ts` and adapt:
- Source initialization order: Wikidata → Wikipedia → Britannica → Biography.com → Web search → News → Obituaries → Archives → AI
- Replace death confidence keywords with biography keywords
- Higher confidence threshold (0.6 default vs death's 0.5)
- Content cleaning pipeline integration:
  1. Source returns raw result
  2. If raw HTML, run Stage 1 mechanical pre-clean
  3. Run Stage 2 Haiku extraction
  4. Only keep relevance high/medium
  5. Accumulate cleaned sources
  6. After all sources tried (or threshold met), run Stage 3 Claude synthesis
- Export `BiographyEnrichmentOrchestrator` class

**Step 3-5: Test, verify, commit**

---

### Task 15: Build biography enrichment database writer

**Files:**
- Create: `server/src/lib/biography-enrichment-db-writer.ts`
- Create: `server/src/lib/biography-enrichment-db-writer.test.ts`

**Step 1: Write failing tests**

Test cases for `writeBiographyToProduction(pool, actorId, data)`:
- Upserts to `actor_biography_details` (inserts if not exists, updates if exists)
- Updates `actors.biography` with narrative_teaser
- Archives old biography to `actors.biography_legacy` (only on first enrichment)
- Sets `actors.biography_version`, `biography_generated_at`, `biography_source_type`, `biography_has_content`
- Invalidates actor cache after write

Test cases for `writeBiographyToStaging(pool, actorId, data)`:
- Writes to staging table for admin review (reuse existing staging pattern)

**Step 2: Implement database writer**

Model on `server/src/lib/enrichment-db-writer.ts`:
- COALESCE merge strategy (only overwrite non-null fields)
- `biography_legacy` only set when current `biography` is not null AND `biography_legacy` is null
- Update `actors.biography = narrative_teaser` for backwards compatibility
- Update `actors.biography_source_type = 'enriched'` (new value)
- Invalidate actor cache via `invalidateActorCache(actorId)`

**Step 3-5: Test, verify, commit**

---

## Task Group E: Golden Test Cases & CLI

### Task 16: Build golden test case framework

**Files:**
- Create: `server/src/lib/biography/golden-test-cases.ts`
- Create: `server/src/lib/biography/golden-test-cases.test.ts`

**Step 1: Write failing tests**

Test cases for `scoreResult(testCase, result)`:
- Scores fact recall (expectedFacts found in narrative via keyword search)
- Scores factor accuracy (expectedFactors match life_notable_factors)
- Detects unwanted content (filmography keywords, award lists)
- Evaluates teaser quality (starts with personal info vs career)
- Returns composite 0-100 score

**Step 2: Implement golden test cases**

Define test case data:
```typescript
export const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  {
    actorName: "Richard Nixon",
    tmdbId: 59832, // verify this
    expectedFacts: ["Harvard", "scholarship", "family store", "Whittier"],
    expectedFactors: ["scholar", "political_figure", "military_service"],
    unexpectedContent: ["filmography", "box office", "Academy Award"],
  },
  {
    actorName: "Jimmy Stewart",
    tmdbId: 1930,
    expectedFacts: ["Princeton", "architecture", "bomber pilot", "model airplane"],
    expectedFactors: ["military_service", "war_veteran", "scholar"],
    unexpectedContent: ["filmography", "box office"],
  },
  // ... remaining test cases from design doc
]
```

Scoring algorithm:
- Fact recall: +15 points per expected fact found (up to 60)
- Factor accuracy: +5 points per correct factor (up to 20)
- No unwanted content: +10 points (0 if any found)
- Teaser quality: +10 points if teaser doesn't start with birth/career info

**Step 3-5: Test, verify, commit**

---

### Task 17: Build biography enrichment CLI script

**Files:**
- Create: `server/scripts/enrich-biographies.ts`

**Step 1: Implement CLI script**

Model on `server/scripts/enrich-death-details.ts` with Commander.js:

```
Usage: enrich-biographies [options]

Options:
  -l, --limit <n>              Limit actors to process (default: 10)
  -p, --min-popularity <n>     Minimum popularity threshold
  -a, --actor-id <ids>         Process specific actor(s) by ID (comma-separated)
  -t, --tmdb-id <ids>          Process specific actor(s) by TMDB ID
  -n, --dry-run                Preview without writing to database
  -c, --confidence <n>         Confidence threshold (default: 0.6)
  --max-cost-per-actor <n>     Max cost per actor in USD
  --max-total-cost <n>         Max total cost (default: 5)
  --golden-test                Run golden test cases and score results
  --disable-haiku-cleanup      Disable Haiku AI extraction stage
  --disable-web-search         Disable web search sources
  --staging                    Write to staging table for admin review
  -y, --yes                    Skip confirmation prompt
```

Key implementation:
- Import `BiographyEnrichmentOrchestrator` and `writeBiographyToProduction`/`writeBiographyToStaging`
- Query actors from DB (similar pattern to death enrichment script)
- Run orchestrator
- Write results
- If `--golden-test`, score results against golden test cases and print report
- `dotenv/config` must be first import

**Step 2: Add npm script**

Add to `server/package.json` scripts: `"enrich:biographies": "tsx scripts/enrich-biographies.ts"`

**Step 3: Test with dry run**

Run: `cd server && npm run enrich:biographies -- --actor-id <nixon_id> --dry-run`
Expected: Shows what would be generated without writing to DB.

**Step 4: Commit**

```bash
git add server/scripts/enrich-biographies.ts server/package.json
git commit -m "feat: add biography enrichment CLI script

Commander.js CLI for running biography enrichment with options for
actor selection, cost limits, golden test case scoring, dry run,
and staging mode. Mirrors death enrichment script pattern.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task Group F: Job Queue Integration

### Task 18: Add biography enrichment job type and handler

**Files:**
- Modify: `server/src/lib/jobs/types.ts` — add `ENRICH_BIOGRAPHIES_BATCH` job type and payload schema
- Create: `server/src/lib/jobs/handlers/enrich-biographies-batch.ts`
- Modify: `server/src/lib/jobs/handlers/index.ts` — register new handler

**Step 1: Add job type**

In `server/src/lib/jobs/types.ts`:
- Add `ENRICH_BIOGRAPHIES_BATCH = "enrich-biographies-batch"` to `JobType` enum
- Add payload schema:
  ```typescript
  export const enrichBiographiesBatchPayloadSchema = z.object({
    actorIds: z.array(z.number().int().positive()).optional(),
    limit: z.number().int().positive().max(500).optional(),
    minPopularity: z.number().min(0).finite().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    allowRegeneration: z.boolean().default(false),
    useStaging: z.boolean().default(false),
  })
  ```
- Add to `JOB_PAYLOAD_MAP` and export type

**Step 2: Create handler**

Model on `server/src/lib/jobs/handlers/generate-biographies-batch.ts`:
- Extend `BaseJobHandler`
- `process()` method:
  1. Query actors from DB
  2. Create `BiographyEnrichmentOrchestrator` with config from payload
  3. Run `enrichBatch(actors)`
  4. Write results (production or staging based on payload)
  5. Return summary stats

**Step 3: Register handler**

In `server/src/lib/jobs/handlers/index.ts`:
- Import `EnrichBiographiesBatchHandler`
- Add `registerHandler(new EnrichBiographiesBatchHandler())`

**Step 4: Test**

Run: `cd server && npx vitest run src/lib/jobs/handlers/enrich-biographies-batch.test.ts`

**Step 5: Commit**

---

## Task Group G: API & Admin Routes

### Task 19: Add biography enrichment admin API routes

**Files:**
- Create: `server/src/routes/admin/biography-enrichment.ts`
- Modify: `server/src/routes/admin/index.ts` — mount new routes

Three endpoints:

**GET `/admin/api/biography-enrichment`**
- List actors needing biography enrichment (no `actor_biography_details` record, or `biography_version < current`)
- Filters: `minPopularity`, `searchName`, `needsEnrichment`
- Pagination
- Returns stats: total, enriched, needing enrichment

**POST `/admin/api/biography-enrichment/enrich`**
- Single-actor enrichment (synchronous)
- Takes `actorId`
- Returns full `BiographyData` result with cost

**POST `/admin/api/biography-enrichment/enrich-batch`**
- Queue batch enrichment job
- Takes `actorIds`, `limit`, `minPopularity`, `confidenceThreshold`, `allowRegeneration`, `useStaging`
- Returns `jobId`

**POST `/admin/api/biography-enrichment/golden-test`**
- Run golden test cases and return score report
- Takes optional `actorIds` to override default test cases
- Returns array of `TestResult`

**Step 1-5: Implement, test, commit**

---

### Task 20: Extend actor public API with biography details

**Files:**
- Modify: `server/src/routes/actor.ts` — add biography details to response
- Modify: `src/types/actor.ts` — extend ActorProfileResponse type

**Step 1: Modify actor route**

In `server/src/routes/actor.ts`, after fetching actor data:
- Query `actor_biography_details` for the actor
- Add to response:
  ```typescript
  biographyDetails: {
    narrativeTeaser: details?.narrative_teaser || null,
    narrative: details?.narrative || null,
    narrativeConfidence: details?.narrative_confidence || null,
    lifeNotableFactors: details?.life_notable_factors || [],
    birthplaceDetails: details?.birthplace_details || null,
    familyBackground: details?.family_background || null,
    education: details?.education || null,
    preFameLife: details?.pre_fame_life || null,
    fameCatalyst: details?.fame_catalyst || null,
    personalStruggles: details?.personal_struggles || null,
    relationships: details?.relationships || null,
    lesserKnownFacts: details?.lesser_known_facts || [],
    sources: details?.sources || null,
  } | null
  ```

**Step 2: Update TypeScript types**

In `src/types/actor.ts`, add `BiographyDetails` interface and add to `ActorProfileResponse`.

**Step 3-5: Test, verify, commit**

---

## Task Group H: Frontend

### Task 21: Build biography section with teaser/expand

**Files:**
- Create: `src/components/actor/BiographySection.tsx`
- Create: `src/components/actor/BiographySection.test.tsx`
- Modify: `src/pages/ActorPage.tsx` — replace current biography rendering

**Step 1: Write failing tests**

Test cases:
- Renders narrative_teaser with "Show more" button when full narrative exists
- Expands to full narrative on "Show more" click
- Collapses back on "Show less" click
- Renders full narrative directly when no teaser (short bios)
- Falls back to old biography field when no biography details
- Displays lesser-known facts in a callout section
- Displays life notable factors as pills/tags
- Displays source attribution with publication names and links
- Renders nothing when no biography at all

**Step 2: Implement BiographySection component**

```tsx
// Key structure:
// - Teaser shown by default with "Show more" (if narrative > 300 chars)
// - Full narrative revealed on expand
// - Lesser-known facts as "Did you know?" callout
// - Life notable factors as pills
// - Source attribution at bottom
```

Use existing design tokens (bg-surface-elevated, text-text-primary, etc.). Add `data-testid` attributes for testing.

**Step 3: Integrate into ActorPage**

Replace the current biography rendering block (around lines 387-403 in `src/pages/ActorPage.tsx`) with `<BiographySection>`.

Pass props:
- `biography` (old field, for fallback)
- `biographyDetails` (new enriched data)
- `biographySourceUrl` / `biographySourceType` (for old bio fallback)

**Step 4: Run tests**

Run: `npx vitest run src/components/actor/BiographySection.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/actor/BiographySection.tsx src/components/actor/BiographySection.test.tsx src/pages/ActorPage.tsx
git commit -m "feat: add BiographySection component with teaser/expand and source attribution

Replaces career-focused biography with human-focused narrative.
Shows teaser with 'Show more' for long bios. Displays lesser-known
facts, life notable factors as tags, and source attribution with
publication names and article titles.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task Group I: Admin UI

### Task 22: Build biography enrichment admin tab

**Files:**
- Create: `src/components/admin/actors/BiographyEnrichmentTab.tsx`
- Modify: admin actor management page to include new tab

This mirrors the existing `BiographiesTab.tsx` but for the enrichment workflow:
- Stats cards: total actors, enriched, needing enrichment
- Filters: name search, min popularity, enrichment status
- Batch actions: enrich top N, enrich selected, run golden tests
- Single-actor enrich button
- Golden test results panel
- Job status tracking with polling

**Step 1-5: Implement, test, commit**

---

## Task Group J: Documentation & Cleanup

### Task 23: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md` — add biography enrichment to architecture section
- Create: `.claude/rules/biography-enrichment.md` — detailed rules for biography system
- Modify: `.github/copilot-instructions.md` — add biography enrichment section

**CLAUDE.md updates:**
- Add `biography-sources/` to Key Directories
- Add biography enrichment CLI command to Common Commands
- Add `actor_biography_details` to architecture description
- Add biography enrichment job type to Key Dependencies

**New `.claude/rules/biography-enrichment.md`:**
- System overview (goals: human-focused, not fame-focused)
- Three-stage content cleaning pipeline explanation
- Source priority order for biography vs death
- Claude synthesis prompt philosophy (person, not celebrity)
- Golden test cases and quality iteration loop
- Valid life notable factors list
- Database tables and write paths
- Content cleaner architecture (mechanical → Haiku → Opus)
- Scripts and CLI commands

**Copilot instructions:**
- Add biography enrichment section matching the new rules file

**Step 1-3: Write all documentation, verify sync, commit**

```bash
git add CLAUDE.md .claude/rules/biography-enrichment.md .github/copilot-instructions.md
git commit -m "docs: add biography enrichment system documentation

Adds detailed rules for biography enrichment including three-stage
content cleaning pipeline, source priority, Claude synthesis prompt
philosophy, golden test cases, and valid life notable factors.
Updates CLAUDE.md architecture section and syncs copilot instructions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task Group K: Integration Testing & Golden Test Run

### Task 24: End-to-end integration test

**Files:**
- Create: `server/src/lib/biography-sources/integration.test.ts`

Write integration tests that exercise the full pipeline with mocked external services:
- Mock Wikidata SPARQL response
- Mock Wikipedia API section list and content
- Mock web search results
- Mock Haiku AI extraction responses
- Mock Claude synthesis response
- Verify full flow: sources → cleaning → synthesis → database write
- Verify golden test scoring against known results

Run: `cd server && npx vitest run src/lib/biography-sources/integration.test.ts`

---

### Task 25: First golden test run

**Prerequisites:** All previous tasks complete, dev environment running.

**Step 1: Run golden test cases in dry run**

```bash
cd server && npm run enrich:biographies -- --golden-test --dry-run
```

Review output: fact recall, factor accuracy, teaser quality.

**Step 2: Run for real on golden test actors**

```bash
cd server && npm run enrich:biographies -- --golden-test --max-total-cost 5
```

**Step 3: Score results**

Review the automated scoring. Check:
- Did Nixon/Harvard fact appear?
- Did Stewart/Princeton appear?
- Did Hepburn/Dutch Resistance appear?
- Are teasers compelling (not career-focused)?
- Are notable factors correct?

**Step 4: Iterate on prompt if needed**

If scores < 80%, adjust the synthesis prompt in `claude-cleanup.ts` and re-run.

**Step 5: Commit results and any prompt adjustments**

---

## Execution Order Summary

| Group | Tasks | Dependencies | Estimated Scope |
|-------|-------|-------------|-----------------|
| A: Database | 1 | None | 1 migration |
| B: Types & Shared | 2-5 | Task 1 | 4 modules |
| C: Sources | 6-12 | Tasks 2-5 | ~15 source files |
| D: Orchestrator | 13-15 | Tasks 6-12 | 3 modules |
| E: Golden Tests & CLI | 16-17 | Tasks 13-15 | 2 modules |
| F: Job Queue | 18 | Tasks 14-15 | 1 handler |
| G: API Routes | 19-20 | Tasks 15, 18 | 2 route files |
| H: Frontend | 21 | Task 20 | 1 component |
| I: Admin UI | 22 | Tasks 19, 21 | 1 component |
| J: Documentation | 23 | All above | 3 doc files |
| K: Integration | 24-25 | All above | 2 test files |

Groups A-B can run first. Groups C and D are the bulk of the work. Groups E-K can follow incrementally.
