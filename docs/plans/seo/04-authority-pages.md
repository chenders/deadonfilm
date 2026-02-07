# Plan 04: Authority & Trust Pages

**Impact: High | Effort: Small | Dependencies: #1 (pre-rendering ensures bots see content)**

## Problem

Dead on Film has zero informational pages explaining what the site is, how it works, where data comes from, or how mortality statistics are calculated. This is a significant E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) gap.

Google's Search Quality Rater Guidelines specifically flag content related to death and health topics as requiring strong E-E-A-T signals. Without authority pages, the site looks like an anonymous data dump with no credibility signals.

## Solution

Create four authority pages that establish expertise and build trust:

### 1. About Page (`/about`)

- What Dead on Film is and why it exists
- The team/creator behind it
- The site's mission: making mortality data accessible and meaningful
- How long the site has been running
- Contact information

### 2. FAQ Page (`/faq`)

- "How do you know when an actor has died?" (data sources: TMDB, Wikidata, Claude API)
- "How accurate is your data?" (verification process, multi-source confirmation)
- "Why does the death count differ from what I expect?" (archived footage exclusion, obscure filtering)
- "What is a 'curse score'?" (actuarial calculation explanation)
- "How often is data updated?" (TMDB sync frequency, death monitoring)
- Implement with FAQPage JSON-LD schema (ties into Recommendation #3)

### 3. Methodology Page (`/methodology`)

- How mortality statistics are calculated (expected deaths formula, actuarial tables)
- Source of actuarial data (US SSA life tables)
- How "years lost" is computed
- How "curse score" works
- How archived footage exclusion works (died >3 years before release)
- How obscure actor/movie filtering works
- This page turns the site's algorithmic approach into a credibility asset

### 4. Data Sources Page (`/data-sources`)

- TMDB: Where movie/show/actor data comes from
- Wikidata SPARQL: Death information verification
- Claude API: Cause-of-death enrichment
- SSA Actuarial Life Tables: Mortality statistics basis
- How sources are prioritized and cross-referenced
- Data freshness and update frequency

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/AboutPage.tsx` | Create | About page component |
| `src/pages/FaqPage.tsx` | Create | FAQ page with FAQPage schema |
| `src/pages/MethodologyPage.tsx` | Create | Mortality calculation methodology |
| `src/pages/DataSourcesPage.tsx` | Create | Data source documentation |
| `src/App.tsx` | Modify | Add routes for all four pages |
| `src/components/layout/Footer.tsx` | Modify | Add links to authority pages |
| `src/components/layout/Header.tsx` | Modify | Consider adding to main navigation |
| `server/src/lib/sitemap-generator.ts` | Modify | Add authority pages to sitemap |

## Implementation Notes

- Use the existing page layout patterns and Tailwind styling
- Each page needs unique, descriptive meta tags via `react-helmet-async`
- The FAQ page should use FAQPage JSON-LD schema for rich result eligibility
- The Methodology page should reference actual code logic (e.g., the curse score formula) to demonstrate technical expertise
- Link between authority pages and relevant content pages (e.g., Methodology links to a movie page showing curse score)
- These pages should be accessible from the footer on every page

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Brand query impressions | GSC Performance | Measure before | +25% in 60 days |
| Authority page traffic | GA | 0 | Measurable organic traffic in 30 days |
| Bounce rate | GA | N/A | < 60% on authority pages |
| Backlinks to authority pages | GSC Links | 0 | Any backlinks indicate success |
| FAQ rich results | GSC Rich Results | 0 | Eligible within 30 days of indexing |
