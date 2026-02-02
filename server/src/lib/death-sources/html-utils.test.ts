/**
 * Tests for HTML utility functions.
 *
 * These are security-critical functions used across 16+ death source scrapers
 * to safely extract text from HTML while preventing XSS and other injection attacks.
 */

import { describe, it, expect } from "vitest"
import {
  decodeHtmlEntities,
  removeScriptTags,
  removeStyleTags,
  stripHtmlTags,
  htmlToText,
  cleanHtmlEntities,
  looksLikeCode,
  stripCodeFromText,
  htmlToTextClean,
} from "./html-utils.js"

describe("decodeHtmlEntities", () => {
  describe("named entities", () => {
    it("should decode common named entities", () => {
      expect(decodeHtmlEntities("&lt;script&gt;")).toBe("<script>")
      expect(decodeHtmlEntities("&amp;")).toBe("&")
      expect(decodeHtmlEntities("&quot;")).toBe('"')
      expect(decodeHtmlEntities("&apos;")).toBe("'")
      expect(decodeHtmlEntities("&nbsp;")).toBe("\u00A0")
    })

    it("should decode multiple entities in text", () => {
      expect(decodeHtmlEntities("Tom &amp; Jerry &lt;friends&gt;")).toBe("Tom & Jerry <friends>")
    })

    it("should decode extended named entities", () => {
      expect(decodeHtmlEntities("&copy;")).toBe("©")
      expect(decodeHtmlEntities("&reg;")).toBe("®")
      expect(decodeHtmlEntities("&euro;")).toBe("€")
    })
  })

  describe("numeric entities", () => {
    it("should decode decimal numeric entities", () => {
      expect(decodeHtmlEntities("&#60;")).toBe("<")
      expect(decodeHtmlEntities("&#62;")).toBe(">")
      expect(decodeHtmlEntities("&#38;")).toBe("&")
      expect(decodeHtmlEntities("&#169;")).toBe("©")
    })

    it("should decode hexadecimal numeric entities", () => {
      expect(decodeHtmlEntities("&#x3C;")).toBe("<")
      expect(decodeHtmlEntities("&#x3E;")).toBe(">")
      expect(decodeHtmlEntities("&#x26;")).toBe("&")
      expect(decodeHtmlEntities("&#xA9;")).toBe("©")
    })

    it("should decode mixed numeric and named entities", () => {
      expect(decodeHtmlEntities("&#60;div&#62;&amp;&#x3C;/div&#x3E;")).toBe("<div>&</div>")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(decodeHtmlEntities("")).toBe("")
    })

    it("should handle text without entities", () => {
      expect(decodeHtmlEntities("plain text")).toBe("plain text")
    })

    it("should handle malformed entities", () => {
      // Note: he.decode actually converts &not to ¬ (logical not symbol)
      // This is expected behavior - &not; is a valid HTML entity
      expect(decodeHtmlEntities("&notanentity;")).toBe("¬anentity;")
    })

    it("should handle incomplete entities", () => {
      // Note: he.decode is lenient and decodes entities without semicolons
      expect(decodeHtmlEntities("&lt")).toBe("<")
      expect(decodeHtmlEntities("&#60")).toBe("<")
    })
  })
})

