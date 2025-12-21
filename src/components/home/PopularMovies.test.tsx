import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import PopularMovies from "./PopularMovies"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getPopularMovies: vi.fn(),
  getPosterUrl: (path: string | null, _size?: string) =>
    path ? `https://image.tmdb.org/t/p/w185${path}` : null,
}))

const mockMovies = {
  movies: [
    {
      id: 12345,
      title: "The Godfather",
      releaseYear: 1972,
      posterPath: "/poster1.jpg",
      deceasedCount: 10,
      castCount: 20,
      popularity: 100.5,
    },
    {
      id: 67890,
      title: "Casablanca",
      releaseYear: 1942,
      posterPath: null,
      deceasedCount: 15,
      castCount: 25,
      popularity: 85.2,
    },
  ],
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe("PopularMovies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton initially", () => {
    vi.mocked(api.getPopularMovies).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<PopularMovies />)

    expect(screen.getByTestId("popular-movies")).toBeInTheDocument()
    expect(screen.getByTestId("popular-movies").querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders movies when data loads", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByTestId("popular-movies-title")).toBeInTheDocument()
    })

    expect(screen.getByText("Popular Movies")).toBeInTheDocument()
    expect(screen.getByText("The Godfather")).toBeInTheDocument()
    expect(screen.getByText("Casablanca")).toBeInTheDocument()
  })

  it("displays mortality percentages", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByTestId("popular-movies-list")).toBeInTheDocument()
    })

    // 10/20 = 50%, 15/25 = 60%
    expect(screen.getByText("50% deceased")).toBeInTheDocument()
    expect(screen.getByText("60% deceased")).toBeInTheDocument()
  })

  it("links to movie pages", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByTestId("popular-movies-list")).toBeInTheDocument()
    })

    const links = screen.getByTestId("popular-movies-list").querySelectorAll("a")
    expect(links[0]).toHaveAttribute("href", "/movie/the-godfather-1972-12345")
    expect(links[1]).toHaveAttribute("href", "/movie/casablanca-1942-67890")
  })

  it("displays poster images when available", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByTestId("popular-movies-list")).toBeInTheDocument()
    })

    const img = screen.getByAltText("The Godfather")
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/poster1.jpg")
  })

  it("shows placeholder when no poster", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByTestId("popular-movies-list")).toBeInTheDocument()
    })

    // Casablanca has no poster
    expect(screen.queryByAltText("Casablanca")).not.toBeInTheDocument()
  })

  it("displays release year", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue(mockMovies)

    renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(screen.getByText("1972")).toBeInTheDocument()
    })

    expect(screen.getByText("1942")).toBeInTheDocument()
  })

  it("renders nothing when no movies available", async () => {
    vi.mocked(api.getPopularMovies).mockResolvedValue({ movies: [] })

    const { container } = renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(api.getPopularMovies).toHaveBeenCalled()
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='popular-movies-list']")).toBeNull()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getPopularMovies).mockRejectedValue(new Error("API Error"))

    const { container } = renderWithProviders(<PopularMovies />)

    await waitFor(() => {
      expect(api.getPopularMovies).toHaveBeenCalled()
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='popular-movies-list']")).toBeNull()
  })
})
