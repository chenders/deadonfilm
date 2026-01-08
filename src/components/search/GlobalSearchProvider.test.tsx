import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GlobalSearchProvider, useGlobalSearch } from "./GlobalSearchProvider"

// Mock SearchModal to avoid complex setup
vi.mock("./SearchModal", () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="mock-search-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

function TestConsumer() {
  const { isOpen, openSearch, closeSearch } = useGlobalSearch()
  return (
    <div>
      <span data-testid="is-open">{isOpen ? "open" : "closed"}</span>
      <button data-testid="open-search" onClick={openSearch}>
        Open Search
      </button>
      <button data-testid="close-search" onClick={closeSearch}>
        Close Search
      </button>
    </div>
  )
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe("GlobalSearchProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("provides context with initial closed state", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    expect(screen.getByTestId("is-open")).toHaveTextContent("closed")
    expect(screen.queryByTestId("mock-search-modal")).not.toBeInTheDocument()
  })

  it("opens modal when openSearch is called", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    fireEvent.click(screen.getByTestId("open-search"))

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
    expect(screen.getByTestId("mock-search-modal")).toBeInTheDocument()
  })

  it("closes modal when closeSearch is called", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    // Open first
    fireEvent.click(screen.getByTestId("open-search"))
    expect(screen.getByTestId("is-open")).toHaveTextContent("open")

    // Close
    fireEvent.click(screen.getByTestId("close-search"))
    expect(screen.getByTestId("is-open")).toHaveTextContent("closed")
  })

  it("opens modal on Cmd+K", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    fireEvent.keyDown(document, { key: "k", metaKey: true })

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
  })

  it("opens modal on Ctrl+K", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    fireEvent.keyDown(document, { key: "k", ctrlKey: true })

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
  })

  it("toggles modal on repeated Cmd+K", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    // First press opens
    fireEvent.keyDown(document, { key: "k", metaKey: true })
    expect(screen.getByTestId("is-open")).toHaveTextContent("open")

    // Second press closes
    fireEvent.keyDown(document, { key: "k", metaKey: true })
    expect(screen.getByTestId("is-open")).toHaveTextContent("closed")
  })

  it("opens modal on / key when not in input", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
      </GlobalSearchProvider>
    )

    fireEvent.keyDown(document, { key: "/" })

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
  })

  it("does not open modal on / key when in input", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
        <input data-testid="test-input" />
      </GlobalSearchProvider>
    )

    const input = screen.getByTestId("test-input")
    fireEvent.keyDown(input, { key: "/" })

    expect(screen.getByTestId("is-open")).toHaveTextContent("closed")
  })

  it("does not open modal on / key when in textarea", () => {
    renderWithProviders(
      <GlobalSearchProvider>
        <TestConsumer />
        <textarea data-testid="test-textarea" />
      </GlobalSearchProvider>
    )

    const textarea = screen.getByTestId("test-textarea")
    fireEvent.keyDown(textarea, { key: "/" })

    expect(screen.getByTestId("is-open")).toHaveTextContent("closed")
  })

  it("throws error when useGlobalSearch is used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      renderWithProviders(<TestConsumer />)
    }).toThrow("useGlobalSearch must be used within GlobalSearchProvider")

    consoleSpy.mockRestore()
  })
})
