/**
 * HTML renderer for prerendered bot pages.
 *
 * Generates complete HTML documents with proper meta tags, OG/Twitter Cards,
 * JSON-LD structured data, and minimal visible content for SEO crawlers.
 */

const BASE_URL = "https://deadonfilm.com"

export interface PrerenderPageData {
  title: string
  description: string
  ogType: "website" | "article" | "profile" | "video.movie" | "video.tv_show" | "video.episode"
  imageUrl?: string
  canonicalUrl: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  heading: string
  subheading?: string
  /** Optional robots directive (e.g., "noindex, follow" for search pages) */
  robots?: string
}

/**
 * Escape HTML special characters to prevent XSS in dynamic content.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}

/**
 * Safely serialize JSON-LD for embedding in a <script> tag.
 * Replaces '<' with '\u003c' to prevent premature </script> closing
 * if any schema field contains "</script>" (e.g., names from external sources).
 * Matches the frontend JsonLd component's escaping approach.
 */
function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/**
 * Render a complete HTML document for bot consumption.
 * Includes all SEO meta tags, OG/Twitter Cards, and JSON-LD.
 */
export function renderPrerenderHtml(data: PrerenderPageData): string {
  const escapedTitle = escapeHtml(data.title)
  const escapedDescription = escapeHtml(data.description)
  const escapedHeading = escapeHtml(data.heading)
  const escapedSubheading = data.subheading ? escapeHtml(data.subheading) : ""
  const escapedCanonicalUrl = escapeHtml(data.canonicalUrl)

  const jsonLdScripts = data.jsonLd
    ? Array.isArray(data.jsonLd)
      ? data.jsonLd
          .map((schema) => `<script type="application/ld+json">${safeJsonLd(schema)}</script>`)
          .join("\n    ")
      : `<script type="application/ld+json">${safeJsonLd(data.jsonLd)}</script>`
    : ""

  const imageMetaTags = data.imageUrl
    ? `
    <meta property="og:image" content="${escapeHtml(data.imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:image" content="${escapeHtml(data.imageUrl)}" />`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />${data.robots ? `\n    <meta name="robots" content="${escapeHtml(data.robots)}" />` : ""}
    <link rel="canonical" href="${escapedCanonicalUrl}" />

    <!-- OpenGraph -->
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:type" content="${data.ogType}" />
    <meta property="og:url" content="${escapedCanonicalUrl}" />
    <meta property="og:site_name" content="Dead on Film" />${imageMetaTags}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="${data.imageUrl ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />

    ${jsonLdScripts}
  </head>
  <body>
    <h1>${escapedHeading}</h1>
    ${escapedSubheading ? `<p>${escapedSubheading}</p>` : ""}
    <p><a href="${escapedCanonicalUrl}">View on Dead on Film</a></p>
  </body>
</html>`
}

/**
 * Render fallback HTML with generic site metadata.
 * Used when data fetching fails — still better than the empty SPA shell.
 */
export function renderFallbackHtml(path: string): string {
  return renderPrerenderHtml({
    title: "Dead on Film — Movie Cast Mortality Database",
    description:
      "Look up any movie or TV show to see which actors have passed away. Mortality statistics, causes of death, and more.",
    ogType: "website",
    canonicalUrl: `${BASE_URL}${path}`,
    heading: "Dead on Film",
    subheading:
      "Movie cast mortality database. Look up any movie or TV show to see which actors have passed away.",
  })
}
