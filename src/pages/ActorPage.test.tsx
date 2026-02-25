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
  getRelatedActors: vi.fn().mockResolvedValue({ actors: [] }),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockLivingActor = {
  actor: {
    id: 12345,
    tmdbId: 99001,
    name: "Living Actor",
    birthday: "1980-05-15",
    deathday: null,
    biography: "A talented performer known for many roles.",
    biographySourceUrl: "https://www.themoviedb.org/person/99001",
    biographySourceType: "tmdb" as const,
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
  analyzedTVFilmography: [],
  deathInfo: null,
  biographyDetails: null,
}

const mockDeceasedActor = {
  actor: {
    id: 67890,
    tmdbId: 99002,
    name: "Deceased Actor",
    birthday: "1940-03-10",
    deathday: "2020-08-15",
    biography: "A legendary performer who left a lasting legacy.",
    biographySourceUrl: "https://en.wikipedia.org/wiki/Deceased_Actor",
    biographySourceType: "wikipedia" as const,
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
  analyzedTVFilmography: [],
  deathInfo: {
    causeOfDeath: "Natural causes",
    causeOfDeathDetails: "Passed peacefully at home surrounded by family.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Deceased_Actor",
    ageAtDeath: 80,
    yearsLost: -5,
    hasDetailedDeathInfo: false,
    notableFactors: ["found_dead", "heart_disease", "media_sensation"],
    career: null,
    relatedCelebrities: null,
  },
  biographyDetails: null,
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
      expect(screen.getByTestId("actor-page")).toBeInTheDocument()
    })

    // Actor name appears in header (and breadcrumb)
    expect(screen.getAllByText("Living Actor").length).toBeGreaterThanOrEqual(1)

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
      expect(screen.getByTestId("actor-page")).toBeInTheDocument()
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

  it("renders empty filmography message when no movies or shows", async () => {
    vi.mocked(api.getActor).mockResolvedValue({
      ...mockLivingActor,
      analyzedFilmography: [],
      analyzedTVFilmography: [],
    })

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("No movies or TV shows in our database yet.")).toBeInTheDocument()
    })
  })

  it("shows cause of death in header and details in death summary card", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

    renderWithProviders(<ActorPage />, {
      initialEntries: ["/actor/deceased-actor-67890"],
    })

    await waitFor(() => {
      expect(screen.getByTestId("actor-page")).toBeInTheDocument()
    })

    // Header shows cause name (no tooltip)
    expect(screen.getByText(/Cause of Death:/)).toBeInTheDocument()
    expect(screen.getByText("Natural Causes")).toBeInTheDocument()
    expect(screen.queryByTestId("death-details-tooltip")).not.toBeInTheDocument()

    // Death summary card shows teaser line (non-expandable fallback)
    expect(screen.getByTestId("death-summary-card")).toBeInTheDocument()
    expect(screen.getByText(/Died of natural causes at age 80/)).toBeInTheDocument()
  })

  it("omits TMDB link and OG image when tmdbId is null", async () => {
    vi.mocked(api.getActor).mockResolvedValue({
      ...mockLivingActor,
      actor: {
        ...mockLivingActor.actor,
        tmdbId: null,
        biographySourceUrl: null,
      },
    })

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByTestId("actor-page")).toBeInTheDocument()
    })

    // TMDB link should not be present
    expect(screen.queryByText("TMDB")).not.toBeInTheDocument()

    // Profile photo should not be wrapped in a link
    const photo = screen.getByTestId("actor-profile-photo")
    expect(photo.closest("a")).toBeNull()
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

    // Check TMDB link (uses tmdbId, not id)
    const tmdbLink = screen.getByText("TMDB").closest("a")
    expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org/person/99002")

    // Check Wikipedia link
    const wikiLink = screen.getByText("Wikipedia").closest("a")
    expect(wikiLink).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Deceased_Actor")
  })

  it("renders biography when present", async () => {
    vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

    renderWithProviders(<ActorPage />)

    await waitFor(() => {
      expect(screen.getByText("Life")).toBeInTheDocument()
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
      expect(screen.getByTestId("actor-page")).toBeInTheDocument()
    })

    // Verify costarStats is not in the mock data structure
    expect(mockLivingActor).not.toHaveProperty("costarStats")
    expect(Object.keys(mockLivingActor)).toEqual([
      "actor",
      "analyzedFilmography",
      "analyzedTVFilmography",
      "deathInfo",
      "biographyDetails",
    ])
  })

  it("shows years lost in death summary card when positive", async () => {
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
      expect(screen.getByTestId("death-summary-card")).toBeInTheDocument()
    })

    expect(screen.getByText(/15\.0 years before life expectancy/)).toBeInTheDocument()
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

  describe("TV show appearances", () => {
    const mockActorWithTV = {
      ...mockLivingActor,
      analyzedTVFilmography: [
        {
          showId: 500,
          name: "Great TV Show",
          firstAirYear: 2018,
          lastAirYear: 2022,
          character: "Main Character",
          posterPath: "/tv-poster.jpg",
          deceasedCount: 2,
          castCount: 8,
          episodeCount: 24,
        },
        {
          showId: 600,
          name: "Another Show",
          firstAirYear: 2020,
          lastAirYear: null,
          character: null,
          posterPath: null,
          deceasedCount: 1,
          castCount: 5,
          episodeCount: 5,
        },
      ],
    }

    it("renders TV show appearances with episode count", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithTV)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByText("Great TV Show")).toBeInTheDocument()
      })

      // Should show episode count
      expect(screen.getByText(/24 episodes/)).toBeInTheDocument()
      expect(screen.getByText(/5 episodes/)).toBeInTheDocument()
    })

    it("renders TV show year range", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithTV)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByText("Great TV Show")).toBeInTheDocument()
      })

      // Should show year range for show with start and end years
      expect(screen.getByText(/2018–2022/)).toBeInTheDocument()
    })

    it("links TV shows to show pages", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithTV)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByText("Great TV Show")).toBeInTheDocument()
      })

      const filmRows = screen.getAllByTestId("filmography-row")
      // Movies (2) + TV shows (2) = 4 total
      expect(filmRows).toHaveLength(4)

      // Find the TV show row and verify it links to show page
      const tvShowLink = filmRows.find((row) => row.textContent?.includes("Great TV Show"))
      expect(tvShowLink).toBeTruthy()
      expect(tvShowLink?.getAttribute("href")).toContain("/show/")
    })

    it("shows combined filmography count in header", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithTV)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      // Should show counts for movies and TV shows
      expect(screen.getByText(/2 movies/)).toBeInTheDocument()
      expect(screen.getByText(/2 TV shows/)).toBeInTheDocument()
    })

    it("sorts combined filmography by year (newest first)", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithTV)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const filmRows = screen.getAllByTestId("filmography-row")
      // Order should be: Another Show (2020), Great TV Show (2018), Great Movie (2015), Another Film (2010)
      const titles = filmRows.map((row) => row.querySelector("h3")?.textContent)
      expect(titles).toEqual(["Another Show", "Great TV Show", "Great Movie", "Another Film"])
    })
  })

  describe("collapsible filmography", () => {
    const mockActorWithManyFilms = {
      ...mockLivingActor,
      analyzedFilmography: Array.from({ length: 8 }, (_, i) => ({
        movieId: 100 + i,
        title: `Movie ${i + 1}`,
        releaseYear: 2020 - i,
        character: `Role ${i + 1}`,
        posterPath: null,
        deceasedCount: 1,
        castCount: 10,
      })),
    }

    it("shows only first 5 items when collapsed", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithManyFilms)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const filmRows = screen.getAllByTestId("filmography-row")
      expect(filmRows).toHaveLength(5)
    })

    it("shows toggle button with total count", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithManyFilms)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const toggle = screen.getByTestId("filmography-toggle")
      expect(toggle).toHaveTextContent("Show all 8 titles")
    })

    it("expands to show all items when toggle is clicked", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithManyFilms)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId("filmography-toggle"))

      const filmRows = screen.getAllByTestId("filmography-row")
      expect(filmRows).toHaveLength(8)
      expect(screen.getByTestId("filmography-toggle")).toHaveTextContent("Show less")
    })

    it("collapses back when toggle is clicked again", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockActorWithManyFilms)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const toggle = screen.getByTestId("filmography-toggle")
      fireEvent.click(toggle) // expand
      fireEvent.click(toggle) // collapse

      const filmRows = screen.getAllByTestId("filmography-row")
      expect(filmRows).toHaveLength(5)
    })

    it("does not show toggle when filmography has 5 or fewer items", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("filmography-toggle")).not.toBeInTheDocument()
    })
  })

  describe("career context and related people sections", () => {
    it("renders career context when present for deceased actor", async () => {
      vi.mocked(api.getActor).mockResolvedValue({
        ...mockDeceasedActor,
        deathInfo: {
          ...mockDeceasedActor.deathInfo!,
          career: {
            statusAtDeath: "semi-retired",
            lastProject: {
              title: "Final Film",
              year: 2019,
              tmdb_id: 999,
              imdb_id: null,
              type: "movie" as const,
            },
            posthumousReleases: [],
          },
        },
      })

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("career-context-section")).toBeInTheDocument()
      })

      expect(screen.getByText("Career Context")).toBeInTheDocument()
      expect(screen.getByText("Semi Retired")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Final Film (2019)" })).toBeInTheDocument()
    })

    it("renders related people when present for deceased actor", async () => {
      vi.mocked(api.getActor).mockResolvedValue({
        ...mockDeceasedActor,
        deathInfo: {
          ...mockDeceasedActor.deathInfo!,
          relatedCelebrities: [
            {
              name: "Famous Friend",
              tmdbId: 100,
              relationship: "close friend",
              slug: "famous-friend-100",
            },
            { name: "Co-Star", tmdbId: null, relationship: "co-star", slug: null },
          ],
        },
      })

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("related-people-section")).toBeInTheDocument()
      })

      expect(screen.getByText("Related People")).toBeInTheDocument()
      expect(screen.getByText("Famous Friend")).toBeInTheDocument()
      expect(screen.getByText("Co-Star")).toBeInTheDocument()
    })

    it("does not render career context for living actors", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("career-context-section")).not.toBeInTheDocument()
      expect(screen.queryByTestId("related-people-section")).not.toBeInTheDocument()
    })

    it("does not render sections when fields are null", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      // mockDeceasedActor has career: null and relatedCelebrities: null
      expect(screen.queryByTestId("career-context-section")).not.toBeInTheDocument()
      expect(screen.queryByTestId("related-people-section")).not.toBeInTheDocument()
    })
  })

  describe("notable factor badges", () => {
    it("renders factor badges for deceased actors", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockDeceasedActor)

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const badges = screen.getAllByTestId("factor-badge")
      expect(badges).toHaveLength(3)
      expect(screen.getByText("Found Dead")).toBeInTheDocument()
      expect(screen.getByText("Heart Disease")).toBeInTheDocument()
      expect(screen.getByText("Media Sensation")).toBeInTheDocument()
    })

    it("does not render factor badges for living actors", async () => {
      vi.mocked(api.getActor).mockResolvedValue(mockLivingActor)

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("factor-badge")).not.toBeInTheDocument()
    })

    it("does not render factor badges when notableFactors is null", async () => {
      vi.mocked(api.getActor).mockResolvedValue({
        ...mockDeceasedActor,
        deathInfo: {
          ...mockDeceasedActor.deathInfo!,
          notableFactors: null,
        },
      })

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("factor-badge")).not.toBeInTheDocument()
    })

    it("renders life factor badges from biographyDetails", async () => {
      vi.mocked(api.getActor).mockResolvedValue({
        ...mockDeceasedActor,
        biographyDetails: {
          narrative: "A remarkable person.",
          narrativeConfidence: null,
          lifeNotableFactors: ["military_service", "scholar"],
          birthplaceDetails: null,
          familyBackground: null,
          education: null,
          preFameLife: null,
          fameCatalyst: null,
          personalStruggles: null,
          relationships: null,
          lesserKnownFacts: [],
          sources: null,
        },
      })

      renderWithProviders(<ActorPage />, {
        initialEntries: ["/actor/deceased-actor-67890"],
      })

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      // Death factors (3) + life factors (2) = 5 total badges
      const badges = screen.getAllByTestId("factor-badge")
      expect(badges).toHaveLength(5)
      expect(screen.getByText("Military Service")).toBeInTheDocument()
      expect(screen.getByText("Scholar")).toBeInTheDocument()
    })

    it("renders only life factor badges when no death factors", async () => {
      vi.mocked(api.getActor).mockResolvedValue({
        ...mockLivingActor,
        biographyDetails: {
          narrative: "A remarkable person.",
          narrativeConfidence: null,
          lifeNotableFactors: ["prodigy", "multiple_careers"],
          birthplaceDetails: null,
          familyBackground: null,
          education: null,
          preFameLife: null,
          fameCatalyst: null,
          personalStruggles: null,
          relationships: null,
          lesserKnownFacts: [],
          sources: null,
        },
      })

      renderWithProviders(<ActorPage />)

      await waitFor(() => {
        expect(screen.getByTestId("actor-page")).toBeInTheDocument()
      })

      const badges = screen.getAllByTestId("factor-badge")
      expect(badges).toHaveLength(2)
      expect(screen.getByText("Prodigy")).toBeInTheDocument()
      expect(screen.getByText("Multiple Careers")).toBeInTheDocument()
    })
  })
})
