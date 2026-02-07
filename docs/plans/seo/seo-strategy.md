# SEO Strategy & Analytics Monitoring Plan for Dead on Film

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [The 10 Recommendations](#2-the-10-recommendations)
3. [Things to STOP Doing / Avoid](#3-things-to-stop-doing--avoid)
4. [Ad Campaign Suggestions](#4-ad-campaign-suggestions)
5. [Measurement Framework](#5-measurement-framework)

---

## 1. Current State Assessment

### Architecture

Dead on Film is a pure client-side single-page application (SPA) built with React 18, TypeScript, and Vite. The Express.js backend serves the API and static files, but **all page content is rendered client-side**. PostgreSQL 16 stores the data, with Redis caching for performance. The site runs on a VPS with full server access.

### What's Working Well

**Sitemaps**: Comprehensive sitemap generation via `server/src/lib/sitemap-generator.ts` covers actors, movies, shows, and episodes with proper `lastmod`, `changefreq`, and `priority` values. The sitemap index correctly partitions large entity sets into multiple sitemaps.

**Meta tags**: `react-helmet-async` provides per-page `<title>`, `<meta name="description">`, and Open Graph tags throughout the app. Each content type (actor, movie, show, episode) has tailored meta content.

**Structured data**: JSON-LD schemas are implemented in `src/utils/schema.ts` and rendered via `src/components/seo/JsonLd.tsx`. Current schemas include Movie, Person, WebSite, and BreadcrumbList.

**Clean URLs**: Human-readable slug-based URLs (`/actor/john-wayne-2157`, `/movie/the-godfather-1972-238`) with proper 301 redirects for legacy patterns.

**Analytics**: Google Analytics is integrated via `src/hooks/useGoogleAnalytics.ts`. New Relic APM and Browser monitoring are active. Custom page visit tracking exists in `server/src/routes/admin/page-views.ts` with an admin dashboard at `/admin/analytics`.

**Performance**: Redis caching with centralized key management (`server/src/lib/cache.ts`), efficient database queries with batch lookups, and proper cache invalidation patterns.

### The Critical Gap

**Search engine crawlers see an empty page.** When Googlebot (or any bot that doesn't execute JavaScript) requests any page on Dead on Film, the response is:

```html
<!doctype html>
<html>
  <head><!-- static meta only --></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

While Googlebot *can* execute JavaScript, it does so in a deferred rendering queue that can take days to weeks. This means:
- New content may not appear in search results for weeks after publication
- Crawl budget is wasted on re-rendering existing pages
- Dynamic meta tags set by `react-helmet-async` may not be reliably indexed
- JSON-LD structured data injected client-side may be missed or delayed
- Google's "mobile-first" indexing sees the empty shell first

This is the single biggest SEO issue. Everything else is optimization on top of a broken foundation.

### Other Gaps

| Gap | Impact |
|-----|--------|
| Zero Core Web Vitals measurement | Can't track or improve ranking signals |
| No TVSeries/TVEpisode schemas | Missing rich results for show/episode pages |
| No authority pages (About, FAQ, Methodology) | Weak E-E-A-T signals for death-related content |
| No crawlable search results | Long-tail query landing pages don't exist |
| No editorial content | No featured snippet or long-tail keyword targeting |
| No pagination SEO | Deep pages waste crawl budget |
| GSC not connected to admin panel | No centralized SEO monitoring |

---

## 2. The 10 Recommendations

Ordered by impact (critical to low). Each has a dedicated plan file with full implementation details.

### Recommendation 1: Pre-rendering for Search Crawlers

**Impact: Critical | Effort: Medium | Plan: [`01-prerendering.md`](./01-prerendering.md)**

Add a pre-rendering service as Express middleware to serve fully-rendered HTML to search engine bots while preserving the SPA experience for users. This is the single highest-impact change possible.

On the VPS, self-hosted Rendertron (or Prerender.io's open-source equivalent) sits behind Express middleware that detects bot user agents. When a bot requests a page, the middleware routes the request to the pre-renderer, which uses headless Chromium to render the page and returns the fully-hydrated HTML. Human users get the normal SPA.

**Why this first**: Without pre-rendering, every other SEO improvement (structured data, meta tags, content) is undermined because bots may not see any of it reliably. This unblocks all other recommendations.

**Alternative**: Full Next.js migration provides SSR/SSG natively but requires rewriting the entire frontend. Higher long-term value, much higher effort. Pre-rendering is the pragmatic first step.

**Measure**: GSC indexed pages count, impressions, crawl stats (pages crawled per day, response time).

### Recommendation 2: Core Web Vitals Tracking

**Impact: High | Effort: Small | Plan: [`02-core-web-vitals.md`](./02-core-web-vitals.md)**

Install the `web-vitals` library and report LCP, FID, CLS, INP, and TTFB to both Google Analytics (as events) and New Relic (as custom attributes). Core Web Vitals are a direct Google ranking factor, and the site currently has zero measurement.

The `web-vitals` library is < 2KB and provides standardized metric collection. Reporting to GA enables the CrUX dashboard; reporting to New Relic enables correlation with backend performance data.

**Measure**: CrUX report in GSC, GA CWV event reports, New Relic dashboards.

### Recommendation 3: Structured Data Expansion

**Impact: High | Effort: Small | Plan: [`03-structured-data-expansion.md`](./03-structured-data-expansion.md)**

Expand JSON-LD schemas beyond the current Movie/Person/WebSite/BreadcrumbList set. Add TVSeries for show pages, TVEpisode for episode pages, CollectionPage for curated lists (Death Watch, Forever Young, etc.), FAQPage where applicable, and SearchAction on the WebSite schema.

The existing `src/utils/schema.ts` architecture makes this straightforward — it's adding new builder functions following the established pattern.

**Measure**: GSC Rich Results report, Google Rich Results Test, Schema.org validator.

### Recommendation 4: Authority & Trust Pages

**Impact: High | Effort: Small | Plan: [`04-authority-pages.md`](./04-authority-pages.md)**

Create About, FAQ, Methodology (how mortality stats are calculated), and Data Sources pages. These build E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals, which are critical for content related to death and health topics.

The site currently has zero informational pages explaining what it is, how it works, or where data comes from. Google's Search Quality Rater Guidelines specifically flag death/health content for E-E-A-T evaluation.

**Measure**: GSC brand query impressions, bounce rate on authority pages, backlink acquisition to these pages.

### Recommendation 5: Crawlable Search Results Page

**Impact: Medium | Effort: Small | Plan: [`05-search-results-page.md`](./05-search-results-page.md)**

Add a `/search?q=...` route that renders search results as a real page (not just the existing Cmd+K modal). This creates crawlable landing pages for long-tail queries like "Titanic actors who died" or "Breaking Bad cast deaths."

The search API already exists. This is a new page component that renders results from the same endpoint, with proper meta tags and internal linking.

**Measure**: GSC search appearance for `/search` URLs, organic traffic to search pages, new long-tail keyword rankings.

### Recommendation 6: Content Hub Strategy + Internal Linking

**Impact: Medium | Effort: Medium | Plan: [`06-content-hub-strategy.md`](./06-content-hub-strategy.md)**

Restructure curated pages (Death Watch, Forever Young, causes of death, decades) as content hubs with deliberate cross-linking in a hub-and-spoke model. Each hub page links to related content, and spoke pages link back to the hub and to each other.

Add "Related Movies," "Related Actors," and "See Also" sections to content pages. Expand breadcrumb navigation. This distributes PageRank effectively and helps crawlers discover content.

**Measure**: GA pages per session, internal navigation paths; GSC internal links report, crawl depth metrics.

### Recommendation 7: GSC Monitoring Dashboard

**Impact: Medium | Effort: Medium | Plan: [`07-gsc-monitoring-dashboard.md`](./07-gsc-monitoring-dashboard.md)**

Integrate the Google Search Console API into the existing admin analytics hub at `/admin/analytics`. Track indexed pages over time, impressions/clicks by page type, average position by query cluster, and crawl errors.

This is the measurement backbone for all other SEO work. Currently GSC data exists but requires manually visiting the GSC web interface. Bringing it into the admin panel enables data-driven SEO decisions alongside existing analytics.

**Measure**: Self-referential — the dashboard itself is the measurement tool. Track adoption via admin page visits.

### Recommendation 8: Editorial Content / Blog

**Impact: Medium | Effort: Large | Plan: [`08-editorial-content.md`](./08-editorial-content.md)**

Create a `/blog` or `/articles` section with long-form content targeting featured snippets and long-tail keywords. The site's unique data (mortality statistics, actuarial calculations, curse scores) provides compelling content that no competitor has.

Example topics: "The Poltergeist Curse: Fact vs. Statistics," "How Actuarial Tables Predict Celebrity Deaths," "The 10 Movies Where the Most Cast Members Have Died."

**Measure**: GSC impressions for article keywords, featured snippet appearances, organic traffic to `/articles` pages, backlink acquisition.

### Recommendation 9: Dynamic OG Images + Social Sharing

**Impact: Low-Medium | Effort: Medium | Plan: [`09-social-sharing-og-images.md`](./09-social-sharing-og-images.md)**

Generate custom Open Graph images per page with site branding and key statistics. Current OG images are raw TMDB posters with no Dead on Film branding. Add share buttons to content pages.

Server-side image generation (via `@vercel/og` adapted for Express, or Playwright screenshots of a template) creates branded, data-rich preview images for every actor, movie, and show page.

**Measure**: GA social referral traffic, New Relic `/og-image` endpoint usage, social media engagement.

### Recommendation 10: Pagination SEO

**Impact: Low | Effort: Small | Plan: [`10-pagination-seo.md`](./10-pagination-seo.md)**

Add self-referencing canonical URLs on paginated pages, `rel="prev"`/`rel="next"` link tags, and `noindex` on deep pagination pages (page 20+). Currently paginated pages like `/deaths/all?page=2` have no pagination-specific SEO handling.

**Measure**: GSC indexed paginated URLs, crawl budget allocation, duplicate content warnings.

---

## 3. Things to STOP Doing / Avoid

These anti-patterns are specific to Dead on Film's current architecture and content.

### 1. Don't rely on client-side rendering for SEO-critical content

**The current state.** Every meta tag, JSON-LD schema, and content element is injected by JavaScript. While Googlebot can execute JS, it does so on a deferred schedule. This is the #1 issue. Recommendation #1 (pre-rendering) directly addresses this.

### 2. Don't create thin or duplicate content pages

Each paginated page (`/deaths/all?page=2`, `?page=3`, etc.) currently generates identical meta descriptions. Deep pagination pages add little unique value. Don't index every pagination page — use `noindex` on page 20+ and ensure each page has a unique, descriptive meta tag. Recommendation #10 addresses this.

### 3. Don't use JavaScript-dependent navigation without HTML fallbacks

The site's navigation, breadcrumbs, and internal links are all rendered client-side. If pre-rendering fails for any reason, bots see zero navigation structure. Ensure the pre-rendered HTML includes complete `<nav>` elements and `<a href>` tags with real URLs (not `onClick` handlers).

### 4. Don't ignore Core Web Vitals

Currently there is zero CWV measurement. Google has been weighting CWV as a ranking signal since 2021. Without measurement, there's no way to know if the site passes or fails, or to detect regressions. Recommendation #2 is small effort, high value.

### 5. Don't use generic meta descriptions across similar pages

Each movie page, actor page, and show page should have a unique meta description that includes the specific mortality statistic. "See which actors from The Godfather (1972) have passed away — 14 of 45 cast members" is far better than a generic template. Audit existing `react-helmet-async` usage for uniqueness.

### 6. Don't neglect mobile-first indexing

Google indexes the mobile version of pages first. All CWV testing, layout verification, and content checks should prioritize mobile viewports. The site uses Tailwind's responsive utilities, but CWV may differ significantly between desktop and mobile.

### 7. Don't add `noindex` to curated collection pages

Pages like Death Watch, Forever Young, and cause-of-death listings are among the most valuable for SEO — they target specific search intents ("actors who died young," "movie curse deaths"). These should be fully indexed with rich meta descriptions and structured data.

### 8. Don't over-optimize titles and descriptions

Avoid keyword stuffing. "Dead Actors from The Godfather | Dead Actors Movie | Actor Deaths" is spam. Write for humans first: "The Godfather (1972) Cast: 14 of 45 actors have passed away" is natural and informative.

### 9. Don't ignore the death/mortality content angle

This is the site's unique value proposition. No other movie database focuses on mortality statistics. Lean into it — the morbid curiosity angle drives engagement, shares, and backlinks. Don't sanitize the content to be generic.

### 10. Don't block crawlers from any content pages

`robots.txt` currently allows all crawlers. Maintain this. Don't accidentally block `/api/` routes that pre-rendering might depend on. Do block `/admin/` routes (they shouldn't be indexed). Verify with `robots.txt` testing in GSC.

---

## 4. Ad Campaign Suggestions

The goal is to attract curious, engaged users who'll explore the site — not to drive sales funnels. Dead on Film's content naturally generates curiosity and sharing behavior. Campaigns should lean into the "I had no idea" reaction.

### 1. Reddit Ads

**Target**: r/movies, r/television, r/MovieDetails, r/todayilearned, r/morbidreality, r/entertainment

**Creative angle**: TIL-style hooks that match the subreddit tone.
- "TIL that 47% of the original Wizard of Oz cast has passed away. Here's the full breakdown."
- "I looked up how many actors from my favorite childhood movies have died. The numbers were shocking."

**Why Reddit**: The audience is exactly right — movie nerds who love trivia and data. Reddit ads perform well when they match the organic tone of the subreddit. The site's statistical approach resonates with Reddit's data-loving culture.

**Budget**: Start at $10-20/day, test 3-4 creatives, scale winners.

### 2. Google Discovery Ads

**Targeting**: Interest categories for movie enthusiasts, true crime fans, pop culture, entertainment news.

**Creative**: Visual cards with mortality statistics and movie posters. "The Shining (1980): How many cast members are still alive?" The Discovery feed rewards curiosity-driven content.

**Why Discovery**: High-intent audience already browsing entertainment content. Lower CPC than Search ads. Visual format showcases the site's data well.

### 3. Facebook / Instagram Ads

**Hook**: Nostalgia + mortality. "Before you rewatch [popular movie], see which cast members have passed away."

**Target demographics**: 35-65, interests in classic film, nostalgia, movie trivia. This age group has the strongest emotional connection to older films where mortality stats are most striking.

**Format**: Carousel ads showing 3-4 actors with "Still alive" / "Passed away" labels. Drives clicks through the "I want to know" impulse.

### 4. YouTube Pre-roll (6-second bumpers)

**Placement**: Before movie review, retrospective, and "where are they now" videos.

**Script**: "How many actors from [movie] are still alive? Find out at DeadOnFilm.com" over a quick montage of cast photos with mortality overlay.

**Why**: The audience is already watching movie content. Six-second bumpers are non-skippable and cheap. The question format creates an itch that only a site visit can scratch.

### 5. Twitter/X Promoted Tweets

**Strategy**: Tie to cultural moments in real time.
- Oscar season: "Of the Best Picture winners, which one lost the most cast members?"
- Actor death in the news: "We just updated [actor]'s page. See their full filmography and co-star mortality stats."
- Movie anniversaries: "The Godfather turns 54 today. Of the 45 credited cast members, 14 have passed away."

**Why**: Twitter rewards timely, data-driven content. The site's real-time death tracking (Death Watch feature) is a natural fit for news cycles.

### 6. Pinterest

**Format**: Infographic-style pins showing mortality statistics for classic films. Visual grids of cast photos with mortality overlays.

**Why**: Pinterest is a visual discovery platform where movie and trivia content performs well. Pins have long shelf lives — a single good infographic can drive traffic for years.

### 7. Content Partnerships / Digital PR

**Approach**: Pitch unique data stories to entertainment journalists, film blogs, and podcasters.
- "According to Dead on Film data, the average Marvel movie has lost 2.3 cast members..."
- "We analyzed every Best Picture winner's cast mortality — here's what we found."

**Why**: Creates authoritative backlinks (critical for SEO), drives referral traffic, and builds brand awareness. The site's unique dataset is inherently newsworthy.

### 8. Podcast Sponsorship

**Target shows**: True crime podcasts (morbid curiosity overlap), movie review podcasts (direct audience), pop culture shows (broad appeal).

**Read**: "Ever wondered how many actors from your favorite movie have passed away? Dead on Film tracks mortality statistics for every major film and TV show. Check it out at DeadOnFilm.com."

**Why**: Podcast listeners are highly engaged and trust host recommendations. The morbid curiosity angle aligns naturally with true crime and entertainment podcast audiences.

---

## 5. Measurement Framework

### Key Metrics by Recommendation

| # | Recommendation | Primary Metric | Secondary Metrics |
|---|---------------|---------------|-------------------|
| 1 | Pre-rendering | GSC: Pages indexed | Crawl stats, impressions |
| 2 | Core Web Vitals | CrUX pass rate | LCP, CLS, INP individual scores |
| 3 | Structured data | Rich result impressions | Schema validation errors |
| 4 | Authority pages | Brand query impressions | Bounce rate, time on page |
| 5 | Crawlable search | Long-tail keyword rankings | /search page traffic |
| 6 | Content hubs | Pages per session | Internal link equity distribution |
| 7 | GSC dashboard | Dashboard adoption | Alert response time |
| 8 | Editorial content | Article organic traffic | Featured snippet appearances |
| 9 | OG images | Social referral traffic | Share button click rate |
| 10 | Pagination SEO | Crawl budget efficiency | Indexed pagination pages |

### Tracking Cadence

| Frequency | What to Check |
|-----------|--------------|
| Daily | Crawl errors, indexing anomalies (automated alerts) |
| Weekly | Impressions/clicks trends, CWV scores, new pages indexed |
| Monthly | Keyword ranking changes, content performance review, backlink growth |
| Quarterly | Full SEO audit, strategy review, priority re-evaluation |

### Baseline Establishment

Before implementing any recommendations, capture baselines:
1. Total pages indexed (GSC > Coverage)
2. Total impressions and clicks (GSC > Performance)
3. Average position for top 50 queries
4. Crawl stats (pages crawled/day, response time)
5. Current CWV scores (if any — likely none in CrUX)

These baselines will allow measurement of each recommendation's impact.

---

## Key Files Referenced

| File | Role | Recommendations |
|------|------|----------------|
| `index.html` | SPA entry point — what bots currently see | #1 |
| `server/src/index.ts` | Express server — middleware integration point | #1, #5, #7, #9 |
| `src/utils/schema.ts` | JSON-LD schema builders | #3 |
| `src/components/seo/JsonLd.tsx` | JSON-LD renderer component | #3 |
| `server/src/lib/sitemap-generator.ts` | Sitemap generation | #5, #10 |
| `src/hooks/useGoogleAnalytics.ts` | GA tracking hook | #2, #7 |
| `src/hooks/useNewRelicBrowser.ts` | NR browser monitoring hook | #2 |
| `src/App.tsx` | All route definitions | #4, #5, #8 |
| `server/src/routes/admin/page-views.ts` | Custom analytics API | #7 |
| `src/pages/admin/AnalyticsHubPage.tsx` | Admin analytics dashboard | #7 |
| `public/robots.txt` | Crawler directives | #1 |
| `server/src/lib/cache.ts` | Redis cache key management | #1 |
