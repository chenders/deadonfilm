/**
 * Mechanical (regex-based) content cleaning pipeline.
 *
 * Stage 1 of a three-stage cleaning pipeline:
 *   1. Mechanical pre-clean (this module) - strips structural noise, extracts article body, metadata
 *   2. Haiku AI extraction (Stage 2) - relevance scoring, content type classification
 *   3. Claude synthesis (Stage 3) - combines multi-source data into structured biography
 *
 * More aggressive than the simple `htmlToText()` in death-sources/html-utils.ts.
 * Reuses utilities from that module where possible.
 */

import {
  decodeHtmlEntities,
  stripHtmlTags,
  removeScriptTags,
  removeStyleTags,
  looksLikeCode,
} from "../death-sources/html-utils.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata extracted from page HTML before tag stripping.
 */
export interface PageMetadata {
  title: string | null
  publication: string | null
  author: string | null
  publishDate: string | null
}

/**
 * Result of the mechanical pre-clean pipeline.
 */
export interface MechanicalCleanResult {
  text: string
  metadata: PageMetadata
}

// ============================================================================
// State machine tag removal (handles nesting robustly)
// ============================================================================

/**
 * Remove a specific tag and its content using a state machine approach.
 * Handles nested content, malformed tags, and self-closing variants.
 *
 * Modeled after removeScriptTags/removeStyleTags in html-utils.ts.
 */
function removeTagWithContent(html: string, tagName: string): string {
  let result = ""
  let i = 0
  const lowerHtml = html.toLowerCase()
  const openTag = `<${tagName.toLowerCase()}`
  const closeTag = `</${tagName.toLowerCase()}`

  while (i < html.length) {
    const tagStart = lowerHtml.indexOf(openTag, i)
    if (tagStart === -1) {
      result += html.slice(i)
      break
    }

    // Verify it's actually a tag boundary (not e.g. <scriptx)
    const charAfterTag = lowerHtml[tagStart + openTag.length]
    if (
      charAfterTag !== undefined &&
      charAfterTag !== ">" &&
      charAfterTag !== " " &&
      charAfterTag !== "\t" &&
      charAfterTag !== "\n" &&
      charAfterTag !== "\r" &&
      charAfterTag !== "/"
    ) {
      // Not actually this tag (e.g. <navigation when looking for <nav)
      result += html.slice(i, tagStart + openTag.length)
      i = tagStart + openTag.length
      continue
    }

    // Add content before the tag
    result += html.slice(i, tagStart)

    // Find the end of the opening tag
    const tagEnd = html.indexOf(">", tagStart)
    if (tagEnd === -1) {
      // Malformed - no closing bracket, skip rest
      break
    }

    // Check for self-closing tag (e.g. <iframe ... />)
    if (html[tagEnd - 1] === "/") {
      i = tagEnd + 1
      continue
    }

    // Find closing tag, handling nesting
    let depth = 1
    let searchFrom = tagEnd + 1

    while (depth > 0 && searchFrom < html.length) {
      const nextOpen = lowerHtml.indexOf(openTag, searchFrom)
      const nextClose = lowerHtml.indexOf(closeTag, searchFrom)

      if (nextClose === -1) {
        // No closing tag found, skip rest of document
        searchFrom = html.length
        break
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check if nested open is actually a tag boundary
        const nextCharAfterOpen = lowerHtml[nextOpen + openTag.length]
        if (
          nextCharAfterOpen === ">" ||
          nextCharAfterOpen === " " ||
          nextCharAfterOpen === "\t" ||
          nextCharAfterOpen === "\n" ||
          nextCharAfterOpen === "\r" ||
          nextCharAfterOpen === "/" ||
          nextCharAfterOpen === undefined
        ) {
          depth++
        }
        searchFrom = nextOpen + openTag.length
      } else {
        depth--
        if (depth === 0) {
          const closeEnd = html.indexOf(">", nextClose)
          if (closeEnd === -1) {
            searchFrom = html.length
          } else {
            searchFrom = closeEnd + 1
          }
        } else {
          searchFrom = nextClose + closeTag.length
        }
      }
    }

    i = searchFrom
  }

  return result
}

// ============================================================================
// Noise removal
// ============================================================================

