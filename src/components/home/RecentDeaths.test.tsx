import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import RecentDeaths from "./RecentDeaths"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getRecentDeaths: vi.fn(),
  getProfileUrl: vi.fn((path) => (path ? `https://image.tmdb.org/t/p/w185${path}` : null)),
}))

const mockDeaths = {
  deaths: [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2024-12-01",
      cause_of_death: "Natural causes",
      cause_of_death_details: "Died peacefully at home",
      profile_path: "/path1.jpg",
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2024-11-15",
      cause_of_death: null,
      cause_of_death_details: null,
      profile_path: null,
    },
    {
      tmdb_id: 3,
      name: "Actor Three",
      deathday: "2024-10-20",
      cause_of_death: "Heart attack",
      cause_of_death_details: null,
      profile_path: "/path3.jpg",
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
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>
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
    expect(images).toHaveLength(2) // Only 2 actors have profile_path
    expect(images[0]).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/path1.jpg")
  })

  it("renders placeholder for actors without profile_path", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("recent-deaths")).toBeInTheDocument()
    })

    // Actor Two has no profile_path, so there should be a placeholder
    const placeholders = document.querySelectorAll('[class*="bg-border-theme"]')
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

  it("calls API with limit of 8", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      expect(api.getRecentDeaths).toHaveBeenCalledWith(8)
    })
  })

  it("displays actor names with truncation", async () => {
    vi.mocked(api.getRecentDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<RecentDeaths />)

    await waitFor(() => {
      const nameElements = screen.getAllByTitle(/Actor/)
      expect(nameElements.length).toBe(3)
    })
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
})
