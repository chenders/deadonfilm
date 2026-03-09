# Plan 08: Editorial Content / Blog

**Impact: Medium | Effort: Large | Dependencies: #1 (pre-rendering), #4 (authority pages establish credibility)**

## Problem

Dead on Film has a unique dataset — mortality statistics, actuarial calculations, curse scores — that no competitor offers. But this data exists only in structured page formats (actor profiles, movie pages). There is no long-form editorial content that:

- Targets featured snippet opportunities (Google's answer boxes)
- Captures long-tail informational queries ("which movie has the most dead actors")
- Provides shareable, linkable content for backlink acquisition
- Demonstrates expertise through analysis and narrative
- Attracts users who search for stories, not just data lookups

## Solution

Create an `/articles` section with long-form editorial content powered by the site's data. Articles combine narrative writing with embedded data from the Dead on Film database.

### Content Categories

**Data Stories** (highest SEO value):
- "The 10 Movies Where the Most Cast Members Have Died"
- "Which Decade Lost the Most Hollywood Talent?"
- "The Deadliest TV Shows: Cast Mortality Rankings"

**Myth Busting** (featured snippet targets):
- "The Poltergeist Curse: What the Statistics Actually Show"
- "Is the Superman Curse Real? An Actuarial Analysis"
- "Do Horror Movie Actors Die Younger? We Checked."

**Methodology Deep Dives** (E-E-A-T signals):
- "How We Calculate Expected Death Rates for Movie Casts"
- "Understanding Actuarial Life Tables: The Math Behind Dead on Film"
- "Why Some Movies Appear 'Cursed': A Statistical Explanation"

**Timely/Cultural** (social sharing potential):
- Oscar season roundups: "Best Picture Nominees: Cast Mortality Comparison"
- Anniversary pieces: "The Godfather at 55: A Cast Mortality Update"
- Notable death coverage: "Remembering [Actor]: Their Filmography Legacy"

### Article Structure

Each article should include:
- 1000-2000 words of narrative content
- Embedded data visualizations or tables from the site's database
- Internal links to relevant actor, movie, and show pages (critical for Recommendation #6)
- Proper meta tags, OG images, and structured data (Article schema)
- Author attribution (ties into E-E-A-T)
- Published and updated dates

### Content Management

Articles can be stored as:
- **Option A**: Markdown files in the repo, compiled at build time (simplest)
- **Option B**: Database entries managed through an admin interface (more flexible)
- **Option C**: Headless CMS integration (most complex, least recommended)

**Recommendation**: Start with Option A (Markdown) for the first 5-10 articles. Evaluate whether a CMS is needed based on publishing frequency.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/ArticlesListPage.tsx` | Create | Article index page |
| `src/pages/ArticlePage.tsx` | Create | Individual article renderer |
| `src/App.tsx` | Modify | Add `/articles` and `/articles/:slug` routes |
| `content/articles/` | Create (directory) | Markdown article files |
| `src/utils/schema.ts` | Modify | Add Article JSON-LD builder |
| `server/src/lib/sitemap-generator.ts` | Modify | Add articles to sitemap |
| `src/components/layout/Header.tsx` | Modify | Add Articles link to navigation |

## Implementation Notes

- Start with 3-5 "evergreen" data stories that don't require frequent updates
- Each article needs unique, compelling meta descriptions (not auto-generated)
- Use `<article>` semantic HTML for the content area
- Include `datePublished` and `dateModified` in Article schema
- Add "Related Articles" section at the bottom of each article
- Cross-link extensively to content pages (this is a major internal linking opportunity)
- Consider implementing a simple reading time estimate
- Don't auto-generate articles — the content should be genuinely insightful and well-written

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Article organic traffic | GA | 0 | 100+ monthly sessions in 90 days |
| Featured snippet appearances | GSC | 0 | At least 1 in 90 days |
| Backlinks to articles | GSC Links | 0 | Any backlinks indicate success |
| Time on page | GA | N/A | > 3 minutes average |
| Internal link clicks from articles | GA Events | 0 | > 20% of article visitors click through |
| Article keyword rankings | GSC Performance | None | Top 20 for target keywords |
