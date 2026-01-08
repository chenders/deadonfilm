import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import ActorDeathPage from "./ActorDeathPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getActorDeathDetails: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockDeathDetails = {
  actor: {
    id: 1,
    tmdbId: 12345,
    name: "Famous Actor",
    birthday: "1940-01-15",
    deathday: "2020-05-20",
    profilePath: "/profile.jpg",
    causeOfDeath: "heart attack",
    causeOfDeathDetails: "Died at home.",
    ageAtDeath: 80,
    yearsLost: 5,
    deathManner: "natural",
    deathCategories: ["cardiovascular"],
    strangeDeath: false,
  },
  circumstances: {
    official: "He was found at his home after suffering a cardiac event.",
    confidence: "high",
    rumored: null,
    locationOfDeath: "Los Angeles, California",
    notableFactors: ["sudden_death"],
    additionalContext: "He had been working on a new project.",
  },
  career: {
    statusAtDeath: "active",
    lastProject: {
      title: "Final Film",
      year: 2019,
      tmdb_id: 999,
      imdb_id: null,
      type: "movie" as const,
    },
    posthumousReleases: [
      { title: "Released After", year: 2021, tmdb_id: 1000, imdb_id: null, type: "movie" as const },
    ],
  },
  relatedCelebrities: [
    {
      name: "Co-Star Name",
      tmdbId: 54321,
      relationship: "Frequent co-star",
      slug: "co-star-name-54321",
    },
  ],
  sources: {
    cause: [{ url: "https://example.com", archiveUrl: null, description: "News article" }],
    circumstances: null,
    rumored: null,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/actor/famous-actor-12345/death"] } = {}
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
            <Route path="/actor/:slug/death" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("ActorDeathPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getActorDeathDetails).mockReturnValue(new Promise(() => {}))

    renderWithProviders(<ActorDeathPage />)

    expect(screen.getByText("Loading death details...")).toBeInTheDocument()
  })

  it("renders error state when API returns error", async () => {
    vi.mocked(api.getActorDeathDetails).mockRejectedValue(new Error("Failed to fetch"))

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument()
    })
  })

  it("renders actor death details", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Famous Actor")).toBeInTheDocument()
    })

    // Check basic info
    expect(screen.getByText(/Born:/)).toBeInTheDocument()
    expect(screen.getByText(/Died:/)).toBeInTheDocument()
    expect(screen.getByText(/age 80/)).toBeInTheDocument()
    expect(screen.getByText(/Los Angeles, California/)).toBeInTheDocument()
    expect(screen.getByText(/Heart Attack/)).toBeInTheDocument()
  })

  it("renders official circumstances section", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("official-section")).toBeInTheDocument()
    })

    expect(screen.getByText("What We Know")).toBeInTheDocument()
    expect(
      screen.getByText("He was found at his home after suffering a cardiac event.")
    ).toBeInTheDocument()
  })

  it("renders confidence indicator", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("confidence-indicator")).toBeInTheDocument()
    })

    expect(screen.getByText("High confidence")).toBeInTheDocument()
  })

  it("renders notable factors as badges", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("factor-badge")).toBeInTheDocument()
    })

    expect(screen.getByText("Sudden Death")).toBeInTheDocument()
  })

  it("renders career context section", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("career-section")).toBeInTheDocument()
    })

    expect(screen.getByText("Career Context")).toBeInTheDocument()
    expect(screen.getByText(/Status at Death:/)).toBeInTheDocument()
    expect(screen.getByText(/Last Project:/)).toBeInTheDocument()
    expect(screen.getByText("Final Film (2019)")).toBeInTheDocument()
    expect(screen.getByText(/Posthumous Releases:/)).toBeInTheDocument()
    expect(screen.getByText("Released After (2021)")).toBeInTheDocument()
  })

  it("renders related celebrities section", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("related-section")).toBeInTheDocument()
    })

    expect(screen.getByText("Related People")).toBeInTheDocument()
    expect(screen.getByText("Co-Star Name")).toBeInTheDocument()
    expect(screen.getByText("Frequent co-star")).toBeInTheDocument()
  })

  it("renders sources section", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("sources-section")).toBeInTheDocument()
    })

    expect(screen.getByText("News article")).toBeInTheDocument()
  })

  it("renders back link to actor page", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("back-to-actor")).toBeInTheDocument()
    })

    const backLink = screen.getByTestId("back-to-actor")
    expect(backLink).toHaveAttribute("href", "/actor/famous-actor-12345")
    expect(backLink).toHaveTextContent("Back to Famous Actor")
  })

  it("does not render rumored section when no rumored circumstances", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("actor-death-page")).toBeInTheDocument()
    })

    expect(screen.queryByTestId("rumored-section")).not.toBeInTheDocument()
  })

  it("renders rumored section when rumored circumstances exist", async () => {
    const dataWithRumored = {
      ...mockDeathDetails,
      circumstances: {
        ...mockDeathDetails.circumstances,
        rumored: "Some people believe there was foul play involved.",
      },
    }
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(dataWithRumored)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("rumored-section")).toBeInTheDocument()
    })

    expect(screen.getByText("Alternative Accounts")).toBeInTheDocument()
    expect(
      screen.getByText("Some people believe there was foul play involved.")
    ).toBeInTheDocument()
  })

  it("renders additional context section when present", async () => {
    vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

    renderWithProviders(<ActorDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("context-section")).toBeInTheDocument()
    })

    expect(screen.getByText("Additional Context")).toBeInTheDocument()
    expect(screen.getByText("He had been working on a new project.")).toBeInTheDocument()
  })

  it("renders invalid actor URL error for invalid slug", async () => {
    renderWithProviders(<ActorDeathPage />, {
      initialEntries: ["/actor/invalid/death"],
    })

    expect(screen.getByText("Invalid actor URL")).toBeInTheDocument()
  })

  describe("Low Confidence Warning Banner", () => {
    it("shows warning banner when confidence is low", async () => {
      const dataWithLowConfidence = {
        ...mockDeathDetails,
        circumstances: {
          ...mockDeathDetails.circumstances,
          confidence: "low",
        },
      }
      vi.mocked(api.getActorDeathDetails).mockResolvedValue(dataWithLowConfidence)

      renderWithProviders(<ActorDeathPage />)

      await waitFor(() => {
        expect(screen.getByTestId("low-confidence-warning")).toBeInTheDocument()
      })

      expect(screen.getByText("Unverified Information")).toBeInTheDocument()
      expect(screen.getByText(/could not be fully verified/i)).toBeInTheDocument()
    })

    it("shows disputed warning banner when confidence is disputed", async () => {
      const dataWithDisputedConfidence = {
        ...mockDeathDetails,
        circumstances: {
          ...mockDeathDetails.circumstances,
          confidence: "disputed",
        },
      }
      vi.mocked(api.getActorDeathDetails).mockResolvedValue(dataWithDisputedConfidence)

      renderWithProviders(<ActorDeathPage />)

      await waitFor(() => {
        expect(screen.getByTestId("low-confidence-warning")).toBeInTheDocument()
      })

      expect(screen.getByText("Information Disputed")).toBeInTheDocument()
      expect(screen.getByText(/Multiple conflicting accounts exist/i)).toBeInTheDocument()
    })

    it("does not show warning banner when confidence is high", async () => {
      vi.mocked(api.getActorDeathDetails).mockResolvedValue(mockDeathDetails)

      renderWithProviders(<ActorDeathPage />)

      await waitFor(() => {
        expect(screen.getByTestId("official-section")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("low-confidence-warning")).not.toBeInTheDocument()
    })

    it("does not show warning banner when confidence is medium", async () => {
      const dataWithMediumConfidence = {
        ...mockDeathDetails,
        circumstances: {
          ...mockDeathDetails.circumstances,
          confidence: "medium",
        },
      }
      vi.mocked(api.getActorDeathDetails).mockResolvedValue(dataWithMediumConfidence)

      renderWithProviders(<ActorDeathPage />)

      await waitFor(() => {
        expect(screen.getByTestId("official-section")).toBeInTheDocument()
      })

      expect(screen.queryByTestId("low-confidence-warning")).not.toBeInTheDocument()
    })
  })
})
