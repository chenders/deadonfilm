import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import CausesOfDeathPage from "./CausesOfDeathPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getCauseCategoryIndex: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockCategoryIndex = {
  categories: [
    {
      slug: "cancer",
      label: "Cancer",
      count: 500,
      percentage: 25.5,
      avgAge: 68,
      avgYearsLost: 10,
      topCauses: [
        { cause: "Lung cancer", slug: "lung-cancer", count: 150 },
        { cause: "Breast cancer", slug: "breast-cancer", count: 80 },
      ],
    },
    {
      slug: "heart-disease",
      label: "Heart Disease",
      count: 400,
      percentage: 20.0,
      avgAge: 72,
      avgYearsLost: 8,
      topCauses: [{ cause: "Heart attack", slug: "heart-attack", count: 200 }],
    },
    {
      slug: "accidents",
      label: "Accidents",
      count: 100,
      percentage: 5.0,
      avgAge: 45,
      avgYearsLost: 25,
      topCauses: [],
    },
  ],
  totalWithKnownCause: 1960,
  overallAvgAge: 65,
  overallAvgYearsLost: 12,
  mostCommonCategory: "Cancer",
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/causes-of-death"] } = {}
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
            <Route path="/causes-of-death" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("CausesOfDeathPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getCauseCategoryIndex).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<CausesOfDeathPage />)

    expect(screen.getByText("Loading causes of death...")).toBeInTheDocument()
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Causes of Death")).toBeInTheDocument()
      expect(
        screen.getByText("Explore how actors from movies and TV shows have passed away")
      ).toBeInTheDocument()
    })
  })

  it("renders stats banner with correct data", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("1,960")).toBeInTheDocument() // totalWithKnownCause
      expect(screen.getByText("Known Causes")).toBeInTheDocument()
      expect(screen.getByText("65")).toBeInTheDocument() // overallAvgAge
      expect(screen.getByText("Avg Age at Death")).toBeInTheDocument()
      expect(screen.getByText("12")).toBeInTheDocument() // overallAvgYearsLost
      expect(screen.getByText("Avg Years Lost")).toBeInTheDocument()
      expect(screen.getByText("3")).toBeInTheDocument() // categories.length
      expect(screen.getByText("Categories")).toBeInTheDocument()
    })
  })

  it("renders category cards", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
      expect(screen.getByText("Heart Disease")).toBeInTheDocument()
      expect(screen.getByText("Accidents")).toBeInTheDocument()
    })
  })

  it("renders category counts correctly", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("500 deaths")).toBeInTheDocument()
      expect(screen.getByText("400 deaths")).toBeInTheDocument()
      expect(screen.getByText("100 deaths")).toBeInTheDocument()
    })
  })

  it("renders category average ages", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Avg age: 68")).toBeInTheDocument()
      expect(screen.getByText("Avg age: 72")).toBeInTheDocument()
      expect(screen.getByText("Avg age: 45")).toBeInTheDocument()
    })
  })

  it("renders top causes when available", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("Lung cancer (150)")).toBeInTheDocument()
      expect(screen.getByText("Breast cancer (80)")).toBeInTheDocument()
      expect(screen.getByText("Heart attack (200)")).toBeInTheDocument()
    })
  })

  it("category cards link to category pages", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      const cancerCard = screen.getByTestId("category-card-cancer")
      expect(cancerCard).toHaveAttribute("href", "/causes-of-death/cancer")

      const heartCard = screen.getByTestId("category-card-heart-disease")
      expect(heartCard).toHaveAttribute("href", "/causes-of-death/heart-disease")
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("renders error state when data is null", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(null as never)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("Failed to load data")
  })

  it("handles singular death count", async () => {
    const singleDeathCategory = {
      ...mockCategoryIndex,
      categories: [
        {
          slug: "other",
          label: "Other",
          count: 1,
          percentage: 0.1,
          avgAge: 50,
          avgYearsLost: 30,
          topCauses: [],
        },
      ],
    }
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(singleDeathCategory)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByText("1 death")).toBeInTheDocument()
    })
  })

  it("handles null avgAge gracefully", async () => {
    const noAvgAgeData = {
      ...mockCategoryIndex,
      overallAvgAge: null,
      overallAvgYearsLost: null,
    }
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(noAvgAgeData)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      // Should show dashes for null values
      expect(screen.getAllByText("-")).toHaveLength(2)
    })
  })

  it("has correct page test ID", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("causes-of-death-page")).toBeInTheDocument()
    })
  })

  it("has category grid test ID", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      expect(screen.getByTestId("category-grid")).toBeInTheDocument()
    })
  })

  it("renders category-specific icons for each category", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    renderWithProviders(<CausesOfDeathPage />)

    await waitFor(() => {
      // Each category card should have an SVG icon
      const cancerCard = screen.getByTestId("category-card-cancer")
      const heartCard = screen.getByTestId("category-card-heart-disease")

      expect(cancerCard.querySelector("svg")).toBeInTheDocument()
      expect(heartCard.querySelector("svg")).toBeInTheDocument()
    })
  })
})
