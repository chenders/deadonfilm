import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import ActorPage from "./ActorPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getActor: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockLivingActor = {
  actor: {
    id: 12345,
    name: "Living Actor",
    birthday: "1980-05-15",
    deathday: null,
    biography: "A talented performer known for many roles.",
    profilePath: "/profile.jpg",
    placeOfBirth: "Los Angeles, California, USA",
  },
  analyzedFilmography: [
    {
      movieId: 100,
      title: "Great Movie",
      releaseYear: 2015,
      character: "Lead Role",
      posterPath: "/poster1.jpg",
      deceasedCount: 3,
      castCount: 10,
    },
    {
      movieId: 200,
      title: "Another Film",
      releaseYear: 2010,
      character: "Supporting Role",
      posterPath: "/poster2.jpg",
      deceasedCount: 5,
      castCount: 15,
    },
  ],
  deathInfo: null,
}

const mockDeceasedActor = {
  actor: {
    id: 67890,
    name: "Deceased Actor",
    birthday: "1940-03-10",
    deathday: "2020-08-15",
    biography: "A legendary performer who left a lasting legacy.",
    profilePath: "/legacy.jpg",
    placeOfBirth: "New York City, New York, USA",
  },
  analyzedFilmography: [
    {
      movieId: 300,
      title: "Classic Film",
      releaseYear: 1985,
      character: "Main Character",
      posterPath: "/classic.jpg",
      deceasedCount: 7,
      castCount: 12,
    },
  ],
  deathInfo: {
    causeOfDeath: "Natural causes",
    causeOfDeathDetails: "Passed peacefully at home surrounded by family.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Deceased_Actor",
    ageAtDeath: 80,
    yearsLost: -5,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/actor/living-actor-12345"] } = {}
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
            <Route path="/actor/:slug" element={ui} />
            <Route path="/movie/:slug" element={<div>Movie Page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("ActorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getActor).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<ActorPage />)

    expect(screen.getByText("Loading actor profile...")).toBeInTheDocument()
  })

  it("renders living actor profile without deceased label", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Living Actor")).toBeInTheDocument()
    })

    // Should not have deceased label
    expect(screen.queryByTestId("deceased-label")).not.toBeInTheDocument()

    // Should show birthday
    expect(screen.getByText(/Born:/)).toBeInTheDocument()

    // Should show current age (not death date)
    expect(screen.getByText(/Age:/)).toBeInTheDocument()
  })

  it("renders deceased actor profile with deceased label and death info", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/deceased-actor-67890"],
    })

    await waitFor(() => {
      expect(screen.getByText("Deceased Actor")).toBeInTheDocument()
    })

    // Should have deceased label
    expect(screen.getByTestId("deceased-label")).toBeInTheDocument()
    expect(screen.getByText("(Deceased)")).toBeInTheDocument()

    // Should show death date with age
    expect(screen.getByText(/Died:/)).toBeInTheDocument()

    // Should show cause of death
    expect(screen.getByText(/Cause of Death:/)).toBeInTheDocument()
    expect(screen.getByText("Natural Causes")).toBeInTheDocument()
  })

  it("renders filmography with mortality stats", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Great Movie")).toBeInTheDocument()
      expect(screen.getByText("Another Film")).toBeInTheDocument()
    })

    // Should show deceased/total counts
    expect(screen.getByText("3/10")).toBeInTheDocument()
    expect(screen.getByText("5/15")).toBeInTheDocument()

    // Should show mortality percentages
    expect(screen.getByText("30% deceased")).toBeInTheDocument()
    expect(screen.getByText("33% deceased")).toBeInTheDocument()
  })

  it("renders empty filmography message when no movies", async () => {
    vi.mocked(api.getActor).mockResolvedValue({
      ...mockLivingActor,
      analyzedFilmography: [],
    })

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("No movies in our database yet.")).toBeInTheDocument()
    })
  })

  it("shows cause of death tooltip with details on hover", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/deceased-actor-67890"],
    })

    await waitFor(() => {
      expect(screen.getByTestId("cause-of-death-trigger")).toBeInTheDocument()
    })

    // Hover to show tooltip
    fireEvent.mouseEnter(screen.getByTestId("cause-of-death-trigger"))

    await waitFor(() => {
      expect(screen.getByTestId("death-details-tooltip")).toBeInTheDocument()
      expect(
        screen.getByText("Passed peacefully at home surrounded by family.")
      ).toBeInTheDocument()
    })
  })

  it("renders external links (TMDB, Wikipedia)", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/deceased-actor-67890"],
    })

    await waitFor(() => {
      expect(screen.getByText("TMDB")).toBeInTheDocument()
      expect(screen.getByText("Wikipedia")).toBeInTheDocument()
    })

    // Check TMDB link
    const tmdbLink = screen.getByText("TMDB").closest("a")
    expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org/person/67890")

    // Check Wikipedia link
    const wikiLink = screen.getByText("Wikipedia").closest("a")
    expect(wikiLink).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Deceased_Actor")
  })

  it("renders biography when present", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Biography")).toBeInTheDocument()
      expect(screen.getByText("A talented performer known for many roles.")).toBeInTheDocument()
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getActor).mockRejectedValue(new Error("Failed to load actor"))

    renderWithProviders(<ActorPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it("renders error for invalid actor URL", async () => {
    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/invalid-url-no-id"],
    })

    // Should show error immediately for invalid slug
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument()
    })
  })

  it("response structure does not include costarStats", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Living Actor")).toBeInTheDocument()
    })

    // Verify costarStats is not in the mock data structure
    expect(mockLivingActor).not.toHaveProperty("costarStats")
    expect(Object.keys(mockLivingActor)).toEqual(["actor", "analyzedFilmography", "deathInfo"])
  })

  it("shows years lost when positive", async () => {
    vi.mocked(api.getActor).mockResolvedValue({
      ...mockDeceasedActor,
      deathInfo: {
        ...mockDeceasedActor.deathInfo!,
        yearsLost: 15,
      },
    })

    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/deceased-actor-67890"],
    })

    await waitFor(() => {
      expect(screen.getByText(/Died 15.0 years before life expectancy/)).toBeInTheDocument()
    })
  })

  it("filmography links to movie pages", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Great Movie")).toBeInTheDocument()
    })

    // Get filmography rows
    const filmRows = screen.getAllByTestId("filmography-row")
    expect(filmRows).toHaveLength(2)

    // Check that first filmography row is a link
    const firstLink = filmRows[0] as HTMLAnchorElement
    expect(firstLink.tagName).toBe("A")
    expect(firstLink.getAttribute("href")).toContain("/movie/")
  })
})
