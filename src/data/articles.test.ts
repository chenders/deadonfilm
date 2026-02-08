import { describe, it, expect } from "vitest"
import { articles, getArticleBySlug, getRelatedArticles, getReadingTime } from "./articles"

describe("articles registry", () => {
  it("has unique slugs", () => {
    const slugs = articles.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("all articles have required fields", () => {
    for (const article of articles) {
      expect(article.slug).toBeTruthy()
      expect(article.title).toBeTruthy()
      expect(article.description).toBeTruthy()
      expect(article.category).toBeTruthy()
      expect(article.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(article.author).toBeTruthy()
      expect(article.wordCount).toBeGreaterThan(0)
      expect(article.component).toBeDefined()
    }
  })
})

describe("getArticleBySlug", () => {
  it("returns the correct article for a known slug", () => {
    const article = getArticleBySlug("deadliest-horror-franchises")
    expect(article).toBeDefined()
    expect(article!.title).toBe("The Deadliest Horror Franchises: Cast Mortality Rates Compared")
  })

  it("returns undefined for an unknown slug", () => {
    expect(getArticleBySlug("nonexistent-article")).toBeUndefined()
  })
})

describe("getRelatedArticles", () => {
  it("resolves related slugs to ArticleMeta objects", () => {
    const article = {
      ...articles[0],
      relatedSlugs: ["deadliest-horror-franchises"],
    }
    const related = getRelatedArticles(article)
    expect(related).toHaveLength(1)
    expect(related[0].slug).toBe("deadliest-horror-franchises")
  })

  it("filters out non-existent slugs", () => {
    const article = {
      ...articles[0],
      relatedSlugs: ["nonexistent-article", "deadliest-horror-franchises"],
    }
    const related = getRelatedArticles(article)
    expect(related).toHaveLength(1)
    expect(related[0].slug).toBe("deadliest-horror-franchises")
  })

  it("returns empty array when no related slugs", () => {
    const article = { ...articles[0], relatedSlugs: [] }
    expect(getRelatedArticles(article)).toEqual([])
  })
})

describe("getReadingTime", () => {
  it("returns 1 minute for 238 words or fewer", () => {
    expect(getReadingTime(238)).toBe(1)
    expect(getReadingTime(1)).toBe(1)
  })

  it("rounds up to 2 minutes for 239 words", () => {
    expect(getReadingTime(239)).toBe(2)
  })

  it("returns 2 minutes for 476 words", () => {
    expect(getReadingTime(476)).toBe(2)
  })

  it("returns 3 minutes for 477 words", () => {
    expect(getReadingTime(477)).toBe(3)
  })
})
