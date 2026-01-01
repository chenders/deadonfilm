import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import ThisWeekDeaths from "./ThisWeekDeaths"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getThisWeekDeaths: vi.fn(),
  getProfileUrl: (path: string | null, _size?: string) =>
    path ? `https://image.tmdb.org/t/p/w185${path}` : null,
}))

const mockDeaths = {
  deaths: [
    {
      id: 12345,
      name: "James Dean",
      deathday: "1955-09-30",
      profilePath: "/profile.jpg",
      causeOfDeath: "Car accident",
      ageAtDeath: 24,
      yearOfDeath: 1955,
    },
    {
      id: 67890,
      name: "John Lennon",
      deathday: "1980-12-08",
      profilePath: null,
      causeOfDeath: "Murder",
      ageAtDeath: 40,
      yearOfDeath: 1980,
    },
  ],
  weekRange: {
    start: "Dec 15",
    end: "Dec 21",
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

describe("ThisWeekDeaths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton initially", () => {
    vi.mocked(api.getThisWeekDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<ThisWeekDeaths />)

    expect(screen.getByTestId("this-week-deaths")).toBeInTheDocument()
    expect(
      screen.getByTestId("this-week-deaths").querySelector(".animate-pulse")
    ).toBeInTheDocument()
  })

  it("renders deaths when data loads", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("this-week-title")).toBeInTheDocument()
    })

    // Check the title contains the week range
    const title = screen.getByTestId("this-week-title")
    expect(title.textContent).toMatch(/This Week in History/)
    expect(title.textContent).toMatch(/Dec 15/)
    expect(title.textContent).toMatch(/Dec 21/)
  })

  it("displays death information", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByText("James Dean")).toBeInTheDocument()
    })

    expect(screen.getByText("John Lennon")).toBeInTheDocument()
    expect(screen.getByText("1955")).toBeInTheDocument()
    expect(screen.getByText("1980")).toBeInTheDocument()
  })

  it("links to actor pages", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("this-week-list")).toBeInTheDocument()
    })

    const links = screen.getByTestId("this-week-list").querySelectorAll("a")
    expect(links[0]).toHaveAttribute("href", "/actor/james-dean-12345")
    expect(links[1]).toHaveAttribute("href", "/actor/john-lennon-67890")
  })

  it("displays profile images when available", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("this-week-list")).toBeInTheDocument()
    })

    const img = screen.getByAltText("James Dean")
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/profile.jpg")
  })

  it("shows placeholder when no profile image", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(mockDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("this-week-list")).toBeInTheDocument()
    })

    // John Lennon has no profile image
    expect(screen.queryByAltText("John Lennon")).not.toBeInTheDocument()
  })

  it("renders nothing when no deaths available", async () => {
    vi.mocked(api.getThisWeekDeaths).mockResolvedValue({
      deaths: [],
      weekRange: { start: "Dec 15", end: "Dec 21" },
    })

    renderWithProviders(<ThisWeekDeaths />)

    // Wait for the loading skeleton to disappear (component returns null when no deaths)
    await waitForElementToBeRemoved(() => screen.queryByTestId("this-week-deaths"))

    expect(screen.queryByTestId("this-week-deaths")).not.toBeInTheDocument()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getThisWeekDeaths).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<ThisWeekDeaths />)

    // Wait for the component to finish loading and render nothing on error
    await waitFor(
      () => {
        expect(screen.queryByTestId("this-week-deaths")).not.toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })

  it("limits display to 8 deaths", async () => {
    const manyDeaths = {
      deaths: Array(15)
        .fill(null)
        .map((_, i) => ({
          id: i,
          name: `Actor ${i}`,
          deathday: "2000-12-15",
          profilePath: null,
          causeOfDeath: null,
          ageAtDeath: 50,
          yearOfDeath: 2000,
        })),
      weekRange: { start: "Dec 15", end: "Dec 21" },
    }

    vi.mocked(api.getThisWeekDeaths).mockResolvedValue(manyDeaths)

    renderWithProviders(<ThisWeekDeaths />)

    await waitFor(() => {
      expect(screen.getByTestId("this-week-list")).toBeInTheDocument()
    })

    const links = screen.getByTestId("this-week-list").querySelectorAll("a")
    expect(links).toHaveLength(8)
  })
})
