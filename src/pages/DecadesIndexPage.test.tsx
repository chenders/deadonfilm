import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import DecadesIndexPage from "./DecadesIndexPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getDecadeCategories: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w45${path}` : null
  ),
  getBackdropUrl: vi.fn((path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : null
  ),
}))

const mockDecadeCategories = {
  decades: [
    {
      decade: 1980,
      count: 500,
      featuredActor: {
        id: 1001,
        tmdbId: 1001,
        name: "John Wayne",
        profilePath: "/john.jpg",
        causeOfDeath: "Cancer",
      },
      topCauses: [
        { cause: "Cancer", count: 200 },
        { cause: "Heart Attack", count: 150 },
        { cause: "Stroke", count: 100 },
      ],
      topMovie: {
        tmdbId: 694,
        title: "The Shining",
        releaseYear: 1980,
        backdropPath: "/shining.jpg",
      },
    },
    {
      decade: 1990,
      count: 750,
      featuredActor: {
        id: 2002,
        tmdbId: 2002,
        name: "Jane Doe",
        profilePath: null,
        causeOfDeath: "Heart Attack",
      },
      topCauses: [
        { cause: "Natural Causes", count: 300 },
        { cause: "AIDS", count: 200 },
      ],
      topMovie: {
        tmdbId: 597,
        title: "Titanic",
        releaseYear: 1997,
        backdropPath: "/titanic.jpg",
      },
    },
    {
      decade: 2000,
      count: 300,
      featuredActor: null,
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

describe("DecadesIndexPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading and error states", () => {
    it("renders loading skeleton initially", () => {
      vi.mocked(api.getDecadeCategories).mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<DecadesIndexPage />)

      // Loading skeleton should be present
      expect(
        screen.getByText((_, element) => element?.classList.contains("animate-pulse") ?? false)
      )
    })

    it("renders error state when API fails", async () => {
      vi.mocked(api.getDecadeCategories).mockRejectedValue(new Error("API Error"))

      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load decade categories. Please try again later.")
        ).toBeInTheDocument()
      })
    })
  })

  describe("page content", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("renders page title and total count", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        expect(screen.getByText("Deaths by Decade")).toBeInTheDocument()
        expect(screen.getByText(/1,550 Deaths Across 3 Decades/)).toBeInTheDocument()
      })
    })

    it("renders decade grid", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        expect(screen.getByTestId("decades-grid")).toBeInTheDocument()
      })
    })

    it("displays death counts for each decade", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        expect(screen.getByText("500 Deaths")).toBeInTheDocument()
        expect(screen.getByText("750 Deaths")).toBeInTheDocument()
        expect(screen.getByText("300 Deaths")).toBeInTheDocument()
      })
    })
  })

  describe("decade card links", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("decade heading links to decade detail page", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /1980s/ })
        // Find the heading link (the one inside the content section)
        const headingLink = links.find((link) => link.querySelector("h2"))
        expect(headingLink).toHaveAttribute("href", "/deaths/decade/1980s")
      })
    })

    it("card overlay links to decade detail page", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const overlayLink = screen.getByRole("link", { name: "View deaths in the 1980s" })
        expect(overlayLink).toHaveAttribute("href", "/deaths/decade/1980s")
      })
    })
  })

  describe("movie title links", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("movie title badge links to movie page", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const movieLink = screen.getByRole("link", { name: /The Shining \(1980\)/ })
        expect(movieLink).toHaveAttribute("href", "/movie/the-shining-1980-694")
      })
    })

    it("renders all movie badges with correct links", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // The Shining (1980)
        const shiningLink = screen.getByRole("link", { name: /The Shining \(1980\)/ })
        expect(shiningLink).toHaveAttribute("href", "/movie/the-shining-1980-694")

        // Titanic (1997)
        const titanicLink = screen.getByRole("link", { name: /Titanic \(1997\)/ })
        expect(titanicLink).toHaveAttribute("href", "/movie/titanic-1997-597")
      })
    })

    it("does not render movie badge when no top movie", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // 2000s decade has no top movie
        expect(screen.queryByRole("link", { name: /2000\)/ })).not.toBeInTheDocument()
      })
    })
  })

  describe("actor badge links", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("actor badge links to actor page", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const actorLink = screen.getByRole("link", { name: /Top Actor: John Wayne/ })
        expect(actorLink).toHaveAttribute("href", "/actor/john-wayne-1001")
      })
    })

    it("renders all actor badges with correct links", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const johnWayneLink = screen.getByRole("link", { name: /Top Actor: John Wayne/ })
        expect(johnWayneLink).toHaveAttribute("href", "/actor/john-wayne-1001")

        const janeDoeLink = screen.getByRole("link", { name: /Top Actor: Jane Doe/ })
        expect(janeDoeLink).toHaveAttribute("href", "/actor/jane-doe-2002")
      })
    })

    it("does not render actor badge when no featured actor", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // 2000s decade has no featured actor
        const actorBadges = screen.queryAllByText(/Top Actor:/)
        expect(actorBadges).toHaveLength(2) // Only 1980s and 1990s
      })
    })
  })

  describe("cause links", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("cause pills link to cause detail page", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const cancerLinks = screen.getAllByRole("link", { name: "Cancer" })
        expect(cancerLinks.length).toBeGreaterThan(0)
        expect(cancerLinks[0]).toHaveAttribute("href", "/deaths/cancer")
      })
    })

    it("renders all cause pills with correct slugified URLs", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // Check various causes with different slugification needs
        const heartAttackLinks = screen.getAllByRole("link", { name: "Heart Attack" })
        expect(heartAttackLinks[0]).toHaveAttribute("href", "/deaths/heart-attack")

        const naturalCausesLinks = screen.getAllByRole("link", { name: "Natural Causes" })
        expect(naturalCausesLinks[0]).toHaveAttribute("href", "/deaths/natural-causes")

        const aidsLinks = screen.getAllByRole("link", { name: "AIDS" })
        expect(aidsLinks[0]).toHaveAttribute("href", "/deaths/aids")
      })
    })

    it("limits causes to 3 per decade card", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // 1980s decade has exactly 3 causes
        expect(screen.getByRole("link", { name: "Cancer" })).toBeInTheDocument()
        expect(screen.getAllByRole("link", { name: "Heart Attack" })).toHaveLength(1)
        expect(screen.getByRole("link", { name: "Stroke" })).toBeInTheDocument()
      })
    })

    it("does not render causes section when no top causes", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // Check that there are exactly 2 "Top Causes" labels (for 1980s and 1990s)
        const topCausesLabels = screen.queryAllByText("Top Causes")
        expect(topCausesLabels).toHaveLength(2)
      })
    })
  })

  describe("images", () => {
    beforeEach(() => {
      vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
    })

    it("renders movie backdrop images with lazy loading", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const shiningImg = screen.getByAltText("The Shining")
        expect(shiningImg).toHaveAttribute("loading", "lazy")
        expect(shiningImg).toHaveAttribute("decoding", "async")
        expect(shiningImg).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/shining.jpg")
      })
    })

    it("renders actor profile images", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        const johnImg = screen.getByAltText("John Wayne")
        expect(johnImg).toHaveAttribute("src", "https://image.tmdb.org/t/p/w45/john.jpg")
      })
    })

    it("renders placeholder when actor has no profile image", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // Jane Doe has no profile path, so should show placeholder skull icon
        const janeDoeLink = screen.getByRole("link", { name: /Top Actor: Jane Doe/ })
        expect(janeDoeLink.querySelector("svg")).toBeInTheDocument()
      })
    })

    it("renders placeholder when decade has no movie", async () => {
      renderWithProviders(<DecadesIndexPage />)

      await waitFor(() => {
        // 2000s decade has no movie, check for placeholder skull
        const decadesGrid = screen.getByTestId("decades-grid")
        const cards = decadesGrid.querySelectorAll(".group")
        expect(cards).toHaveLength(3)
      })
    })
  })
})
