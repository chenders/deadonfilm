import { describe, it, expect } from "vitest"
import { renderPrerenderHtml, renderFallbackHtml, escapeHtml } from "./renderer.js"

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry")
  })

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"
    )
  })

  it("escapes quotes", () => {
    expect(escapeHtml("\"hello\" & 'world'")).toBe("&quot;hello&quot; &amp; &#x27;world&#x27;")
  })

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("")
  })

  it("passes through safe strings", () => {
    expect(escapeHtml("John Wayne")).toBe("John Wayne")
  })
})

describe("renderPrerenderHtml", () => {
  it("renders a complete HTML document with meta tags", () => {
    const html = renderPrerenderHtml({
      title: "The Godfather (1972) — Cast Deaths | Dead on Film",
      description: "10 of 45 cast members have passed away.",
      ogType: "video.movie",
      imageUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      canonicalUrl: "https://deadonfilm.com/movie/the-godfather-1972-238",
      heading: "The Godfather (1972)",
      subheading: "10 of 45 cast members have passed away.",
    })

    // Title tag
    expect(html).toContain("<title>The Godfather (1972) — Cast Deaths | Dead on Film</title>")

    // Meta description
    expect(html).toContain('name="description" content="10 of 45 cast members have passed away."')

    // Canonical URL
    expect(html).toContain(
      'rel="canonical" href="https://deadonfilm.com/movie/the-godfather-1972-238"'
    )

    // OG tags
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:description"')
    expect(html).toContain('property="og:type" content="video.movie"')
    expect(html).toContain('property="og:url"')
    expect(html).toContain('property="og:site_name" content="Dead on Film"')
    expect(html).toContain('property="og:image"')

    // Twitter Card tags
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="twitter:title"')
    expect(html).toContain('name="twitter:description"')
    expect(html).toContain('name="twitter:image"')

    // Visible content for crawlers
    expect(html).toContain("<h1>The Godfather (1972)</h1>")
    expect(html).toContain("<p>10 of 45 cast members have passed away.</p>")
  })

  it("uses summary card when no image is provided", () => {
    const html = renderPrerenderHtml({
      title: "About Dead on Film",
      description: "About us.",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/about",
      heading: "About Dead on Film",
    })

    expect(html).toContain('name="twitter:card" content="summary"')
    expect(html).not.toContain("og:image")
    expect(html).not.toContain("twitter:image")
  })

  it("renders JSON-LD script tags", () => {
    const html = renderPrerenderHtml({
      title: "Test",
      description: "Test",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/test",
      heading: "Test",
      jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Dead on Film" },
    })

    expect(html).toContain('type="application/ld+json"')
    expect(html).toContain('"@context":"https://schema.org"')
    expect(html).toContain('"@type":"WebSite"')
  })

  it("renders multiple JSON-LD schemas", () => {
    const html = renderPrerenderHtml({
      title: "Test",
      description: "Test",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/test",
      heading: "Test",
      jsonLd: [
        { "@context": "https://schema.org", "@type": "Person", name: "John Wayne" },
        { "@context": "https://schema.org", "@type": "BreadcrumbList" },
      ],
    })

    const jsonLdCount = (html.match(/application\/ld\+json/g) || []).length
    expect(jsonLdCount).toBe(2)
  })

  it("escapes XSS in title and description", () => {
    const html = renderPrerenderHtml({
      title: '<script>alert("xss")</script>',
      description: '<img onerror="alert(1)" src="x">',
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/test",
      heading: "Safe heading",
    })

    // Raw tags must be escaped
    expect(html).not.toContain("<script>alert")
    expect(html).not.toContain("<img onerror")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&lt;img")
  })

  it("omits subheading when not provided", () => {
    const html = renderPrerenderHtml({
      title: "Test",
      description: "Test",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/test",
      heading: "Test",
    })

    // Should have h1 but no paragraph for subheading
    expect(html).toContain("<h1>Test</h1>")
    // The only <p> should be the "View on Dead on Film" link
    const paragraphs = html.match(/<p>/g) || []
    expect(paragraphs.length).toBe(1)
  })
})

describe("renderFallbackHtml", () => {
  it("renders generic site metadata", () => {
    const html = renderFallbackHtml("/some-unknown-path")

    expect(html).toContain("<title>Dead on Film")
    expect(html).toContain("Movie Cast Mortality Database")
    expect(html).toContain("https://deadonfilm.com/some-unknown-path")
    expect(html).toContain('property="og:site_name" content="Dead on Film"')
  })

  it("includes the path in the canonical URL", () => {
    const html = renderFallbackHtml("/actor/missing-actor-999")

    expect(html).toContain('href="https://deadonfilm.com/actor/missing-actor-999"')
  })
})
