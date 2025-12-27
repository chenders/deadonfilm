import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import EpisodeList from "./EpisodeList"
import type { EpisodeSummary } from "@/types"

const mockEpisodes: EpisodeSummary[] = [
  { episodeNumber: 1, seasonNumber: 1, name: "Pilot", airDate: "1990-01-01" },
  { episodeNumber: 2, seasonNumber: 1, name: "The Second Episode", airDate: "1990-01-08" },
  { episodeNumber: 3, seasonNumber: 1, name: "Episode Three", airDate: null },
]

const renderWithRouter = (component: React.ReactNode) => {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

describe("EpisodeList", () => {
  it("renders all episodes", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    expect(screen.getByTestId("episode-list")).toBeInTheDocument()
    expect(screen.getByTestId("episode-link-1")).toBeInTheDocument()
    expect(screen.getByTestId("episode-link-2")).toBeInTheDocument()
    expect(screen.getByTestId("episode-link-3")).toBeInTheDocument()
  })

  it("shows episode numbers and names", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    expect(screen.getByText("E1")).toBeInTheDocument()
    expect(screen.getByText("Pilot")).toBeInTheDocument()
    expect(screen.getByText("E2")).toBeInTheDocument()
    expect(screen.getByText("The Second Episode")).toBeInTheDocument()
  })

  it("shows formatted air dates", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    expect(screen.getByText("Jan 1, 1990")).toBeInTheDocument()
    expect(screen.getByText("Jan 8, 1990")).toBeInTheDocument()
  })

  it("handles missing air dates", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    // Episode 3 has no air date - it should not crash and only 2 dates should show
    const dates = screen.getAllByText(/\d{4}/)
    expect(dates).toHaveLength(2)
  })

  it("creates correct episode links", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    const link = screen.getByTestId("episode-link-1")
    expect(link).toHaveAttribute("href", "/episode/test-show-s1e1-pilot-1400")
  })

  it("shows loading state", () => {
    renderWithRouter(
      <EpisodeList
        episodes={[]}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={true}
      />
    )

    expect(screen.getByTestId("episode-list-loading")).toBeInTheDocument()
    expect(screen.getByText("Loading episodes...")).toBeInTheDocument()
  })

  it("shows empty state", () => {
    renderWithRouter(
      <EpisodeList
        episodes={[]}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    expect(screen.getByTestId("episode-list-empty")).toBeInTheDocument()
    expect(screen.getByText("No episodes available")).toBeInTheDocument()
  })

  it("shows season header with episode count", () => {
    renderWithRouter(
      <EpisodeList
        episodes={mockEpisodes}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    expect(screen.getByTestId("season-header")).toBeInTheDocument()
    expect(screen.getByText("Season 1")).toBeInTheDocument()
    expect(screen.getByText("(3 episodes)")).toBeInTheDocument()
  })

  it("truncates long episode names", () => {
    const longNameEpisode: EpisodeSummary[] = [
      {
        episodeNumber: 1,
        seasonNumber: 1,
        name: "This Is A Very Long Episode Name That Should Be Truncated For Display",
        airDate: "1990-01-01",
      },
    ]

    renderWithRouter(
      <EpisodeList
        episodes={longNameEpisode}
        showId={1400}
        showName="Test Show"
        seasonNumber={1}
        seasonName="Season 1"
        isLoading={false}
      />
    )

    // Name is truncated at 40 chars + "..."
    expect(screen.getByText("This Is A Very Long Episode Name That Sh...")).toBeInTheDocument()
  })
})
