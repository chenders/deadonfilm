import { describe, it, expect } from "vitest"
import { matchUrl } from "./url-patterns.js"

describe("matchUrl", () => {
  describe("home", () => {
    it("matches /", () => {
      expect(matchUrl("/")).toEqual({ pageType: "home", params: {} })
    })

    it("normalizes trailing slash to /", () => {
      // "//" becomes "/" after removing trailing slash then defaulting to "/"
      expect(matchUrl("//")).toEqual({ pageType: "home", params: {} })
    })
  })

  describe("actor", () => {
    it("matches /actor/{slug}-{id}", () => {
      expect(matchUrl("/actor/john-wayne-2157")).toEqual({
        pageType: "actor",
        params: { actorId: "2157" },
      })
    })

    it("matches actor with complex slug", () => {
      expect(matchUrl("/actor/audrey-hepburn-10560")).toEqual({
        pageType: "actor",
        params: { actorId: "10560" },
      })
    })

    it("matches /actor/{slug}/death", () => {
      expect(matchUrl("/actor/john-wayne-2157/death")).toEqual({
        pageType: "actor-death",
        params: { actorId: "2157" },
      })
    })

    it("strips query string", () => {
      expect(matchUrl("/actor/john-wayne-2157?tab=filmography")).toEqual({
        pageType: "actor",
        params: { actorId: "2157" },
      })
    })
  })

  describe("movie", () => {
    it("matches /movie/{slug}-{year}-{tmdbId}", () => {
      expect(matchUrl("/movie/the-godfather-1972-238")).toEqual({
        pageType: "movie",
        params: { tmdbId: "238" },
      })
    })

    it("handles movie with unknown year", () => {
      expect(matchUrl("/movie/some-movie-unknown-99999")).toEqual({
        pageType: "movie",
        params: { tmdbId: "99999" },
      })
    })
  })

  describe("show", () => {
    it("matches /show/{slug}-{year}-{tmdbId}", () => {
      expect(matchUrl("/show/breaking-bad-2008-1396")).toEqual({
        pageType: "show",
        params: { tmdbId: "1396" },
      })
    })
  })

  describe("season", () => {
    it("matches /show/{slug}/season/{seasonNumber}", () => {
      expect(matchUrl("/show/breaking-bad-2008-1396/season/1")).toEqual({
        pageType: "season",
        params: { tmdbId: "1396", seasonNumber: "1" },
      })
    })

    it("handles multi-digit season numbers", () => {
      expect(matchUrl("/show/the-simpsons-1989-456/season/35")).toEqual({
        pageType: "season",
        params: { tmdbId: "456", seasonNumber: "35" },
      })
    })

    it("strips trailing slash from season path", () => {
      expect(matchUrl("/show/breaking-bad-2008-1396/season/1/")).toEqual({
        pageType: "season",
        params: { tmdbId: "1396", seasonNumber: "1" },
      })
    })
  })

  describe("episode", () => {
    it("matches /episode/{showSlug}-s{N}e{N}-{episodeSlug}-{showTmdbId}", () => {
      expect(matchUrl("/episode/breaking-bad-s1e1-pilot-1396")).toEqual({
        pageType: "episode",
        params: { showTmdbId: "1396", season: "1", episode: "1" },
      })
    })

    it("handles multi-digit season and episode numbers", () => {
      expect(matchUrl("/episode/the-simpsons-s35e12-some-episode-456")).toEqual({
        pageType: "episode",
        params: { showTmdbId: "456", season: "35", episode: "12" },
      })
    })

    it("correctly parses when show slug contains s{N}e{N} substring", () => {
      // A show slug like "s1e1-show" should not confuse the parser —
      // the anchored regex ensures the trailing TMDB ID is associated
      // with the correct season/episode marker
      expect(matchUrl("/episode/my-s1e1-show-s2e3-the-episode-789")).toEqual({
        pageType: "episode",
        params: { showTmdbId: "789", season: "2", episode: "3" },
      })
    })
  })

  describe("static pages", () => {
    it("matches /forever-young", () => {
      expect(matchUrl("/forever-young")).toEqual({ pageType: "forever-young", params: {} })
    })

    it("matches /covid-deaths", () => {
      expect(matchUrl("/covid-deaths")).toEqual({ pageType: "covid-deaths", params: {} })
    })

    it("matches /unnatural-deaths", () => {
      expect(matchUrl("/unnatural-deaths")).toEqual({ pageType: "unnatural-deaths", params: {} })
    })

    it("matches /death-watch", () => {
      expect(matchUrl("/death-watch")).toEqual({ pageType: "death-watch", params: {} })
    })

    it("matches /deaths", () => {
      expect(matchUrl("/deaths")).toEqual({ pageType: "deaths-index", params: {} })
    })

    it("matches /deaths/all", () => {
      expect(matchUrl("/deaths/all")).toEqual({ pageType: "deaths-all", params: {} })
    })

    it("matches /deaths/notable", () => {
      expect(matchUrl("/deaths/notable")).toEqual({ pageType: "deaths-notable", params: {} })
    })

    it("matches /deaths/decades", () => {
      expect(matchUrl("/deaths/decades")).toEqual({ pageType: "deaths-decades", params: {} })
    })

    it("matches /movies/genres", () => {
      expect(matchUrl("/movies/genres")).toEqual({ pageType: "genres-index", params: {} })
    })

    it("matches /causes-of-death", () => {
      expect(matchUrl("/causes-of-death")).toEqual({
        pageType: "causes-of-death-index",
        params: {},
      })
    })

    it("matches /about", () => {
      expect(matchUrl("/about")).toEqual({ pageType: "about", params: {} })
    })

    it("matches /faq", () => {
      expect(matchUrl("/faq")).toEqual({ pageType: "faq", params: {} })
    })

    it("matches /methodology", () => {
      expect(matchUrl("/methodology")).toEqual({ pageType: "methodology", params: {} })
    })

    it("matches /data-sources", () => {
      expect(matchUrl("/data-sources")).toEqual({ pageType: "data-sources", params: {} })
    })

    it("matches /search", () => {
      expect(matchUrl("/search")).toEqual({ pageType: "search", params: {} })
    })
  })

  describe("parameterized pages", () => {
    it("matches /deaths/decade/{decade}", () => {
      expect(matchUrl("/deaths/decade/1970s")).toEqual({
        pageType: "deaths-decade",
        params: { decade: "1970s" },
      })
    })

    it("matches /deaths/decade/{decade} without s suffix", () => {
      expect(matchUrl("/deaths/decade/1970")).toEqual({
        pageType: "deaths-decade",
        params: { decade: "1970" },
      })
    })

    it("matches /deaths/{cause}", () => {
      expect(matchUrl("/deaths/cancer")).toEqual({
        pageType: "deaths-cause",
        params: { cause: "cancer" },
      })
    })

    it("matches /movies/genre/{genre}", () => {
      expect(matchUrl("/movies/genre/action")).toEqual({
        pageType: "genre",
        params: { genre: "action" },
      })
    })

    it("matches /causes-of-death/{category}", () => {
      expect(matchUrl("/causes-of-death/natural-causes")).toEqual({
        pageType: "causes-of-death-category",
        params: { categorySlug: "natural-causes" },
      })
    })

    it("matches /causes-of-death/{category}/{cause}", () => {
      expect(matchUrl("/causes-of-death/natural-causes/heart-disease")).toEqual({
        pageType: "causes-of-death-specific",
        params: { categorySlug: "natural-causes", causeSlug: "heart-disease" },
      })
    })

    it("matches /articles/{slug}", () => {
      expect(matchUrl("/articles/cursed-movies-explained")).toEqual({
        pageType: "article",
        params: { slug: "cursed-movies-explained" },
      })
    })
  })

  describe("unrecognized paths", () => {
    it("returns null for /admin paths", () => {
      expect(matchUrl("/admin/dashboard")).toBeNull()
    })

    it("returns null for /api paths", () => {
      expect(matchUrl("/api/actor/123")).toBeNull()
    })

    it("returns null for unknown paths", () => {
      expect(matchUrl("/unknown/path")).toBeNull()
    })

    it("returns null for paths with invalid actor slug (no numeric id)", () => {
      expect(matchUrl("/actor/no-id-here")).toBeNull()
    })
  })

  describe("trailing slashes", () => {
    it("strips trailing slash from actor path", () => {
      expect(matchUrl("/actor/john-wayne-2157/")).toEqual({
        pageType: "actor",
        params: { actorId: "2157" },
      })
    })

    it("strips trailing slash from movie path", () => {
      expect(matchUrl("/movie/the-godfather-1972-238/")).toEqual({
        pageType: "movie",
        params: { tmdbId: "238" },
      })
    })
  })
})