/**
 * Tags whose content is structural noise and should be fully removed.
 * These are processed via the state machine for robust nested handling.
 */
const STRUCTURAL_NOISE_TAGS = ["script", "style", "noscript", "iframe", "svg", "canvas"]

/**
 * Semantic layout tags that typically contain navigation/chrome, not article content.
 */
const LAYOUT_NOISE_TAGS = ["nav", "footer", "header", "aside"]

/**
 * Class/ID substring patterns that indicate noise elements.
 * Matched as substrings within class or id attribute values.
 */
const NOISE_CLASS_PATTERNS = [
  "advertisement",
  "sponsored",
  "cookie",
  "gdpr",
  "onetrust",
  "newsletter",
  "signup",
  "subscribe",
  "paywall",
  "comment-section",
  "comments",
  "disqus",
  "related-articles",
  "recommended",
  "you-might-like",
  "more-stories",
  "social-share",
  "share-buttons",
  "social-media",
  "breadcrumb",
  "pagination",
]

/**
 * ID patterns that indicate noise elements.
 */
const NOISE_ID_PATTERNS = ["google_ads", "comments", "sidebar"]

/**
 * Remove elements matching class or id noise patterns.
 *
 * For each pattern, finds opening tags with matching class/id attributes
 * and removes them plus their content up to the matching closing tag.
 */
function removeNoiseByAttribute(html: string): string {
  let result = html

  // Combine class and id patterns for matching
  const allPatterns = [
    ...NOISE_CLASS_PATTERNS.map((p) => ({ attr: "class", pattern: p })),
    ...NOISE_ID_PATTERNS.map((p) => ({ attr: "id", pattern: p })),
  ]

  for (const { attr, pattern } of allPatterns) {
    // Build a regex that matches an opening tag with a matching attribute value
    // This finds the start position; we then use nesting-aware removal
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern is escaped via escapeRegex()
    const attrRegex = new RegExp(
      `<(\\w+)\\b[^>]*\\b${attr}\\s*=\\s*"[^"]*${escapeRegex(pattern)}[^"]*"[^>]*>`,
      "gi"
    )

    let match: RegExpExecArray | null
    // Re-search from the start after each removal since positions shift
    while ((match = attrRegex.exec(result)) !== null) {
      const tagName = match[1]
      const startPos = match.index

      // Find the matching close tag, handling nesting
      const closePos = findMatchingCloseTag(result, tagName, startPos + match[0].length)

      if (closePos !== -1) {
        result = result.slice(0, startPos) + result.slice(closePos)
        // Reset regex lastIndex since we modified the string
        attrRegex.lastIndex = startPos
      } else {
        // No close tag found; just remove the opening tag match
        // and keep searching
        break
      }
    }
  }

  return result
}

/**
 * Find the position just after the matching close tag, handling nesting.
 * Returns the position after the closing `>` of the matching close tag,
 * or -1 if not found.
 */
function findMatchingCloseTag(html: string, tagName: string, startFrom: number): number {
  const lowerHtml = html.toLowerCase()
  const lowerTag = tagName.toLowerCase()
  const openTag = `<${lowerTag}`
  const closeTag = `</${lowerTag}`

  let depth = 1
  let pos = startFrom

  while (depth > 0 && pos < html.length) {
    const nextOpen = lowerHtml.indexOf(openTag, pos)
    const nextClose = lowerHtml.indexOf(closeTag, pos)

    if (nextClose === -1) {
      return -1 // No matching close tag
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Check it's actually a tag boundary
      const charAfter = lowerHtml[nextOpen + openTag.length]
      if (
        charAfter === ">" ||
        charAfter === " " ||
        charAfter === "\t" ||
        charAfter === "\n" ||
        charAfter === "\r" ||
        charAfter === "/" ||
        charAfter === undefined
      ) {
        depth++
      }
      pos = nextOpen + openTag.length
    } else {
      depth--
      if (depth === 0) {
        const closeEnd = html.indexOf(">", nextClose)
        return closeEnd === -1 ? -1 : closeEnd + 1
      }
      pos = nextClose + closeTag.length
    }
  }

  return -1
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&")
}

// ============================================================================
// Article body extraction
// ============================================================================

/**
 * Priority-ordered selectors for extracting the main article body.
 * First match wins.
 */
