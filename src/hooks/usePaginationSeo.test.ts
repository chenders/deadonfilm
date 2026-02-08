import { describe, it, expect } from "vitest"
import { buildPageUrl, usePaginationSeo } from "./usePaginationSeo"

describe("buildPageUrl", () => {
  it("returns clean URL for page 1", () => {
    expect(buildPageUrl("/deaths/all", 1)).toBe("https://deadonfilm.com/deaths/all")
  })

  it("returns URL with ?page=N for page 2+", () => {
    expect(buildPageUrl("/deaths/all", 2)).toBe("https://deadonfilm.com/deaths/all?page=2")
    expect(buildPageUrl("/deaths/all", 10)).toBe("https://deadonfilm.com/deaths/all?page=10")
  })

  it("treats page 0 and negative as page 1", () => {
    expect(buildPageUrl("/deaths/all", 0)).toBe("https://deadonfilm.com/deaths/all")
    expect(buildPageUrl("/deaths/all", -1)).toBe("https://deadonfilm.com/deaths/all")
  })

  it("handles dynamic paths", () => {
    expect(buildPageUrl("/causes-of-death/cancer/lung-cancer", 3)).toBe(
      "https://deadonfilm.com/causes-of-death/cancer/lung-cancer?page=3"
    )
  })
})

describe("usePaginationSeo", () => {
  it("returns correct values for page 1", () => {
    const result = usePaginationSeo({ currentPage: 1, totalPages: 10, basePath: "/deaths/all" })

    expect(result.canonicalUrl).toBe("https://deadonfilm.com/deaths/all")
    expect(result.prevUrl).toBeNull()
    expect(result.nextUrl).toBe("https://deadonfilm.com/deaths/all?page=2")
    expect(result.noindex).toBe(false)
  })

  it("returns correct values for a middle page", () => {
    const result = usePaginationSeo({ currentPage: 5, totalPages: 10, basePath: "/deaths/all" })

    expect(result.canonicalUrl).toBe("https://deadonfilm.com/deaths/all?page=5")
    expect(result.prevUrl).toBe("https://deadonfilm.com/deaths/all?page=4")
    expect(result.nextUrl).toBe("https://deadonfilm.com/deaths/all?page=6")
    expect(result.noindex).toBe(false)
  })

  it("returns correct values for the last page", () => {
    const result = usePaginationSeo({ currentPage: 10, totalPages: 10, basePath: "/deaths/all" })

    expect(result.canonicalUrl).toBe("https://deadonfilm.com/deaths/all?page=10")
    expect(result.prevUrl).toBe("https://deadonfilm.com/deaths/all?page=9")
    expect(result.nextUrl).toBeNull()
    expect(result.noindex).toBe(false)
  })

  it("returns noindex for pages beyond threshold (>20)", () => {
    const result = usePaginationSeo({ currentPage: 21, totalPages: 50, basePath: "/deaths/all" })

    expect(result.noindex).toBe(true)
  })

  it("returns noindex=false for page exactly at threshold (20)", () => {
    const result = usePaginationSeo({ currentPage: 20, totalPages: 50, basePath: "/deaths/all" })

    expect(result.noindex).toBe(false)
  })

  it("returns no prev/next for single-page result", () => {
    const result = usePaginationSeo({ currentPage: 1, totalPages: 1, basePath: "/deaths/all" })

    expect(result.canonicalUrl).toBe("https://deadonfilm.com/deaths/all")
    expect(result.prevUrl).toBeNull()
    expect(result.nextUrl).toBeNull()
    expect(result.noindex).toBe(false)
  })

  it("returns clean prev URL when on page 2", () => {
    const result = usePaginationSeo({ currentPage: 2, totalPages: 5, basePath: "/deaths/all" })

    expect(result.prevUrl).toBe("https://deadonfilm.com/deaths/all")
  })
})
