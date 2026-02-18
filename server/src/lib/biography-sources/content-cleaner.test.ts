import { describe, it, expect, vi, beforeEach } from "vitest"
import { mechanicalPreClean, extractMetadata } from "./content-cleaner.js"

// Shared mock create function accessible from tests
const mockCreate = vi.fn()

// Mock Anthropic SDK before importing functions that use it
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

// ============================================================================
// mechanicalPreClean
// ============================================================================

describe("mechanicalPreClean", () => {
  // --------------------------------------------------------------------------
  // Structural noise removal
  // --------------------------------------------------------------------------

  describe("structural noise removal", () => {
    it("strips script tags and their content", () => {
      const html = `
        <div>
          <p>Hello world</p>
          <script>alert('xss');</script>
          <p>Goodbye world</p>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Hello world")
      expect(result.text).toContain("Goodbye world")
      expect(result.text).not.toContain("alert")
      expect(result.text).not.toContain("xss")
    })

    it("strips style tags and their content", () => {
      const html = `
        <div>
          <p>Visible text</p>
          <style>.hidden { display: none; }</style>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Visible text")
      expect(result.text).not.toContain("display")
      expect(result.text).not.toContain("hidden")
    })

    it("strips noscript, iframe, svg, and canvas tags and their content", () => {
      const html = `
        <div>
          <p>Content before</p>
          <noscript><p>Enable JavaScript</p></noscript>
          <iframe src="https://example.com">iframe content</iframe>
          <svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>
          <canvas id="myCanvas">Canvas fallback</canvas>
          <p>Content after</p>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Content before")
      expect(result.text).toContain("Content after")
      expect(result.text).not.toContain("Enable JavaScript")
      expect(result.text).not.toContain("iframe content")
      expect(result.text).not.toContain("circle")
      expect(result.text).not.toContain("Canvas fallback")
    })
  })

  // --------------------------------------------------------------------------
  // Layout noise removal
  // --------------------------------------------------------------------------

  describe("layout noise removal", () => {
    it("strips nav elements", () => {
      const html = `
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <div><p>Article content here</p></div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Article content here")
      expect(result.text).not.toContain("Home")
      expect(result.text).not.toContain("About")
    })

    it("strips footer elements", () => {
      const html = `
        <div><p>Main content</p></div>
        <footer><p>Copyright 2024</p></footer>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Main content")
      expect(result.text).not.toContain("Copyright")
    })

    it("strips header elements", () => {
      const html = `
        <header><h1>Site Title</h1><nav>Links</nav></header>
        <div><p>Body text</p></div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Body text")
      expect(result.text).not.toContain("Site Title")
    })

    it("strips aside elements", () => {
      const html = `
        <div><p>Main article text</p></div>
        <aside><p>Related sidebar content</p></aside>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Main article text")
      expect(result.text).not.toContain("sidebar content")
    })
  })

  // --------------------------------------------------------------------------
  // Class/ID noise removal
  // --------------------------------------------------------------------------

  describe("class/ID noise removal", () => {
    it("strips elements with ad-related classes", () => {
      const html = `
        <div>
          <p>Real content</p>
          <div class="advertisement-banner">Buy our product!</div>
          <p>More content</p>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Real content")
      expect(result.text).toContain("More content")
      expect(result.text).not.toContain("Buy our product")
    })

    it("strips elements with cookie/gdpr classes", () => {
      const html = `
        <div>
          <p>Article text</p>
          <div class="cookie-banner">Accept cookies</div>
          <div class="gdpr-notice">We use cookies</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Article text")
      expect(result.text).not.toContain("Accept cookies")
      expect(result.text).not.toContain("We use cookies")
    })

    it("strips elements with newsletter/subscribe classes", () => {
      const html = `
        <div>
          <p>Story content</p>
          <div class="newsletter-signup">Enter your email</div>
          <div class="subscribe-form">Subscribe now</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Story content")
      expect(result.text).not.toContain("Enter your email")
      expect(result.text).not.toContain("Subscribe now")
    })

    it("strips elements with comments-related classes", () => {
      const html = `
        <div>
          <p>Article body</p>
          <div class="comments">
            <div class="comment">User said something</div>
          </div>
          <div class="disqus-thread">Disqus comments</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Article body")
      expect(result.text).not.toContain("User said something")
      expect(result.text).not.toContain("Disqus comments")
    })

    it("strips elements with noise IDs", () => {
      const html = `
        <div>
          <p>Main text</p>
          <div id="google_ads">Ad content</div>
          <div id="sidebar">Sidebar content</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Main text")
      expect(result.text).not.toContain("Ad content")
      expect(result.text).not.toContain("Sidebar content")
    })

    it("strips elements with social-share classes", () => {
      const html = `
        <div>
          <p>News article</p>
          <div class="social-share-buttons">Share on Twitter</div>
          <div class="share-buttons-container">Facebook Like</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("News article")
      expect(result.text).not.toContain("Share on Twitter")
      expect(result.text).not.toContain("Facebook Like")
    })
  })

  // --------------------------------------------------------------------------
  // Article body extraction
  // --------------------------------------------------------------------------

  describe("article body extraction", () => {
    it("extracts article body when <article> tag is present", () => {
      const html = `
        <div class="site-wrapper">
          <nav><a href="/">Home</a></nav>
          <article>
            <h1>Actor Biography</h1>
            <p>John Wayne was born Marion Robert Morrison.</p>
          </article>
          <aside><p>Related articles</p></aside>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Actor Biography")
      expect(result.text).toContain("John Wayne was born Marion Robert Morrison")
      // Nav and aside are already stripped before article extraction,
      // but article extraction further narrows the content
    })

    it("falls back to <main> when no article tag", () => {
      const html = `
        <div>
          <div class="breadcrumb">Home > Actors</div>
          <main>
            <h1>Biography</h1>
            <p>Interesting life facts here.</p>
          </main>
          <div class="related-articles">More stories</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Biography")
      expect(result.text).toContain("Interesting life facts here")
    })

    it("falls back to div role=article", () => {
      const html = `
        <div role="article">
          <h2>Profile</h2>
          <p>Actor profile content.</p>
        </div>
        <div class="comments">User comments</div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Profile")
      expect(result.text).toContain("Actor profile content")
    })

    it("falls back to cleaned body when no article/main tags", () => {
      const html = `
        <html>
        <body>
          <p>Simple page with just paragraphs.</p>
          <p>No semantic article markup at all.</p>
        </body>
        </html>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Simple page with just paragraphs")
      expect(result.text).toContain("No semantic article markup at all")
    })

    it("extracts from div with itemprop=articleBody", () => {
      const html = `
        <div class="page">
          <div class="sidebar">Sidebar junk</div>
          <div itemprop="articleBody">
            <p>The real article body content.</p>
          </div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("The real article body content")
    })

    it("extracts from div with class=entry-content", () => {
      const html = `
        <div class="post">
          <div class="entry-content">
            <p>WordPress blog post content about an actor.</p>
          </div>
          <div class="comments">Leave a comment</div>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("WordPress blog post content about an actor")
    })
  })

  // --------------------------------------------------------------------------
  // HTML entity decoding
  // --------------------------------------------------------------------------

  describe("HTML entity decoding", () => {
    it("decodes HTML entities", () => {
      const html = "<p>Tom &amp; Jerry &mdash; a classic duo &lt;3</p>"
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Tom & Jerry")
      expect(result.text).toContain("<3")
    })

    it("decodes numeric entities", () => {
      const html = "<p>&#169; 2024 &#8212; All rights reserved</p>"
      const result = mechanicalPreClean(html)
      // he.decode handles numeric entities
      expect(result.text).not.toContain("&#169;")
      expect(result.text).not.toContain("&#8212;")
    })
  })

  // --------------------------------------------------------------------------
  // Citation marker removal
  // --------------------------------------------------------------------------

  describe("citation marker removal", () => {
    it("removes numeric citation markers", () => {
      const html = "<p>He was born in 1907[1] and died in 1979[2] in Los Angeles[3].</p>"
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("He was born in 1907 and died in 1979 in Los Angeles")
      expect(result.text).not.toContain("[1]")
      expect(result.text).not.toContain("[2]")
      expect(result.text).not.toContain("[3]")
    })

    it("removes [edit] markers", () => {
      const html = "<p>Early life[edit] He grew up in Iowa.</p>"
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("He grew up in Iowa")
      expect(result.text).not.toContain("[edit]")
    })

    it("removes [citation needed] markers", () => {
      const html = "<p>He won an Academy Award[citation needed] for his role.</p>"
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("He won an Academy Award")
      expect(result.text).not.toContain("[citation needed]")
    })
  })

  // --------------------------------------------------------------------------
  // Whitespace normalization
  // --------------------------------------------------------------------------

  describe("whitespace normalization", () => {
    it("collapses multiple spaces to single space", () => {
      const html = "<p>Too    many     spaces    here</p>"
      const result = mechanicalPreClean(html)
      expect(result.text).toBe("Too many spaces here")
    })

    it("collapses multiple newlines to max 2", () => {
      const html = "<p>First paragraph</p>\n\n\n\n\n<p>Second paragraph</p>"
      const result = mechanicalPreClean(html)
      // After stripping tags, we get text with spaces/newlines
      // Multiple newlines should be collapsed
      const newlineCount = (result.text.match(/\n/g) || []).length
      expect(newlineCount).toBeLessThanOrEqual(2)
    })

    it("trims leading and trailing whitespace", () => {
      const html = "   <p>  Content with padding  </p>   "
      const result = mechanicalPreClean(html)
      expect(result.text).not.toMatch(/^\s/)
      expect(result.text).not.toMatch(/\s$/)
    })
  })

  // --------------------------------------------------------------------------
  // Code fragment stripping
  // --------------------------------------------------------------------------

  describe("code fragment stripping", () => {
    it("strips code fragments from text", () => {
      const html = `
        <div>
          <p>John Wayne was a famous actor.</p>
          <p>function init() { const el = document.getElementById('app'); return this.value; }</p>
          <p>He appeared in over 170 films.</p>
        </div>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("John Wayne was a famous actor")
      expect(result.text).toContain("He appeared in over 170 films")
      expect(result.text).not.toContain("document.getElementById")
    })
  })

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles empty input gracefully", () => {
      const result = mechanicalPreClean("")
      expect(result.text).toBe("")
      expect(result.metadata).toEqual({
        title: null,
        publication: null,
        author: null,
        publishDate: null,
      })
    })

    it("handles null/undefined input gracefully", () => {
      // TypeScript should prevent this, but test runtime safety
      const result = mechanicalPreClean(null as unknown as string)
      expect(result.text).toBe("")
      expect(result.metadata.title).toBeNull()
    })

    it("handles input with no HTML (plain text passthrough)", () => {
      const result = mechanicalPreClean("Just plain text with no HTML tags at all.")
      expect(result.text).toBe("Just plain text with no HTML tags at all.")
    })

    it("handles malformed HTML gracefully", () => {
      const html = "<p>Unclosed tag <div>nested <span>deeply"
      const result = mechanicalPreClean(html)
      // Should not throw and should extract some text
      expect(result.text).toBeTruthy()
      expect(result.text).toContain("Unclosed tag")
    })

    it("does not remove <navigation> when stripping <nav>", () => {
      const html = `
        <navigation><p>Custom tag content</p></navigation>
        <nav><p>Real nav content</p></nav>
        <p>Article text</p>
      `
      const result = mechanicalPreClean(html)
      expect(result.text).toContain("Custom tag content")
      expect(result.text).toContain("Article text")
      expect(result.text).not.toContain("Real nav content")
    })
  })

  // --------------------------------------------------------------------------
  // Full pipeline integration
  // --------------------------------------------------------------------------

  describe("full pipeline integration", () => {
    it("processes a realistic article page", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>John Wayne - Actor Biography | Hollywood Reporter</title>
          <meta property="og:site_name" content="The Hollywood Reporter">
          <meta name="author" content="Jane Smith">
          <meta property="article:published_time" content="2023-05-15T10:00:00Z">
          <style>body { font-family: sans-serif; }</style>
          <script>window.analytics = { track: function() {} };</script>
        </head>
        <body>
          <header>
            <nav><a href="/">Home</a> <a href="/actors">Actors</a></nav>
          </header>
          <div class="cookie-banner">We use cookies. <button>Accept</button></div>
          <article>
            <h1>John Wayne: The Duke of Hollywood</h1>
            <time datetime="2023-05-15">May 15, 2023</time>
            <p>Marion Robert Morrison[1], known professionally as John Wayne[2], was an American actor who became a leading man in Hollywood.</p>
            <p>Wayne was born on May 26, 1907, in Winterset, Iowa &amp; grew up to become one of the most iconic figures in film history.</p>
            <div class="social-share">Share this article</div>
            <p>He died on June 11, 1979, at the age of 72.</p>
          </article>
          <aside>
            <h3>Related Articles</h3>
            <ul><li>Top 10 Western Stars</li></ul>
          </aside>
          <div class="newsletter-signup">
            <p>Get our weekly newsletter</p>
            <input type="email" placeholder="Email">
          </div>
          <div class="comments">
            <h3>Comments</h3>
            <div class="comment">Great article!</div>
          </div>
          <footer>
            <p>&copy; 2023 Hollywood Reporter</p>
          </footer>
        </body>
        </html>
      `
      const result = mechanicalPreClean(html)

      // Should contain article content
      expect(result.text).toContain("John Wayne: The Duke of Hollywood")
      expect(result.text).toContain("known professionally as John Wayne")
      expect(result.text).toContain("He died on June 11, 1979")

      // Should have decoded entities
      expect(result.text).toContain("&")
      expect(result.text).not.toContain("&amp;")

      // Should have removed citation markers
      expect(result.text).not.toContain("[1]")
      expect(result.text).not.toContain("[2]")

      // Should NOT contain noise
      expect(result.text).not.toContain("We use cookies")
      expect(result.text).not.toContain("Share this article")
      expect(result.text).not.toContain("newsletter")
      expect(result.text).not.toContain("Great article!")
      expect(result.text).not.toContain("analytics")
      expect(result.text).not.toContain("font-family")

      // Metadata should be extracted
      expect(result.metadata.title).toBe("John Wayne - Actor Biography | Hollywood Reporter")
      expect(result.metadata.publication).toBe("The Hollywood Reporter")
      expect(result.metadata.author).toBe("Jane Smith")
      expect(result.metadata.publishDate).toBe("2023-05-15T10:00:00Z")
    })
  })
})

// ============================================================================
// extractMetadata
// ============================================================================

describe("extractMetadata", () => {
  it("extracts title from <title> tag", () => {
    const html = "<html><head><title>Actor Name - Biography</title></head><body></body></html>"
    const metadata = extractMetadata(html)
    expect(metadata.title).toBe("Actor Name - Biography")
  })

  it("extracts publication from og:site_name meta tag", () => {
    const html = `<html><head><meta property="og:site_name" content="The Guardian"></head><body></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.publication).toBe("The Guardian")
  })

  it("extracts publication when content comes before property", () => {
    const html = `<html><head><meta content="BBC News" property="og:site_name"></head><body></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.publication).toBe("BBC News")
  })

  it("extracts author from meta author tag", () => {
    const html = `<html><head><meta name="author" content="John Doe"></head><body></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.author).toBe("John Doe")
  })

  it("extracts author from article:author meta tag", () => {
    const html = `<html><head><meta property="article:author" content="Jane Smith"></head><body></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.author).toBe("Jane Smith")
  })

  it("extracts publish date from article:published_time meta tag", () => {
    const html = `<html><head><meta property="article:published_time" content="2024-01-15T09:30:00Z"></head><body></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.publishDate).toBe("2024-01-15T09:30:00Z")
  })

  it("extracts publish date from <time datetime> tag", () => {
    const html = `<html><body><time datetime="2024-03-20">March 20, 2024</time></body></html>`
    const metadata = extractMetadata(html)
    expect(metadata.publishDate).toBe("2024-03-20")
  })

  it("prefers article:published_time over <time> tag", () => {
    const html = `
      <html>
      <head><meta property="article:published_time" content="2024-01-15"></head>
      <body><time datetime="2023-06-01">June 1</time></body>
      </html>
    `
    const metadata = extractMetadata(html)
    expect(metadata.publishDate).toBe("2024-01-15")
  })

  it("returns null for missing fields", () => {
    const html = "<html><body><p>No metadata here</p></body></html>"
    const metadata = extractMetadata(html)
    expect(metadata.title).toBeNull()
    expect(metadata.publication).toBeNull()
    expect(metadata.author).toBeNull()
    expect(metadata.publishDate).toBeNull()
  })

  it("handles malformed HTML gracefully", () => {
    const html = "<title>Broken<meta name='author'"
    const metadata = extractMetadata(html)
    // Should not throw
    expect(metadata).toBeDefined()
    // Title won't be extracted because there's no closing tag
    expect(metadata.title).toBeNull()
  })

  it("handles empty input", () => {
    const metadata = extractMetadata("")
    expect(metadata.title).toBeNull()
    expect(metadata.publication).toBeNull()
    expect(metadata.author).toBeNull()
    expect(metadata.publishDate).toBeNull()
  })

  it("decodes HTML entities in metadata values", () => {
    const html = `<html><head><title>Tom &amp; Jerry&apos;s Adventures</title></head></html>`
    const metadata = extractMetadata(html)
    expect(metadata.title).toBe("Tom & Jerry's Adventures")
  })
})

