import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import EpisodeBrowser from "./EpisodeBrowser"
import type { SeasonSummary } from "@/types"

// Mock the hook
vi.mock("@/hooks/useSeasonEpisodes", () => ({
  useSeasonEpisodes: vi.fn(),
}))

import { useSeasonEpisodes } from "@/hooks/useSeasonEpisodes"

const mockSeasons: SeasonSummary[] = [
  { seasonNumber: 1, name: "Season 1", airDate: "1990-01-01", episodeCount: 10, posterPath: null },
  { seasonNumber: 2, name: "Season 2", airDate: "1991-01-01", episodeCount: 12, posterPath: null },
]

const mockEpisodes = [
  { episodeNumber: 1, seasonNumber: 1, name: "Pilot", airDate: "1990-01-01" },
  { episodeNumber: 2, seasonNumber: 1, name: "Episode Two", airDate: "1990-01-08" },
]

const renderWithRouter = (component: React.ReactNode) => {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

describe("EpisodeBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSeasonEpisodes).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useSeasonEpisodes>)
  })

  it("renders the season selector", () => {
    renderWithRouter(<EpisodeBrowser seasons={mockSeasons} showId={1400} showName="Test Show" />)

    expect(screen.getByTestId("episode-browser")).toBeInTheDocument()
    expect(screen.getByTestId("season-selector")).toBeInTheDocument()
    expect(screen.getByTestId("season-btn-1")).toBeInTheDocument()
    expect(screen.getByTestId("season-btn-2")).toBeInTheDocument()
  })

  it("returns null when no seasons", () => {
    const { container } = renderWithRouter(
      <EpisodeBrowser seasons={[]} showId={1400} showName="Test Show" />
    )

    expect(container.firstChild).toBeNull()
  })

  it("does not show episode list initially", () => {
    renderWithRouter(<EpisodeBrowser seasons={mockSeasons} showId={1400} showName="Test Show" />)

    expect(screen.queryByTestId("episode-list")).not.toBeInTheDocument()
  })

  it("shows loading state when fetching episodes", () => {
    vi.mocked(useSeasonEpisodes).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useSeasonEpisodes>)

    renderWithRouter(<EpisodeBrowser seasons={mockSeasons} showId={1400} showName="Test Show" />)

    // Click a season to show the episode list area
    fireEvent.click(screen.getByTestId("season-btn-1"))

    expect(screen.getByTestId("episode-list-loading")).toBeInTheDocument()
  })

  it("shows episodes when season is selected and data is loaded", () => {
    vi.mocked(useSeasonEpisodes).mockReturnValue({
      data: { episodes: mockEpisodes },
      isLoading: false,
    } as unknown as ReturnType<typeof useSeasonEpisodes>)

    renderWithRouter(<EpisodeBrowser seasons={mockSeasons} showId={1400} showName="Test Show" />)

    // Click a season
    fireEvent.click(screen.getByTestId("season-btn-1"))

    expect(screen.getByTestId("episode-list")).toBeInTheDocument()
    expect(screen.getByText("Pilot")).toBeInTheDocument()
    expect(screen.getByText("Episode Two")).toBeInTheDocument()
  })

  it("hides episode list when clicking the same season again", () => {
    vi.mocked(useSeasonEpisodes).mockReturnValue({
      data: { episodes: mockEpisodes },
      isLoading: false,
    } as unknown as ReturnType<typeof useSeasonEpisodes>)

    renderWithRouter(<EpisodeBrowser seasons={mockSeasons} showId={1400} showName="Test Show" />)

    // Click season 1
    fireEvent.click(screen.getByTestId("season-btn-1"))
    expect(screen.getByTestId("episode-list")).toBeInTheDocument()

    // Click season 1 again to toggle off
    fireEvent.click(screen.getByTestId("season-btn-1"))
    expect(screen.queryByTestId("episode-list")).not.toBeInTheDocument()
  })
})
