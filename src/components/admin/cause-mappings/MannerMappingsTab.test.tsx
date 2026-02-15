import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import MannerMappingsTab from "./MannerMappingsTab"

const mockMutate = vi.fn()

vi.mock("../../../hooks/admin/useCauseMappings", () => ({
  useMannerMappings: vi.fn(),
  useUpdateMannerMapping: () => ({ mutate: mockMutate }),
}))

import { useMannerMappings } from "../../../hooks/admin/useCauseMappings"

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>
        <MannerMappingsTab />
      </AdminTestWrapper>
    </QueryClientProvider>
  )
}

describe("MannerMappingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    expect(screen.getByText("Failed to load manner mappings")).toBeInTheDocument()
  })

  it("renders mappings table with data", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: {
        mappings: [
          {
            normalizedCause: "Gunshot wound",
            manner: "homicide",
            source: "manual",
            createdAt: "2026-01-01",
            actorCount: 42,
          },
          {
            normalizedCause: "Lung cancer",
            manner: "natural",
            source: "deterministic",
            createdAt: "2026-01-01",
            actorCount: 100,
          },
        ],
        totalMapped: 800,
        totalUnmapped: 2,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    expect(screen.getByText("Gunshot wound")).toBeInTheDocument()
    expect(screen.getByText("Lung cancer")).toBeInTheDocument()
    expect(screen.getByText("800 mapped")).toBeInTheDocument()
    expect(screen.getByText("2 unmapped")).toBeInTheDocument()
  })

  it("renders empty state when no mappings found", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: { mappings: [], totalMapped: 0, totalUnmapped: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    expect(screen.getByText("No mappings found")).toBeInTheDocument()
  })

  it("calls updateManner when manner dropdown is changed", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: {
        mappings: [
          {
            normalizedCause: "Gunshot wound",
            manner: "homicide",
            source: "manual",
            createdAt: "2026-01-01",
            actorCount: 42,
          },
        ],
        totalMapped: 1,
        totalUnmapped: 0,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    const select = screen.getByTestId("manner-select-Gunshot wound")
    fireEvent.change(select, { target: { value: "suicide" } })
    expect(mockMutate).toHaveBeenCalledWith({ cause: "Gunshot wound", manner: "suicide" })
  })

  it("renders search and filter inputs", () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: { mappings: [], totalMapped: 0, totalUnmapped: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()
    expect(screen.getByTestId("manner-search")).toBeInTheDocument()
    expect(screen.getByTestId("manner-filter")).toBeInTheDocument()
  })

  it("passes search and filter values to hook", async () => {
    vi.mocked(useMannerMappings).mockReturnValue({
      data: { mappings: [], totalMapped: 0, totalUnmapped: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMannerMappings>)

    renderTab()

    fireEvent.change(screen.getByTestId("manner-search"), { target: { value: "cancer" } })
    await waitFor(() => {
      expect(useMannerMappings).toHaveBeenCalledWith("cancer", undefined)
    })

    fireEvent.change(screen.getByTestId("manner-filter"), { target: { value: "natural" } })
    await waitFor(() => {
      expect(useMannerMappings).toHaveBeenCalledWith("cancer", "natural")
    })
  })
})
