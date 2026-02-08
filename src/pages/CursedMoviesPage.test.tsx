import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import CursedMoviesPage from "./CursedMoviesPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getCursedMovies: vi.fn(),
  getCursedMoviesFilters: vi.fn(() => Promise.resolve({ maxMinDeaths: 10 })),
  getPosterUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w92${path}` : null)),
}))

const mockMovies = [
  {
    rank: 1,
    id: 1,
    title: "Very Cursed Movie",
    releaseYear: 1980,
    posterPath: "/poster1.jpg",
    deceasedCount: 15,
    castCount: 20,
    expectedDeaths: 5,
    mortalitySurpriseScore: 2.0,
  },
  {
    rank: 2,
    id: 2,
    title: "Somewhat Cursed Movie",
    releaseYear: 1990,
    posterPath: "/poster2.jpg",
    deceasedCount: 10,
    castCount: 15,
    expectedDeaths: 4,
    mortalitySurpriseScore: 1.5,
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/cursed-movies"] } = {}) {
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
            <Route path="/cursed-movies" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("CursedMoviesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getCursedMovies).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<CursedMoviesPage />)

    expect(screen.getByText("Loading movies...")).toBeInTheDocument()
  })

  it("renders movie list when data loads", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Both desktop and mobile layouts render movie titles
      expect(screen.getAllByText("Very Cursed Movie").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Somewhat Cursed Movie").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders filter controls", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Both desktop (with colon) and mobile (without) layouts are rendered
      expect(screen.getByLabelText("From:")).toBeInTheDocument()
      expect(screen.getByLabelText("To:")).toBeInTheDocument()
      expect(screen.getByLabelText("Min Deaths:")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with correct params when filter is changed", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(screen.getByLabelText("From:")).toBeInTheDocument()
    })

    // Change the "From" decade filter
    fireEvent.change(screen.getByLabelText("From:"), { target: { value: "1980" } })

    await waitFor(() => {
      expect(api.getCursedMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          fromDecade: 1980,
        })
      )
    })
  })

  it("shows Clear filters button when filters are applied", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    // Start with a filter in URL
    renderWithProviders(<CursedMoviesPage />, {
      initialEntries: ["/cursed-movies?from=1980"],
    })

    await waitFor(() => {
      // Both mobile and desktop layouts render Clear filters
      expect(screen.getAllByText("Clear filters").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("does not show Clear filters button when no filters applied", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Both desktop and mobile layouts render movie titles
      expect(screen.getAllByText("Very Cursed Movie").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument()
  })

  it("shows empty state when no movies match filters", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(
        screen.getByText("No movies match these filters. Try adjusting your criteria.")
      ).toBeInTheDocument()
    })
  })

  it("displays movie stats correctly", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Both desktop and mobile layouts render stats, use getAllByText
      // Check mortality stats display (deceasedCount/castCount) - desktop shows "15/20"
      expect(screen.getAllByText("15/20").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("10/15").length).toBeGreaterThanOrEqual(1)

      // Check excess mortality display (mortalitySurpriseScore * 100)%
      expect(screen.getAllByText("200%").length).toBeGreaterThanOrEqual(1) // 2.0 * 100
      expect(screen.getAllByText("150%").length).toBeGreaterThanOrEqual(1) // 1.5 * 100
    })
  })

  it("shows total count in footer", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 movies")).toBeInTheDocument()
    })
  })

  it("reads filters from URL parameters", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 2, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />, {
      initialEntries: ["/cursed-movies?page=2&from=1970&to=1990&minDeaths=5"],
    })

    await waitFor(() => {
      expect(api.getCursedMovies).toHaveBeenCalledWith({
        page: 2,
        fromDecade: 1970,
        toDecade: 1990,
        minDeadActors: 5,
        includeObscure: false,
      })
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getCursedMovies).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 2, totalPages: 1 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Both desktop and mobile layouts render movie titles
      expect(screen.getAllByText("Very Cursed Movie").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders Include obscure movies checkbox", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Desktop has "Include obscure movies", mobile has "Include obscure"
      expect(screen.getByLabelText("Include obscure movies")).toBeInTheDocument()
    })
  })

  it("defaults includeObscure to false (checkbox unchecked)", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      // Use desktop checkbox for testing
      const checkbox = screen.getByLabelText("Include obscure movies") as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    // Verify API was called with includeObscure: false
    expect(api.getCursedMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        includeObscure: false,
      })
    )
  })

  it("calls API with includeObscure=true when checkbox is checked", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />)

    await waitFor(() => {
      expect(screen.getByLabelText("Include obscure movies")).toBeInTheDocument()
    })

    // Check the desktop checkbox
    fireEvent.click(screen.getByLabelText("Include obscure movies"))

    await waitFor(() => {
      expect(api.getCursedMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          includeObscure: true,
        })
      )
    })
  })

  it("shows Clear filters when includeObscure is true", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />, {
      initialEntries: ["/cursed-movies?includeObscure=true"],
    })

    await waitFor(() => {
      // Both mobile and desktop have Clear filters buttons, use getAllByText
      expect(screen.getAllByText("Clear filters").length).toBeGreaterThanOrEqual(1)
      // Use desktop checkbox for testing
      const checkbox = screen.getByLabelText("Include obscure movies") as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getCursedMovies).mockResolvedValue({
      movies: mockMovies,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedMoviesPage />, {
      initialEntries: ["/cursed-movies?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getCursedMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          includeObscure: true,
        })
      )
    })
  })
})
