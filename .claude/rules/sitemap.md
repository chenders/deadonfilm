---
globs: ["server/src/routes/sitemap.ts", "server/src/lib/slug-utils.ts"]
---
# Sitemap Updates

When adding a new page or URL route to the application, you MUST update the sitemap:

1. **Static pages** (discovery pages, landing pages): Add to the `staticPages` array in `server/src/routes/sitemap.ts`
2. **Dynamic pages** (movie/show/actor detail pages): Add a query and loop to generate URLs in `server/src/routes/sitemap.ts`
3. **Slug utilities**: If the new page type needs a slug, add the function to `server/src/lib/slug-utils.ts`

The sitemap is located at `server/src/routes/sitemap.ts` and generates `/sitemap.xml` for SEO.