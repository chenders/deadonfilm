import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import TriviaFacts from "./TriviaFacts"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getTrivia: vi.fn(),
}))

const mockFacts = {
  facts: [
    {
      type: "oldest",
      title: "Oldest at Death",
      value: "Kirk Douglas lived to 103 years old",
      link: "/actor/kirk-douglas-12345",
    },
    {
      type: "years_lost",
      title: "Total Years Lost",
      value: "50,000 years of life lost to early deaths",
    },
    {
      type: "highest_mortality",
      title: "Highest Mortality Rate",
      value: "The Conqueror (1956): 92% of cast deceased",
      link: "/movie/the-conqueror-1956-54321",
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

describe("TriviaFacts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton initially", () => {
    vi.mocked(api.getTrivia).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<TriviaFacts />)

    expect(screen.getByTestId("trivia-facts")).toBeInTheDocument()
    expect(screen.getByTestId("trivia-facts").querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders trivia when data loads", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue(mockFacts)

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-title")).toBeInTheDocument()
    })

    expect(screen.getByText("Did You Know?")).toBeInTheDocument()
  })

  it("displays fact title and value", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue({ facts: [mockFacts.facts[0]] })

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByText("Oldest at Death")).toBeInTheDocument()
    })

    expect(screen.getByText("Kirk Douglas lived to 103 years old")).toBeInTheDocument()
  })

  it("creates link when fact has link property", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue({ facts: [mockFacts.facts[0]] })

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-link")).toBeInTheDocument()
    })

    const link = screen.getByTestId("trivia-link")
    expect(link).toHaveAttribute("href", "/actor/kirk-douglas-12345")
  })

  it("shows navigation buttons with multiple facts", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue(mockFacts)

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-prev")).toBeInTheDocument()
    })

    expect(screen.getByTestId("trivia-next")).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it("navigates to next fact when clicking next button", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue(mockFacts)

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-next")).toBeInTheDocument()
    })

    const nextButton = screen.getByTestId("trivia-next")
    const contentBefore = screen.getByTestId("trivia-content").textContent

    fireEvent.click(nextButton)

    const contentAfter = screen.getByTestId("trivia-content").textContent
    expect(contentAfter).not.toBe(contentBefore)
  })

  it("navigates to previous fact when clicking prev button", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue(mockFacts)

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-prev")).toBeInTheDocument()
    })

    // First go to next to establish a position
    fireEvent.click(screen.getByTestId("trivia-next"))
    const contentBefore = screen.getByTestId("trivia-content").textContent

    fireEvent.click(screen.getByTestId("trivia-prev"))
    const contentAfter = screen.getByTestId("trivia-content").textContent

    expect(contentAfter).not.toBe(contentBefore)
  })

  it("hides navigation buttons with single fact", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue({ facts: [mockFacts.facts[0]] })

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByTestId("trivia-title")).toBeInTheDocument()
    })

    expect(screen.queryByTestId("trivia-prev")).not.toBeInTheDocument()
    expect(screen.queryByTestId("trivia-next")).not.toBeInTheDocument()
  })

  it("renders nothing when no facts available", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue({ facts: [] })

    const { container } = renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(api.getTrivia).toHaveBeenCalled()
    })

    // Wait a bit for the component to update
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='trivia-content']")).toBeNull()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getTrivia).mockRejectedValue(new Error("API Error"))

    const { container } = renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(api.getTrivia).toHaveBeenCalled()
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(container.querySelector("[data-testid='trivia-content']")).toBeNull()
  })

  it("displays fact without link as plain text", async () => {
    vi.mocked(api.getTrivia).mockResolvedValue({ facts: [mockFacts.facts[1]] })

    renderWithProviders(<TriviaFacts />)

    await waitFor(() => {
      expect(screen.getByText("50,000 years of life lost to early deaths")).toBeInTheDocument()
    })

    expect(screen.queryByTestId("trivia-link")).not.toBeInTheDocument()
  })
})
