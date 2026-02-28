import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import SpecificCausePage from "./SpecificCausePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getSpecificCauseDetail: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockSpecificCauseDetail = {
  cause: "Lung cancer",
  slug: "lung-cancer",
  categorySlug: "cancer",
  categoryLabel: "Cancer",
  count: 150,
  avgAge: 70,
  avgYearsLost: 8,
  notableActors: [
    {
      id: 1,
      tmdbId: 100,
      name: "Notable Actor One",
      profilePath: "/path1.jpg",
      fallbackProfileUrl: null,
      deathday: "2020-01-15",
      causeOfDeath: "Lung cancer",
      causeOfDeathDetails: "Metastatic lung cancer",
      ageAtDeath: 65,
    },
  ],
  decadeBreakdown: [
    { decade: "2000s", count: 50 },
    { decade: "2010s", count: 60 },
    { decade: "2020s", count: 40 },
  ],
  actors: [
    {
      rank: 1,
      id: 10,
      tmdbId: 1000,
      name: "Actor One",
      profilePath: "/actor1.jpg",
      fallbackProfileUrl: null,
      deathday: "2024-01-10",
      causeOfDeath: "Lung cancer",
      causeOfDeathDetails: "Stage 4 lung cancer",
      ageAtDeath: 72,
      yearsLost: 8,
    },
    {
      rank: 2,
      id: 20,
      tmdbId: 2000,
      name: "Actor Two",
      profilePath: null,
      fallbackProfileUrl: null,
      deathday: "2024-02-20",
      causeOfDeath: "Lung cancer",
      causeOfDeathDetails: null,
      ageAtDeath: 68,
      yearsLost: 12,
    },
  ],
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 2,
    totalCount: 100,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/causes-of-death/cancer/lung-cancer"] } = {}
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
            <Route path="/causes-of-death/:categorySlug/:causeSlug" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("SpecificCausePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getSpecificCauseDetail).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<SpecificCausePage />)

    expect(screen.getByText("Loading cause details...")).toBeInTheDocument()
  })

  it("renders cause title and stats", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Lung cancer" })).toBeInTheDocument()
      expect(screen.getByText("150 actors")).toBeInTheDocument()
    })
  })

  it("renders stats panel with correct data", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument() // count
      expect(screen.getByText("Total Deaths")).toBeInTheDocument()
      expect(screen.getByText("70")).toBeInTheDocument() // avgAge
      expect(screen.getByText("Avg Age at Death")).toBeInTheDocument()
      expect(screen.getByText("8")).toBeInTheDocument() // avgYearsLost
      expect(screen.getByText("Avg Years Lost")).toBeInTheDocument()
    })
  })

  it("renders breadcrumb navigation", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      const causesLink = screen.getByText("Causes of Death")
      expect(causesLink).toHaveAttribute("href", "/causes-of-death")

      const categoryLink = screen.getByText("Cancer")
      expect(categoryLink).toHaveAttribute("href", "/causes-of-death/cancer")

      // The specific cause appears in breadcrumb as text (not a link) - use getAllByText since it appears multiple times
      expect(screen.getAllByText("Lung cancer").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders notable actors section", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Notable Actors")).toBeInTheDocument()
      expect(screen.getByText("Notable Actor One")).toBeInTheDocument()
    })
  })

  it("renders decade breakdown chart", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Deaths by Decade")).toBeInTheDocument()
      expect(screen.getByText("2000s")).toBeInTheDocument()
      expect(screen.getByText("2010s")).toBeInTheDocument()
      expect(screen.getByText("2020s")).toBeInTheDocument()
    })
  })

  it("renders actor list", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("All Actors")).toBeInTheDocument()
      // Use getAllByText since responsive layout renders both versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders pagination when multiple pages", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("renders total count footer", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<SpecificCausePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("renders error state when cause not found", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(null as never)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("Cause not found")
  })

  it("has correct page test ID", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByTestId("specific-cause-page")).toBeInTheDocument()
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    renderWithProviders(<SpecificCausePage />, {
      initialEntries: ["/causes-of-death/cancer/lung-cancer?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<SpecificCausePage />, {
      initialEntries: ["/causes-of-death/cancer/lung-cancer?page=2"],
    })

    await waitFor(() => {
      expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("hides notable actors section when empty", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      notableActors: [],
    })

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Lung cancer" })).toBeInTheDocument()
    })

    expect(screen.queryByText("Notable Actors")).not.toBeInTheDocument()
  })

  it("hides decade breakdown when empty", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      decadeBreakdown: [],
    })

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Lung cancer" })).toBeInTheDocument()
    })

    expect(screen.queryByText("Deaths by Decade")).not.toBeInTheDocument()
  })

  it("shows empty state when no actors", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      actors: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("No actors found for this cause.")).toBeInTheDocument()
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("hides total count footer when no actors", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue({
      ...mockSpecificCauseDetail,
      actors: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<SpecificCausePage />)

    await waitFor(() => {
      expect(screen.getByText("No actors found for this cause.")).toBeInTheDocument()
    })

    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})
