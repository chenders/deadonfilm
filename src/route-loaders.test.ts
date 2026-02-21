/**
 * Tests for route-level data loaders used by SSR prefetching.
 */

import { describe, it, expect } from "vitest"
import { matchRouteLoaders } from "./route-loaders"

const FETCH_BASE = "http://127.0.0.1:8080"

/** Helper: get query keys and URLs from a matched loader */
function getSpecs(url: string) {
  const loaderFn = matchRouteLoaders(url)
  if (!loaderFn) return null
  return loaderFn(FETCH_BASE).map((spec) => ({
    queryKey: spec.queryKey,
  }))
}

describe("matchRouteLoaders", () => {
  // ── No match ────────────────────────────────────────────────────

  it("returns null for unknown paths", () => {
    expect(matchRouteLoaders("/about")).toBeNull()
    expect(matchRouteLoaders("/faq")).toBeNull()
    expect(matchRouteLoaders("/methodology")).toBeNull()
  })

  it("returns null for admin paths", () => {
    expect(matchRouteLoaders("/admin/dashboard")).toBeNull()
  })

  // ── Actor routes ────────────────────────────────────────────────

  it("matches actor page", () => {
    const specs = getSpecs("/actor/john-wayne-2157")
    expect(specs).toEqual([{ queryKey: ["actors", "john-wayne-2157"] }])
  })

  it("returns null for actor death redirect route", () => {
    // /actor/:slug/death is a <Navigate> redirect in App.tsx, no data to prefetch
    expect(matchRouteLoaders("/actor/john-wayne-2157/death")).toBeNull()
  })

  // ── Movie routes ────────────────────────────────────────────────

  it("matches movie page with valid ID", () => {
    const specs = getSpecs("/movie/the-shining-694")
    expect(specs).toEqual([{ queryKey: ["movies", 694] }])
  })

  it("returns empty specs for movie with invalid slug", () => {
    const specs = getSpecs("/movie/invalid-slug")
    expect(specs).toEqual([])
  })

  // ── Show routes ─────────────────────────────────────────────────

  it("matches show page", () => {
    const specs = getSpecs("/show/breaking-bad-1396")
    expect(specs).toEqual([{ queryKey: ["shows", 1396] }])
  })

  it("matches season page", () => {
    const specs = getSpecs("/show/breaking-bad-1396/season/3")
    expect(specs).toEqual([{ queryKey: ["season", 1396, 3] }])
  })

  // ── Episode routes ──────────────────────────────────────────────

  it("matches episode page", () => {
    const specs = getSpecs("/episode/ozymandias-s5e14-breaking-bad-1396")
    expect(specs).toEqual([{ queryKey: ["episode", 1396, 5, 14] }])
  })

  it("returns empty specs for episode with invalid slug", () => {
    const specs = getSpecs("/episode/invalid-episode-slug")
    expect(specs).toEqual([])
  })

  // ── Causes of death routes ──────────────────────────────────────

  it("matches causes-of-death index", () => {
    const specs = getSpecs("/causes-of-death")
    expect(specs).toEqual([{ queryKey: ["causes-of-death-index"] }])
  })

  it("matches causes-of-death category", () => {
    const specs = getSpecs("/causes-of-death/natural")
    expect(specs).toEqual([
      { queryKey: ["causes-of-death-category", "natural", 1, false, undefined] },
    ])
  })

  it("matches causes-of-death specific cause", () => {
    const specs = getSpecs("/causes-of-death/natural/heart-attack")
    expect(specs).toEqual([{ queryKey: ["specific-cause", "natural", "heart-attack", 1, false] }])
  })

  it("passes page and includeObscure params for causes-of-death", () => {
    const specs = getSpecs("/causes-of-death/natural/heart-attack?page=3&includeObscure=true")
    expect(specs).toEqual([{ queryKey: ["specific-cause", "natural", "heart-attack", 3, true] }])
  })

  // ── Deaths routes ───────────────────────────────────────────────

  it("matches deaths index", () => {
    const specs = getSpecs("/deaths")
    expect(specs).toEqual([{ queryKey: ["cause-categories"] }])
  })

  it("matches deaths by decade", () => {
    const specs = getSpecs("/deaths/decade/1990s")
    expect(specs).toEqual([{ queryKey: ["deaths-by-decade", "1990s", 1, false] }])
  })

  it("matches notable deaths", () => {
    const specs = getSpecs("/deaths/notable")
    expect(specs).toEqual([{ queryKey: ["notable-deaths", 1, 20, "all", false, "date", "desc"] }])
  })

  it("matches all deaths with sort params", () => {
    const specs = getSpecs("/deaths/all?sort=name&dir=asc&page=2")
    expect(specs).toEqual([{ queryKey: ["all-deaths", 2, false, "", "name", "asc"] }])
  })

  it("matches all deaths with search param", () => {
    const specs = getSpecs("/deaths/all?search=cancer")
    expect(specs).toEqual([{ queryKey: ["all-deaths", 1, false, "cancer", "date", "desc"] }])
  })

  it("matches deaths decades index", () => {
    const specs = getSpecs("/deaths/decades")
    expect(specs).toEqual([{ queryKey: ["decade-categories"] }])
  })

  it("matches deaths by cause (old route)", () => {
    const specs = getSpecs("/deaths/cancer")
    expect(specs).toEqual([{ queryKey: ["deaths-by-cause", "cancer", 1, false] }])
  })

  // ── Genre routes ────────────────────────────────────────────────

  it("matches genres index", () => {
    const specs = getSpecs("/movies/genres")
    expect(specs).toEqual([{ queryKey: ["genre-categories"] }])
  })

  it("matches movies by genre", () => {
    const specs = getSpecs("/movies/genre/horror?page=2")
    expect(specs).toEqual([{ queryKey: ["movies-by-genre", "horror", 2] }])
  })

  // ── Special pages ───────────────────────────────────────────────

  it("matches forever young", () => {
    const specs = getSpecs("/forever-young")
    expect(specs).toEqual([{ queryKey: ["forever-young", 1, "year", "desc"] }])
  })

  it("matches covid deaths", () => {
    const specs = getSpecs("/covid-deaths?page=2&includeObscure=true")
    expect(specs).toEqual([{ queryKey: ["covid-deaths", 2, true] }])
  })

  it("matches unnatural deaths", () => {
    const specs = getSpecs("/unnatural-deaths?category=murder")
    expect(specs).toEqual([{ queryKey: ["unnatural-deaths", 1, "murder", false, false] }])
  })

  it("matches unnatural deaths with showSelfInflicted", () => {
    const specs = getSpecs("/unnatural-deaths?showSelfInflicted=true&category=all")
    expect(specs).toEqual([{ queryKey: ["unnatural-deaths", 1, "all", true, false] }])
  })

  it("matches death watch", () => {
    const specs = getSpecs("/death-watch?sort=age&dir=asc&page=3")
    expect(specs).toEqual([
      {
        queryKey: [
          "death-watch",
          { page: 3, includeObscure: false, search: "", sort: "age", dir: "asc" },
        ],
      },
    ])
  })

  it("matches death watch with search param", () => {
    const specs = getSpecs("/death-watch?search=wayne")
    expect(specs).toEqual([
      {
        queryKey: [
          "death-watch",
          { page: 1, includeObscure: false, search: "wayne", sort: "probability", dir: "desc" },
        ],
      },
    ])
  })

  // ── Home page ───────────────────────────────────────────────────

  it("matches home page with 3 prefetch specs", () => {
    const specs = getSpecs("/")
    expect(specs).toHaveLength(3)
    expect(specs![0].queryKey).toEqual(["site-stats"])
    expect(specs![1].queryKey).toEqual(["recent-deaths", 10])
    expect(specs![2].queryKey).toEqual(["featured-movie"])
  })

  // ── URL normalization ───────────────────────────────────────────

  it("strips trailing slashes", () => {
    const specs = getSpecs("/actor/john-wayne-2157/")
    expect(specs).toEqual([{ queryKey: ["actors", "john-wayne-2157"] }])
  })

  // ── queryFn calls correct API paths ─────────────────────────────

  it("actor queryFn fetches correct API endpoint", async () => {
    const loaderFn = matchRouteLoaders("/actor/john-wayne-2157")!
    const specs = loaderFn(FETCH_BASE)

    // Mock global fetch to capture the URL
    const originalFetch = globalThis.fetch
    let fetchedUrl = ""
    globalThis.fetch = async (url: string | URL | globalThis.Request) => {
      fetchedUrl = url.toString()
      return new Response(JSON.stringify({}), { status: 200 })
    }

    try {
      await specs[0].queryFn()
      expect(fetchedUrl).toBe("http://127.0.0.1:8080/api/actor/john-wayne-2157")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("home page queryFns fetch correct API endpoints", async () => {
    const loaderFn = matchRouteLoaders("/")!
    const specs = loaderFn(FETCH_BASE)

    const originalFetch = globalThis.fetch
    const fetchedUrls: string[] = []
    globalThis.fetch = async (url: string | URL | globalThis.Request) => {
      fetchedUrls.push(url.toString())
      return new Response(JSON.stringify({}), { status: 200 })
    }

    try {
      await Promise.all(specs.map((s) => s.queryFn()))
      expect(fetchedUrls).toContain("http://127.0.0.1:8080/api/stats")
      expect(fetchedUrls).toContain("http://127.0.0.1:8080/api/recent-deaths?limit=10")
      expect(fetchedUrls).toContain("http://127.0.0.1:8080/api/featured-movie")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
