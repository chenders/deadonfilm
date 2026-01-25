import { describe, it, expect } from "vitest"
import {
  createMovieSlug,
  extractMovieId,
  extractYearFromSlug,
  createActorSlug,
  extractActorId,
  createShowSlug,
  extractShowId,
  createEpisodeSlug,
  extractEpisodeInfo,
} from "./slugify"

describe("createMovieSlug", () => {
  it("creates a slug from title, release date, and id", () => {
    expect(createMovieSlug("Breakfast at Tiffany's", "1961-10-05", 14629)).toBe(
      "breakfast-at-tiffanys-1961-14629"
    )
  })

  it("handles titles with special characters", () => {
    expect(
      createMovieSlug("The Lord of the Rings: The Fellowship of the Ring", "2001-12-19", 120)
    ).toBe("the-lord-of-the-rings-the-fellowship-of-the-ring-2001-120")
  })

  it("handles titles with numbers", () => {
    expect(createMovieSlug("2001: A Space Odyssey", "1968-04-02", 62)).toBe(
      "2001-a-space-odyssey-1968-62"
    )
  })

  it("removes apostrophes", () => {
    expect(createMovieSlug("Schindler's List", "1993-12-15", 424)).toBe("schindlers-list-1993-424")
  })

  it("handles curly apostrophes", () => {
    expect(createMovieSlug("It's a Wonderful Life", "1946-12-20", 1585)).toBe(
      "its-a-wonderful-life-1946-1585"
    )
  })

  it("removes leading and trailing hyphens", () => {
    expect(createMovieSlug("...And Justice for All", "1979-10-19", 10961)).toBe(
      "and-justice-for-all-1979-10961"
    )
  })

  it("handles empty release date", () => {
    expect(createMovieSlug("Unknown Movie", "", 99999)).toBe("unknown-movie-unknown-99999")
  })

  it("handles single word titles", () => {
    expect(createMovieSlug("Jaws", "1975-06-20", 578)).toBe("jaws-1975-578")
  })

  it("handles non-ASCII characters", () => {
    expect(createMovieSlug("Amélie", "2001-04-25", 194)).toBe("amelie-2001-194")
  })
})

