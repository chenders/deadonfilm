import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import ForeverYoungPage from "./ForeverYoungPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getForeverYoungMovies: vi.fn(),
  getPosterUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockMovies = [
  {
    rank: 1,
    id: 100,
    title: "Rebel Without a Cause",
    releaseYear: 1955,
    posterPath: "/poster1.jpg",
    actor: {
      id: 123,
      name: "James Dean",
      profilePath: "/profile1.jpg",
      yearsLost: 45.5,
      causeOfDeath: "Car accident",
      causeOfDeathDetails: "Fatal car crash in Cholame, California",
    },
  },
  {
    rank: 2,
    id: 200,
    title: "The Crow",
    releaseYear: 1994,
    posterPath: null,
    actor: {
      id: 456,
      name: "Brandon Lee",
      profilePath: null,
      yearsLost: 38.2,
      causeOfDeath: "Accidental shooting",
      causeOfDeathDetails: null,
    },
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/forever-young"] } = {}) {
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
            <Route path="/forever-young" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("ForeverYoungPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getForeverYoungMovies).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<ForeverYoungPage />)

    expect(screen.getByText("Loading forever young movies...")).toBeInTheDocument()
  })

  it("renders movie list when data loads", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: {
        page: 1,
        pageSize: 50,
        totalPages: 2,
        totalCount: 100,
      },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Rebel Without a Cause").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("The Crow").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("Forever Young")).toBeInTheDocument()
      expect(
        screen.getByText(/Movies featuring leading actors who died tragically young/)
      ).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("No forever young movies found in our database.")).toBeInTheDocument()
    })
  })

  it("displays movie and actor details correctly", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      // Check movie details - use getAllByText for responsive layouts
      expect(screen.getAllByText("1955").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("1994").length).toBeGreaterThanOrEqual(1)

      // Check actor details
      expect(screen.getAllByText("James Dean").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Brandon Lee").length).toBeGreaterThanOrEqual(1)

      // Check years lost display (rounded)
      expect(screen.getAllByText(/Died 46 years early/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/died 38 years early/i).length).toBeGreaterThanOrEqual(1)

      // Check cause of death
      expect(screen.getAllByText("Car accident").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getForeverYoungMovies).toHaveBeenCalledWith(2, "years_lost", "desc")
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getAllByText("Rebel Without a Cause").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getForeverYoungMovies).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 movies")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<ForeverYoungPage />, {
      initialEntries: ["/forever-young?page=2"],
    })

    await waitFor(() => {
      expect(api.getForeverYoungMovies).toHaveBeenCalledWith(2, "years_lost", "desc")
    })
  })

  it("movie rows have correct data-testid", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getByTestId("forever-young-row-100")).toBeInTheDocument()
      expect(screen.getByTestId("forever-young-row-200")).toBeInTheDocument()
    })
  })

  it("displays placeholder icon when no actor profile image", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: [mockMovies[1]], // Brandon Lee has no profile path
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      // The PersonIcon should be rendered as an SVG
      const row = screen.getByTestId("forever-young-row-200")
      expect(row.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("displays 'No poster' placeholder when no movie poster", async () => {
    vi.mocked(api.getForeverYoungMovies).mockResolvedValue({
      movies: [mockMovies[1]], // The Crow has no poster path in mock
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<ForeverYoungPage />)

    await waitFor(() => {
      expect(screen.getAllByText("No poster").length).toBeGreaterThanOrEqual(1)
    })
  })
})