const ARTICLE_SELECTORS: Array<{
  description: string
  match: (html: string) => string | null
}> = [
  {
    description: '<article> or <div role="article">',
    match: (html) =>
      extractTagContent(html, "article") ?? extractByAttribute(html, "div", "role", "article"),
  },
  {
    description: "itemprop=articleBody or class=article-body",
    match: (html) =>
      extractByAttribute(html, "div", "itemprop", "articleBody") ??
      extractByAttribute(html, "div", "class", "article-body"),
  },
  {
    description: '<main> or <div role="main">',
    match: (html) =>
      extractTagContent(html, "main") ?? extractByAttribute(html, "div", "role", "main"),
  },
  {
    description: "entry-content, post-content, story-body",
    match: (html) =>
      extractByAttribute(html, "div", "class", "entry-content") ??
      extractByAttribute(html, "div", "class", "post-content") ??
      extractByAttribute(html, "div", "class", "story-body"),
  },
  {
    description: "id=content, class=content",
    match: (html) =>
      extractByAttribute(html, "div", "id", "content") ??
      extractByAttribute(html, "div", "class", "content"),
  },
]

/**
 * Extract content of the first matching tag (e.g. <article>...</article>).
 * Returns the inner HTML of the matched tag, or null if not found.
 */
function extractTagContent(html: string, tagName: string): string | null {
  const lowerHtml = html.toLowerCase()
  const openTag = `<${tagName.toLowerCase()}`
  const tagStart = lowerHtml.indexOf(openTag)

  if (tagStart === -1) return null

  // Verify it's a tag boundary
  const charAfter = lowerHtml[tagStart + openTag.length]
  if (
    charAfter !== ">" &&
    charAfter !== " " &&
    charAfter !== "\t" &&
    charAfter !== "\n" &&
    charAfter !== "\r" &&
    charAfter !== "/" &&
    charAfter !== undefined
  ) {
    return null
  }

  const tagEnd = html.indexOf(">", tagStart)
  if (tagEnd === -1) return null

  const contentStart = tagEnd + 1
  const closeTag = `</${tagName.toLowerCase()}`
  const closeStart = lowerHtml.indexOf(closeTag, contentStart)
  if (closeStart === -1) return null

  return html.slice(contentStart, closeStart)
}

/**
 * Extract content of an element matching tag + attribute value.
 * The attribute value is matched as an exact token within the attribute string
 * (for class) or as an exact match (for id, role, itemprop).
 */
function extractByAttribute(
  html: string,
  tagName: string,
  attr: string,
  value: string
): string | null {
  const lowerHtml = html.toLowerCase()
  const lowerTag = tagName.toLowerCase()
  const lowerAttr = attr.toLowerCase()
  const lowerValue = value.toLowerCase()

  // Build regex to find the opening tag with matching attribute
  // For class, match as a token within space-separated values
  let attrPattern: RegExp
  if (lowerAttr === "class") {
    // eslint-disable-next-line security/detect-non-literal-regexp -- inputs are escaped via escapeRegex()
    attrPattern = new RegExp(
      `<${escapeRegex(lowerTag)}\\b[^>]*\\b${escapeRegex(lowerAttr)}\\s*=\\s*"[^"]*(?:^|\\s)${escapeRegex(lowerValue)}(?:\\s|$|")[^"]*"[^>]*>`,
      "i"
    )
  } else {
    // eslint-disable-next-line security/detect-non-literal-regexp -- inputs are escaped via escapeRegex()
    attrPattern = new RegExp(
      `<${escapeRegex(lowerTag)}\\b[^>]*\\b${escapeRegex(lowerAttr)}\\s*=\\s*"${escapeRegex(lowerValue)}"[^>]*>`,
      "i"
    )
  }

  const match = attrPattern.exec(lowerHtml)
  if (!match) return null

  const contentStart = match.index + match[0].length
  const closePos = findMatchingCloseTag(html, lowerTag, contentStart)
  if (closePos === -1) return null

  // closePos is just after the closing >, we need content before the close tag
  const closeTag = `</${lowerTag}`
  const closeTagStart = lowerHtml.lastIndexOf(closeTag, closePos)
  if (closeTagStart === -1) return null

  return html.slice(contentStart, closeTagStart)
}

// ============================================================================
// Metadata extraction
// ============================================================================

