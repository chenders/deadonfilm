import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import UnnaturalDeathsPage from "./UnnaturalDeathsPage"
import * as api from "@/services/api"
import type { UnnaturalDeathsResponse } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getUnnaturalDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockPersons = [
  {
    rank: 1,
    id: 123,
    name: "Actor One",
    deathday: "2020-03-15",
    causeOfDeath: "Car Accident",
    causeOfDeathDetails: "Fatal crash on highway",
    profilePath: "/path1.jpg",
    ageAtDeath: 45,
  },
  {
    rank: 2,
    id: 456,
    name: "Actor Two",
    deathday: "2019-12-01",
    causeOfDeath: "Overdose",
    causeOfDeathDetails: null,
    profilePath: null,
    ageAtDeath: 32,
  },
]

const mockResponse: UnnaturalDeathsResponse = {
  persons: mockPersons,
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 2,
    totalCount: 100,
  },
  categories: [
    { id: "accident", label: "Accident", count: 40 },
    { id: "overdose", label: "Overdose", count: 30 },
    { id: "suicide", label: "Suicide", count: 20 },
    { id: "homicide", label: "Homicide", count: 10 },
  ],
  selectedCategory: "all",
  showSelfInflicted: false,
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/unnatural-deaths"] } = {}
) {
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
            <Route path="/unnatural-deaths" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("UnnaturalDeathsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getUnnaturalDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<UnnaturalDeathsPage />)

    expect(screen.getByText("Loading unnatural deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Unnatural Deaths")).toBeInTheDocument()
      expect(screen.getByText(/Actors who died from unnatural causes/)).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      persons: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("No unnatural deaths found.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getAllByText(/Age 45/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Car Accident").length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText("Fatal crash on highway")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 2,
        category: "all",
        showSelfInflicted: false,
        includeObscure: false,
      })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("unnatural-death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      persons: [mockPersons[1]], // Actor Two has no profile path
    })

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("unnatural-death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("renders category tabs", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("category-tab-all")).toBeInTheDocument()
      expect(screen.getByTestId("category-tab-accident")).toBeInTheDocument()
      expect(screen.getByTestId("category-tab-overdose")).toBeInTheDocument()
      expect(screen.getByTestId("category-tab-suicide")).toBeInTheDocument()
      expect(screen.getByTestId("category-tab-homicide")).toBeInTheDocument()
    })
  })

  it("calls API with category when tab is clicked", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("category-tab-accident")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId("category-tab-accident"))

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "accident",
        showSelfInflicted: false,
        includeObscure: false,
      })
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const obscureCheckbox = screen.getByTestId("include-obscure-filter").querySelector("input")!
    fireEvent.click(obscureCheckbox)

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "all",
        showSelfInflicted: false,
        includeObscure: true,
      })
    })
  })

  it("renders show self-inflicted filter when category is all", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-self-inflicted-filter")).toBeInTheDocument()
      expect(screen.getByText("Show self-inflicted deaths")).toBeInTheDocument()
    })
  })

  it("calls API with showSelfInflicted when checkbox is checked", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("show-self-inflicted-filter")).toBeInTheDocument()
    })

    const selfInflictedCheckbox = screen
      .getByTestId("show-self-inflicted-filter")
      .querySelector("input")!
    fireEvent.click(selfInflictedCheckbox)

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "all",
        showSelfInflicted: true,
        includeObscure: false,
      })
    })
  })

  it("hides self-inflicted filter when category is not all", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      selectedCategory: "accident",
    })

    renderWithProviders(<UnnaturalDeathsPage />, {
      initialEntries: ["/unnatural-deaths?category=accident"],
    })

    await waitFor(() => {
      expect(screen.getByTestId("category-tab-accident")).toBeInTheDocument()
    })

    expect(screen.queryByTestId("show-self-inflicted-filter")).not.toBeInTheDocument()
  })

  it("reads category from URL parameters", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      selectedCategory: "overdose",
    })

    renderWithProviders(<UnnaturalDeathsPage />, {
      initialEntries: ["/unnatural-deaths?category=overdose"],
    })

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "overdose",
        showSelfInflicted: false,
        includeObscure: false,
      })
    })
  })

  it("reads showSelfInflicted from URL parameters", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue({
      ...mockResponse,
      showSelfInflicted: true,
    })

    renderWithProviders(<UnnaturalDeathsPage />, {
      initialEntries: ["/unnatural-deaths?showSelfInflicted=true"],
    })

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "all",
        showSelfInflicted: true,
        includeObscure: false,
      })
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />, {
      initialEntries: ["/unnatural-deaths?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
        page: 1,
        category: "all",
        showSelfInflicted: false,
        includeObscure: true,
      })
    })
  })

  it("displays category counts in tabs", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValue(mockResponse)

    renderWithProviders(<UnnaturalDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("All (100)")).toBeInTheDocument()
      expect(screen.getByText("Accident (40)")).toBeInTheDocument()
      expect(screen.getByText("Overdose (30)")).toBeInTheDocument()
    })
  })
})
