import { describe, it, expect } from "vitest"
import { categorizeUrl, extractPathFromUrl } from "../src/lib/gsc-client.js"

/**
 * Tests for the GSC snapshot capture script.
 *
 * The main runSnapshot function is an async Commander action that orchestrates
 * GSC API calls → writeGscSnapshot (already tested in admin-gsc-queries.test.ts)
 * → cronjob tracking. We test the URL extraction and page categorization logic
 * here since that's the script's primary transformation.
 */

describe("capture-gsc-snapshot", () => {
  describe("extractPathFromUrl", () => {
    it("extracts pathname from full URLs", () => {
      expect(extractPathFromUrl("https://deadonfilm.com/actor/john-wayne-4165")).toBe(
        "/actor/john-wayne-4165"
      )
      expect(extractPathFromUrl("https://deadonfilm.com/movie/the-searchers-3114")).toBe(
        "/movie/the-searchers-3114"
      )
    })

    it("handles URLs with query params and fragments", () => {
      expect(extractPathFromUrl("https://deadonfilm.com/search?q=test")).toBe("/search")
      expect(extractPathFromUrl("https://deadonfilm.com/actor/foo#bio")).toBe("/actor/foo")
    })

    it("returns raw string for invalid URLs", () => {
      expect(extractPathFromUrl("/actor/john-wayne-4165")).toBe("/actor/john-wayne-4165")
      expect(extractPathFromUrl("not-a-url")).toBe("not-a-url")
      expect(extractPathFromUrl("")).toBe("")
    })
  })

  describe("page categorization", () => {
    it("categorizes actor pages", () => {
      expect(categorizeUrl("/actor/john-wayne-4165")).toBe("actor")
    })

    it("categorizes actor death pages", () => {
      expect(categorizeUrl("/actor/john-wayne-4165/death")).toBe("actor-death")
    })

    it("categorizes movie pages", () => {
      expect(categorizeUrl("/movie/the-searchers-3114")).toBe("movie")
    })

    it("categorizes show pages", () => {
      expect(categorizeUrl("/show/breaking-bad-1396")).toBe("show")
    })

    it("categorizes the homepage", () => {
      expect(categorizeUrl("/")).toBe("home")
    })

    it("categorizes unknown paths as other", () => {
      expect(categorizeUrl("/about")).toBe("other")
      expect(categorizeUrl("/faq")).toBe("other")
    })
  })

  describe("end-to-end: full URL → page type", () => {
    it("categorizes full GSC URLs via extractPathFromUrl + categorizeUrl", () => {
      const categorize = (url: string) => categorizeUrl(extractPathFromUrl(url))

      expect(categorize("https://deadonfilm.com/actor/helen-mirren-15854")).toBe("actor")
      expect(categorize("https://deadonfilm.com/movie/fast-x-385687")).toBe("movie")
      expect(categorize("https://deadonfilm.com/")).toBe("home")
      expect(categorize("https://deadonfilm.com/about")).toBe("other")
    })
  })
})