/**
 * Extract metadata from HTML before stripping tags.
 *
 * Extracts:
 * - title: from <title> tag
 * - publication: from <meta property="og:site_name">
 * - author: from <meta name="author"> or <meta property="article:author">
 * - publishDate: from <time datetime="..."> or <meta property="article:published_time">
 */
export function extractMetadata(html: string): PageMetadata {
  if (!html) {
    return { title: null, publication: null, author: null, publishDate: null }
  }

  const title = extractMetaTitle(html)
  const publication = extractMetaPublication(html)
  const author = extractMetaAuthor(html)
  const publishDate = extractMetaPublishDate(html)

  return { title, publication, author, publishDate }
}

function extractMetaTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return null
  const decoded = decodeHtmlEntities(match[1].trim())
  return decoded || null
}

function extractMetaPublication(html: string): string | null {
  const match =
    /<meta\s+[^>]*property\s*=\s*"og:site_name"\s+[^>]*content\s*=\s*"([^"]*)"/i.exec(html) ??
    /<meta\s+[^>]*content\s*=\s*"([^"]*)"\s+[^>]*property\s*=\s*"og:site_name"/i.exec(html)
  if (!match) return null
  const decoded = decodeHtmlEntities(match[1].trim())
  return decoded || null
}

function extractMetaAuthor(html: string): string | null {
  // Try <meta name="author">
  const authorMeta =
    /<meta\s+[^>]*name\s*=\s*"author"\s+[^>]*content\s*=\s*"([^"]*)"/i.exec(html) ??
    /<meta\s+[^>]*content\s*=\s*"([^"]*)"\s+[^>]*name\s*=\s*"author"/i.exec(html)
  if (authorMeta) {
    const decoded = decodeHtmlEntities(authorMeta[1].trim())
    if (decoded) return decoded
  }

  // Try <meta property="article:author">
  const articleAuthor =
    /<meta\s+[^>]*property\s*=\s*"article:author"\s+[^>]*content\s*=\s*"([^"]*)"/i.exec(html) ??
    /<meta\s+[^>]*content\s*=\s*"([^"]*)"\s+[^>]*property\s*=\s*"article:author"/i.exec(html)
  if (articleAuthor) {
    const decoded = decodeHtmlEntities(articleAuthor[1].trim())
    if (decoded) return decoded
  }

  return null
}

function extractMetaPublishDate(html: string): string | null {
  // Try <meta property="article:published_time">
  const metaDate =
    /<meta\s+[^>]*property\s*=\s*"article:published_time"\s+[^>]*content\s*=\s*"([^"]*)"/i.exec(
      html
    ) ??
    /<meta\s+[^>]*content\s*=\s*"([^"]*)"\s+[^>]*property\s*=\s*"article:published_time"/i.exec(
      html
    )
  if (metaDate) {
    const decoded = decodeHtmlEntities(metaDate[1].trim())
    if (decoded) return decoded
  }

  // Try <time datetime="...">
  const timeTag = /<time\s+[^>]*datetime\s*=\s*"([^"]*)"/i.exec(html)
  if (timeTag) {
    const decoded = decodeHtmlEntities(timeTag[1].trim())
    if (decoded) return decoded
  }

  return null
}

// ============================================================================
// Citation marker removal
// ============================================================================

/**
 * Remove citation markers like [1], [2], [edit], [citation needed].
 */
function removeCitationMarkers(text: string): string {
  // Remove [number] references
  text = text.replace(/\[\d+\]/g, "")
  // Remove [edit], [citation needed], and similar bracketed annotations
  text = text.replace(
    /\[\s*(?:edit|citation needed|clarification needed|when\?|who\?|where\?|dubious|discuss|further explanation needed|original research\??|not in citation given|failed verification|unreliable source\??)\s*\]/gi,
    ""
  )
  return text
}

// ============================================================================
// Whitespace normalization
// ============================================================================

/**
 * Collapse whitespace: multiple spaces to single, multiple newlines to max 2.
 */
function collapseWhitespace(text: string): string {
  // Replace multiple spaces (not newlines) with a single space
  text = text.replace(/[^\S\n]+/g, " ")
  // Replace 3+ newlines with exactly 2
  text = text.replace(/\n{3,}/g, "\n\n")
  // Trim leading/trailing whitespace on each line
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
  // Trim the whole string
  return text.trim()
}

