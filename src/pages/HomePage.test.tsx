import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import HomePage from "./HomePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getSiteStats: vi.fn(),
  getRecentDeaths: vi.fn(),
  getOnThisDay: vi.fn(),
  searchMovies: vi.fn(),
  searchAll: vi.fn(),
  getDiscoverMovie: vi.fn(),
  getProfileUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w185${path}` : null)),
}))

const mockStats = {
  totalDeceasedActors: 1500,
  totalMoviesAnalyzed: 350,
  topCauseOfDeath: "Cancer",
  avgMortalityPercentage: 42.5,
  causeOfDeathPercentage: 25.8,
}

const mockDeaths = {
  deaths: [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2024-12-01",
      cause_of_death: "Natural causes",
      profile_path: "/path1.jpg",
    },
  ],
}

const mockOnThisDay = {
  date: "2024-12-10",
  month: "12",
  day: "10",
  deaths: [],
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up default mocks that resolve to prevent hanging
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)
    vi.mocked(api.getOnThisDay).mockResolvedValue(mockOnThisDay)
    vi.mocked(api.searchMovies).mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
    vi.mocked(api.searchAll).mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it("renders home page with correct test id", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByTestId("home-page")).toBeInTheDocument()
  })

  it("renders tagline", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByTestId("home-tagline")).toHaveTextContent(
      "Search for a movie or TV show to see which cast members have passed away"
    )
  })

  it("renders search bar with media type toggle", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByPlaceholderText(/search movies and tv shows/i)).toBeInTheDocument()
    expect(screen.getByTestId("media-type-toggle")).toBeInTheDocument()
  })

  it("renders quick actions", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByTestId("quick-actions")).toBeInTheDocument()
  })

  it("renders info popover trigger in search bar", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByRole("button", { name: /about this site/i })).toBeInTheDocument()
  })

  it("renders SiteStats when data loads", async () => {
    renderWithProviders(<HomePage />)

    await waitFor(() => {
      expect(screen.getByTestId("site-stats")).toBeInTheDocument()
    })

    expect(screen.getByText("1,500")).toBeInTheDocument()
    expect(screen.getByText("350")).toBeInTheDocument()
  })

  it("renders RecentDeaths when data loads", async () => {
    renderWithProviders(<HomePage />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    expect(screen.getByText("Actor One")).toBeInTheDocument()
  })

  it("renders quick action buttons", async () => {
    renderWithProviders(<HomePage />)

    expect(screen.getByTestId("forever-young-btn")).toBeInTheDocument()
    expect(screen.getByTestId("covid-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("death-watch-btn")).toBeInTheDocument()
  })
})
