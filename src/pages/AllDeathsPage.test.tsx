import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import AllDeathsPage from "./AllDeathsPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getAllDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockDeaths = [
  {
    rank: 1,
    id: 123,
    name: "Actor One",
    deathday: "2024-01-15",
    causeOfDeath: "Natural causes",
    causeOfDeathDetails: "Died peacefully in their sleep at home",
    profilePath: "/path1.jpg",
    ageAtDeath: 85,
  },
  {
    rank: 2,
    id: 456,
    name: "Actor Two",
    deathday: "2024-01-10",
    causeOfDeath: null,
    causeOfDeathDetails: null,
    profilePath: null,
    ageAtDeath: 72,
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/deaths/all"] } = {}) {
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
            <Route path="/deaths/all" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("AllDeathsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getAllDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<AllDeathsPage />)

    expect(screen.getByText("Loading deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: {
        page: 1,
        pageSize: 50,
        totalPages: 2,
        totalCount: 100,
      },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("All Deaths")).toBeInTheDocument()
      // Default state (includeObscure=false) shows "Well-known" description
      expect(screen.getByText(/Well-known deceased actors in our database/)).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("No deaths found in our database.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // Check death info is displayed - use getAllByText since responsive layout renders both versions
      expect(screen.getAllByText(/Age 85/).length).toBeGreaterThanOrEqual(1)
      // Cause of death is now title-cased
      expect(screen.getAllByText("Natural Causes").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("displays causeOfDeathDetails with tooltip trigger when present", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // Check that the death details trigger exists with info icon
      const detailsTrigger = screen.getByTestId("death-details-123")
      expect(detailsTrigger).toBeInTheDocument()
      // The trigger should contain the cause of death text (title-cased)
      expect(detailsTrigger).toHaveTextContent("Natural Causes")
      // The trigger should have an info icon (SVG element)
      expect(detailsTrigger.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("does not render causeOfDeathDetails element when null", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: [mockDeaths[1]], // Actor Two has null causeOfDeathDetails
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })

    // Should not find any death details elements
    expect(screen.queryByTestId("death-details-456")).not.toBeInTheDocument()
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getAllDeaths).toHaveBeenCalledWith({ page: 2, includeObscure: false, search: "" })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getAllDeaths).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<AllDeathsPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<AllDeathsPage />, {
      initialEntries: ["/deaths/all?page=2"],
    })

    await waitFor(() => {
      expect(api.getAllDeaths).toHaveBeenCalledWith({ page: 2, includeObscure: false, search: "" })
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: [mockDeaths[1]], // Actor Two has no profile path
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // The PersonIcon should be rendered as an SVG
      const actorRow = screen.getByTestId("death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("displays ranks correctly", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      // Check that ranks are displayed - both desktop and mobile show rank
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getAllDeaths).toHaveBeenCalledWith({
        page: 1,
        includeObscure: true,
        search: "",
      })
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />, {
      initialEntries: ["/deaths/all?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getAllDeaths).toHaveBeenCalledWith({
        page: 1,
        includeObscure: true,
        search: "",
      })
    })
  })

  it("shows different description when includeObscure is checked", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue({
      deaths: mockDeaths,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<AllDeathsPage />, {
      initialEntries: ["/deaths/all?includeObscure=true"],
    })

    await waitFor(() => {
      expect(screen.getByText(/All deceased actors in our database/)).toBeInTheDocument()
    })
  })

  describe("search functionality", () => {
    it("renders search input", async () => {
      vi.mocked(api.getAllDeaths).mockResolvedValue({
        deaths: mockDeaths,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<AllDeathsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("search-input")).toBeInTheDocument()
        expect(screen.getByPlaceholderText("Search for an actor...")).toBeInTheDocument()
      })
    })

    it("reads search from URL parameters", async () => {
      vi.mocked(api.getAllDeaths).mockResolvedValue({
        deaths: mockDeaths,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<AllDeathsPage />, {
        initialEntries: ["/deaths/all?search=John"],
      })

      // Wait for data to load (search input renders after loading completes)
      await waitFor(() => {
        expect(screen.getByTestId("search-input")).toBeInTheDocument()
      })

      expect(api.getAllDeaths).toHaveBeenCalledWith({
        page: 1,
        includeObscure: false,
        search: "John",
      })

      // Search input should be populated with the URL parameter
      const searchInput = screen.getByTestId("search-input") as HTMLInputElement
      expect(searchInput.value).toBe("John")
    })

    it("shows search-specific empty state when no results for search term", async () => {
      vi.mocked(api.getAllDeaths).mockResolvedValue({
        deaths: [],
        pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
      })

      renderWithProviders(<AllDeathsPage />, {
        initialEntries: ["/deaths/all?search=NonexistentActor"],
      })

      await waitFor(() => {
        expect(screen.getByText(/No actors found matching "NonexistentActor"/)).toBeInTheDocument()
        expect(screen.getByText(/Try a different search term/)).toBeInTheDocument()
      })
    })

    it("search input updates value on change", async () => {
      vi.mocked(api.getAllDeaths).mockResolvedValue({
        deaths: mockDeaths,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<AllDeathsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("search-input")).toBeInTheDocument()
      })

      // Type in search input - this tests that the input updates immediately
      // (the debounce is internal state, tested implicitly by the URL param tests)
      const searchInput = screen.getByTestId("search-input") as HTMLInputElement
      fireEvent.change(searchInput, { target: { value: "Test" } })

      expect(searchInput.value).toBe("Test")
    })

    it("combines search with includeObscure filter", async () => {
      vi.mocked(api.getAllDeaths).mockResolvedValue({
        deaths: mockDeaths,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<AllDeathsPage />, {
        initialEntries: ["/deaths/all?search=John&includeObscure=true"],
      })

      await waitFor(() => {
        expect(api.getAllDeaths).toHaveBeenCalledWith({
          page: 1,
          includeObscure: true,
          search: "John",
        })
      })
    })
  })
})
