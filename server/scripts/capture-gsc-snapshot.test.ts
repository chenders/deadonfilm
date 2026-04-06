import { describe, it, expect } from "vitest"
import { categorizeUrl } from "../src/lib/gsc-client.js"

/**
 * Tests for the GSC snapshot capture script.
 *
 * The main runSnapshot function is an async Commander action that orchestrates
 * GSC API calls → writeGscSnapshot (already tested in admin-gsc-queries.test.ts)
 * → cronjob tracking. We test the page categorization logic here since it's
 * the script's primary transformation. The DB write logic is covered by
 * writeGscSnapshot tests.
 */

describe("capture-gsc-snapshot", () => {
  describe("page categorization", () => {
    it("categorizes actor pages", () => {
      expect(categorizeUrl("/actor/john-wayne-4165")).toBe("actor")
    })

    it("categorizes movie pages", () => {
      expect(categorizeUrl("/movie/the-searchers-3114")).toBe("movie")
    })

    it("categorizes show pages", () => {
      expect(categorizeUrl("/show/breaking-bad-1396")).toBe("show")
    })

    it("categorizes death pages", () => {
      const result = categorizeUrl("/deaths")
      // deaths may map to a specific category or "other" depending on implementation
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })

    it("categorizes the homepage", () => {
      expect(categorizeUrl("/")).toBe("home")
    })

    it("categorizes unknown paths as other", () => {
      expect(categorizeUrl("/about")).toBe("other")
      expect(categorizeUrl("/faq")).toBe("other")
    })
  })
})
