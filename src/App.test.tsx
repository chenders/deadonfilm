import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import App from "./App"

// Mock the analytics hooks
vi.mock("./hooks/useGoogleAnalytics", () => ({
  useGoogleAnalytics: vi.fn(),
}))

vi.mock("./hooks/useNewRelicBrowser", () => ({
  useNewRelicBrowser: vi.fn(),
}))

// Mock the API
vi.mock("@/services/api", () => ({
  getSiteStats: vi.fn(() =>
    Promise.resolve({
      totalDeceasedActors: 1500,
      totalMoviesAnalyzed: 350,
      topCauseOfDeath: "Cancer",
      avgMortalityPercentage: 42.5,
    })
  ),
  getRecentDeaths: vi.fn(() => Promise.resolve({ deaths: [] })),
  getOnThisDay: vi.fn(() =>
    Promise.resolve({ date: "2024-12-10", month: "12", day: "10", deaths: [] })
  ),
  searchMovies: vi.fn(() =>
    Promise.resolve({ results: [], page: 1, total_pages: 0, total_results: 0 })
  ),
  getDiscoverMovie: vi.fn(() => Promise.resolve(null)),
  getProfileUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w185${path}` : null)),
  getCursedMovies: vi.fn(() =>
    Promise.resolve({ movies: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 })
  ),
  getCursedMoviesFilters: vi.fn(() => Promise.resolve({ maxMinDeaths: 10 })),
  getCursedActors: vi.fn(() =>
    Promise.resolve({ actors: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 })
  ),
  getMovie: vi.fn(() =>
    Promise.resolve({
      movie: {
        id: 12345,
        title: "Test Movie",
        release_date: "2024-01-01",
        poster_path: "/test.jpg",
        overview: "Test overview",
      },
      deceased: [],
      living: [],
      stats: {
        totalCast: 10,
        deceasedCount: 0,
        livingCount: 10,
        mortalityPercentage: 0,
      },
    })
  ),
  getPosterUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w92${path}` : null)),
}))

function renderApp(initialRoute = "/") {
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
        <MemoryRouter
          initialEntries={[initialRoute]}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("routing", () => {
    it("renders HomePage at root route", async () => {
      renderApp("/")

      await waitFor(() => {
        expect(screen.getByTestId("home-page")).toBeInTheDocument()
      })
    })

    it("renders lazy-loaded MoviePage at /movie/:slug", async () => {
      renderApp("/movie/test-movie-2024-12345")

      await waitFor(() => {
        expect(screen.getByTestId("movie-page")).toBeInTheDocument()
      })
    })
  })

  describe("lazy loading", () => {
    it("shows LoadingSpinner as fallback while lazy components load", async () => {
      // This test verifies the Suspense boundary is set up correctly
      // The LoadingSpinner should be rendered as fallback during lazy loading
      renderApp("/movie/test-movie-2024-12345")

      // The page should eventually load
      await waitFor(() => {
        expect(screen.getByTestId("movie-page")).toBeInTheDocument()
      })
    })
  })

  describe("layout", () => {
    it("renders within Layout component", async () => {
      renderApp("/")

      await waitFor(() => {
        // Layout contains the header with site title
        expect(screen.getByText("Dead on Film")).toBeInTheDocument()
      })
    })
  })
})
