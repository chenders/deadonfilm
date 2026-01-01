import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, type MemoryRouterProps } from "react-router-dom"

const routerFutureConfig: MemoryRouterProps["future"] = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import SeasonPage from "./SeasonPage"

// Mock the hook
vi.mock("@/hooks/useSeason", () => ({
  useSeason: vi.fn(),
}))

import { useSeason } from "@/hooks/useSeason"

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

const mockSeasonData = {
  show: {
    id: 1400,
    name: "Seinfeld",
    posterPath: "/poster.jpg",
    firstAirDate: "1989-07-05",
  },
  season: {
    seasonNumber: 4,
    name: "Season 4",
    airDate: "1992-08-12",
    posterPath: "/s4.jpg",
    episodeCount: 24,
  },
  episodes: [
    {
      episodeNumber: 1,
      seasonNumber: 4,
      name: "The Trip (1)",
      airDate: "1992-08-12",
      runtime: 22,
      guestStarCount: 5,
      deceasedCount: 2,
    },
    {
      episodeNumber: 2,
      seasonNumber: 4,
      name: "The Trip (2)",
      airDate: "1992-08-19",
      runtime: 22,
      guestStarCount: 3,
      deceasedCount: 0,
    },
    {
      episodeNumber: 3,
      seasonNumber: 4,
      name: "The Pitch",
      airDate: "1992-09-16",
      runtime: 22,
      guestStarCount: 2,
      deceasedCount: 1,
    },
  ],
  stats: {
    totalEpisodes: 3,
    uniqueGuestStars: 10,
    uniqueDeceasedGuestStars: 3,
    expectedDeaths: 1.5,
    mortalitySurpriseScore: 1.0,
  },
}

const renderWithProviders = (initialRoute: string) => {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[initialRoute]} future={routerFutureConfig}>
          <Routes>
            <Route path="/show/:slug/season/:seasonNumber" element={<SeasonPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("SeasonPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.getByText("Loading season data...")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load season"),
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.getByText("Failed to load season")).toBeInTheDocument()
  })

  it("renders invalid URL error for missing show ID", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    render(
      <QueryClientProvider client={createQueryClient()}>
        <HelmetProvider>
          <MemoryRouter
            initialEntries={["/show/invalid-slug/season/4"]}
            future={routerFutureConfig}
          >
            <Routes>
              <Route path="/show/:slug/season/:seasonNumber" element={<SeasonPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText("Invalid season URL")).toBeInTheDocument()
  })

  it("renders season data when loaded", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.getByTestId("season-page")).toBeInTheDocument()
    // Season name appears in heading
    expect(screen.getByRole("heading", { name: "Season 4" })).toBeInTheDocument()
    // Show name appears in breadcrumb and below heading
    const showNameElements = screen.getAllByText("Seinfeld")
    expect(showNameElements.length).toBeGreaterThan(0)
  })

  it("shows stats section", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    // Check for stat labels (may appear multiple times, so use getAllByText)
    const episodeLabels = screen.getAllByText("Episodes")
    expect(episodeLabels.length).toBeGreaterThan(0)

    expect(screen.getByText("Guest Stars")).toBeInTheDocument()
    expect(screen.getByText("Deceased")).toBeInTheDocument()
  })

  it("renders episode list with links", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.getByTestId("episode-link-1")).toBeInTheDocument()
    expect(screen.getByTestId("episode-link-2")).toBeInTheDocument()
    expect(screen.getByTestId("episode-link-3")).toBeInTheDocument()
    expect(screen.getByText("The Trip (1)")).toBeInTheDocument()
    expect(screen.getByText("The Trip (2)")).toBeInTheDocument()
    expect(screen.getByText("The Pitch")).toBeInTheDocument()
  })

  it("shows deceased badge for episodes with deceased guest stars", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    // Episode 1 has 2 deceased, Episode 3 has 1 deceased
    expect(screen.getByText("2 deceased")).toBeInTheDocument()
    expect(screen.getByText("1 deceased")).toBeInTheDocument()
  })

  it("shows breadcrumb with link to show", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    const showLink = screen.getByRole("link", { name: "Seinfeld" })
    expect(showLink).toHaveAttribute("href", "/show/seinfeld-1989-1400")
  })

  it("shows season not found error when data is null", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.getByText("Season not found")).toBeInTheDocument()
  })

  it("renders MortalityGauge with mortality statistics", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: mockSeasonData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    // MortalityGauge should be rendered when uniqueGuestStars > 0
    expect(screen.getByTestId("mortality-gauge")).toBeInTheDocument()
    // Check that the percentage is displayed (30% = 3/10 deceased)
    expect(screen.getByTestId("gauge-percentage")).toHaveTextContent("30%")
  })

  it("does not render MortalityGauge when no guest stars", () => {
    vi.mocked(useSeason).mockReturnValue({
      data: {
        ...mockSeasonData,
        stats: {
          totalEpisodes: 3,
          uniqueGuestStars: 0,
          uniqueDeceasedGuestStars: 0,
          expectedDeaths: 0,
          mortalitySurpriseScore: 0,
        },
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSeason>)

    renderWithProviders("/show/seinfeld-1989-1400/season/4")

    expect(screen.queryByTestId("mortality-gauge")).not.toBeInTheDocument()
  })
})
