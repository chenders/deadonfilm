---
globs: ["server/src/routes/sitemap.ts", "server/src/lib/slug-utils.ts"]
---
# Sitemap Updates

When adding a new page or URL route, you MUST update the sitemap.

## Update Checklist

| Page Type | Action Required |
|-----------|-----------------|
| Static pages (discovery, landing) | Add to `staticPages` array in `server/src/routes/sitemap.ts` |
| Dynamic pages (movie/show/actor detail) | Add query + loop to generate URLs in `server/src/routes/sitemap.ts` |
| New page type needing slug | Add function to `server/src/lib/slug-utils.ts` |

Sitemap location: `server/src/routes/sitemap.ts` → generates `/sitemap.xml`