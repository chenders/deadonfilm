interface JsonLdProps {
  data: Record<string, unknown>
}

/**
 * Renders a JSON-LD structured data script tag
 * Used for SEO to provide search engines with structured information about the page
 *
 * Escapes closing script tags in serialized JSON to prevent XSS when
 * untrusted text (e.g., episode overviews, show names) contains "</script>"
 */
export default function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c")
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
