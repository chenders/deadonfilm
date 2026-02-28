import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import GenresIndexPage from "./GenresIndexPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getGenreCategories: vi.fn(),
  getBackdropUrl: vi.fn((path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : null
  ),
}))

const mockGenreCategories = {
  genres: [
    {
      genre: "Action",
      count: 500,
      slug: "action",
      topCauses: [
        { cause: "Cancer", count: 200, slug: "cancer" },
        { cause: "Heart Attack", count: 150, slug: "heart-attack" },
        { cause: "Stroke", count: 100, slug: "stroke" },
      ],
      topMovie: {
        tmdbId: 694,
        title: "Die Hard",
        releaseYear: 1988,
        backdropPath: "/diehard.jpg",
      },
    },
    {
      genre: "Drama",
      count: 750,
      slug: "drama",
      topCauses: [
        { cause: "Natural Causes", count: 300, slug: "natural-causes" },
        { cause: "AIDS", count: 200, slug: "aids" },
      ],
      topMovie: {
        tmdbId: 597,
        title: "Schindler's List",
        releaseYear: 1993,
        backdropPath: "/schindlers.jpg",
      },
    },
    {
      genre: "Western",
      count: 100,
      slug: "western",
      topCauses: [],
      topMovie: null,
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
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("GenresIndexPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading and error states", () => {
    it("renders loading skeleton initially", () => {
      vi.mocked(api.getGenreCategories).mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<GenresIndexPage />)

      // Loading skeleton should be present
      expect(
        screen.getByText((_, element) => element?.classList.contains("animate-pulse") ?? false)
      ).toBeInTheDocument()
    })

    it("renders error state when API fails", async () => {
      vi.mocked(api.getGenreCategories).mockRejectedValue(new Error("API Error"))

      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load genre categories. Please try again later.")
        ).toBeInTheDocument()
      })
    })
  })

  describe("page content", () => {
    beforeEach(() => {
      vi.mocked(api.getGenreCategories).mockResolvedValue(mockGenreCategories)
    })

    it("renders page title and total count", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        expect(screen.getByText("Movies by Genre")).toBeInTheDocument()
        expect(screen.getByText(/1,350 Movies Across 3 Genres/)).toBeInTheDocument()
      })
    })

    it("renders genre grid", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        expect(screen.getByTestId("genres-grid")).toBeInTheDocument()
      })
    })

    it("displays movie counts for each genre", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        expect(screen.getByText("500 Movies")).toBeInTheDocument()
        expect(screen.getByText("750 Movies")).toBeInTheDocument()
        expect(screen.getByText("100 Movies")).toBeInTheDocument()
      })
    })
  })

  describe("genre card links", () => {
    beforeEach(() => {
      vi.mocked(api.getGenreCategories).mockResolvedValue(mockGenreCategories)
    })

    it("genre heading links to genre detail page", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /Action/ })
        // Find the heading link (the one inside the content section)
        const headingLink = links.find((link) => link.querySelector("h2"))
        expect(headingLink).toHaveAttribute("href", "/movies/genre/action")
      })
    })

    it("card overlay links to genre detail page", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const overlayLink = screen.getByRole("link", { name: "View movies in Action" })
        expect(overlayLink).toHaveAttribute("href", "/movies/genre/action")
      })
    })
  })

  describe("movie title links", () => {
    beforeEach(() => {
      vi.mocked(api.getGenreCategories).mockResolvedValue(mockGenreCategories)
    })

    it("movie title badge links to movie page", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const movieLink = screen.getByRole("link", { name: /Die Hard \(1988\)/ })
        expect(movieLink).toHaveAttribute("href", "/movie/die-hard-1988-694")
      })
    })

    it("renders all movie badges with correct links", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        // Die Hard (1988)
        const dieHardLink = screen.getByRole("link", { name: /Die Hard \(1988\)/ })
        expect(dieHardLink).toHaveAttribute("href", "/movie/die-hard-1988-694")

        // Schindler's List (1993)
        const schindlersLink = screen.getByRole("link", { name: /Schindler's List \(1993\)/ })
        expect(schindlersLink).toHaveAttribute("href", "/movie/schindlers-list-1993-597")
      })
    })

    it("does not render movie badge when no top movie", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        // Only Action and Drama have movie badges (with year in parens)
        const movieBadgeLinks = screen.getAllByRole("link", { name: /\(\d{4}\)/ })
        expect(movieBadgeLinks).toHaveLength(2) // Die Hard (1988) and Schindler's List (1993)
      })
    })
  })

  describe("cause links", () => {
    beforeEach(() => {
      vi.mocked(api.getGenreCategories).mockResolvedValue(mockGenreCategories)
    })

    it("cause pills link to cause detail page", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const cancerLinks = screen.getAllByRole("link", { name: "Cancer" })
        expect(cancerLinks.length).toBeGreaterThan(0)
        expect(cancerLinks[0]).toHaveAttribute("href", "/deaths/cancer")
      })
    })

    it("renders all cause pills with correct slugified URLs", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const heartAttackLinks = screen.getAllByRole("link", { name: "Heart Attack" })
        expect(heartAttackLinks[0]).toHaveAttribute("href", "/deaths/heart-attack")

        const naturalCausesLinks = screen.getAllByRole("link", { name: "Natural Causes" })
        expect(naturalCausesLinks[0]).toHaveAttribute("href", "/deaths/natural-causes")

        const aidsLinks = screen.getAllByRole("link", { name: "AIDS" })
        expect(aidsLinks[0]).toHaveAttribute("href", "/deaths/aids")
      })
    })

    it("limits causes to 3 per genre card", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        // Action genre has exactly 3 causes
        expect(screen.getByRole("link", { name: "Cancer" })).toBeInTheDocument()
        expect(screen.getAllByRole("link", { name: "Heart Attack" })).toHaveLength(1)
        expect(screen.getByRole("link", { name: "Stroke" })).toBeInTheDocument()
      })
    })

    it("does not render causes section when no top causes", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        // Check that there are exactly 2 "Top Causes" labels (for Action and Drama)
        const topCausesLabels = screen.queryAllByText("Top Causes")
        expect(topCausesLabels).toHaveLength(2)
      })
    })
  })

  describe("images", () => {
    beforeEach(() => {
      vi.mocked(api.getGenreCategories).mockResolvedValue(mockGenreCategories)
    })

    it("renders movie backdrop images with lazy loading", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        const dieHardImg = screen.getByAltText("Die Hard")
        expect(dieHardImg).toHaveAttribute("loading", "lazy")
        expect(dieHardImg).toHaveAttribute("decoding", "async")
        expect(dieHardImg).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/diehard.jpg")
      })
    })

    it("renders placeholder when genre has no movie", async () => {
      renderWithProviders(<GenresIndexPage />)

      await waitFor(() => {
        // All 3 genres render headings
        expect(screen.getByText("Action")).toBeInTheDocument()
        expect(screen.getByText("Drama")).toBeInTheDocument()
        expect(screen.getByText("Western")).toBeInTheDocument()

        // Only Action and Drama have movie backdrop images
        expect(screen.getByAltText("Die Hard")).toBeInTheDocument()
        expect(screen.getByAltText("Schindler's List")).toBeInTheDocument()

        // Western has no movie image — verify via overlay link
        expect(screen.getByRole("link", { name: "View movies in Western" })).toBeInTheDocument()
      })
    })
  })
})
