import { describe, it, expect, vi } from "vitest"
import { extractArticleContent } from "./readability-extract.js"

describe("extractArticleContent", () => {
  it("extracts article content from well-structured HTML", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
  <article>
    <h1>Jeff Buckley: A Life Cut Short</h1>
    <p>Jeff Buckley was an American singer-songwriter and guitarist who drowned in the Wolf River Harbor on May 29, 1997. He was 30 years old at the time of his death.</p>
    <p>Buckley grew up in Southern California and moved to New York City in 1990. He released his only completed studio album, Grace, in 1994.</p>
  </article>
  <footer>Copyright 2024</footer>
</body>
</html>`

    const result = extractArticleContent(html)
    expect(result).not.toBeNull()
    expect(result!.text).toContain("Jeff Buckley")
    expect(result!.text).toContain("Wolf River Harbor")
    // Navigation and footer should be stripped
    expect(result!.text).not.toContain("Home")
    expect(result!.text).not.toContain("Copyright 2024")
  })

  it("strips navigation, ads, and sidebar content", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>News Article</title>
<meta property="og:site_name" content="The Daily News">
</head>
<body>
  <nav>News | Sports | Weather | Entertainment</nav>
  <aside>
    <h3>Trending</h3>
    <ul><li>Story 1</li><li>Story 2</li></ul>
  </aside>
  <main>
    <article>
      <h1>Actor Dies at 85</h1>
      <p>The beloved actor passed away peacefully at his home surrounded by family. He had been battling cancer for several years before his death.</p>
      <p>His career spanned over five decades, with notable roles in numerous films and television shows throughout the years.</p>
    </article>
  </main>
  <div class="newsletter-signup">
    <p>Sign up for our newsletter!</p>
    <input type="email" placeholder="Email">
  </div>
  <footer>Terms of Service | Privacy Policy</footer>
</body>
</html>`

    const result = extractArticleContent(html)
    expect(result).not.toBeNull()
    expect(result!.text).toContain("beloved actor passed away")
    expect(result!.text).toContain("battling cancer")
    // Should not contain navigation
    expect(result!.text).not.toContain("News | Sports | Weather")
    expect(result!.siteName).toBe("The Daily News")
  })

  it("returns null for non-article HTML", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form>
    <input type="text" name="username">
    <input type="password" name="password">
    <button>Log In</button>
  </form>
</body>
</html>`

    const result = extractArticleContent(html)
    // Login form has < 100 chars of text content
    expect(result).toBeNull()
  })

  it("returns null for very short content", () => {
    const html = `<!DOCTYPE html>
<html><body><p>Short.</p></body></html>`

    const result = extractArticleContent(html)
    expect(result).toBeNull()
  })

  it("extracts metadata from HTML", () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>The Life of John Wayne - Biography</title>
  <meta property="og:site_name" content="Biography.com">
  <meta name="author" content="Jane Smith">
</head>
<body>
  <article>
    <h1>The Life of John Wayne</h1>
    <p>John Wayne, born Marion Robert Morrison, was an American actor who became a Hollywood icon. He appeared in over 170 films during his career spanning five decades.</p>
    <p>Wayne grew up in Southern California and attended the University of Southern California on a football scholarship before a surfing accident ended his athletic career.</p>
  </article>
</body>
</html>`

    const result = extractArticleContent(html)
    expect(result).not.toBeNull()
    expect(result!.siteName).toBe("Biography.com")
    expect(result!.author).toBe("Jane Smith")
  })

  it("suppresses jsdom CSS parse errors without logging", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    // HTML with CSS that triggers jsdom parse errors
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>@import url("nonexistent.css"); .broken { content: }</style>
</head>
<body>
  <article>
    <h1>Article with bad CSS</h1>
    <p>This article has broken CSS stylesheets that jsdom cannot parse. The extraction should still work and not log CSS parse errors to the console.</p>
  </article>
</body>
</html>`

    const result = extractArticleContent(html)
    expect(result).not.toBeNull()
    expect(result!.text).toContain("broken CSS stylesheets")

    // CSS parse errors should be suppressed, not forwarded to console.error
    const cssErrors = consoleSpy.mock.calls.filter((call) => {
      const msg = String(call[0])
      return msg.includes("Could not parse CSS stylesheet")
    })
    expect(cssErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })
})