describe("extractMovieId", () => {
  it("extracts ID from valid slug", () => {
    expect(extractMovieId("breakfast-at-tiffanys-1961-14629")).toBe(14629)
  })

  it("extracts ID from slug with large ID", () => {
    expect(extractMovieId("some-movie-2023-999999")).toBe(999999)
  })

  it("extracts ID from simple slug", () => {
    expect(extractMovieId("jaws-1975-578")).toBe(578)
  })

  it("returns 0 for invalid slug without ID", () => {
    expect(extractMovieId("invalid-slug-without-id")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(extractMovieId("")).toBe(0)
  })

  it("handles slug with unknown year", () => {
    expect(extractMovieId("some-movie-unknown-12345")).toBe(12345)
  })
})

describe("extractYearFromSlug", () => {
  it("extracts year from valid slug", () => {
    expect(extractYearFromSlug("breakfast-at-tiffanys-1961-14629")).toBe("1961")
  })

  it("extracts year from recent movie", () => {
    expect(extractYearFromSlug("oppenheimer-2023-872585")).toBe("2023")
  })

  it("returns null for slug with unknown year", () => {
    expect(extractYearFromSlug("unknown-movie-unknown-99999")).toBe(null)
  })

  it("returns null for invalid slug", () => {
    expect(extractYearFromSlug("invalid-slug")).toBe(null)
  })

  it("returns null for empty string", () => {
    expect(extractYearFromSlug("")).toBe(null)
  })
})

describe("createActorSlug", () => {
  it("creates a slug from actor name and id", () => {
    expect(createActorSlug("John Wayne", 4165)).toBe("john-wayne-4165")
  })

  it("handles names with apostrophes", () => {
    expect(createActorSlug("Michael O'Brien", 12345)).toBe("michael-obrien-12345")
  })

  it("handles curly apostrophes", () => {
    expect(createActorSlug("Michael O'Brien", 12345)).toBe("michael-obrien-12345")
  })

  it("handles names with special characters", () => {
    expect(createActorSlug("Jean-Claude Van Damme", 5576)).toBe("jean-claude-van-damme-5576")
  })

  it("handles single word names", () => {
    expect(createActorSlug("Madonna", 65011)).toBe("madonna-65011")
  })

  it("handles names with periods and numbers", () => {
    expect(createActorSlug("Robert Downey Jr.", 3223)).toBe("robert-downey-jr-3223")
  })

  it("normalizes various accent types", () => {
    expect(createActorSlug("François Truffaut", 1)).toBe("francois-truffaut-1")
    expect(createActorSlug("Björk Guðmundsdóttir", 2)).toBe("bjork-gudmundsdottir-2")
    expect(createActorSlug("José García", 3)).toBe("jose-garcia-3")
    expect(createActorSlug("Penélope Cruz", 4)).toBe("penelope-cruz-4")
    expect(createActorSlug("Māris Liepa", 5)).toBe("maris-liepa-5")
  })
})

describe("extractActorId", () => {
  it("extracts ID from valid actor slug", () => {
    expect(extractActorId("john-wayne-4165")).toBe(4165)
  })

  it("extracts ID from actor with hyphenated name", () => {
    expect(extractActorId("jean-claude-van-damme-5576")).toBe(5576)
  })

  it("extracts ID with large number", () => {
    expect(extractActorId("some-actor-999999")).toBe(999999)
  })

  it("returns 0 for invalid slug without ID", () => {
    expect(extractActorId("invalid-slug")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(extractActorId("")).toBe(0)
  })
})

describe("createShowSlug", () => {
  it("creates a slug from show name, first air date, and id", () => {
    expect(createShowSlug("Breaking Bad", "2008-01-20", 1396)).toBe("breaking-bad-2008-1396")
  })

  it("handles show names with special characters", () => {
    expect(createShowSlug("It's Always Sunny in Philadelphia", "2005-08-04", 2710)).toBe(
      "its-always-sunny-in-philadelphia-2005-2710"
    )
  })

  it("handles show names with apostrophes and colons", () => {
    expect(createShowSlug("Grey's Anatomy", "2005-03-27", 1416)).toBe("greys-anatomy-2005-1416")
  })

  it("handles non-ASCII characters", () => {
    expect(createShowSlug("Élite", "2018-10-05", 76479)).toBe("elite-2018-76479")
  })

  it("handles null first air date", () => {
    expect(createShowSlug("Upcoming Show", null, 99999)).toBe("upcoming-show-unknown-99999")
  })

  it("handles single word show names", () => {
    expect(createShowSlug("Seinfeld", "1989-07-05", 1400)).toBe("seinfeld-1989-1400")
  })

  it("handles show names with numbers", () => {
    expect(createShowSlug("9-1-1", "2018-01-03", 71790)).toBe("9-1-1-2018-71790")
  })

  it("normalizes various accent types in show names", () => {
    expect(createShowSlug("La Casa de Papel", "2017-05-02", 71446)).toBe(
      "la-casa-de-papel-2017-71446"
    )
    expect(createShowSlug("Skam", "2015-09-25", 63351)).toBe("skam-2015-63351")
    expect(createShowSlug("Señorita 89", "2022-02-23", 132368)).toBe("senorita-89-2022-132368")
  })
})

describe("extractShowId", () => {
  it("extracts ID from valid show slug", () => {
    expect(extractShowId("breaking-bad-2008-1396")).toBe(1396)
  })

  it("extracts ID from show with hyphenated name", () => {
    expect(extractShowId("its-always-sunny-in-philadelphia-2005-2710")).toBe(2710)
  })

  it("extracts ID with large number", () => {
    expect(extractShowId("some-show-2023-999999")).toBe(999999)
  })

  it("returns 0 for invalid slug without ID", () => {
    expect(extractShowId("invalid-slug-without-id")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(extractShowId("")).toBe(0)
  })

  it("handles slug with unknown year", () => {
    expect(extractShowId("some-show-unknown-12345")).toBe(12345)
  })
})

describe("createEpisodeSlug", () => {
  it("creates a slug from show name, episode name, season, episode number, and show ID", () => {
    expect(createEpisodeSlug("Seinfeld", "The Contest", 4, 11, 1400)).toBe(
      "seinfeld-s4e11-the-contest-1400"
    )
  })

  it("handles episode names with special characters", () => {
    expect(createEpisodeSlug("Breaking Bad", "Ozymandias", 5, 14, 1396)).toBe(
      "breaking-bad-s5e14-ozymandias-1396"
    )
  })

  it("handles episode names with apostrophes and colons", () => {
    expect(createEpisodeSlug("The Office", "The Dundies", 2, 1, 2316)).toBe(
      "the-office-s2e1-the-dundies-2316"
    )
  })

  it("handles show names with non-ASCII characters", () => {
    expect(createEpisodeSlug("Élite", "Carla Samuel", 1, 1, 76479)).toBe(
      "elite-s1e1-carla-samuel-76479"
    )
  })

  it("handles episode names with non-ASCII characters", () => {
    expect(createEpisodeSlug("Money Heist", "Efectuar lo acordado", 1, 1, 71446)).toBe(
      "money-heist-s1e1-efectuar-lo-acordado-71446"
    )
  })

  it("handles single digit season and episode numbers", () => {
    expect(createEpisodeSlug("Friends", "The Pilot", 1, 1, 1668)).toBe(
      "friends-s1e1-the-pilot-1668"
    )
  })

  it("handles double digit season and episode numbers", () => {
    expect(createEpisodeSlug("Game of Thrones", "The Winds of Winter", 6, 10, 1399)).toBe(
      "game-of-thrones-s6e10-the-winds-of-winter-1399"
    )
  })

  it("normalizes various accent types in both show and episode names", () => {
    expect(createEpisodeSlug("Señorita 89", "Día Uno", 1, 1, 132368)).toBe(
      "senorita-89-s1e1-dia-uno-132368"
    )
  })
})

describe("extractEpisodeInfo", () => {
  it("extracts show ID, season, and episode from valid episode slug", () => {
    expect(extractEpisodeInfo("seinfeld-s4e11-the-contest-1400")).toEqual({
      showId: 1400,
      season: 4,
      episode: 11,
    })
  })

  it("extracts info from episode with single digit numbers", () => {
    expect(extractEpisodeInfo("friends-s1e1-the-pilot-1668")).toEqual({
      showId: 1668,
      season: 1,
      episode: 1,
    })
  })

  it("extracts info from episode with double digit numbers", () => {
    expect(extractEpisodeInfo("game-of-thrones-s6e10-the-winds-of-winter-1399")).toEqual({
      showId: 1399,
      season: 6,
      episode: 10,
    })
  })

  it("extracts info from episode with hyphenated show name", () => {
    expect(extractEpisodeInfo("breaking-bad-s5e14-ozymandias-1396")).toEqual({
      showId: 1396,
      season: 5,
      episode: 14,
    })
  })

  it("returns null for invalid slug without season/episode pattern", () => {
    expect(extractEpisodeInfo("invalid-slug-without-pattern")).toBe(null)
  })

  it("returns null for empty string", () => {
    expect(extractEpisodeInfo("")).toBe(null)
  })

  it("returns null for slug with malformed season/episode pattern", () => {
    expect(extractEpisodeInfo("show-s4-e11-episode-1400")).toBe(null)
  })
})
