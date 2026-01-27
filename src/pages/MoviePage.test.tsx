import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import MoviePage from "./MoviePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getMovie: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

// Mock the polling hook
vi.mock("@/hooks/useDeathInfoPolling", () => ({
  useDeathInfoPolling: vi.fn(({ deceased }) => ({
    enrichedDeceased: deceased,
    isPolling: false,
  })),
}))

const mockMovieResponse = {
  movie: {
    id: 550,
    tmdb_id: 550,
    title: "Fight Club",
    release_date: "1999-10-15",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    overview: "An insomniac office worker...",
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" },
    ],
    vote_average: 8.4,
    original_language: "en",
    runtime: 139,
  },
  deceased: [
    {
      id: 100,
      name: "Deceased Actor",
      character: "Character A",
      profile_path: "/profile1.jpg",
      birthday: "1930-01-01",
      deathday: "2020-06-15",
      ageAtDeath: 90,
      yearsLost: -10,
      causeOfDeath: "Natural causes",
      causeOfDeathDetails: null,
      wikipediaUrl: "https://en.wikipedia.org/wiki/Actor",
      tmdbUrl: "https://www.themoviedb.org/person/100",
    },
  ],
  living: [
    {
      id: 200,
      name: "Living Actor",
      character: "Character B",
      profile_path: "/profile2.jpg",
      birthday: "1960-05-20",
      age: 64,
    },
  ],
  stats: {
    totalCast: 100,
    deceasedCount: 30,
    livingCount: 70,
    mortalityPercentage: 30,
    expectedDeaths: 25,
    mortalitySurpriseScore: 0.2,
  },
  lastSurvivor: null,
  enrichmentPending: false,
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/movie/fight-club-1999-550"] } = {}
) {
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
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/movie/:slug" element={ui} />
            <Route path="/actor/:slug" element={<div>Actor Page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("MoviePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getMovie).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<MoviePage />)

    expect(screen.getByText("Loading movie data...")).toBeInTheDocument()
  })

  it("renders movie header with title and year", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByText("Fight Club")).toBeInTheDocument()
    })

    expect(screen.getByText("(1999)")).toBeInTheDocument()
  })

  it("renders mortality gauge with percentage", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("mortality-gauge")).toBeInTheDocument()
    })

    expect(screen.getByText("30%")).toBeInTheDocument()
  })

  it("renders cast toggle with deceased and living counts", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("cast-toggle")).toBeInTheDocument()
    })

    expect(screen.getByTestId("deceased-toggle-btn")).toBeInTheDocument()
    expect(screen.getByTestId("living-toggle-btn")).toBeInTheDocument()
  })

  it("shows deceased list by default", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("deceased-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Deceased Actor")).toBeInTheDocument()
  })

  it("toggles to living list when clicked", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("cast-toggle")).toBeInTheDocument()
    })

    // Click the Living tab
    const livingTab = screen.getByRole("button", { name: /Living/ })
    fireEvent.click(livingTab)

    await waitFor(() => {
      expect(screen.getByTestId("living-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Living Actor")).toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getMovie).mockRejectedValue(new Error("Failed to load movie"))

    renderWithProviders(<MoviePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it("renders error for invalid movie URL", async () => {
    renderWithProviders(<MoviePage />, {
      initialEntries: ["/movie/invalid-url-no-id"],
    })

    await waitFor(() => {
      expect(screen.getByText("Invalid movie URL")).toBeInTheDocument()
    })
  })

  it("auto-selects living tab when no deceased actors", async () => {
    vi.mocked(api.getMovie).mockResolvedValue({
      ...mockMovieResponse,
      deceased: [],
      stats: {
        totalCast: 100,
        deceasedCount: 0,
        livingCount: 100,
        mortalityPercentage: 0,
        expectedDeaths: 10,
        mortalitySurpriseScore: -1,
      },
    })

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("living-list")).toBeInTheDocument()
    })
  })

  it("shows poster image when available", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByTestId("movie-poster")).toBeInTheDocument()
    })
  })

  it("shows empty cast message when totalCast is 0", async () => {
    vi.mocked(api.getMovie).mockResolvedValue({
      ...mockMovieResponse,
      deceased: [],
      living: [],
      stats: {
        totalCast: 0,
        deceasedCount: 0,
        livingCount: 0,
        mortalityPercentage: 0,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      },
    })

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(
        screen.getByText("Cast information is not yet available for this movie.")
      ).toBeInTheDocument()
    })
  })

  it("hides cast toggle when totalCast is 0", async () => {
    vi.mocked(api.getMovie).mockResolvedValue({
      ...mockMovieResponse,
      deceased: [],
      living: [],
      stats: {
        totalCast: 0,
        deceasedCount: 0,
        livingCount: 0,
        mortalityPercentage: 0,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
      },
    })

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(
        screen.getByText("Cast information is not yet available for this movie.")
      ).toBeInTheDocument()
    })

    expect(screen.queryByTestId("cast-toggle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("deceased-list")).not.toBeInTheDocument()
    expect(screen.queryByTestId("living-list")).not.toBeInTheDocument()
  })

  it("links actor names to actor pages", async () => {
    vi.mocked(api.getMovie).mockResolvedValue(mockMovieResponse)

    renderWithProviders(<MoviePage />)

    await waitFor(() => {
      expect(screen.getByText("Deceased Actor")).toBeInTheDocument()
    })

    const actorLink = screen.getByText("Deceased Actor").closest("a")
    expect(actorLink).toHaveAttribute("href", "/actor/deceased-actor-100")
  })
})
