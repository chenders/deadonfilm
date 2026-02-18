# Biography Enrichment System — Design Document

**Date:** 2026-02-17
**Status:** Approved

## Problem

The current biography field is a 6-line AI-generated summary focused on career highlights — notable roles, genres, career trajectory. It reads like a celebrity profile. Since Dead on Film already collects extensive personal data through death enrichment, we have an opportunity to differentiate by producing biographies that read like the story of a *person* — their childhood, struggles, education, relationships, and lesser-known facts — rather than a famous person's resume.

Example of what we want to surface: Richard Nixon received a scholarship to Harvard but turned it down because his mother needed help at the family store. The general public doesn't know this because all they hear about is the presidency.

## Goals

1. Generate human-focused biographies that emphasize personal life over fame
2. Surface lesser-known facts that make each person's story unique
3. Track and display sources with publication name, article title, and URL
4. Build a multi-source orchestrator modeled on the death enrichment system
5. Clean source data aggressively before final AI synthesis to reduce cost and improve quality
6. Support iterative quality improvement via golden test cases and admin review

## Non-Goals

- Replacing death enrichment or the death page
- Covering every person in the database immediately (start with most popular, expand)
- Real-time biography generation (batch process, like death enrichment)

---

## 1. Data Model

### Migration: Add biography archive column to `actors`

| Column | Type | Purpose |
|--------|------|---------|
| `biography_legacy` | text | Archive of the old AI-generated biography (copied from `biography` before overwrite) |
| `biography_version` | integer | Tracks which generation iteration produced the current biography |

The existing `biography`, `biography_source_url`, `biography_source_type`, `biography_generated_at`, `biography_raw_tmdb`, and `biography_has_content` columns are reused. The `biography` column will hold the new human-focused narrative teaser (for backwards compatibility with existing API consumers), while the full narrative lives in the new details table.

### New table: `actor_biography_details`

One record per actor (upsert on `actor_id`), mirrors `actor_death_circumstances` pattern.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | serial PK | |
| `actor_id` | integer, FK, unique | One record per actor |
| `narrative_teaser` | text | 2-3 sentence compelling hook, shown by default before "show more" |
| `narrative` | text | Full human-focused biography (adaptive length: 2-5 paragraphs) |
| `narrative_confidence` | text | `high` / `medium` / `low` |
| `life_notable_factors` | text[] | Structured tags from valid set |
| `birthplace_details` | text | Rich birthplace context (not just city name) |
| `family_background` | text | Parents, siblings, family circumstances |
| `education` | text | Schools, degrees, scholarships |
| `pre_fame_life` | text | Jobs, struggles, pivotal moments before fame |
| `fame_catalyst` | text | Single sentence: what catapulted them to recognition |
| `personal_struggles` | text | Addiction, legal, health, poverty, discrimination |
| `relationships` | text | Marriages, partnerships, children |
| `lesser_known_facts` | text[] | Array of surprising 1-2 sentence facts (the Nixon/Harvard moments) |
| `sources` | jsonb | Per-field source tracking (see format below) |
| `entity_links` | jsonb | Auto-detected entity links (reuse entity linker) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Source tracking JSONB format

Each field tracks which sources contributed to it, with publication metadata:

```json
{
  "narrative": [
    {
      "type": "wikipedia",
      "publication": "Wikipedia",
      "articleTitle": "Richard Nixon — Early life and education",
      "url": "https://en.wikipedia.org/wiki/Richard_Nixon#Early_life_and_education",
      "domain": "en.wikipedia.org",
      "confidence": 0.85,
      "reliabilityScore": 0.85,
      "retrievedAt": "2026-02-17T..."
    },
    {
      "type": "guardian",
      "publication": "The Guardian",
      "articleTitle": "The scholarship Nixon turned down that changed history",
      "url": "https://www.theguardian.com/...",
      "domain": "theguardian.com",
      "confidence": 0.72,
      "reliabilityScore": 0.95,
      "retrievedAt": "2026-02-17T..."
    }
  ],
  "education": [...],
  "lesser_known_facts": [...]
}
```

### Valid life notable factors

```
orphaned, adopted, foster_child, single_parent, poverty, wealth,
immigrant, refugee, military_service, war_veteran, combat_wounded,
pow, scholar, self_taught, dropout, child_star, child_labor,
incarcerated, wrongfully_convicted, addiction_recovery, disability,
chronic_illness, civil_rights_activist, political_figure, athlete,
multiple_careers, turned_down_fame, rags_to_riches, prodigy,
polyglot, clergy, royalty, nobility, espionage, survivor,
whistleblower, philanthropist
```

