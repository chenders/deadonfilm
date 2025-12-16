interface JsonLdProps {
  data: Record<string, unknown>
}

/**
 * Renders a JSON-LD structured data script tag
 * Used for SEO to provide search engines with structured information about the page
 */
export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
