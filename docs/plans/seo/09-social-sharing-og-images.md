# Plan 09: Dynamic OG Images + Social Sharing

**Impact: Low-Medium | Effort: Medium | Dependencies: #1 (pre-rendering ensures OG tags are visible to bots)**

## Problem

When someone shares a Dead on Film link on social media, the preview card shows a raw TMDB poster (for movies/actors) or nothing (for curated pages). There is no Dead on Film branding, no mortality statistics, and no visual hook that distinguishes the share from any other movie database link.

The site also lacks share buttons, making it harder for users to share content they find interesting. Given the site's inherently shareable content (mortality statistics trigger curiosity and conversation), this is a missed engagement and backlink opportunity.

## Solution

### Dynamic OG Image Generation

Create a server-side endpoint that generates branded Open Graph images on-the-fly for each page type. Each image includes the TMDB poster/photo, Dead on Film branding, and the key mortality statistic.

**Actor pages**: Actor photo + name + birth/death dates + "X of Y co-stars have passed away"

**Movie pages**: Movie poster + title + year + "X of Y cast members have passed away" + mortality percentage

**Show pages**: Show poster + title + "X of Y cast members across N seasons have passed away"

**Curated pages**: Branded template + page title + key statistic

### Implementation Options

**Option A: Playwright-based** (recommended for VPS)
- Create an HTML template page that renders the OG image layout
- Use Playwright to screenshot the template at 1200x630px (OG standard)
- Cache generated images in Redis or on disk
- Serve via `/og-image/:type/:id.png` endpoint

**Option B: Canvas-based** (lighter weight)
- Use `@napi-rs/canvas` or `sharp` for server-side image composition
- Overlay text on poster images programmatically
- Faster generation, less flexible design

**Option C: `@vercel/og`-style** (modern approach)
- Use Satori (the library behind `@vercel/og`) for JSX-to-SVG rendering
- Convert SVG to PNG with sharp
- Most flexible design, React-like DX

### Share Buttons

Add unobtrusive share buttons to content pages:
- Twitter/X (with pre-formatted tweet text)
- Facebook
- Reddit (critical for this audience)
- Copy link button
- Native share API on mobile (Web Share API)

### OG Meta Tag Updates

Update `react-helmet-async` usage to reference the dynamic OG image endpoint:
```html
<meta property="og:image" content="https://deadonfilm.com/og-image/movie/238.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `server/src/routes/og-image.ts` | Create | OG image generation endpoint |
| `server/src/lib/og-image-generator.ts` | Create | Image generation logic |
| `server/src/index.ts` | Modify | Mount OG image route |
| `src/components/social/ShareButtons.tsx` | Create | Share button component |
| `src/pages/ActorPage.tsx` | Modify | Update OG image meta + add share buttons |
| `src/pages/MoviePage.tsx` | Modify | Update OG image meta + add share buttons |
| `src/pages/ShowPage.tsx` | Modify | Update OG image meta + add share buttons |
| `server/src/lib/cache.ts` | Modify | Add OG image cache keys |

## Implementation Notes

- OG images must be exactly 1200x630px for optimal display across platforms
- Cache aggressively — OG images change rarely (only when death data updates)
- Use the existing actor/movie/show data from the API to populate image text
- Set `Cache-Control: public, max-age=86400` on the image endpoint
- Test with Facebook Sharing Debugger, Twitter Card Validator, and LinkedIn Post Inspector
- Share buttons should not load external scripts (privacy concern) — use simple link-based sharing
- Web Share API (`navigator.share()`) provides native mobile sharing with no external dependencies
- Add `og:image` to pre-rendered HTML so social crawlers (which don't execute JS) see it

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Social referral traffic | GA | Measure before | +50% in 90 days |
| Share button clicks | GA Events | 0 | Measurable engagement |
| OG image requests | New Relic | 0 | Correlates with social sharing |
| Social media mentions | Manual / social listening | Unknown | Increased visibility |
| Link previews | Facebook/Twitter debuggers | Generic poster | Branded OG images |
