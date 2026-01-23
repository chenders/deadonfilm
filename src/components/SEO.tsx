import { Helmet } from "react-helmet-async"

interface SEOProps {
  title?: string
  description?: string
  canonical?: string
  noindex?: boolean
}

/**
 * SEO component for managing meta tags and canonical URLs
 *
 * @param title - Page title (will be suffixed with " - Dead on Film")
 * @param description - Meta description
 * @param canonical - Canonical URL (should be full URL with https://deadonfilm.com)
 * @param noindex - Whether to add noindex meta tag (for search pages, etc.)
 */
export function SEO({ title, description, canonical, noindex }: SEOProps) {
  const fullTitle = title
    ? `${title} - Dead on Film`
    : "Dead on Film - Movie Cast Mortality Database"

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {noindex && <meta name="robots" content="noindex, follow" />}
    </Helmet>
  )
}
