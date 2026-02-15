# Plan 07: GSC Monitoring Dashboard

**Impact: Medium | Effort: Medium | Dependencies: None (but informs all other recommendations)**

## Problem

Google Search Console is configured for Dead on Film, but all data lives in the GSC web interface. The site has a custom admin analytics hub at `/admin/analytics` with page view tracking, but SEO metrics aren't integrated. This means:

- SEO performance isn't visible alongside other analytics
- No automated alerting for indexing issues or crawl errors
- No trend tracking for impressions, clicks, or keyword rankings
- Manual GSC checks are infrequent and reactive instead of proactive
- Can't correlate SEO metrics with site changes or deployments

## Solution

Integrate the Google Search Console API into the existing admin analytics dashboard. Build a dedicated SEO metrics section that tracks the key indicators needed to measure all other recommendations.

### Dashboard Sections

**1. Indexing Health**
- Total pages indexed over time (line chart)
- Pages indexed by type (actor, movie, show, episode, curated)
- Indexing errors by category (soft 404, redirect, server error)
- New pages discovered vs. indexed

**2. Search Performance**
- Total impressions and clicks (line chart, 30/90 day view)
- Click-through rate (CTR) trend
- Average position trend
- Top queries with impressions, clicks, CTR, position
- Top pages with same metrics

**3. Page Type Performance**
- Impressions/clicks broken down by page type (actor, movie, show, etc.)
- Average position by page type
- Identify which content types perform best in search

**4. Crawl Monitoring**
- Pages crawled per day
- Average response time
- Crawl budget usage
- Crawl errors

**5. Alerts**
- Drop in indexed pages > 10%
- Spike in crawl errors
- Significant position changes for top queries
- CWV threshold failures (ties into Recommendation #2)

### API Integration

The GSC API (Search Console API v3) provides:
- `searchAnalytics.query` — impressions, clicks, CTR, position by query/page/date
- `sitemaps.list` / `sitemaps.get` — sitemap submission status
- `urlInspection.index.inspect` — per-URL indexing status

Authentication: OAuth2 service account with domain-wide delegation, or user-based OAuth flow through the admin panel.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `server/src/routes/admin/gsc.ts` | Create | GSC API proxy routes |
| `server/src/lib/gsc-client.ts` | Create | Google Search Console API client |
| `src/pages/admin/SeoMetricsPage.tsx` | Create | SEO dashboard UI |
| `src/pages/admin/AnalyticsHubPage.tsx` | Modify | Add SEO metrics tab/link |
| `server/src/routes/admin/page-views.ts` | Verify | Existing analytics pattern to follow |
| `.env.example` | Modify | Add GSC API credentials documentation |

## Implementation Notes

- Follow the existing admin route pattern in `server/src/routes/admin/`
- Use the `googleapis` npm package for the GSC API client
- Cache GSC API responses in Redis (data updates daily, no need for real-time)
- Store historical snapshots in PostgreSQL for trend analysis beyond GSC's 16-month retention
- The dashboard should load quickly — pre-aggregate data in a background job
- Consider a daily cron job that fetches GSC data and stores it locally
- Protect with existing admin authentication

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Dashboard usage | Admin page views | 0 | Weekly active usage |
| Alert response time | Internal | No alerts exist | < 24h response to indexing drops |
| Data freshness | Internal | Manual checks only | Daily automated updates |
| Trend visibility | Internal | None | 90-day trend lines for all key metrics |
