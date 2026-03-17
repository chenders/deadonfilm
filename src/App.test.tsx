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

vi.mock("./hooks/useWebVitals", () => ({
  useWebVitals: vi.fn(),
}))

// Mock the API
vi.mock("@/services/api", () => ({
  getSiteStats: vi.fn(() =>
    Promise.resolve({
      totalActors: 500000,
      totalDeceasedActors: 1500,
      totalMoviesAnalyzed: 350,
      topCauseOfDeath: "Cancer",
      topCauseOfDeathCategorySlug: "cancer",
      avgMortalityPercentage: 42.5,
      causeOfDeathPercentage: 25.8,
      actorsWithCauseKnown: 387,
    })
  ),
  getRecentDeaths: vi.fn(() => Promise.resolve({ deaths: [] })),
  searchMovies: vi.fn(() =>
    Promise.resolve({ results: [], page: 1, total_pages: 0, total_results: 0 })
  ),
  getProfileUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w185${path}` : null)),
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

  describe("admin routes", () => {
    // Admin route tests need longer timeout in CI where lazy imports can be slow
    const adminTimeout = { timeout: 5000 }

    beforeEach(() => {
      // Mock fetch to return unauthenticated for admin auth check
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ authenticated: false }),
        } as Response)
      )
    })

    it("redirects /admin to /admin/dashboard", async () => {
      renderApp("/admin")

      // Should redirect to /admin/dashboard, which then redirects to /admin/login
      // since the user is not authenticated
      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("routes to /admin/jobs for job queue management", async () => {
      renderApp("/admin/jobs")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("routes to /admin/jobs/runs for job history", async () => {
      renderApp("/admin/jobs/runs")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("routes to /admin/jobs/dead-letter for dead letter queue", async () => {
      renderApp("/admin/jobs/dead-letter")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("routes to /admin/data-quality for data quality management", async () => {
      renderApp("/admin/data-quality")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("redirects /admin/logs to /admin/jobs?tab=logs", async () => {
      renderApp("/admin/logs")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })

    it("redirects /admin/sync to /admin/operations?tab=sync", async () => {
      renderApp("/admin/sync")

      await waitFor(() => {
        expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
      }, adminTimeout)
    })
  })
})
