# Plan 01: Pre-rendering for Search Crawlers

**Impact: Critical | Effort: Medium | Dependencies: None**

## Problem

Dead on Film is a pure client-side SPA. When search engine crawlers request any page, they receive `<div id="root"></div>` with a script tag. While Googlebot can execute JavaScript, it does so in a deferred rendering queue (days to weeks). This means content, meta tags, JSON-LD schemas, and internal links may not be indexed reliably or promptly.

This is the single biggest SEO blocker. All other recommendations are undermined if bots can't see the content.

## Solution

Add a pre-rendering middleware layer to the Express server that detects bot user agents and serves fully-rendered HTML to crawlers while preserving the SPA experience for human users.

### Approach: Self-hosted Prerender

1. **Install and configure Prerender** (or Rendertron) as a headless Chromium service running on the VPS
2. **Add Express middleware** that intercepts requests from known bot user agents (Googlebot, Bingbot, Twitterbot, etc.)
3. **Route bot requests** through the prerender service, which renders the page in headless Chrome and returns the full HTML
4. **Cache pre-rendered pages** in Redis using the existing cache infrastructure to avoid re-rendering on every crawl
5. **Serve cached HTML** to subsequent bot requests until cache expires or content changes

### Bot Detection

Detect via `User-Agent` header matching against known crawler strings. The `prerender-node` middleware handles this automatically, including Google, Bing, Facebook, Twitter, LinkedIn, and others.

### Cache Strategy

- Cache pre-rendered HTML in Redis with key pattern `prerender:{url_path}`
- TTL: 24 hours for content pages, 1 hour for frequently-updated pages (Death Watch)
- Invalidate on content updates (actor death, new movie sync)
- Add cache keys to `CACHE_KEYS` registry in `server/src/lib/cache.ts`

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `server/src/index.ts` | Modify | Add prerender middleware before static file serving |
| `server/src/middleware/prerender.ts` | Create | Bot detection + prerender routing middleware |
| `server/src/lib/cache.ts` | Modify | Add `prerender` key pattern to `CACHE_KEYS` |
| `public/robots.txt` | Verify | Ensure no content pages are blocked |
| `docker-compose.yml` | Modify | Add prerender service container |

## Implementation Notes

- The prerender service must be able to access the running frontend (localhost:5173 in dev, the production URL in prod)
- Set a render timeout (10s max) to prevent hanging on broken pages
- Return the pre-rendered HTML with proper HTTP status codes (200, 301, 404)
- Include `<meta name="fragment" content="!">` in `index.html` as a signal to the prerender middleware
- Monitor prerender service health via New Relic

## Alternative: Next.js Migration

A full migration to Next.js would provide SSR/SSG natively, eliminating the need for a prerender service. This is higher effort (rewriting the entire frontend) but provides better long-term SEO capabilities including streaming SSR, incremental static regeneration, and built-in image optimization.

**Recommendation**: Start with pre-rendering now. Evaluate Next.js migration as a future project based on SEO results.

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Pages indexed | GSC Coverage | Measure before | +50% in 30 days |
| Impressions | GSC Performance | Measure before | +100% in 60 days |
| Crawl rate | GSC Crawl Stats | Measure before | 2x pages/day |
| Crawl response time | GSC Crawl Stats | Measure before | <500ms average |
| Rendering errors | New Relic | 0 | <1% of prerender requests |
