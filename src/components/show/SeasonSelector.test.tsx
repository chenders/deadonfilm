import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SeasonSelector from "./SeasonSelector"
import type { SeasonSummary } from "@/types"

const mockSeasons: SeasonSummary[] = [
  { seasonNumber: 1, name: "Season 1", airDate: "1990-01-01", episodeCount: 10, posterPath: null },
  { seasonNumber: 2, name: "Season 2", airDate: "1991-01-01", episodeCount: 12, posterPath: null },
  { seasonNumber: 3, name: "Season 3", airDate: "1992-01-01", episodeCount: 15, posterPath: null },
]

describe("SeasonSelector", () => {
  it("renders all seasons", () => {
    render(<SeasonSelector seasons={mockSeasons} selectedSeason={null} onSelectSeason={vi.fn()} />)

    expect(screen.getByTestId("season-selector")).toBeInTheDocument()
    expect(screen.getByTestId("season-btn-1")).toHaveTextContent("S1")
    expect(screen.getByTestId("season-btn-1")).toHaveTextContent("(10)")
    expect(screen.getByTestId("season-btn-2")).toHaveTextContent("S2")
    expect(screen.getByTestId("season-btn-2")).toHaveTextContent("(12)")
    expect(screen.getByTestId("season-btn-3")).toHaveTextContent("S3")
    expect(screen.getByTestId("season-btn-3")).toHaveTextContent("(15)")
  })

  it("renders nothing when seasons is empty", () => {
    const { container } = render(
      <SeasonSelector seasons={[]} selectedSeason={null} onSelectSeason={vi.fn()} />
    )

    expect(container.firstChild).toBeNull()
  })

  it("calls onSelectSeason when clicking a season", () => {
    const onSelectSeason = vi.fn()
    render(
      <SeasonSelector seasons={mockSeasons} selectedSeason={null} onSelectSeason={onSelectSeason} />
    )

    fireEvent.click(screen.getByTestId("season-btn-2"))

    expect(onSelectSeason).toHaveBeenCalledWith(2)
  })

  it("toggles off when clicking the already selected season", () => {
    const onSelectSeason = vi.fn()
    render(
      <SeasonSelector seasons={mockSeasons} selectedSeason={2} onSelectSeason={onSelectSeason} />
    )

    fireEvent.click(screen.getByTestId("season-btn-2"))

    expect(onSelectSeason).toHaveBeenCalledWith(null)
  })

  it("applies selected styling to active season", () => {
    render(<SeasonSelector seasons={mockSeasons} selectedSeason={2} onSelectSeason={vi.fn()} />)

    const selectedButton = screen.getByTestId("season-btn-2")
    expect(selectedButton).toHaveClass("bg-accent")
    expect(selectedButton).toHaveClass("text-white")
    expect(selectedButton).toHaveAttribute("aria-pressed", "true")

    const unselectedButton = screen.getByTestId("season-btn-1")
    expect(unselectedButton).not.toHaveClass("bg-accent")
    expect(unselectedButton).toHaveAttribute("aria-pressed", "false")
  })

  it("renders Browse Episodes heading", () => {
    render(<SeasonSelector seasons={mockSeasons} selectedSeason={null} onSelectSeason={vi.fn()} />)

    expect(screen.getByText("Browse Episodes")).toBeInTheDocument()
  })
})
