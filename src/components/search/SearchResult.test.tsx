import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SearchResult from "./SearchResult"
import type { UnifiedSearchResult } from "@/types"

// Mock scrollIntoView which isn't available in jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const mockMovie: UnifiedSearchResult = {
  id: 603,
  title: "The Matrix",
  release_date: "1999-03-30",
  poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  overview: "A computer hacker learns about the true nature of reality.",
  media_type: "movie",
}

const mockTVShow: UnifiedSearchResult = {
  id: 1396,
  title: "Breaking Bad",
  release_date: "2008-01-20",
  poster_path: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  overview: "A high school chemistry teacher turned meth manufacturer.",
  media_type: "tv",
}

const mockMovieNoPoster: UnifiedSearchResult = {
  id: 604,
  title: "Unknown Film",
  release_date: "2020-01-01",
  poster_path: null,
  overview: "A film without a poster.",
  media_type: "movie",
}

const mockTVShowNoPoster: UnifiedSearchResult = {
  id: 1397,
  title: "Unknown Show",
  release_date: "2020-01-01",
  poster_path: null,
  overview: "A show without a poster.",
  media_type: "tv",
}

const mockOldMovie: UnifiedSearchResult = {
  id: 605,
  title: "Classic Film",
  release_date: "1950-06-15",
  poster_path: "/classic.jpg",
  overview: "A very old classic film.",
  media_type: "movie",
}

const mockMediumOldMovie: UnifiedSearchResult = {
  id: 606,
  title: "Medium Age Film",
  release_date: "1990-06-15",
  poster_path: "/medium.jpg",
  overview: "A medium age film.",
  media_type: "movie",
}

describe("SearchResult", () => {
  const defaultProps = {
    isSelected: false,
    onSelect: vi.fn(),
    searchQuery: "the matrix",
  }

  it("renders movie title, year, and Film badge", () => {
    render(<SearchResult result={mockMovie} {...defaultProps} />)

    expect(screen.getByText("The Matrix")).toBeInTheDocument()
    expect(screen.getByText("1999")).toBeInTheDocument()
    expect(screen.getByTestId("media-badge-movie")).toHaveTextContent("Film")
  })

  it("renders TV show title, year, and TV badge", () => {
    render(<SearchResult result={mockTVShow} {...defaultProps} />)

    expect(screen.getByText("Breaking Bad")).toBeInTheDocument()
    expect(screen.getByText("2008")).toBeInTheDocument()
    expect(screen.getByTestId("media-badge-tv")).toHaveTextContent("TV")
  })

  it("renders poster image when poster_path exists", () => {
    render(<SearchResult result={mockMovie} {...defaultProps} />)

    const img = screen.getByRole("img", { name: "The Matrix poster" })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute(
      "src",
      "https://media.themoviedb.org/t/p/w45_and_h67_face/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"
    )
    expect(img).toHaveAttribute("srcset")
    expect(img.getAttribute("srcset")).toContain("w45_and_h67_face")
    expect(img.getAttribute("srcset")).toContain("w94_and_h141_face")
  })

  it("renders FilmReel placeholder icon for movie without poster", () => {
    render(<SearchResult result={mockMovieNoPoster} {...defaultProps} />)

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    // FilmReelIcon should be present as placeholder
    const container = document.querySelector('[class*="bg-brown-medium"]')
    expect(container?.querySelector("svg")).toBeInTheDocument()
  })

  it("renders TV placeholder icon for show without poster", () => {
    render(<SearchResult result={mockTVShowNoPoster} {...defaultProps} />)

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    // TVIcon should be present as placeholder
    const container = document.querySelector('[class*="bg-brown-medium"]')
    expect(container?.querySelector("svg")).toBeInTheDocument()
  })

  it("shows double skull icons for high mortality movies (50+ years old)", () => {
    render(<SearchResult result={mockOldMovie} {...defaultProps} />)

    // Should have 2 skull icons for high mortality
    const skulls = document.querySelectorAll('[class*="text-accent"] svg')
    expect(skulls.length).toBe(2)
  })

  it("shows single skull icon for medium mortality movies (30-49 years old)", () => {
    render(<SearchResult result={mockMediumOldMovie} {...defaultProps} />)

    // Should have 1 skull icon for medium mortality
    const mortalityContainer = document.querySelector('[title="Some deaths likely"]')
    expect(mortalityContainer).toBeInTheDocument()
    const skulls = mortalityContainer?.querySelectorAll("svg")
    expect(skulls?.length).toBe(1)
  })

  it("shows no skull icons for recent movies", () => {
    render(<SearchResult result={mockMovieNoPoster} {...defaultProps} />)

    // 2020 movie - should have no skulls
    const mortalityContainer = document.querySelector("[title]")
    expect(mortalityContainer).not.toBeInTheDocument()
  })

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn()
    render(<SearchResult result={mockMovie} {...defaultProps} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("option"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("applies selected styling when isSelected is true", () => {
    render(<SearchResult result={mockMovie} {...defaultProps} isSelected={true} />)

    const option = screen.getByRole("option")
    expect(option).toHaveAttribute("aria-selected", "true")
    expect(option).toHaveClass("bg-beige")
  })

  it("displays Unknown for movies without release date", () => {
    const movieNoDate: UnifiedSearchResult = {
      ...mockMovie,
      release_date: "",
    }
    render(<SearchResult result={movieNoDate} {...defaultProps} />)

    expect(screen.getByText("Unknown")).toBeInTheDocument()
  })

  it("has correct TMDB srcset for retina displays", () => {
    render(<SearchResult result={mockMovie} {...defaultProps} />)

    const img = screen.getByRole("img", { name: "The Matrix poster" })
    const srcset = img.getAttribute("srcset")

    // Should have 1x and 2x variants
    expect(srcset).toContain("1x")
    expect(srcset).toContain("2x")
    // Should use face-cropped format
    expect(srcset).toContain("w45_and_h67_face")
    expect(srcset).toContain("w94_and_h141_face")
  })

  it("includes tracking data attributes with media_type", () => {
    render(<SearchResult result={mockMovie} {...defaultProps} />)

    const option = screen.getByRole("option")
    expect(option).toHaveAttribute("data-track-event", "search_select")
    expect(option).toHaveAttribute("data-track-params")

    const params = JSON.parse(option.getAttribute("data-track-params") || "{}")
    expect(params.title).toBe("The Matrix")
    expect(params.id).toBe(603)
    expect(params.media_type).toBe("movie")
    expect(params.search_term).toBe("the matrix")
  })
})
