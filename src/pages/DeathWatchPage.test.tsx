import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import DeathWatchPage from "./DeathWatchPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getDeathWatch: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockActors = [
  {
    rank: 1,
    id: 123,
    name: "Old Actor",
    age: 95,
    birthday: "1928-05-15",
    profilePath: "/path1.jpg",
    deathProbability: 0.3521,
    yearsRemaining: 2.5,
    totalMovies: 15,
  },
  {
    rank: 2,
    id: 456,
    name: "Another Actor",
    age: 88,
    birthday: "1936-01-01",
    profilePath: null,
    deathProbability: 0.1856,
    yearsRemaining: 5.1,
    totalMovies: 8,
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/death-watch"] } = {}) {
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
            <Route path="/death-watch" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("DeathWatchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getDeathWatch).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<DeathWatchPage />)

    expect(screen.getByText("Loading Death Watch...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: {
        page: 1,
        pageSize: 50,
        totalPages: 2,
        totalCount: 100,
      },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Old Actor").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Another Actor").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Death Watch")).toBeInTheDocument()
      expect(
        screen.getByText(/Living actors in our database ranked by their probability/)
      ).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("No actors found matching your criteria.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      // Check age and movie count
      expect(screen.getAllByText(/Age 95/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/15 movie/).length).toBeGreaterThanOrEqual(1)
      // Check death probability (35.2% - one decimal place for >= 1%)
      expect(screen.getAllByText(/35\.2%/).length).toBeGreaterThanOrEqual(1)
      // Check years remaining (desktop shows ~2.5, mobile shows ~2.5 yrs left)
      expect(screen.getAllByText(/~2\.5/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getDeathWatch).toHaveBeenCalledWith({
        page: 2,
        includeObscure: false,
        search: "",
        sort: "age",
        dir: "desc",
      })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Old Actor").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getDeathWatch).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<DeathWatchPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("toggles include obscure filter", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getDeathWatch).toHaveBeenCalledWith({
        page: 1,
        includeObscure: true,
        search: "",
        sort: "age",
        dir: "desc",
      })
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-watch-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/old-actor-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: [mockActors[1]], // Another Actor has no profile path
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      // The PersonIcon should be rendered as an SVG
      const actorRow = screen.getByTestId("death-watch-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("formats low death probabilities with two decimal places", async () => {
    vi.mocked(api.getDeathWatch).mockResolvedValue({
      actors: [
        {
          ...mockActors[0],
          deathProbability: 0.005, // 0.5%
        },
      ],
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<DeathWatchPage />)

    await waitFor(() => {
      expect(screen.getByText("0.50%")).toBeInTheDocument()
    })
  })

  describe("search functionality", () => {
    it("renders search input", async () => {
      vi.mocked(api.getDeathWatch).mockResolvedValue({
        actors: mockActors,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<DeathWatchPage />)

      await waitFor(() => {
        expect(screen.getByTestId("search-input")).toBeInTheDocument()
        expect(screen.getByPlaceholderText("Search for an actor...")).toBeInTheDocument()
      })
    })

    it("reads search from URL parameters", async () => {
      vi.mocked(api.getDeathWatch).mockResolvedValue({
        actors: mockActors,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<DeathWatchPage />, {
        initialEntries: ["/death-watch?search=Clint"],
      })

      // Wait for data to load (search input renders after loading completes)
      await waitFor(() => {
        expect(screen.getByTestId("search-input")).toBeInTheDocument()
      })

      expect(api.getDeathWatch).toHaveBeenCalledWith({
        page: 1,
        includeObscure: false,
        search: "Clint",
        sort: "age",
        dir: "desc",
      })

      // Search input should be populated with the URL parameter
      const searchInput = screen.getByTestId("search-input") as HTMLInputElement
      expect(searchInput.value).toBe("Clint")
    })

    it("shows search-specific empty state when no results for search term", async () => {
      vi.mocked(api.getDeathWatch).mockResolvedValue({
        actors: [],
        pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
      })

      renderWithProviders(<DeathWatchPage />, {
        initialEntries: ["/death-watch?search=NonexistentActor"],
      })

      await waitFor(() => {
        expect(screen.getByText(/No actors found matching "NonexistentActor"/)).toBeInTheDocument()
        expect(screen.getByText(/Try a different search term/)).toBeInTheDocument()
      })
    })

    it("search input updates value on change", async () => {
      vi.mocked(api.getDeathWatch).mockResolvedValue({
        actors: mockActors,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<DeathWatchPage />)

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
      vi.mocked(api.getDeathWatch).mockResolvedValue({
        actors: mockActors,
        pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
      })

      renderWithProviders(<DeathWatchPage />, {
        initialEntries: ["/death-watch?search=Clint&includeObscure=true"],
      })

      await waitFor(() => {
        expect(api.getDeathWatch).toHaveBeenCalledWith({
          page: 1,
          includeObscure: true,
          search: "Clint",
          sort: "age",
          dir: "desc",
        })
      })
    })

    describe("debounce behavior", () => {
      it("does not call API on every keypress - only after debounce delay", async () => {
        vi.useFakeTimers()
        try {
          vi.mocked(api.getDeathWatch).mockResolvedValue({
            actors: mockActors,
            pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
          })

          renderWithProviders(<DeathWatchPage />)

          // Wait for initial load
          await act(async () => {
            await vi.runAllTimersAsync()
          })

          // Clear mock to track new calls
          vi.mocked(api.getDeathWatch).mockClear()

          const searchInput = screen.getByTestId("search-input")

          // Type each character rapidly (simulating fast typing)
          await act(async () => {
            fireEvent.change(searchInput, { target: { value: "C" } })
            fireEvent.change(searchInput, { target: { value: "Cl" } })
            fireEvent.change(searchInput, { target: { value: "Cli" } })
            fireEvent.change(searchInput, { target: { value: "Clin" } })
            fireEvent.change(searchInput, { target: { value: "Clint" } })
          })

          // Advance time by less than debounce delay (300ms)
          await act(async () => {
            vi.advanceTimersByTime(100)
          })

          // API should NOT have been called yet during rapid typing
          expect(api.getDeathWatch).not.toHaveBeenCalled()

          // Advance past the debounce delay and flush promises
          await act(async () => {
            await vi.advanceTimersByTimeAsync(300)
          })

          // Now the API should be called exactly once with the final search term
          expect(api.getDeathWatch).toHaveBeenCalledTimes(1)
          expect(api.getDeathWatch).toHaveBeenCalledWith({
            page: 1,
            includeObscure: false,
            search: "Clint",
            sort: "age",
            dir: "desc",
          })
        } finally {
          vi.useRealTimers()
        }
      })

      it("cancels pending search when user continues typing", async () => {
        vi.useFakeTimers()
        try {
          vi.mocked(api.getDeathWatch).mockResolvedValue({
            actors: mockActors,
            pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
          })

          renderWithProviders(<DeathWatchPage />)

          // Wait for initial load
          await act(async () => {
            await vi.runAllTimersAsync()
          })

          vi.mocked(api.getDeathWatch).mockClear()

          const searchInput = screen.getByTestId("search-input")

          // Type first term
          await act(async () => {
            fireEvent.change(searchInput, { target: { value: "Morgan" } })
          })

          // Wait 200ms (less than 300ms debounce)
          await act(async () => {
            vi.advanceTimersByTime(200)
          })

          // Change to a different search term before debounce completes
          await act(async () => {
            fireEvent.change(searchInput, { target: { value: "Clint" } })
          })

          // Advance past the debounce delay and flush promises
          await act(async () => {
            await vi.advanceTimersByTimeAsync(300)
          })

          // Should only have called API with "Clint", never with "Morgan"
          expect(api.getDeathWatch).toHaveBeenCalledTimes(1)
          expect(api.getDeathWatch).toHaveBeenCalledWith({
            page: 1,
            includeObscure: false,
            search: "Clint",
            sort: "age",
            dir: "desc",
          })

          // Verify "Morgan" was never sent to API
          expect(api.getDeathWatch).not.toHaveBeenCalledWith(
            expect.objectContaining({ search: "Morgan" })
          )
        } finally {
          vi.useRealTimers()
        }
      })
    })
  })
})
