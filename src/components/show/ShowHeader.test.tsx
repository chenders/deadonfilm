import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import ShowHeader, { ShowPoster } from "./ShowHeader"
import type { ShowDetails } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockShow: ShowDetails = {
  id: 1400,
  name: "Seinfeld",
  firstAirDate: "1989-07-05",
  lastAirDate: "1998-05-14",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  overview: "A show about nothing.",
  status: "Ended",
  numberOfSeasons: 9,
  numberOfEpisodes: 180,
  genres: [{ id: 35, name: "Comedy" }],
}

const mockShowNoPoster: ShowDetails = {
  ...mockShow,
  posterPath: null,
}

const mockShowSingleSeason: ShowDetails = {
  ...mockShow,
  numberOfSeasons: 1,
  numberOfEpisodes: 1,
}

describe("ShowHeader", () => {
  it("renders show title", () => {
    render(<ShowHeader show={mockShow} />)

    expect(screen.getByTestId("show-title")).toHaveTextContent("Seinfeld")
  })

  it("renders show year from firstAirDate", () => {
    render(<ShowHeader show={mockShow} />)

    expect(screen.getByTestId("show-year")).toHaveTextContent("(1989)")
  })

  it("renders show poster when available", () => {
    render(<ShowHeader show={mockShow} />)

    const poster = screen.getByTestId("show-poster")
    expect(poster).toBeInTheDocument()
    expect(poster).toHaveAttribute("src", "https://image.tmdb.org/poster.jpg")
    expect(poster).toHaveAttribute("alt", "Seinfeld poster")
  })

  it("renders poster placeholder when no poster", () => {
    render(<ShowHeader show={mockShowNoPoster} />)

    expect(screen.getByTestId("show-poster-placeholder")).toBeInTheDocument()
    expect(screen.queryByTestId("show-poster")).not.toBeInTheDocument()
  })

  it("hides poster when hidePoster is true", () => {
    render(<ShowHeader show={mockShow} hidePoster />)

    expect(screen.queryByTestId("show-poster")).not.toBeInTheDocument()
    expect(screen.queryByTestId("show-poster-placeholder")).not.toBeInTheDocument()
  })

  it("renders show meta with seasons and episodes", () => {
    render(<ShowHeader show={mockShow} />)

    const meta = screen.getByTestId("show-meta")
    expect(meta).toHaveTextContent("9 seasons")
    expect(meta).toHaveTextContent("180 episodes")
    expect(meta).toHaveTextContent("Ended")
  })

  it("uses singular form for single season and episode", () => {
    render(<ShowHeader show={mockShowSingleSeason} />)

    const meta = screen.getByTestId("show-meta")
    expect(meta).toHaveTextContent("1 season")
    expect(meta).toHaveTextContent("1 episode")
  })

  it("renders show-header container", () => {
    render(<ShowHeader show={mockShow} />)

    expect(screen.getByTestId("show-header")).toBeInTheDocument()
  })
})

describe("ShowPoster", () => {
  it("renders poster image linked to TMDB", () => {
    render(<ShowPoster show={mockShow} />)

    const poster = screen.getByTestId("show-poster")
    expect(poster).toHaveAttribute("src", "https://image.tmdb.org/poster.jpg")

    const link = poster.closest("a")
    expect(link).toHaveAttribute("href", "https://www.themoviedb.org/tv/1400")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("renders placeholder linked to TMDB when no poster", () => {
    render(<ShowPoster show={mockShowNoPoster} />)

    const placeholder = screen.getByTestId("show-poster-placeholder")
    expect(placeholder).toBeInTheDocument()

    const link = placeholder.closest("a")
    expect(link).toHaveAttribute("href", "https://www.themoviedb.org/tv/1400")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("sets proper alt text on poster image", () => {
    render(<ShowPoster show={mockShow} />)

    expect(screen.getByTestId("show-poster")).toHaveAttribute("alt", "Seinfeld poster")
  })
})