describe("removeScriptTags", () => {
  describe("basic removal", () => {
    it("should remove simple script tag", () => {
      const html = "<p>Before</p><script>alert(1)</script><p>After</p>"
      expect(removeScriptTags(html)).toBe("<p>Before</p><p>After</p>")
    })

    it("should remove script tag with attributes", () => {
      const html = '<script type="text/javascript" src="evil.js">code</script><p>Text</p>'
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should remove multiple script tags", () => {
      const html = "<script>a</script><p>Mid</p><script>b</script>"
      expect(removeScriptTags(html)).toBe("<p>Mid</p>")
    })

    it("should remove script at start of document", () => {
      const html = "<script>evil</script><p>Content</p>"
      expect(removeScriptTags(html)).toBe("<p>Content</p>")
    })

    it("should remove script at end of document", () => {
      const html = "<p>Content</p><script>evil</script>"
      expect(removeScriptTags(html)).toBe("<p>Content</p>")
    })
  })

  describe("case insensitivity", () => {
    it("should remove uppercase SCRIPT tags", () => {
      const html = "<SCRIPT>alert(1)</SCRIPT><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should remove mixed case ScRiPt tags", () => {
      const html = "<ScRiPt>alert(1)</ScRiPt><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should handle mixed case in opening and closing tags", () => {
      const html = "<SCRIPT>code</script><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })
  })

  describe("malformed HTML", () => {
    it("should handle script tag without closing bracket", () => {
      const html = "<p>Before</p><script type='text/javascript'<p>After</p>"
      // When malformed opening tag found, skip rest of document
      expect(removeScriptTags(html)).toBe("<p>Before</p>")
    })

    it("should handle script tag without closing bracket at end", () => {
      const html = "<p>Before</p><script"
      // Opening tag without > at end of document
      expect(removeScriptTags(html)).toBe("<p>Before</p>")
    })

    it("should handle script tag without closing tag", () => {
      const html = "<p>Before</p><script>unclosed<p>After</p>"
      // When no closing tag found, skip rest of document
      expect(removeScriptTags(html)).toBe("<p>Before</p>")
    })

    it("should handle closing script tag without closing bracket", () => {
      const html = "<p>Before</p><script>code</script<p>After</p>"
      // When looking for > after </script, it finds it in <p>, so continues
      expect(removeScriptTags(html)).toBe("<p>Before</p>After</p>")
    })

    it("should handle closing script tag without closing bracket at end", () => {
      const html = "<p>Before</p><script>code</script"
      // Closing tag without > at end of document
      expect(removeScriptTags(html)).toBe("<p>Before</p>")
    })
  })

  describe("tags with spaces", () => {
    it("should remove script tag with space before closing bracket", () => {
      const html = "<script >alert(1)</script><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should remove closing script tag with space", () => {
      const html = "<script>alert(1)</script ><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })
  })

  describe("nested content", () => {
    it("should remove script with nested strings containing <script", () => {
      const html = '<script>var s = "<script>nested</script>";</script><p>Text</p>'
      // State machine finds first <script, then first </script> (which closes "nested")
      // This is a known limitation - doesn't parse JavaScript strings
      expect(removeScriptTags(html)).toBe('";</script><p>Text</p>')
    })

    it("should handle script content with angle brackets", () => {
      const html = "<script>if (1 < 2) { alert('hi') }</script><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(removeScriptTags("")).toBe("")
    })

    it("should handle string with no script tags", () => {
      const html = "<p>Just normal HTML</p>"
      expect(removeScriptTags(html)).toBe(html)
    })

    it("should handle script-like text that isn't a tag", () => {
      const html = "<p>The script was written in JavaScript</p>"
      expect(removeScriptTags(html)).toBe(html)
    })
  })

  describe("XSS prevention", () => {
    it("should remove inline event handler scripts", () => {
      const html = "<script>doEvil()</script><p>Text</p>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should remove script with document.write", () => {
      const html = '<script>document.write("<img src=x onerror=alert(1)>")</script><p>Text</p>'
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })

    it("should remove multiple XSS attempts", () => {
      const html = "<script>alert(1)</script><p>Text</p><script>eval(location.hash)</script>"
      expect(removeScriptTags(html)).toBe("<p>Text</p>")
    })
  })
})

describe("removeStyleTags", () => {
  describe("basic removal", () => {
    it("should remove simple style tag", () => {
      const html = "<p>Before</p><style>body{color:red}</style><p>After</p>"
      expect(removeStyleTags(html)).toBe("<p>Before</p><p>After</p>")
    })

    it("should remove style tag with attributes", () => {
      const html = '<style type="text/css">p{margin:0}</style><p>Text</p>'
      expect(removeStyleTags(html)).toBe("<p>Text</p>")
    })

    it("should remove multiple style tags", () => {
      const html = "<style>a{}</style><p>Mid</p><style>b{}</style>"
      expect(removeStyleTags(html)).toBe("<p>Mid</p>")
    })

    it("should remove style at start of document", () => {
      const html = "<style>*{margin:0}</style><p>Content</p>"
      expect(removeStyleTags(html)).toBe("<p>Content</p>")
    })

    it("should remove style at end of document", () => {
      const html = "<p>Content</p><style>*{padding:0}</style>"
      expect(removeStyleTags(html)).toBe("<p>Content</p>")
    })
  })

  describe("case insensitivity", () => {
    it("should remove uppercase STYLE tags", () => {
      const html = "<STYLE>body{}</STYLE><p>Text</p>"
      expect(removeStyleTags(html)).toBe("<p>Text</p>")
    })

    it("should remove mixed case StYlE tags", () => {
      const html = "<StYlE>p{}</StYlE><p>Text</p>"
      expect(removeStyleTags(html)).toBe("<p>Text</p>")
    })
  })

  describe("malformed HTML", () => {
    it("should handle style tag without closing bracket", () => {
      const html = "<p>Before</p><style<p>After</p>"
      expect(removeStyleTags(html)).toBe("<p>Before</p>")
    })

    it("should handle style tag without closing bracket at end", () => {
      const html = "<p>Before</p><style"
      // Opening tag without > at end of document
      expect(removeStyleTags(html)).toBe("<p>Before</p>")
    })

    it("should handle style tag without closing tag", () => {
      const html = "<p>Before</p><style>unclosed<p>After</p>"
      expect(removeStyleTags(html)).toBe("<p>Before</p>")
    })

    it("should handle closing style tag without closing bracket", () => {
      const html = "<p>Before</p><style>css</style<p>After</p>"
      // When looking for > after </style, it finds it in <p>, so continues
      expect(removeStyleTags(html)).toBe("<p>Before</p>After</p>")
    })

    it("should handle closing style tag without closing bracket at end", () => {
      const html = "<p>Before</p><style>css</style"
      // Closing tag without > at end of document
      expect(removeStyleTags(html)).toBe("<p>Before</p>")
    })
  })

  describe("tags with spaces", () => {
    it("should remove style tag with space before closing bracket", () => {
      const html = "<style >p{}</style><p>Text</p>"
      expect(removeStyleTags(html)).toBe("<p>Text</p>")
    })

    it("should remove closing style tag with space", () => {
      const html = "<style>p{}</style ><p>Text</p>"
      expect(removeStyleTags(html)).toBe("<p>Text</p>")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(removeStyleTags("")).toBe("")
    })

    it("should handle string with no style tags", () => {
      const html = "<p>Just normal HTML</p>"
      expect(removeStyleTags(html)).toBe(html)
    })

    it("should handle style-like text that isn't a tag", () => {
      const html = "<p>The style guide recommends modern CSS</p>"
      expect(removeStyleTags(html)).toBe(html)
    })
  })
})

describe("stripHtmlTags", () => {
  describe("basic stripping", () => {
    it("should strip simple tags", () => {
      expect(stripHtmlTags("<p>Text</p>")).toBe(" Text ")
    })

    it("should strip multiple tags", () => {
      // Each tag replaced with single space: <div> <p> </p> </div>
      expect(stripHtmlTags("<div><p>Text</p></div>")).toBe("  Text  ")
    })

    it("should strip self-closing tags", () => {
      expect(stripHtmlTags("Before<br/>After")).toBe("Before After")
    })

    it("should strip tags with attributes", () => {
      expect(stripHtmlTags('<a href="url">Link</a>')).toBe(" Link ")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(stripHtmlTags("")).toBe("")
    })

    it("should handle text without tags", () => {
      expect(stripHtmlTags("plain text")).toBe("plain text")
    })

    it("should handle angle brackets in text", () => {
      // Limitation: regex matches "< 2 and 3 >" as a tag, replaces with single space
      expect(stripHtmlTags("1 < 2 and 3 > 2")).toBe("1   2")
    })
  })

  describe("complex HTML", () => {
    it("should strip nested tags", () => {
      const html = "<div><span><strong>Bold</strong></span></div>"
      // 6 tags total, each replaced with space
      expect(stripHtmlTags(html)).toBe("   Bold   ")
    })

    it("should strip tags with newlines", () => {
      const html = "<p>\n  Text\n</p>"
      expect(stripHtmlTags(html)).toBe(" \n  Text\n ")
    })
  })
})

describe("htmlToText", () => {
  describe("full pipeline", () => {
    it("should remove scripts, strip tags, decode entities, and normalize whitespace", () => {
      const html = "<p>Tom &amp; Jerry</p><script>alert(1)</script><style>p{}</style><p>Show</p>"
      expect(htmlToText(html)).toBe("Tom & Jerry Show")
    })

    it("should handle complex nested HTML", () => {
      const html = `
        <div>
          <h1>Title &mdash; Subtitle</h1>
          <p>First &amp; second.</p>
          <script>evil()</script>
          <style>p{margin:0}</style>
          <p>Third.</p>
        </div>
      `
      expect(htmlToText(html)).toBe("Title — Subtitle First & second. Third.")
    })

    it("should preserve text order while removing scripts", () => {
      const html = "Start<script>alert(1)</script>Middle<script>alert(2)</script>End"
      expect(htmlToText(html)).toBe("StartMiddleEnd")
    })
  })

  describe("XSS prevention", () => {
    it("should remove script tags before stripping other tags", () => {
      const html = '<script>alert("XSS")</script><p>Safe &lt;text&gt;</p>'
      expect(htmlToText(html)).toBe("Safe <text>")
    })

    it("should handle multiple XSS vectors", () => {
      const html = `
        <script>document.write('<img src=x onerror=alert(1)>')</script>
        <p>Content &amp; more</p>
        <style>body:after{content:"evil"}</style>
        <script>fetch('evil.com')</script>
      `
      expect(htmlToText(html)).toBe("Content & more")
    })

    it("should safely decode entities after removing scripts", () => {
      const html = "<script>&lt;img src=x&gt;</script><p>Text</p>"
      expect(htmlToText(html)).toBe("Text")
    })
  })

  describe("whitespace normalization", () => {
    it("should normalize multiple spaces to single space", () => {
      const html = "<p>Too    many     spaces</p>"
      expect(htmlToText(html)).toBe("Too many spaces")
    })

    it("should normalize newlines to single space", () => {
      const html = "<p>Line\n\n\nbreaks</p>"
      expect(htmlToText(html)).toBe("Line breaks")
    })

    it("should trim leading and trailing whitespace", () => {
      const html = "  <p>  Text  </p>  "
      expect(htmlToText(html)).toBe("Text")
    })

    it("should normalize tabs to single space", () => {
      const html = "<p>Tab\t\t\tseparated</p>"
      expect(htmlToText(html)).toBe("Tab separated")
    })
  })

  describe("entity decoding", () => {
    it("should decode named entities after tag stripping", () => {
      const html = "<p>&copy; 2024 &mdash; Company &amp; Partners</p>"
      expect(htmlToText(html)).toBe("© 2024 — Company & Partners")
    })

    it("should decode numeric entities", () => {
      const html = "<p>&#60;div&#62; &#x26; &#169;</p>"
      expect(htmlToText(html)).toBe("<div> & ©")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(htmlToText("")).toBe("")
    })

    it("should handle plain text without HTML", () => {
      expect(htmlToText("plain text")).toBe("plain text")
    })

    it("should handle only script tags", () => {
      expect(htmlToText("<script>only script</script>")).toBe("")
    })

    it("should handle only style tags", () => {
      expect(htmlToText("<style>only style</style>")).toBe("")
    })

    it("should handle HTML with no text content", () => {
      expect(htmlToText("<div></div><p></p>")).toBe("")
    })
  })

  describe("real-world death scraper scenarios", () => {
    it("should extract clean text from Wikipedia HTML", () => {
      const html = `
        <p>John Doe (born 1950) died on <b>January 1, 2020</b> from
        <a href="/wiki/Cancer">cancer</a>.</p>
        <script>trackPageView()</script>
      `
      // Whitespace normalized to single spaces
      expect(htmlToText(html)).toBe("John Doe (born 1950) died on January 1, 2020 from cancer .")
    })

    it("should extract death information from news article HTML", () => {
      const html = `
        <article>
          <h1>Actor Jane Smith Dies at 75</h1>
          <style>.ad{display:none}</style>
          <p>Jane Smith, known for her role in &quot;Famous Film&quot;,
          passed away on February 15, 2024 &mdash; she was 75.</p>
          <script>loadAds()</script>
        </article>
      `
      expect(htmlToText(html)).toBe(
        'Actor Jane Smith Dies at 75 Jane Smith, known for her role in "Famous Film", passed away on February 15, 2024 — she was 75.'
      )
    })

    it("should handle HTML with special characters in death descriptions", () => {
      const html = "<p>Died from COVID&#8209;19 complications &amp; pneumonia in 2021.</p>"
      expect(htmlToText(html)).toBe("Died from COVID‑19 complications & pneumonia in 2021.")
    })
  })
})

describe("cleanHtmlEntities", () => {
  describe("basic functionality", () => {
    it("should decode entities and normalize whitespace", () => {
      expect(cleanHtmlEntities("Tom &amp;   Jerry")).toBe("Tom & Jerry")
    })

    it("should preserve HTML tags while decoding entities", () => {
      expect(cleanHtmlEntities("<p>Tom &amp; Jerry</p>")).toBe("<p>Tom & Jerry</p>")
    })

    it("should normalize multiple spaces", () => {
      expect(cleanHtmlEntities("Too    many     spaces")).toBe("Too many spaces")
    })

    it("should trim leading and trailing whitespace", () => {
      expect(cleanHtmlEntities("  Text  ")).toBe("Text")
    })
  })

  describe("entity decoding without tag removal", () => {
    it("should decode entities but keep tags", () => {
      expect(cleanHtmlEntities("<strong>&copy; 2024</strong>")).toBe("<strong>© 2024</strong>")
    })

    it("should decode multiple entities", () => {
      expect(cleanHtmlEntities("&lt;div&gt; &amp; &quot;text&quot;")).toBe('<div> & "text"')
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(cleanHtmlEntities("")).toBe("")
    })

    it("should handle text without entities", () => {
      expect(cleanHtmlEntities("<p>plain text</p>")).toBe("<p>plain text</p>")
    })

    it("should normalize newlines and tabs", () => {
      expect(cleanHtmlEntities("Line\n\n\nbreaks\t\ttabs")).toBe("Line breaks tabs")
    })
  })
})

describe("looksLikeCode", () => {
  describe("detects JavaScript code patterns", () => {
    it("should detect function declarations", () => {
      expect(looksLikeCode("function foo() { return this.bar; }")).toBe(true)
    })

    it("should detect const/let/var declarations", () => {
      expect(looksLikeCode("const x = 5; let y = function() { return x; }")).toBe(true)
    })

    it("should detect if statements with braces", () => {
      expect(looksLikeCode("if (data.type == 'video') { this.playVideo(); }")).toBe(true)
    })

    it("should detect document object access", () => {
      expect(looksLikeCode("document.getElementById('content'); return null")).toBe(true)
    })

    it("should detect arrow functions", () => {
      expect(looksLikeCode("items.map(item => { return item.id === id; })")).toBe(true)
    })

    it("should detect this keyword assignments", () => {
      expect(looksLikeCode("this.assetData = data; return this.items")).toBe(true)
    })

    it("should detect class declarations", () => {
      expect(looksLikeCode("class VideoPlayer { constructor() { this.init(); } }")).toBe(true)
    })

    it("should detect async/await patterns", () => {
      expect(looksLikeCode("async function loadData() { await fetch(url); }")).toBe(true)
    })

    it("should detect try/catch blocks", () => {
      expect(looksLikeCode("try { doSomething(); } catch(e) { console.log(e); }")).toBe(true)
    })

    it("should detect complex JavaScript", () => {
      const code =
        "item.id === id) this.assetData = data; if (data.type == 'video') { this.playVideoInline()"
      expect(looksLikeCode(code)).toBe(true)
    })

    it("should detect DOM manipulation code", () => {
      const code = "document.getElementById('content').innerHTML = this.render();"
      expect(looksLikeCode(code)).toBe(true)
    })
  })

  describe("does not detect natural language", () => {
    it("should not detect biography text", () => {
      expect(looksLikeCode("Michael Kenneth Williams was an American actor.")).toBe(false)
    })

    it("should not detect longer biography text", () => {
      const bio = "Michael Kenneth Williams was an American actor known for The Wire."
      expect(looksLikeCode(bio)).toBe(false)
    })

    it("should not detect location text", () => {
      expect(looksLikeCode("Born November 22, 1966 in Brooklyn, New York")).toBe(false)
    })

    it("should not detect death information", () => {
      expect(looksLikeCode("He died on September 6, 2021, from an accidental drug overdose.")).toBe(
        false
      )
    })

    it("should not detect career descriptions", () => {
      expect(
        looksLikeCode(
          "Williams was best known for his role as Omar Little in the HBO series The Wire."
        )
      ).toBe(false)
    })

    it("should not detect quotes or dialogue", () => {
      expect(
        looksLikeCode('He once said, "Acting is about truth and honesty in every moment."')
      ).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("should require multiple patterns to match", () => {
      // Just one pattern isn't enough
      expect(looksLikeCode("The document was filed yesterday")).toBe(false)
      expect(looksLikeCode("He was known as the function coordinator")).toBe(false)
    })

    it("should return false for empty string", () => {
      expect(looksLikeCode("")).toBe(false)
    })

    it("should return false for very short text", () => {
      expect(looksLikeCode("Hi there")).toBe(false)
    })

    it("should return false for text under 20 characters", () => {
      expect(looksLikeCode("const x = 5;")).toBe(false) // Too short
    })
  })
})

describe("stripCodeFromText", () => {
  describe("removes code segments", () => {
    it("should return empty for all-code input", () => {
      const code = "function test() { return this.getValue(); }"
      const result = stripCodeFromText(code)
      expect(result).toBe("")
    })

    it("should preserve biography text", () => {
      const bio = "Michael Williams was an American actor. He died in 2021."
      const result = stripCodeFromText(bio)
      expect(result).toContain("Michael Williams")
      expect(result).toContain("American actor")
    })

    it("should return empty for JavaScript garbage", () => {
      const jsGarbage =
        "item.id === id) this.assetData = data; if (data.type == 'video') { this.playVideoInline()"
      const result = stripCodeFromText(jsGarbage)
      expect(result).toBe("")
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(stripCodeFromText("")).toBe("")
    })
  })
})

describe("htmlToTextClean", () => {
  describe("cleans HTML and strips code", () => {
    it("should clean HTML tags and preserve normal text", () => {
      // Script tags are removed by htmlToText before code detection
      const html = "<p>Normal text here.</p>"
      const result = htmlToTextClean(html)
      expect(result).toContain("Normal text")
    })

    it("should strip embedded JavaScript code", () => {
      // This tests code that appears in text content, not script tags
      const html = "<div>function getData() { return this.items; }</div>"
      const result = htmlToTextClean(html)
      expect(result).toBe("")
    })

    it("should preserve clean biography HTML", () => {
      const html = "<p>John Doe (1950-2020) was an American actor.</p>"
      const result = htmlToTextClean(html)
      expect(result).toContain("John Doe")
      expect(result).toContain("American actor")
    })
  })

  describe("Television Academy garbage case", () => {
    it("should reject JavaScript garbage from client-side rendered pages", () => {
      // This is the actual garbage that was saved to the database
      const jsGarbage =
        "item.id === id) this.assetData = data; if (data.type == 'video') { this.playVideoInline()"
      const result = htmlToTextClean(`<div>${jsGarbage}</div>`)
      expect(result).toBe("")
    })

    it("should reject location matched from JavaScript variable", () => {
      // The regex matched "in content" from "document.getElementById('content')"
      const jsLocation = "document.getElementById('content').innerHTML = value;"
      const result = htmlToTextClean(`<p>${jsLocation}</p>`)
      expect(result).toBe("")
    })
  })
})
