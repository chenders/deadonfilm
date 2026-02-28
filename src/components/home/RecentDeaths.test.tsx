import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import RecentDeaths from "./RecentDeaths"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getRecentDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null, size: string = "w185") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null
  ),
}))

const mockDeaths = {
  deaths: [
    {
      id: 1,
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2024-12-01",
      cause_of_death: "Natural causes",
      cause_of_death_details: "Died peacefully at home",
      profile_path: "/path1.jpg",
      fallback_profile_url: null,
      age_at_death: 75,
      birthday: "1949-03-15",
      known_for: [
        { name: "Famous Movie", year: 1990, type: "movie" as const },
        { name: "Great Show", year: 2005, type: "tv" as const },
      ],
    },
    {
      id: 2,
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2024-11-15",
      cause_of_death: null,
      cause_of_death_details: null,
      profile_path: null,
      fallback_profile_url: null,
      age_at_death: null,
      birthday: null,
      known_for: null,
    },
    {
      id: 3,
      tmdb_id: 3,
      name: "Actor Three",
      deathday: "2024-10-20",
      cause_of_death: "Heart attack",
      cause_of_death_details: null,
      profile_path: "/path3.jpg",
      fallback_profile_url: null,
      age_at_death: 62,
      birthday: "1962-05-10",
      known_for: [{ name: "Action Film", year: 2000, type: "movie" as const }],
    },
    {
      id: 4,
      tmdb_id: 4,
      name: "Actor Four",
      deathday: "2024-09-05",
      cause_of_death: "Lung cancer",
      cause_of_death_details: null,
      profile_path: "/path4.jpg",
      fallback_profile_url: null,
      age_at_death: 81,
      birthday: "1943-01-20",
      known_for: [{ name: "Classic Drama", year: 1985, type: "movie" as const }],
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
    <HelmetProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("RecentDeaths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getRecentDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<RecentDeaths />)

    // Loading state shows skeleton UI with beige background
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders deaths list when data loads", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    expect(screen.getByText("Actor One")).toBeInTheDocument()
    expect(screen.getByText("Actor Two")).toBeInTheDocument()
    expect(screen.getByText("Actor Three")).toBeInTheDocument()
    expect(screen.getByText("Actor Four")).toBeInTheDocument()
  })

  it("renders correct title", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths-title")).toHaveTextContent("Recent Passings")
    })
  })

  it("displays cause of death when available", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByText("Natural causes")).toBeInTheDocument()
      expect(screen.getByText("Heart attack")).toBeInTheDocument()
    })
  })

  it("renders actor images when profile_path exists", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    const images = screen.getAllByRole("img")
    expect(images).toHaveLength(3) // Actors 1, 3, 4 have profile_path
    expect(images[0]).toHaveAttribute("src", "https://image.tmdb.org/t/p/w92/path1.jpg")
  })

  it("renders placeholder for actors without profile_path", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    // Actor Two has no profile_path, so there should be a placeholder
    const placeholders = document.querySelectorAll(".bg-brown-medium\\/20")
    expect(placeholders.length).toBeGreaterThan(0)
  })

  it("renders nothing when no deaths data", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue({ deaths: [] })

    const { container } = renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(api.getRecentDeaths).toHaveBeenCalled()
    })

    // Component should return null for empty data
    expect(container.querySelector("[data-testid='recent-deaths']")).toBeNull()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getRecentDeaths).mockRejectedValue(new Error("API Error"))

    const { container } = renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(api.getRecentDeaths).toHaveBeenCalled()
    })

    // Component should return null on error
    expect(container.querySelector("[data-testid='recent-deaths']")).toBeNull()
  })

  it("calls API with limit of 6", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(api.getRecentDeaths).toHaveBeenCalledWith(6)
    })
  })

  it("displays actor names with truncation", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      const nameElements = screen.getAllByTitle(/Actor/)
      expect(nameElements.length).toBe(4)
    })
  })

  it("trims odd number of deaths to even count", async () => {
    const oddDeaths = {
      deaths: [
        ...mockDeaths.deaths,
        {
          id: 5,
          tmdb_id: 5,
          name: "Actor Five",
          deathday: "2024-08-01",
          cause_of_death: null,
          cause_of_death_details: null,
          profile_path: null,
          fallback_profile_url: null,
          age_at_death: 70,
          birthday: "1954-01-01",
          known_for: null,
        },
      ],
    }
    vi.mocked(api.getRecentDeaths).mockResolvedValue(oddDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    // 5 deaths → trimmed to 4 for even grid
    expect(screen.getByText("Actor One")).toBeInTheDocument()
    expect(screen.getByText("Actor Four")).toBeInTheDocument()
    expect(screen.queryByText("Actor Five")).not.toBeInTheDocument()
  })

  it("displays a single death without trimming", async () => {
    const singleDeath = {
      deaths: [mockDeaths.deaths[0]],
    }
    vi.mocked(api.getRecentDeaths).mockResolvedValue(singleDeath)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    expect(screen.getByText("Actor One")).toBeInTheDocument()
  })

  it("applies fetchpriority=high to first image and lazy loading to subsequent images", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    // Actor One (index 0) has profile_path — should get priority
    // Actor Two (index 1) has no image — skipped
    // Actor Three (index 2) has profile_path — should be lazy
    const images = screen.getAllByRole("img")
    expect(images[0]).toHaveAttribute("fetchpriority", "high")
    expect(images[0]).not.toHaveAttribute("loading")

    expect(images[1]).toHaveAttribute("loading", "lazy")
    expect(images[1]).not.toHaveAttribute("fetchpriority")

    expect(images[2]).toHaveAttribute("loading", "lazy")
    expect(images[2]).not.toHaveAttribute("fetchpriority")
  })

  it("applies fetchpriority to first card with image when first card lacks one", async () => {
    // Reorder so the first death has no image
    const reorderedDeaths = {
      deaths: [
        mockDeaths.deaths[1], // Actor Two - no image
        mockDeaths.deaths[0], // Actor One - has image
        mockDeaths.deaths[2], // Actor Three - has image
        mockDeaths.deaths[3], // Actor Four - has image
      ],
    }
    vi.mocked(api.getRecentDeaths).mockResolvedValue(reorderedDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    const images = screen.getAllByRole("img")
    // Actor One (index 1) is first with an image — gets priority
    expect(images[0]).toHaveAttribute("fetchpriority", "high")
    expect(images[0]).not.toHaveAttribute("loading")

    // Actor Three (index 2) — lazy
    expect(images[1]).toHaveAttribute("loading", "lazy")
    expect(images[1]).not.toHaveAttribute("fetchpriority")
  })

  it("renders View all link to /deaths/all", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("view-all-deaths-link")).toBeInTheDocument()
    })

    const link = screen.getByTestId("view-all-deaths-link")
    expect(link).toHaveAttribute("href", "/deaths/all")
    expect(link).toHaveTextContent("View all")
  })

  it("renders preload link for first visible image with correct srcset", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    const preloadLink = document.head.querySelector('link[rel="preload"][as="image"]')
    expect(preloadLink).not.toBeNull()
    expect(preloadLink!.getAttribute("href")).toBe("https://image.tmdb.org/t/p/w92/path1.jpg")
    expect(preloadLink!.getAttribute("imagesrcset")).toContain(
      "image.tmdb.org/t/p/w92/path1.jpg 92w"
    )
    expect(preloadLink!.getAttribute("imagesrcset")).toContain(
      "image.tmdb.org/t/p/w185/path1.jpg 185w"
    )
    expect(preloadLink!.getAttribute("imagesizes")).toBe("80px")
  })

  it("renders preload link with href for fallback profile URL", async () => {
    const fallbackDeaths = {
      deaths: [
        {
          ...mockDeaths.deaths[1], // no profile_path
          id: 20,
          fallback_profile_url: "https://example.com/fallback.jpg",
        },
        mockDeaths.deaths[0],
        mockDeaths.deaths[2],
        mockDeaths.deaths[3],
      ],
    }
    vi.mocked(api.getRecentDeaths).mockResolvedValue(fallbackDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    const preloadLink = document.head.querySelector('link[rel="preload"][as="image"]')
    expect(preloadLink).not.toBeNull()
    expect(preloadLink!.getAttribute("href")).toBe("https://example.com/fallback.jpg")
    expect(preloadLink!.getAttribute("fetchpriority")).toBe("high")
    expect(preloadLink!.getAttribute("imagesrcset")).toBeNull()
  })

  it("does not render preload link when first 3 visible cards lack images", async () => {
    const noImageDeaths = {
      deaths: [
        { ...mockDeaths.deaths[1], id: 10 }, // no image
        { ...mockDeaths.deaths[1], id: 11 }, // no image
        { ...mockDeaths.deaths[1], id: 12 }, // no image
        { ...mockDeaths.deaths[0], id: 13 }, // has image but index >= 3 (desktop-only)
      ],
    }
    vi.mocked(api.getRecentDeaths).mockResolvedValue(noImageDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    const preloadLink = document.head.querySelector('link[rel="preload"][as="image"]')
    expect(preloadLink).toBeNull()
  })
})
