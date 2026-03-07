# SEO Person Schema Enhancement via Biography Enrichment

## Goal

Enhance the schema.org Person markup on actor pages by extracting structured SEO fields (alternate names, gender, nationality, occupations, awards) during biography enrichment. Remove the redundant `BiographyLifeDetails` UI component. Enable alternate-name search.

## Context

PR #557 (v5.1.0) added a `BiographyLifeDetails` component that renders structured biography fields (birthplace, family, education, etc.) below the narrative. These fields largely duplicate the narrative content and don't add standalone value as UI text. However, the Claude prompt already extracts them, and they're useful as structured data for SEO.

The existing `buildPersonSchema()` emits a minimal Person schema (name, birthDate, deathDate, birthPlace, image, jobTitle="Actor"). Google's structured data guidelines support many more Person properties that would improve search visibility.

## Design

### New Fields

Add 5 new fields to `BiographyData` and the Claude synthesis prompt:

| Field | Type | Claude Prompt Instruction |
|-------|------|--------------------------|
| `alternateNames` | `string[]` | Stage names, maiden names, nicknames, birth names if different |
| `gender` | `string \| null` | "male", "female", "non-binary", or null |
| `nationality` | `string \| null` | Primary nationality (e.g., "American", "British-American") |
| `occupations` | `string[]` | All known occupations beyond acting (politician, inventor, pilot, etc.) |
| `awards` | `string[]` | Notable awards — max 5, only if clearly sourced |

The `awards` field relaxes the existing prompt rule that bans award names from the biography. Awards will be extracted as structured metadata but remain banned from the narrative text.

### Data Sources

| Field | Claude | Wikidata | TMDB |
|-------|--------|----------|------|
| `alternateNames` | Yes — from source text | P742 (pseudonym) + `also_known_as` | `also_known_as` field |
| `gender` | Yes — from source text | P21 (sex or gender) | `gender` field (numeric) |
| `nationality` | Yes — from source text | P27 (country of citizenship) | — |
| `occupations` | Yes — from source text | P106 (occupation) | `known_for_department` |
| `awards` | Yes — from source text | P166 (award received) | — |

### Database Changes

Migration adds columns to `actor_biography_details`:
- `alternate_names text[]`
- `gender text`
- `nationality text`
- `occupations text[]`
- `awards text[]`

Denormalized on `actors` table:
- `alternate_names text[]` (for search performance)

### Schema.org Person Output

| Property | Source | Status |
|----------|--------|--------|
| `name` | `actors.name` | Existing |
| `alternateName` | `actor_biography_details.alternate_names` | **New** |
| `gender` | `actor_biography_details.gender` | **New** |
| `nationality` | `actor_biography_details.nationality` | **New** |
| `jobTitle` | `actors.known_for_department` → mapped label | **Fix** (was hardcoded "Actor") |
| `hasOccupation` | `actor_biography_details.occupations` | **New** |
| `alumniOf` | `actor_biography_details.education` | **New** |
| `award` | `actor_biography_details.awards` | **New** |
| `birthDate` | `actors.birthday` | Existing |
| `deathDate` | `actors.deathday` | Existing |
| `birthPlace` | `actors.place_of_birth` | Existing |
| `description` | `actors.biography` | Existing |
| `image` | TMDB profile path | Existing |
| `url` | Site URL | Existing |
| `sameAs` | TMDB URL | Existing |

### UI Changes

- **Remove** `BiographyLifeDetails.tsx` + test — structured fields no longer rendered below narrative
- **Remove** integration in `BiographySection.tsx`
- **Keep** `lesserKnownFacts` display as-is (genuinely additive content)
- Structured fields continue to be extracted by Claude and stored — just not rendered

### Search Enhancement

Add `actors.alternate_names` to the search query so users can find actors by stage names, maiden names, or nicknames via the search box.

### Version

Bump `BIO_ENRICHMENT_VERSION` to `"6.0.0"` — new fields require re-synthesis to populate.

Re-synthesize actors with version < 6.0.0 using the existing `resynthesize-biographies.ts` script.

## Files to Modify

| File | Change |
|------|--------|
| `server/migrations/{ts}_add-biography-seo-fields.cjs` | New columns |
| `server/src/lib/biography-sources/types.ts` | Add fields to `BiographyData` |
| `server/src/lib/biography-sources/claude-cleanup.ts` | Add fields to prompt JSON schema |
| `server/src/lib/biography-enrichment-db-writer.ts` | Write new columns |
| `server/src/lib/biography-sources/sources/wikidata.ts` | Add P106, P742, P166 to SPARQL |
| `server/src/lib/enrichment-version.ts` | Bump to 6.0.0 |
| `src/utils/schema.ts` | Enhance `buildPersonSchema()` |
| `server/src/lib/prerender/schema.ts` | Same for server-side |
| `server/src/routes/actor.ts` | Pass new fields to schema builder |
| `server/src/routes/search.ts` | Add alternate_names to search query |
| `src/components/actor/BiographySection.tsx` | Remove BiographyLifeDetails |
| `src/components/actor/BiographyLifeDetails.tsx` | Delete |
| `src/components/actor/BiographyLifeDetails.test.tsx` | Delete |
| `src/types/actor.ts` | Add new fields to BiographyDetails |
