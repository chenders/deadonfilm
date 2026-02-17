import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import InDetailPage from "./InDetailPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getInDetailActors: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockInDetailResponse = {
  actors: [
    {
      id: 1,
      tmdbId: 12345,
      name: "Researched Actor",
      profilePath: "/profile.jpg",
      deathday: "2020-05-20",
      ageAtDeath: 80,
      causeOfDeath: "heart attack",
      deathManner: "natural",
      enrichedAt: "2025-01-15T12:00:00Z",
      circumstancesConfidence: "high",
      slug: "researched-actor-1",
      topFilms: [
        { title: "Famous Movie", year: 1995 },
        { title: "Another Hit", year: 2001 },
      ],
    },
    {
      id: 2,
      tmdbId: 67890,
      name: "Another Actor",
      profilePath: null,
      deathday: "2019-03-15",
      ageAtDeath: 45,
      causeOfDeath: "accident",
      deathManner: "accident",
      enrichedAt: "2025-01-10T12:00:00Z",
      circumstancesConfidence: "medium",
      slug: "another-actor-2",
      topFilms: [],
    },
  ],
  pagination: {
    page: 1,
    pageSize: 50,
    totalCount: 2,
    totalPages: 1,
  },
}

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/in-detail"] } = {}) {
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
            <Route path="/in-detail" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("InDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getInDetailActors).mockReturnValue(new Promise(() => {}))

    renderWithProviders(<InDetailPage />)

    expect(screen.getByText("Loading actors...")).toBeInTheDocument()
  })

  it("renders error state when API returns error", async () => {
    vi.mocked(api.getInDetailActors).mockRejectedValue(new Error("Failed to fetch"))

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument()
    })
  })

  it("renders actor list", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Researched Actor")).toBeInTheDocument()
    })

    expect(screen.getByText("Another Actor")).toBeInTheDocument()
    expect(screen.getByText("In Detail")).toBeInTheDocument()
  })

  it("renders actor cards with death info", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByTestId("in-detail-1")).toBeInTheDocument()
    })

    expect(screen.getByText(/Age: 80/)).toBeInTheDocument()
    expect(screen.getByText("Heart Attack")).toBeInTheDocument()
  })

  it("renders search input", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByTestId("search-input")).toBeInTheDocument()
    })
  })

  it("renders include obscure checkbox", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
  })

  it("calls API with includeObscure param when checkbox is toggled", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getInDetailActors).toHaveBeenCalledWith(
        expect.objectContaining({ includeObscure: true })
      )
    })
  })

  it("renders pagination when multiple pages", async () => {
    const multiPageResponse = {
      ...mockInDetailResponse,
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      },
    }
    vi.mocked(api.getInDetailActors).mockResolvedValue(multiPageResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })

    expect(screen.getByText("Previous")).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
  })

  it("renders total count", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 actors/)).toBeInTheDocument()
    })
  })

  it("renders empty state when no results", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("No results found.")).toBeInTheDocument()
    })
  })

  it("links to actor page", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByTestId("in-detail-1")).toBeInTheDocument()
    })

    const actorCard = screen.getByTestId("in-detail-1")
    expect(actorCard).toHaveAttribute("href", "/actor/researched-actor-1")
  })

  it("renders sort control with four options", async () => {
    vi.mocked(api.getInDetailActors).mockResolvedValue(mockInDetailResponse)

    renderWithProviders(<InDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Updated")).toBeInTheDocument()
    })

    expect(screen.getByText("Date")).toBeInTheDocument()
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Age")).toBeInTheDocument()
  })
})
