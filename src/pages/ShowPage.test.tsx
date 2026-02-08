import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import ShowPage from "./ShowPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getShow: vi.fn(),
  getRelatedShows: vi.fn().mockResolvedValue({ shows: [] }),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockShowResponse = {
  show: {
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
  },
  seasons: [
    {
      seasonNumber: 1,
      name: "Season 1",
      airDate: "1989-07-05",
      episodeCount: 5,
      posterPath: "/s1.jpg",
    },
  ],
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
      totalEpisodes: 5,
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "The Pilot",
          character: "Character A",
        },
      ],
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
      totalEpisodes: 180,
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "The Pilot",
          character: "Character B",
        },
      ],
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
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/show/seinfeld-1989-1400"] } = {}
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
            <Route path="/show/:slug" element={ui} />
            <Route path="/actor/:slug" element={<div>Actor Page</div>} />
            <Route path="/episode/:slug" element={<div>Episode Page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("ShowPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getShow).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<ShowPage />)

    expect(screen.getByText("Loading show data...")).toBeInTheDocument()
  })

  it("renders show header with title and year", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-page")).toBeInTheDocument()
    })

    // Title appears in both breadcrumb and header; check the header specifically
    expect(screen.getByTestId("show-title")).toBeInTheDocument()
    expect(screen.getByText("(1989)")).toBeInTheDocument()
  })

  it("renders mortality gauge with percentage", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("mortality-gauge")).toBeInTheDocument()
    })

    expect(screen.getByText("30%")).toBeInTheDocument()
  })

  it("renders cast toggle with deceased and living counts", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("cast-toggle")).toBeInTheDocument()
    })

    expect(screen.getByTestId("deceased-toggle-btn")).toBeInTheDocument()
    expect(screen.getByTestId("living-toggle-btn")).toBeInTheDocument()
  })

  it("shows deceased list by default", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-deceased-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Deceased Actor")).toBeInTheDocument()
    expect(screen.getByText("as Character A")).toBeInTheDocument()
  })

  it("toggles to living list when clicked", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("cast-toggle")).toBeInTheDocument()
    })

    // Click the Living tab
    const livingTab = screen.getByRole("button", { name: /Living/ })
    fireEvent.click(livingTab)

    await waitFor(() => {
      expect(screen.getByTestId("show-living-list")).toBeInTheDocument()
    })

    expect(screen.getByText("Living Actor")).toBeInTheDocument()
    expect(screen.getByText("as Character B")).toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getShow).mockRejectedValue(new Error("Failed to load show"))

    renderWithProviders(<ShowPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it("renders error for invalid show URL", async () => {
    renderWithProviders(<ShowPage />, {
      initialEntries: ["/show/invalid-url-no-id"],
    })

    await waitFor(() => {
      expect(screen.getByText("Invalid show URL")).toBeInTheDocument()
    })
  })

  it("auto-selects living tab when no deceased actors", async () => {
    vi.mocked(api.getShow).mockResolvedValue({
      ...mockShowResponse,
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

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-living-list")).toBeInTheDocument()
    })
  })

  it("displays episode information for deceased actors", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-deceased-list")).toBeInTheDocument()
    })

    // Should show episode info
    expect(screen.getByTestId("actor-episodes")).toBeInTheDocument()
  })

  it("links actor names to actor pages", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByText("Deceased Actor")).toBeInTheDocument()
    })

    const actorLink = screen.getByText("Deceased Actor").closest("a")
    expect(actorLink).toHaveAttribute("href", "/actor/deceased-actor-100")
  })

  it("shows poster image when available", async () => {
    vi.mocked(api.getShow).mockResolvedValue(mockShowResponse)

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-poster")).toBeInTheDocument()
    })
  })

  it("shows empty cast message when totalCast is 0", async () => {
    vi.mocked(api.getShow).mockResolvedValue({
      ...mockShowResponse,
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

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(
        screen.getByText("Cast information is not yet available for this show.")
      ).toBeInTheDocument()
    })
  })

  it("hides cast toggle when totalCast is 0", async () => {
    vi.mocked(api.getShow).mockResolvedValue({
      ...mockShowResponse,
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

    renderWithProviders(<ShowPage />)

    await waitFor(() => {
      expect(
        screen.getByText("Cast information is not yet available for this show.")
      ).toBeInTheDocument()
    })

    expect(screen.queryByTestId("cast-toggle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("show-deceased-list")).not.toBeInTheDocument()
    expect(screen.queryByTestId("show-living-list")).not.toBeInTheDocument()
  })
})
