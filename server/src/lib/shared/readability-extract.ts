/**
 * Shared Readability extraction utility.
 *
 * Uses Mozilla's Readability (the engine behind Firefox Reader View) to
 * extract article content from raw HTML. Far more reliable than regex-based
 * article body extraction for stripping navigation, ads, and sidebars.
 *
 * Dependencies: @mozilla/readability, jsdom
 */

import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"

export interface ArticleExtractionResult {
  text: string
  title: string | null
  author: string | null
  excerpt: string | null
  siteName: string | null
}

/**
 * Extract article content from raw HTML using Mozilla Readability.
 * Returns null if Readability can't identify article content.
 *
 * @param html - Raw HTML string
 * @param url - Optional URL for resolving relative links
 */
export function extractArticleContent(html: string, url?: string): ArticleExtractionResult | null {
  const dom = new JSDOM(html, { url: url || undefined })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article || !article.textContent || article.textContent.length < 100) {
    return null
  }

  return {
    text: article.textContent,
    title: article.title || null,
    author: article.byline || null,
    excerpt: article.excerpt || null,
    siteName: article.siteName || null,
  }
}
