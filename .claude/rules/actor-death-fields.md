# Actor Death Fields

How each user-displayed death field is set, changed, and guarded.

## `actors` Table — Core Death Fields

### `deathday` (date)
- **Set by**: TMDB API during actor sync (`seed-deceased-actors.ts`, `sync-tmdb-changes.ts`)
- **Updated by**: Admin enrichment review/approval; enrichment script if deathday was missing
- **Displayed**: Movie cards, actor profile, death page, discovery pages

### `cause_of_death` (text)
- **Set by**: Enrichment script (`enrich-death-details.ts`) via Claude cleanup, or Claude batch API (`actor-updater.ts`)
- **Updated by**: Re-enrichment (only if actor doesn't already have one — see `enrich-death-details.ts` guard); admin review/approval from staging
- **Guard**: Enrichment skips writing if actor already has a value (unless re-enrichment mode)
- **Displayed**: Death cards, actor profile, death page, discovery pages

### `cause_of_death_details` (text)
- **Set by**: Enrichment script via Claude cleanup (short 2-4 sentence summary)
- **Updated by**: Re-enrichment; admin review/approval
- **Displayed**: Death card expanded view, death page

### `death_manner` (text enum: natural, accident, suicide, homicide, undetermined, pending)
- **Set by**: Claude cleanup during enrichment (`deathManner` field); Claude batch API; `sync-actor-death-fields.ts` via `cause_manner_mappings` table
- **Updated by**: Sync script (from cause_manner_mappings), enrichment re-runs
- **Guard**: Sync script will NOT downgrade a specific manner (homicide/suicide/accident/natural) to 'undetermined'. Enrichment writer infers manner from categories if manner is null/undetermined but categories contain a manner slug.
- **Displayed**: Death page, unnatural deaths discovery page

### `death_categories` (text[])
- **Set by**: `sync-actor-death-fields.ts` via `computeCategories(cause, manner)` — combines manner-based categories (suicide, homicide, accident) with text pattern matching from `CAUSE_CATEGORIES`
- **Updated by**: Sync script recomputes for all actors with `cause_of_death` on every run; enrichment writer
- **Guard**: Only updates rows where computed value differs from current
- **Displayed**: Death page (category tags), used for filtering on discovery pages

### `violent_death` (boolean)
- **Set by**: Derived from `death_manner` via `isViolentDeath()` — true if manner is homicide, suicide, or accident
- **Updated by**: Enrichment script; fix scripts
- **Guard**: NULL if no death_manner data
- **Displayed**: Not directly shown; used for filtering on unnatural deaths discovery page

### `covid_related` (boolean)
- **Set by**: `sync-actor-death-fields.ts` via pattern match on `cause_of_death` (checks for "covid", "coronavirus", "sars-cov")
- **Updated by**: Sync script (only sets false→true, never true→false)
- **Displayed**: Not directly shown; used for COVID deaths discovery page filter

### `strange_death` (boolean)
- **Set by**: Claude batch API (`actor-updater.ts`) based on Claude's assessment of unusual/notable circumstances
- **Updated by**: Claude batch re-runs
- **Displayed**: Notable deaths page (filter/styling), death page

### `age_at_death` (integer)
- **Set by**: `sync-actor-death-fields.ts` via `calculateYearsLost()` from birthday + deathday + actuarial cohort tables
- **Updated by**: Sync script (only when NULL)
- **Displayed**: Movie cards, actor profile, death page, discovery pages

### `expected_lifespan` (numeric)
- **Set by**: `sync-actor-death-fields.ts` via actuarial life tables
- **Updated by**: Sync script (only when NULL)
- **Displayed**: Lifespan visualization bar on death page

### `years_lost` (numeric)
- **Set by**: `sync-actor-death-fields.ts` — `expected_lifespan - age_at_death`
- **Updated by**: Sync script (only when NULL)
- **Displayed**: Death cards, actor profile, death page

### `has_detailed_death_info` (boolean)
- **Set by**: Enrichment script — true when circumstances or rumored_circumstances have substantive content (above minimum length thresholds)
- **Updated by**: Re-enrichment
- **Guard**: Claude's `has_substantive_content` must be true AND narrative must exceed minimum length. Prevents empty death pages.
- **Displayed**: Controls whether `/actor/{slug}/death` route is accessible (link shown on actor profile)

### `cause_of_death_source` / `cause_of_death_details_source` (text)
- **Set by**: Enrichment script (tracks which source: Wikipedia, Wikidata, Claude, etc.)
- **Not displayed** to end users

### `deathday_precision` (text enum: year, month, day)
- **Set by**: `sync-actor-death-fields.ts` — sets to 'day' for all actors with full deathday dates
- **Not displayed** directly; affects date formatting

## `actor_death_circumstances` Table — Narrative Fields

All fields set by enrichment script via Claude cleanup or Claude batch API. One record per actor (upsert on `actor_id`). Updated by re-enrichment or admin review/approval.

### `circumstances` (text)
- Official narrative of how death occurred — factual prose
- **Displayed**: Death page main narrative section

### `circumstances_confidence` (text enum: high, medium, low, disputed)
- Claude's assessment of source reliability
- **Displayed**: Death page confidence indicator

### `rumored_circumstances` (text)
- Alternative theories, conspiracy theories for controversial deaths
- **Displayed**: Death page (separate section from official narrative)

### `location_of_death` (text)
- City/state/country where they died
- **Displayed**: Death page

### `notable_factors` (text[])
- Tags like: on_set, vehicle_crash, plane_crash, overdose, assassination, suspicious_circumstances, young_death, etc.
- **Guard**: Only tags in `VALID_NOTABLE_FACTORS` set are stored (prevents arbitrary tags from Claude)
- **Displayed**: Death page, notable deaths page

### `career_status_at_death` (text enum: active, semi-retired, retired, hiatus, unknown)
- **Displayed**: Death page career section

### `last_project` (jsonb: {title, year, tmdb_id, imdb_id, type})
- **Displayed**: Death page career section

### `posthumous_releases` (jsonb array)
- **Displayed**: Death page career section

### `related_celebrities` (jsonb array: [{name, relationship}])
- **Displayed**: Death page related section

### `additional_context` (text)
- Career context relevant to the death
- **Displayed**: Death page

### `entity_links` (jsonb)
- Auto-detected entity links in narrative fields (actor names → profile links)
- **Set by**: Entity linker during enrichment (exact + fuzzy matching)
- **Displayed**: Embedded as navigation links in death page narrative text

### `sources` (jsonb)
- Per-field source tracking: {type, url, confidence, retrievedAt}
- **Displayed**: Death page sources section (broken down by field)

## Write Paths Summary

| Path | Sets | When |
|------|------|------|
| TMDB sync | deathday, birthday | Actor discovery/sync |
| `sync-actor-death-fields.ts` | death_manner, death_categories, covid_related, deathday_precision, age_at_death, expected_lifespan, years_lost | Scheduled after enrichment |
| `enrich-death-details.ts` + Claude cleanup | cause_of_death, details, manner, categories, violent_death, has_detailed_death_info + all circumstances fields | Admin-triggered enrichment |
| Claude batch API (`actor-updater.ts`) | All actors fields + all circumstances fields including strange_death | Batch enrichment runs |
| `enrichment-db-writer.ts` → staging | Same as enrichment, but to staging tables | When enrichment uses review workflow |
| Admin approval (`approveEnrichment`) | Copies staging → production | Admin reviews and approves |
| Fix/backfill scripts | Targeted fields | One-off data fixes |
