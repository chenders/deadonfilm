import { describe, it, expect } from "vitest"
import { mapTopFilms } from "./map-top-films.js"

describe("mapTopFilms", () => {
  it("returns null for null input", () => {
    expect(mapTopFilms(null)).toBeNull()
  })

  it("returns null for empty array", () => {
    expect(mapTopFilms([])).toBeNull()
  })

  it("maps films to knownFor format", () => {
    const films = [
      { title: "The Searchers", year: 1956 },
      { title: "True Grit", year: 1969 },
    ]

    expect(mapTopFilms(films)).toEqual([
      { name: "The Searchers", year: 1956, type: "movie" },
      { name: "True Grit", year: 1969, type: "movie" },
    ])
  })

  it("preserves null year values", () => {
    const films = [{ title: "Unknown Year Film", year: null }]

    expect(mapTopFilms(films)).toEqual([{ name: "Unknown Year Film", year: null, type: "movie" }])
  })

  it("maps single film correctly", () => {
    const films = [{ title: "Casablanca", year: 1942 }]

    expect(mapTopFilms(films)).toEqual([{ name: "Casablanca", year: 1942, type: "movie" }])
  })
})