// ============================================================================
// aiExtractBiographicalContent
// ============================================================================

import {
  aiExtractBiographicalContent,
  shouldPassToSynthesis,
  type MechanicalCleanResult,
} from "./content-cleaner.js"

function makeMechanicalResult(
  overrides: Partial<MechanicalCleanResult> = {}
): MechanicalCleanResult {
  return {
    text: "John Wayne was born Marion Robert Morrison in Winterset, Iowa. He grew up in modest circumstances.",
    metadata: {
      title: "John Wayne Biography",
      publication: "The Hollywood Reporter",
      author: "Jane Smith",
      publishDate: "2023-05-15",
    },
    ...overrides,
  }
}

function makeHaikuResponse(
  jsonBody: Record<string, unknown>,
  usage = { input_tokens: 500, output_tokens: 200 }
) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(jsonBody) }],
    usage,
  }
}

describe("aiExtractBiographicalContent", () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it("returns CleanedContent with extracted biographical text for high relevance", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse({
        extracted_text: "John Wayne grew up in Iowa with a difficult childhood.",
        article_title: "John Wayne: A Life Story",
        publication: "The Hollywood Reporter",
        author: "Jane Smith",
        publish_date: "2023-05-15",
        relevance: "high",
        content_type: "biography",
      })
    )

    const result = await aiExtractBiographicalContent(
      makeMechanicalResult(),
      "John Wayne",
      "https://example.com/article",
      "example.com"
    )

    expect(result.extractedText).toBe("John Wayne grew up in Iowa with a difficult childhood.")
    expect(result.relevance).toBe("high")
    expect(result.contentType).toBe("biography")
    expect(result.url).toBe("https://example.com/article")
    expect(result.domain).toBe("example.com")
    expect(result.articleTitle).toBe("John Wayne: A Life Story")
    expect(result.publication).toBe("The Hollywood Reporter")
    expect(result.author).toBe("Jane Smith")
    expect(result.publishDate).toBe("2023-05-15")
  })

  it("returns relevance 'none' for pages with no biographical content", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse({
        extracted_text: null,
        article_title: "Random Page",
        publication: null,
        author: null,
        publish_date: null,
        relevance: "none",
        content_type: "other",
      })
    )

    const result = await aiExtractBiographicalContent(
      makeMechanicalResult(),
      "John Wayne",
      "https://example.com/random",
      "example.com"
    )

    expect(result.extractedText).toBeNull()
    expect(result.relevance).toBe("none")
    expect(result.cleanedBytes).toBe(0)
  })

  it("handles API failures gracefully with fallback", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API rate limited"))

    const input = makeMechanicalResult()
    const result = await aiExtractBiographicalContent(
      input,
      "John Wayne",
      "https://example.com/article",
      "example.com"
    )

    // Should return fallback with mechanical text
    expect(result.extractedText).toBe(input.text)
    expect(result.relevance).toBe("medium")
    expect(result.contentType).toBe("other")
    expect(result.costUsd).toBe(0)
    expect(result.articleTitle).toBe("John Wayne Biography")
    expect(result.publication).toBe("The Hollywood Reporter")
  })

  it("tracks cost correctly based on token usage", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        {
          extracted_text: "Some bio text.",
          relevance: "high",
          content_type: "biography",
        },
        { input_tokens: 1000, output_tokens: 500 }
      )
    )

    const result = await aiExtractBiographicalContent(
      makeMechanicalResult(),
      "John Wayne",
      "https://example.com/article",
      "example.com"
    )

    // Cost = (1000 * $1 / 1M) + (500 * $5 / 1M) = $0.001 + $0.0025 = $0.0035
    expect(result.costUsd).toBeCloseTo(0.0035, 6)
  })

  it("handles markdown code fences in JSON response", async () => {
    const jsonBody = {
      extracted_text: "Bio text extracted from fenced response.",
      article_title: "Fenced Title",
      publication: "Test Pub",
      author: null,
      publish_date: null,
      relevance: "medium",
      content_type: "profile",
    }

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(jsonBody) + "\n```" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const result = await aiExtractBiographicalContent(
      makeMechanicalResult(),
      "John Wayne",
      "https://example.com/article",
      "example.com"
    )

    expect(result.extractedText).toBe("Bio text extracted from fenced response.")
    expect(result.relevance).toBe("medium")
    expect(result.contentType).toBe("profile")
  })

  it("fills in metadata from mechanical result when Haiku response omits fields", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse({
        extracted_text: "Some biographical details.",
        relevance: "high",
        content_type: "biography",
        // Omit article_title, publication, author, publish_date
      })
    )

    const input = makeMechanicalResult({
      metadata: {
        title: "Mechanical Title",
        publication: "Mechanical Pub",
        author: "Mechanical Author",
        publishDate: "2020-01-01",
      },
    })

    const result = await aiExtractBiographicalContent(
      input,
      "John Wayne",
      "https://example.com/article",
      "example.com"
    )

    // Should fall back to mechanical metadata for omitted fields
    expect(result.articleTitle).toBe("Mechanical Title")
    expect(result.publication).toBe("Mechanical Pub")
    expect(result.author).toBe("Mechanical Author")
    expect(result.publishDate).toBe("2020-01-01")
  })
})

// ============================================================================
// shouldPassToSynthesis
// ============================================================================

describe("shouldPassToSynthesis", () => {
  it('returns true for "high"', () => {
    expect(shouldPassToSynthesis("high")).toBe(true)
  })

  it('returns true for "medium"', () => {
    expect(shouldPassToSynthesis("medium")).toBe(true)
  })

  it('returns false for "low"', () => {
    expect(shouldPassToSynthesis("low")).toBe(false)
  })

  it('returns false for "none"', () => {
    expect(shouldPassToSynthesis("none")).toBe(false)
  })
})
