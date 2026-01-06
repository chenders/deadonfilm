import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import NotableDeathsPage from "./NotableDeathsPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getNotableDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockNotableDeathsResponse = {
  actors: [
    {
      id: 1,
      tmdbId: 12345,
      name: "Notable Actor",
      profilePath: "/profile.jpg",
      deathday: "2020-05-20",
      ageAtDeath: 80,
      causeOfDeath: "heart attack",
      deathManner: "natural",
      strangeDeath: false,
      notableFactors: ["sudden_death"],
      circumstancesConfidence: "high",
      slug: "notable-actor-12345",
    },
    {
      id: 2,
      tmdbId: 67890,
      name: "Strange Death Actor",
      profilePath: "/strange.jpg",
      deathday: "2019-03-15",
      ageAtDeath: 45,
      causeOfDeath: "accident",
      deathManner: "accident",
      strangeDeath: true,
      notableFactors: ["controversial", "vehicle_crash"],
      circumstancesConfidence: "disputed",
      slug: "strange-death-actor-67890",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 50,
    totalCount: 2,
    totalPages: 1,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/deaths/notable"] } = {}
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
            <Route path="/deaths/notable" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("NotableDeathsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getNotableDeaths).mockReturnValue(new Promise(() => {}))

    renderWithProviders(<NotableDeathsPage />)

    expect(screen.getByText("Loading notable deaths...")).toBeInTheDocument()
  })

  it("renders error state when API returns error", async () => {
    vi.mocked(api.getNotableDeaths).mockRejectedValue(new Error("Failed to fetch"))

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument()
    })
  })

  it("renders notable deaths list", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Notable Actor")).toBeInTheDocument()
    })

    expect(screen.getByText("Strange Death Actor")).toBeInTheDocument()
    expect(screen.getByText("Notable Deaths")).toBeInTheDocument()
  })

  it("renders actor cards with death info", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("notable-death-1")).toBeInTheDocument()
    })

    // Check that actor info is displayed
    expect(screen.getByText(/Age 80/)).toBeInTheDocument()
    expect(screen.getByText("Heart Attack")).toBeInTheDocument()
  })

  it("renders strange death badge for strange deaths", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("notable-death-2")).toBeInTheDocument()
    })

    // Strange Death Actor should have "Strange" badge (filter tab also has "Strange" text)
    const strangeElements = screen.getAllByText("Strange")
    expect(strangeElements.length).toBe(2) // Filter tab + badge
    // The badge has specific title attribute
    const strangeBadge = strangeElements.find(
      (el) => el.getAttribute("title") === "Strange or unusual death"
    )
    expect(strangeBadge).toBeInTheDocument()
  })

  it("renders filter tabs", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("filter-all")).toBeInTheDocument()
    })

    expect(screen.getByTestId("filter-strange")).toBeInTheDocument()
    expect(screen.getByTestId("filter-disputed")).toBeInTheDocument()
    expect(screen.getByTestId("filter-controversial")).toBeInTheDocument()
  })

  it("calls API with filter param when filter is clicked", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("filter-strange")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId("filter-strange"))

    await waitFor(() => {
      expect(api.getNotableDeaths).toHaveBeenCalledWith(
        expect.objectContaining({ filter: "strange" })
      )
    })
  })

  it("renders include obscure checkbox", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
  })

  it("calls API with includeObscure param when checkbox is toggled", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getNotableDeaths).toHaveBeenCalledWith(
        expect.objectContaining({ includeObscure: true })
      )
    })
  })

  it("renders pagination when multiple pages", async () => {
    const multiPageResponse = {
      ...mockNotableDeathsResponse,
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      },
    }
    vi.mocked(api.getNotableDeaths).mockResolvedValue(multiPageResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })

    expect(screen.getByText("Previous")).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
  })

  it("renders total count", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 actors/)).toBeInTheDocument()
    })
  })

  it("renders empty state when no results", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("No notable deaths found for this filter.")).toBeInTheDocument()
    })
  })

  it("links to death details page", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("notable-death-1")).toBeInTheDocument()
    })

    const actorCard = screen.getByTestId("notable-death-1")
    expect(actorCard).toHaveAttribute("href", "/actor/notable-actor-12345/death")
  })

  it("renders notable factors as badges", async () => {
    vi.mocked(api.getNotableDeaths).mockResolvedValue(mockNotableDeathsResponse)

    renderWithProviders(<NotableDeathsPage />)

    await waitFor(() => {
      expect(screen.getAllByTestId("factor-badge").length).toBeGreaterThan(0)
    })

    expect(screen.getByText("Sudden Death")).toBeInTheDocument()
  })
})