// ============================================================================
// Code fragment removal
// ============================================================================

/**
 * Remove code fragments on a per-paragraph basis.
 *
 * Unlike stripCodeFromText (which checks the whole text and splits by sentence
 * delimiters, dropping short segments), this operates at the paragraph level
 * using double-newline boundaries. Each paragraph is checked independently
 * with looksLikeCode, preserving non-code paragraphs regardless of length.
 */
function stripCodeParagraphs(text: string): string {
  if (!text) return ""

  // Split on whitespace runs that contain at least one newline
  // (approximating paragraph boundaries from HTML block element spacing)
  const paragraphs = text.split(/\n\s*\n|\n/)

  const filtered = paragraphs.filter((para) => {
    const trimmed = para.trim()
    if (!trimmed) return false
    return !looksLikeCode(trimmed)
  })

  return filtered.map((p) => p.trim()).join("\n")
}

// ============================================================================
// Main pipeline
// ============================================================================

/**
 * Mechanical pre-clean pipeline for raw HTML content.
 *
 * Takes raw HTML and returns cleaned text + extracted metadata.
 * This is Stage 1 of the three-stage cleaning pipeline.
 *
 * Steps (in order):
 * 1. Extract metadata (before any stripping)
 * 2. Remove structural noise tags (script, style, noscript, iframe, svg, canvas)
 * 3. Remove layout noise tags (nav, footer, header, aside)
 * 4. Remove elements with ad/cookie/newsletter/comments class/id patterns
 * 5. Extract article body (priority: article > main > content divs > fallback)
 * 6. Strip remaining HTML tags
 * 7. Decode HTML entities
 * 8. Remove citation markers
 * 9. Strip code fragments
 * 10. Collapse whitespace
 */
export function mechanicalPreClean(html: string): MechanicalCleanResult {
  const emptyResult: MechanicalCleanResult = {
    text: "",
    metadata: { title: null, publication: null, author: null, publishDate: null },
  }

  if (!html || typeof html !== "string") {
    return emptyResult
  }

  // Step 1: Extract metadata before any modifications
  const metadata = extractMetadata(html)

  // Step 2: Remove structural noise tags using state machine
  let cleaned = html
  for (const tag of STRUCTURAL_NOISE_TAGS) {
    if (tag === "script") {
      cleaned = removeScriptTags(cleaned)
    } else if (tag === "style") {
      cleaned = removeStyleTags(cleaned)
    } else {
      cleaned = removeTagWithContent(cleaned, tag)
    }
  }

  // Step 3: Remove layout noise tags
  for (const tag of LAYOUT_NOISE_TAGS) {
    cleaned = removeTagWithContent(cleaned, tag)
  }

  // Step 4: Remove elements with noise class/id patterns
  cleaned = removeNoiseByAttribute(cleaned)

  // Step 5: Extract article body (first match wins in priority order)
  let articleBody: string | null = null
  for (const selector of ARTICLE_SELECTORS) {
    articleBody = selector.match(cleaned)
    if (articleBody !== null) {
      break
    }
  }

  // Use extracted article body if found, otherwise use everything remaining
  const contentHtml = articleBody ?? cleaned

  // Step 6: Strip remaining HTML tags
  // First convert block-level closing tags to newlines to preserve paragraph breaks,
  // then strip all remaining tags to spaces.
  let text = contentHtml.replace(
    /<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article|pre)>/gi,
    "\n"
  )
  text = stripHtmlTags(text)

  // Step 7: Decode HTML entities
  text = decodeHtmlEntities(text)

  // Step 8: Remove citation markers
  text = removeCitationMarkers(text)

  // Step 9: Strip code fragments
  // We use a paragraph-level approach rather than stripCodeFromText directly,
  // because stripCodeFromText's sentence splitting drops short segments (<15 chars)
  // and its whole-text looksLikeCode check can trigger on mixed content.
  // Instead, split by double-newlines (paragraph boundaries from HTML block elements)
  // and remove paragraphs that look like code individually.
  text = stripCodeParagraphs(text)

  // Step 10: Collapse whitespace
  text = collapseWhitespace(text)

  return { text, metadata }
}
