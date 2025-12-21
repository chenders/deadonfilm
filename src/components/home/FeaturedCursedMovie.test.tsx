import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import FeaturedCursedMovie from "./FeaturedCursedMovie"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getFeaturedMovie: vi.fn(),
  getPosterUrl: (path: string | null, _size?: string) =>
    path ? `https://image.tmdb.org/t/p/w185${path}` : null,
}))

const mockMovie = {
  movie: {
    tmdbId: 12345,
    title: "The Conqueror",
    releaseYear: 1956,
    posterPath: "/poster.jpg",
    deceasedCount: 46,
    castCount: 50,
    expectedDeaths: 20,
    mortalitySurpriseScore: 1.3,
  },
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe("FeaturedCursedMovie", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton initially", () => {
    vi.mocked(api.getFeaturedMovie).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<FeaturedCursedMovie />)

    expect(screen.getByTestId("featured-movie")).toBeInTheDocument()
    // Should show loading skeleton (has animate-pulse class)
    expect(screen.getByTestId("featured-movie").querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders featured movie when data loads", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue(mockMovie)

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByTestId("featured-movie-title")).toBeInTheDocument()
    })

    expect(screen.getByText("Most Cursed Movie")).toBeInTheDocument()
    expect(screen.getByText("The Conqueror")).toBeInTheDocument()
    expect(screen.getByText("(1956)")).toBeInTheDocument()
  })

  it("displays mortality statistics", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue(mockMovie)

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByTestId("featured-movie-link")).toBeInTheDocument()
    })

    expect(screen.getByText(/46 of 50 cast deceased/)).toBeInTheDocument()
    expect(screen.getByText("Expected: 20.0 deaths")).toBeInTheDocument()
    expect(screen.getByText("Curse Score: +130% above expected")).toBeInTheDocument()
  })

  it("links to movie page with correct slug", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue(mockMovie)

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByTestId("featured-movie-link")).toBeInTheDocument()
    })

    const link = screen.getByTestId("featured-movie-link")
    expect(link).toHaveAttribute("href", "/movie/the-conqueror-1956-12345")
  })

  it("renders movie poster when available", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue(mockMovie)

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByRole("img")).toBeInTheDocument()
    })

    const img = screen.getByRole("img")
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/poster.jpg")
    expect(img).toHaveAttribute("alt", "The Conqueror")
  })

  it("renders placeholder when no poster", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue({
      movie: {
        ...mockMovie.movie,
        posterPath: null,
      },
    })

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByTestId("featured-movie-link")).toBeInTheDocument()
    })

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  it("renders nothing when movie is null", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue({ movie: null })

    const { container } = renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(api.getFeaturedMovie).toHaveBeenCalled()
    })

    // Wait a bit for the component to update
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='featured-movie-link']")).toBeNull()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getFeaturedMovie).mockRejectedValue(new Error("API Error"))

    const { container } = renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(api.getFeaturedMovie).toHaveBeenCalled()
    })

    // Wait a bit for the component to update
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='featured-movie-link']")).toBeNull()
  })

  it("handles movie without release year", async () => {
    vi.mocked(api.getFeaturedMovie).mockResolvedValue({
      movie: {
        ...mockMovie.movie,
        releaseYear: null,
      },
    })

    renderWithProviders(<FeaturedCursedMovie />)

    await waitFor(() => {
      expect(screen.getByText("The Conqueror")).toBeInTheDocument()
    })

    // Should not show year
    expect(screen.queryByText(/\(\d{4}\)/)).not.toBeInTheDocument()
    // Link should use "unknown" for year
    const link = screen.getByTestId("featured-movie-link")
    expect(link).toHaveAttribute("href", "/movie/the-conqueror-unknown-12345")
  })
})
