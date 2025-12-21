import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import EpisodePage from "./EpisodePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getEpisode: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockEpisodeResponse = {
  show: {
    id: 1400,
    name: "Seinfeld",
    posterPath: "/poster.jpg",
    firstAirDate: "1989-07-05",
  },
  episode: {
    id: 12345,
    seasonNumber: 4,
    episodeNumber: 11,
    name: "The Contest",
    overview: "The gang competes to see who can go the longest.",
    airDate: "1992-11-18",
    runtime: 23,
    stillPath: "/still.jpg",
  },
  deceased: [
    {
      id: 100,
      name: "Deceased Guest",
      character: "Guest Role",
      profile_path: "/guest.jpg",
      birthday: "1940-01-01",
      deathday: "2015-03-10",
      ageAtDeath: 75,
      yearsLost: 5,
      causeOfDeath: "Heart attack",
      causeOfDeathDetails: null,
      wikipediaUrl: null,
      tmdbUrl: "https://www.themoviedb.org/person/100",
      totalEpisodes: 1,
      episodes: [],
    },
  ],
  living: [
    {
      id: 200,
      name: "Living Guest",
      character: "Another Role",
      profile_path: "/living.jpg",
      birthday: "1965-08-15",
      age: 59,
      totalEpisodes: 1,
      episodes: [],
    },
  ],
  stats: {
    totalCast: 10,
    deceasedCount: 3,
    livingCount: 7,
    mortalityPercentage: 30,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/episode/seinfeld-s4e11-the-contest-1400"] } = {}
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
            <Route path="/episode/:slug" element={ui} />
            <Route path="/show/:slug" element={<div>Show Page</div>} />
            <Route path="/actor/:slug" element={<div>Actor Page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("EpisodePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getEpisode).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<EpisodePage />)

    expect(screen.getByText("Loading episode data...")).toBeInTheDocument()
  })

  it("renders episode header with show name and episode code", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByText("The Contest")).toBeInTheDocument()
    })

    expect(screen.getByText("S4E11")).toBeInTheDocument()
  })

  it("renders breadcrumb navigation to show page", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByText("Seinfeld")).toBeInTheDocument()
    })

    const showLink = screen.getByText("Seinfeld").closest("a")
    expect(showLink).toHaveAttribute("href", "/show/seinfeld-1989-1400")
  })

  it("renders mortality stats", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByText("30%")).toBeInTheDocument()
    })

    expect(screen.getByText("cast deceased")).toBeInTheDocument()
    expect(screen.getByText("3 of 10 cast members")).toBeInTheDocument()
  })

  it("renders episode overview", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(
        screen.getByText("The gang competes to see who can go the longest.")
      ).toBeInTheDocument()
    })
  })

  it("renders air date", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByText(/Aired/)).toBeInTheDocument()
    })
  })

  it("shows deceased list by default", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-deceased-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Deceased Guest")).toBeInTheDocument()
  })

  it("toggles to living list when clicked", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByTestId("cast-toggle")).toBeInTheDocument()
    })

    const livingTab = screen.getByRole("button", { name: /Living/ })
    fireEvent.click(livingTab)

    await waitFor(() => {
      expect(screen.getByTestId("show-living-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Living Guest")).toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getEpisode).mockRejectedValue(new Error("Failed to load episode"))

    renderWithProviders(<EpisodePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it("renders error for invalid episode URL", async () => {
    renderWithProviders(<EpisodePage />, {
      initialEntries: ["/episode/invalid-url"],
    })

    await waitFor(() => {
      expect(screen.getByText("Invalid episode URL")).toBeInTheDocument()
    })
  })

  it("auto-selects living tab when no deceased actors", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue({
      ...mockEpisodeResponse,
      deceased: [],
      stats: {
        totalCast: 10,
        deceasedCount: 0,
        livingCount: 10,
        mortalityPercentage: 0,
      },
    })

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-living-list")).toBeInTheDocument()
    })
  })

  it("shows runtime when available", async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(mockEpisodeResponse)

    renderWithProviders(<EpisodePage />)

    await waitFor(() => {
      expect(screen.getByText(/23 min/)).toBeInTheDocument()
    })
  })
})
