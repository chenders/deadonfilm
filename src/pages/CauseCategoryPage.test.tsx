import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import CauseCategoryPage from "./CauseCategoryPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getCauseCategoryDetail: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockCategoryDetail = {
  slug: "cancer",
  label: "Cancer",
  count: 500,
  avgAge: 68,
  avgYearsLost: 10,
  percentage: 25.5,
  notableActors: [
    {
      id: 1,
      tmdbId: 100,
      name: "Notable Actor One",
      profilePath: "/path1.jpg",
      deathday: "2020-01-15",
      causeOfDeath: "Lung cancer",
      causeOfDeathDetails: "Metastatic lung cancer",
      ageAtDeath: 65,
    },
    {
      id: 2,
      tmdbId: 200,
      name: "Notable Actor Two",
      profilePath: null,
      deathday: "2019-06-20",
      causeOfDeath: "Brain cancer",
      causeOfDeathDetails: null,
      ageAtDeath: 55,
    },
  ],
  decadeBreakdown: [
    { decade: "1990s", count: 100 },
    { decade: "2000s", count: 200 },
    { decade: "2010s", count: 150 },
    { decade: "2020s", count: 50 },
  ],
  specificCauses: [
    { cause: "Lung cancer", slug: "lung-cancer", count: 150, avgAge: 70 },
    { cause: "Breast cancer", slug: "breast-cancer", count: 80, avgAge: 62 },
    { cause: "Brain cancer", slug: "brain-cancer", count: 50, avgAge: 58 },
  ],
  actors: [
    {
      rank: 1,
      id: 10,
      tmdbId: 1000,
      name: "Actor One",
      profilePath: "/actor1.jpg",
      deathday: "2024-01-10",
      causeOfDeath: "Lung cancer",
      causeOfDeathDetails: null,
      ageAtDeath: 72,
      yearsLost: 8,
    },
    {
      rank: 2,
      id: 20,
      tmdbId: 2000,
      name: "Actor Two",
      profilePath: null,
      deathday: "2024-02-20",
      causeOfDeath: "Brain cancer",
      causeOfDeathDetails: "Glioblastoma",
      ageAtDeath: 45,
      yearsLost: 35,
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
  { initialEntries = ["/causes-of-death/cancer"] } = {}
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
            <Route path="/causes-of-death/:categorySlug" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("CauseCategoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getCauseCategoryDetail).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<CauseCategoryPage />)

    expect(screen.getByText("Loading category...")).toBeInTheDocument()
  })

  it("renders category title and stats", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
      expect(screen.getByText("500 actors (25.5% of known causes)")).toBeInTheDocument()
    })
  })

  it("renders stats panel with correct data", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("500")).toBeInTheDocument() // count
      expect(screen.getByText("Total Deaths")).toBeInTheDocument()
      expect(screen.getByText("68")).toBeInTheDocument() // avgAge
      expect(screen.getByText("Avg Age at Death")).toBeInTheDocument()
      expect(screen.getByText("10")).toBeInTheDocument() // avgYearsLost
      expect(screen.getByText("Avg Years Lost")).toBeInTheDocument()
    })
  })

  it("renders notable actors section", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Notable Actors")).toBeInTheDocument()
      expect(screen.getByText("Notable Actor One")).toBeInTheDocument()
      expect(screen.getByText("Notable Actor Two")).toBeInTheDocument()
    })
  })

  it("renders decade breakdown chart", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Deaths by Decade")).toBeInTheDocument()
      expect(screen.getByText("1990s")).toBeInTheDocument()
      expect(screen.getByText("2000s")).toBeInTheDocument()
      expect(screen.getByText("2010s")).toBeInTheDocument()
      expect(screen.getByText("2020s")).toBeInTheDocument()
    })
  })

  it("renders specific causes list", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Specific Causes")).toBeInTheDocument()
      // Use getAllByText since causes may appear multiple times (in list and actor rows)
      expect(screen.getAllByText("Lung cancer").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Breast cancer").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Brain cancer").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("specific causes link to detail pages", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      // Find the specific causes section and check for links
      const lungCancerLinks = screen.getAllByText("Lung cancer")
      // At least one should be inside a link to the specific cause page
      const linkWithLungCancer = lungCancerLinks.find(
        (el) => el.closest("a")?.getAttribute("href") === "/causes-of-death/cancer/lung-cancer"
      )
      expect(linkWithLungCancer).toBeDefined()
    })
  })

  it("renders actor list", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("All Actors")).toBeInTheDocument()
      // Use getAllByText since responsive layout renders both versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders breadcrumb navigation", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      const breadcrumb = screen.getByText("← Causes of Death")
      expect(breadcrumb).toHaveAttribute("href", "/causes-of-death")
    })
  })

  it("renders pagination when multiple pages", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
        page: 2,
        includeObscure: false,
        specificCause: undefined,
      })
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
        page: 1,
        includeObscure: true,
        specificCause: undefined,
      })
    })
  })

  it("renders total count footer", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("has correct page test ID", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByTestId("cause-category-page")).toBeInTheDocument()
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    renderWithProviders(<CauseCategoryPage />, {
      initialEntries: ["/causes-of-death/cancer?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
        page: 1,
        includeObscure: true,
        specificCause: undefined,
      })
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue({
      ...mockCategoryDetail,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<CauseCategoryPage />, {
      initialEntries: ["/causes-of-death/cancer?page=2"],
    })

    await waitFor(() => {
      expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
        page: 2,
        includeObscure: false,
        specificCause: undefined,
      })
    })
  })

  it("hides notable actors section when empty", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue({
      ...mockCategoryDetail,
      notableActors: [],
    })

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
    })

    expect(screen.queryByText("Notable Actors")).not.toBeInTheDocument()
  })

  it("hides specific causes section when empty", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue({
      ...mockCategoryDetail,
      specificCauses: [],
    })

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
    })

    expect(screen.queryByText("Specific Causes")).not.toBeInTheDocument()
  })

  it("hides decade breakdown when empty", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue({
      ...mockCategoryDetail,
      decadeBreakdown: [],
    })

    renderWithProviders(<CauseCategoryPage />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
    })

    expect(screen.queryByText("Deaths by Decade")).not.toBeInTheDocument()
  })
})
