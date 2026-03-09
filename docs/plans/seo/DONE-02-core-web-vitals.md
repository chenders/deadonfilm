# Plan 02: Core Web Vitals Tracking

**Impact: High | Effort: Small | Dependencies: None**

## Problem

Core Web Vitals (LCP, CLS, INP) are a direct Google ranking signal since 2021. Dead on Film currently has zero CWV measurement. Without tracking, there's no way to know if the site passes Google's thresholds, detect regressions, or prioritize performance improvements.

The site already has Google Analytics and New Relic Browser monitoring, but neither is configured to capture standardized CWV metrics.

## Solution

Install the `web-vitals` library and report all five metrics (LCP, FID, CLS, INP, TTFB) to both Google Analytics (for CrUX eligibility) and New Relic (for backend correlation).

### Metrics to Track

| Metric | What It Measures | Good Threshold |
|--------|-----------------|----------------|
| LCP (Largest Contentful Paint) | Loading performance | < 2.5s |
| CLS (Cumulative Layout Shift) | Visual stability | < 0.1 |
| INP (Interaction to Next Paint) | Responsiveness | < 200ms |
| FID (First Input Delay) | Legacy responsiveness | < 100ms |
| TTFB (Time to First Byte) | Server response time | < 800ms |

### Reporting to Google Analytics

Send CWV as GA4 events using the existing `useGoogleAnalytics.ts` hook pattern. GA4 events named `web_vitals` with parameters `metric_name`, `metric_value`, `metric_id`, and `metric_rating` enable the CrUX integration.

### Reporting to New Relic

Use the existing New Relic Browser agent (from `useNewRelicBrowser.ts`) to send CWV as custom attributes via `newrelic.setCustomAttribute()` or as custom events via `newrelic.addPageAction()`. This enables CWV dashboards alongside existing APM data.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useWebVitals.ts` | Create | Hook that initializes web-vitals reporting |
| `src/hooks/useGoogleAnalytics.ts` | Modify | Add CWV event reporting function |
| `src/hooks/useNewRelicBrowser.ts` | Modify | Add CWV custom attribute reporting |
| `src/App.tsx` | Modify | Add `useWebVitals()` hook call |
| `package.json` | Modify | Add `web-vitals` dependency |

## Implementation Notes

- The `web-vitals` library is < 2KB gzipped — negligible bundle impact
- Report metrics on every page navigation, not just initial load
- Use `onCLS`, `onINP`, `onLCP`, `onFID`, `onTTFB` from `web-vitals`
- Set `reportAllChanges: true` for CLS to capture the final value
- Include the page type (actor, movie, show, episode, list) as a dimension for segmented analysis
- Don't block rendering — initialize reporting after the app mounts

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| LCP | GA4 + CrUX | Unknown (measure) | < 2.5s (75th percentile) |
| CLS | GA4 + CrUX | Unknown (measure) | < 0.1 (75th percentile) |
| INP | GA4 + CrUX | Unknown (measure) | < 200ms (75th percentile) |
| CrUX eligibility | GSC | Not eligible | Eligible within 28 days |
| NR CWV dashboard | New Relic | None | Active, segmented by page type |