Only tags from this set are stored (validated in code, like death's `VALID_NOTABLE_FACTORS`).

---

## 2. Content Cleaning Pipeline

The current `htmlToText()` in `html-utils.ts` only strips `<script>`, `<style>`, and HTML tags. Ads, navigation, cookie banners, sidebars, comments, and "related articles" all pass through as tokens that pollute Claude's output and inflate cost.

### Three-stage cleaning architecture

#### Stage 1 — Mechanical pre-clean (free)

Runs before any AI processing. Pure regex/selector operations:

- Strip structural noise: `<script>`, `<style>`, `<noscript>`, `<iframe>`, `<svg>`, `<canvas>`
- For full web pages, extract article body via selector cascade:
  1. `<article>` or `[role="article"]`
  2. `[itemprop="articleBody"]` or `.article-body`
  3. `[role="main"]` or `<main>`
  4. `.entry-content`, `.post-content`, `.story-body`
  5. `#content`, `.content` (last resort)
  6. `<body>` after structural removal (fallback)
- Remove by selector: `nav`, `header`, `footer`, `aside`, `.sidebar`, `.ad`, `.cookie-banner`, `.newsletter`, `.comments`, `.related-articles`, `.social-share`, `.breadcrumb`, `.pagination`
- Extract metadata: `<title>`, `og:site_name`, `<meta name="author">`, `<time datetime>`
- Strip remaining HTML tags, decode HTML entities
- Remove citation markers: `[1]`, `[2]`, `[edit]`, `[citation needed]`
- Collapse whitespace
- Strip code fragments (existing `looksLikeCode` detection)

**Goal:** Get from raw HTML to rough text cheaply. A 50KB page → ~10-15KB.

#### Stage 2 — AI content extraction (Haiku, ~$0.003/page)

Receives mechanically-cleaned text + extracted metadata. Uses Haiku (cheapest capable model) to understand context and extract only biographical content.

**Prompt:**
```
You are extracting biographical content about {actorName} from a web page.

Source: {publication} — "{articleTitle}"
URL: {url}

Raw content:
{mechanicallyCleaned}

EXTRACT only text that relates to this person's:
- Childhood, family background, upbringing
- Education, scholarships, academic life
- Personal relationships, marriages, children
- Pre-fame jobs, struggles, pivotal life moments
- Military service, legal issues, health challenges
- Personality traits, hobbies, lesser-known facts
- What launched them into public life

REMOVE completely:
- Ads, promotions, newsletter signups
- Navigation text, cookie notices, legal boilerplate
- Filmography lists, award lists, box office numbers
- "Related articles" / "You might also like"
- Social media buttons/text
- Comments from other users
- HTML artifacts, JavaScript fragments
- Repetitive career achievement lists

Return JSON:
{
  "extracted_text": "Clean biographical text only",
  "article_title": "Actual article title",
  "publication": "Publication name",
  "author": "Author if found",
  "publish_date": "Date if found",
  "relevance": "high|medium|low|none",
  "content_type": "obituary|profile|news|biography|interview|other"
}

If the page contains NO biographical information about this person,
return relevance: "none" and extracted_text: null.
```

**Gate:** Only `relevance: "high"` or `"medium"` results pass to Stage 3. This prevents sending irrelevant pages to the expensive final synthesis.

**Bonus outputs:** Article title, publication name, author, and content type are extracted here for source attribution, essentially for free.

#### Stage 3 — Final synthesis (Opus or Sonnet)

Receives only clean, relevant, pre-filtered input. Token count is ~20-30% of what it would be without the pipeline.

**Cost comparison per actor (5 web sources + Wikipedia):**

| Approach | Input to final Claude | Est. cost |
|----------|----------------------|-----------|
| No cleanup (current death enrichment pattern) | ~60K tokens of noise | ~$0.90+ |
| Regex-only cleanup | ~30K tokens (still noisy) | ~$0.45+ |
| Three-stage pipeline | ~10-15K tokens (focused) | ~$0.17-0.27 total |

#### Backport opportunity

Stages 1 and 2 can be backported to death enrichment to improve quality and cut costs there too.

---

## 3. Source Pipeline

### Wikipedia flow (AI-assisted section selection)

Wikipedia articles have non-uniform section names. We reuse the existing Gemini Flash section selector pattern from death enrichment, but with a biography-focused prompt:

```
Wikipedia article for "Richard Nixon"
  │
  ├─ Fetch section list (free, MediaWiki API)
  │   → 1. Early life  2. Naval career  3. Congressional career
  │     4. Vice presidency ... 27. Personal life  28. Health and death
  │     29. Legacy  30. Awards and honors  31. Electoral history ...
  │
  ├─ AI section selection (Gemini Flash, ~$0.0001)
  │   Prompt: "Select sections about this person's LIFE — childhood,
  │   family, education, personal struggles, relationships, hobbies,
  │   military service, religion, pre-fame life, lesser-known facts..."
  │   → ["Early life", "Naval career", "Personal life"]
  │   (Skips: presidency, legacy, awards, electoral history)
  │
  ├─ Fetch selected sections (free, MediaWiki API)
  └─ Stage 1 mechanical pre-clean
```

### Full source priority order

Sources are chosen for their suitability for personal/biographical information, not death information.

#### Phase 1: Structured Data (free)

| Source | What it gives us | Reliability |
|--------|-----------------|-------------|
| **Wikidata** | Birthplace, education (P69), spouse (P26), children (P40), military branch (P241), religion (P140), occupation history | 1.0 |
| **Wikipedia** (AI section selection) | Early life, Personal life, Education, Family, Military service sections | 0.85 |
| **TMDB biography** | Raw bio (already stored in `biography_raw_tmdb`) | 0.35 |

#### Phase 2: Biographical Reference (free)

| Source | What it gives us | Reliability |
|--------|-----------------|-------------|
| **Britannica** | Curated biographical articles | 0.95 |
| **Biography.com** | Profile-style content, explicitly personal-life focused | 0.8 |

#### Phase 3: Web Search — targeted biographical queries

| Source | Reliability |
|--------|-------------|
| **Google Search** | 0.7 (aggregator) |
| **Bing Search** | 0.7 |
| **Brave Search** | 0.7 |
| **DuckDuckGo** | 0.7 (free fallback) |

Search query templates (different from death enrichment):
- `"{name}" childhood "grew up" education`
- `"{name}" "before fame" OR "early career" OR "first job"`
- `"{name}" family parents siblings`
- `"{name}" interview personal life`
- `"{name}" "little known" OR "lesser known" OR "fun fact"`

#### Phase 4: News & Profile Pieces

| Source | Why good for biography | Reliability |
|--------|----------------------|-------------|
| **The Guardian** | Long-form profiles, interview pieces | 0.95 |
| **New York Times** | Obituaries are mini-biographies, profiles | 0.95 |
| **AP News** | Factual biographical summaries | 0.95 |
| **BBC News** | Profiles, especially British actors | 0.95 |
| **People Magazine** | Personal life is literally their focus | 0.65 |

#### Phase 5: Obituary Sources

Obituaries often contain the richest personal details — childhood, education, family.

| Source | Reliability |
|--------|-------------|
| **Legacy.com** | 0.6 |
| **Find a Grave** | 0.35 |

#### Phase 6: Archives

| Source | Value | Reliability |
|--------|-------|-------------|
| **Internet Archive** | Historical interviews, magazine profiles | 0.7 |
| **Chronicling America** | Pre-1963 newspaper features | 0.9 |
| **Trove** | Australian newspaper archives | 0.9 |
| **Europeana** | European archives | 0.9 |

#### Phase 7: AI Models (fallback)

Same as death enrichment: Gemini Flash → Groq → GPT-4o Mini → etc. by ascending cost. Reliability: 0.55.

#### Sources deliberately excluded

| Source | Why |
|--------|-----|
| TMZ | Gossip/scandal, not biographical depth |
| Deadline, Variety, Hollywood Reporter | Trade press — career/industry focused |
| BFI Sight & Sound | Film criticism |
| FamilySearch | Genealogy dates, not narrative |
| News RSS feeds | Too current-events focused |

### Biographical confidence calculation

Instead of death keywords, confidence is based on:
- Personal life keywords: childhood, grew up, parents, school, education, married, family, siblings
- Pre-fame keywords: before acting, first job, struggled, poverty, scholarship, military, served
- Lesser-known fact indicators: "few people know", "little known", "surprisingly", "before fame"
- Name match: text must mention the target person

### Stopping logic

Same dual-threshold (confidence + reliability) as death enrichment. Confidence threshold of 0.6-0.7 (higher than death's 0.5) since we want richer content. Tunable based on golden test case results.

---

## 4. Claude Synthesis Prompt

The final-stage prompt receives clean, pre-filtered source material and produces the biography. It mirrors `claude-cleanup.ts` but with entirely different narrative goals.

```
You are writing a biography for {actorName} (born {birthYear}{, died {deathYear}}).

This biography is for a website that tracks deceased actors, but the
biography section should read like a biography of a PERSON, not a
celebrity profile. Think of how you'd describe anyone's life — their
childhood, their family, their struggles, what made them who they were
— and only mention their career the way you'd mention anyone's job.

Source material (pre-cleaned, sorted by reliability):

--- {sourceName} ({publication}, reliability: {score}%) ---
{cleanedText}

--- {sourceName2} ({publication2}, reliability: {score2}%) ---
{cleanedText2}

[...]

STRUCTURED DATA (from Wikidata):
- Birthplace: {birthplace}
- Education: {education}
- Spouse(s): {spouses}
- Children: {children}
- Military service: {military}
- Religion: {religion}

Return JSON:
{
  "narrative_teaser": "2-3 sentences — the most compelling snapshot
    of this person's life. This is shown before 'show more'. Lead
    with whatever is most surprising, human, or little-known. Make
    the reader want to learn more. Do NOT start with birth info.",

  "narrative": "Full biography. Adaptive length: as short as 2
    paragraphs for obscure people with thin sources, up to 5
    paragraphs for well-documented lives. Structure guidance below.",

  "life_notable_factors": ["tags from the VALID set"],

  "birthplace_details": "Rich context about where they grew up —
    not just 'Yorba Linda, California' but the character of the
    place and their family's situation there. Null if no detail.",

  "family_background": "Parents, siblings, family circumstances.
    Null if unknown.",

  "education": "Schools, degrees, scholarships — including ones
    turned down. Null if unknown.",

  "pre_fame_life": "What they did before the public knew them.
    Jobs, struggles, pivotal moments. Null if unknown.",

  "fame_catalyst": "What single thing catapulted them into public
    recognition? One sentence. Null if unclear.",

  "personal_struggles": "Addiction, legal issues, health, poverty,
    discrimination, family tragedy. Null if none documented.",

  "relationships": "Marriages, significant partnerships, children.
    Null if unknown.",

  "lesser_known_facts": ["Array of surprising facts the general
    public probably doesn't know. Each 1-2 sentences. Empty if
    none found."],

  "narrative_confidence": "high|medium|low",

  "has_substantive_content": true/false
}

NARRATIVE STRUCTURE:
- Open with childhood/family background, NOT "born on [date] in [city]"
  (birth info is displayed separately on the page)
- Weave in education, early struggles, formative experiences
- Mention what launched them into public life in 1-2 sentences MAX —
  the filmography section below the biography handles the career
- Include personal life: relationships, family, challenges
- For primarily-famous-for-their-public-role figures (politicians,
  war criminals, historical figures), their public role IS their
  personal story — adjust accordingly
- End with something human, not a career summary
- VARY openings — don't start every biography the same way

TONE:
- Write like a thoughtful long-form journalist, not an encyclopedia
- Factual but warm — these are people's lives
- No superlatives: avoid "renowned", "acclaimed", "legendary",
  "beloved", "masterful"
- No Wikipedia-isms: avoid "is widely regarded as", "is best known for"
- Specific details over vague praise: "worked double shifts at a
  grocery store" beats "had a difficult childhood"

TEASER QUALITY:
- The teaser is shown before "show more" — it must hook the reader
- Lead with whatever is most surprising, human, or little-known
- Bad: "John Smith was born in Ohio and attended college."
- Good: "Before he became a household name, John Smith spent three
  years as a coal miner to support his family after his father's
  death — an experience he said shaped every role he ever played."

LESSER_KNOWN_FACTS (the bar to clear):
- "Richard Nixon received a scholarship to Harvard but turned it
   down because his mother needed help at the family store"
- "Before acting, Jimmy Stewart was an architecture student at
   Princeton and designed a model airplane that won a national contest"
- "Audrey Hepburn was a courier for the Dutch Resistance during
   WWII as a teenager"
NOT lesser-known: "Won an Academy Award" (that's fame, not life)

VALID LIFE NOTABLE FACTORS:
[orphaned, adopted, foster_child, single_parent, poverty, wealth,
immigrant, refugee, military_service, war_veteran, combat_wounded,
pow, scholar, self_taught, dropout, child_star, child_labor,
incarcerated, wrongfully_convicted, addiction_recovery, disability,
chronic_illness, civil_rights_activist, political_figure, athlete,
multiple_careers, turned_down_fame, rags_to_riches, prodigy,
polyglot, clergy, royalty, nobility, espionage, survivor,
whistleblower, philanthropist]

WHEN SOURCES CONFLICT:
- Prefer higher reliability sources
- If a fact appears in only one low-reliability source, mark
  narrative_confidence as "medium" or "low"
- Never present disputed facts as certain

CRITICAL:
- Do NOT list filmography, awards, box office numbers
- Do NOT include birth/death dates (displayed separately)
- Mention their career only as context for their personal story
- If sources are thin, write a shorter biography rather than
  padding with career achievements
- Set has_substantive_content to false if you can only produce
  a generic career summary with no personal details
```

---

## 5. Frontend Display

### Teaser / expand pattern

For biographies longer than ~300 characters, show the `narrative_teaser` with a "Show more" button. On click/tap, expand to show the full `narrative`. Same UX pattern used for death circumstances.

For short biographies (under ~300 chars), display the full narrative directly with no expand control.

### Source attribution

Display sources below the biography with publication name, article title, and link:

```
Sources: Wikipedia · The Guardian, "The scholarship Nixon turned down" · AP News
```

Each source links to its URL. The `sources` JSONB provides all the metadata needed.

### Lesser-known facts

Display `lesser_known_facts` as a distinct visual element — perhaps a callout box or "Did you know?" section — to highlight the unique personal details that differentiate this biography.

### Life notable factors

Display as tags/pills (similar to death notable factors). These also enable future discovery pages like "Actors who served in WWII" or "Child stars".

---

## 6. Golden Test Cases & Quality Iteration

### Test case dataset

Actors with known lesser-known facts we can verify appeared in the generated biography:

| Actor | Known fact | Expected factors |
|-------|-----------|-----------------|
| Richard Nixon | Turned down Harvard scholarship for family store | `scholar`, `political_figure` |
| Jimmy Stewart | Princeton architecture student, model airplane contest, WWII bomber pilot | `military_service`, `war_veteran`, `scholar` |
| Audrey Hepburn | Dutch Resistance courier, near-starvation during WWII | `survivor`, `war_veteran` |
| Christopher Lee | WWII SAS/SOE, witnessed last public guillotine execution | `military_service`, `espionage` |
| Steve McQueen | Reform school, ran away to join Marines at 17 | `incarcerated`, `military_service` |
| Hedy Lamarr | Co-invented frequency-hopping (basis for WiFi/Bluetooth) | `prodigy`, `multiple_careers` |
| James Earl Jones | Severe childhood stutter, nearly mute until high school | `disability` |

### Automated scoring

```typescript
interface GoldenTestCase {
  actorId: number
  actorName: string
  expectedFacts: string[]          // Facts that SHOULD appear
  expectedFactors: string[]        // life_notable_factors that SHOULD be tagged
  unexpectedContent: string[]      // Things that should NOT appear
}

interface TestResult {
  actorName: string
  factsFound: number
  factsMissed: string[]
  factorsCorrect: number
  unwantedContent: string[]
  teaserQuality: 'compelling' | 'generic' | 'career_focused'
  narrativeLength: number
  score: number                    // 0-100 composite
}
```

After each run, auto-score against golden cases:
- **Fact recall rate:** Did Nixon/Harvard make it in?
- **False content rate:** Did filmography sneak in?
- **Teaser quality:** Does it lead with personal info or career?
- **Notable factors accuracy:** Correct tags applied?

### Iteration loop

1. Run enrichment on golden test cases
2. Auto-score results
3. Review failures → adjust prompt, source priority, or cleaning pipeline
4. Re-run, compare scores
5. Once golden cases pass at >80% fact recall, run broader batch
6. Admin staging review for broader batch (reuse existing `actor_enrichment_staging` workflow)
7. Approve/reject, feed learnings back into prompt

---

## 7. Architecture Summary

### Directory structure

```
server/src/lib/biography-sources/        # New, mirrors death-sources/
├── orchestrator.ts                      # Source orchestration (forked from death-sources)
├── base-source.ts                       # Caching, rate limiting (forked)
├── types.ts                             # BiographyResult, BiographyData, config types
├── content-cleaner.ts                   # Three-stage cleaning pipeline (NEW)
├── claude-cleanup.ts                    # Final synthesis prompt
├── wikipedia-section-selector.ts        # Biography-focused section selection
├── sources/
│   ├── wikidata.ts                      # SPARQL for biographical structured data
│   ├── wikipedia.ts                     # Full article, AI section selection
│   ├── britannica.ts                    # NEW source
│   ├── biography-com.ts                # NEW source
│   ├── web-search-base.ts              # Shared web search (adapted queries)
│   ├── google-search.ts                # Biographical query templates
│   ├── bing-search.ts
│   ├── brave-search.ts
│   ├── duckduckgo.ts
│   ├── guardian.ts
│   ├── nytimes.ts
│   ├── ap-news.ts
│   ├── bbc-news.ts
│   ├── people.ts
│   ├── legacy.ts                       # Obituaries (rich personal detail)
│   ├── findagrave.ts
│   ├── internet-archive.ts
│   ├── chronicling-america.ts
│   ├── trove.ts
│   └── europeana.ts
└── ai-providers/                        # Fallback AI models (same as death)

server/src/lib/biography/                # Existing, extended
├── biography-generator.ts               # Existing single-actor generation (legacy)
├── wikipedia-fetcher.ts                 # Existing Wikipedia intro fetcher
└── golden-test-cases.ts                 # NEW: test case definitions + scoring

server/src/lib/jobs/handlers/
├── enrich-biographies.ts               # NEW: batch biography enrichment job
└── generate-biographies-batch.ts        # Existing batch generation (legacy)

server/migrations/
├── XXXX_add-biography-details-table.cjs
└── XXXX_add-biography-legacy-column.cjs
```

### Data flow

```
Orchestrator.enrichBiographyBatch(actors[])
  └─ For each actor:
      ├─ Phase 1: Structured data (free)
      │   ├─ Wikidata SPARQL → structured facts
      │   ├─ Wikipedia → AI section selection → fetch sections
      │   └─ TMDB raw bio (already in DB)
      │
      ├─ Phase 2-6: Additional sources by priority
      │   └─ Each source result goes through:
      │       ├─ Stage 1: Mechanical pre-clean (free)
      │       ├─ Stage 2: Haiku AI extraction (~$0.003/page)
      │       │   → Returns: clean text + metadata + relevance score
      │       │   → Gate: relevance "none"/"low" → discard
      │       └─ Cache cleaned result
      │
      ├─ Confidence/reliability threshold check → stop if met
      │
      ├─ Stage 3: Claude synthesis (Opus/Sonnet)
      │   → Receives only high/medium relevance clean extracts
      │   → Produces: narrative, teaser, structured fields,
      │     life_notable_factors, lesser_known_facts
      │
      ├─ Write to production or staging
      │   ├─ actor_biography_details upsert
      │   ├─ actors.biography = narrative_teaser (for API compat)
      │   ├─ actors.biography_legacy = old biography (first run only)
      │   └─ Invalidate actor cache
      │
      └─ Score against golden test cases (if applicable)

Cost per actor: ~$0.17-0.27
  - Gemini Flash section selector: ~$0.0001
  - Haiku cleanup × ~6 sources:    ~$0.018
  - Final synthesis (Opus):         ~$0.15-0.25
```

### Reusable infrastructure from death enrichment

| Component | Reuse strategy |
|-----------|---------------|
| `BaseDataSource` (caching, rate limiting, timeout) | Fork and adapt |
| Source reliability tiers / RSP scoring | Reuse directly |
| Orchestrator dual-threshold stopping | Fork and adapt confidence keywords |
| `EnrichmentSourceEntry` tracking | Reuse type, extend for biography fields |
| Entity linker | Reuse directly for narrative text |
| Admin staging/approval workflow | Reuse existing `actor_enrichment_staging` pattern |
| AI usage tracking | Reuse directly |
| BullMQ job infrastructure | Reuse existing queue/worker pattern |

### New infrastructure

| Component | Purpose |
|-----------|---------|
| `content-cleaner.ts` | Three-stage cleaning pipeline (backportable to death enrichment) |
| Haiku extraction stage | AI-powered content filtering before final synthesis |
| Biography-focused Wikipedia section selector prompt | Different sections than death |
| Biography-focused web search query templates | Personal life queries |
| Golden test case scorer | Automated quality measurement |
| `actor_biography_details` table | Structured biography storage |
