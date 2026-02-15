import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import NormalizationsTab from "./NormalizationsTab"

const mockMutate = vi.fn()

vi.mock("../../../hooks/admin/useCauseMappings", () => ({
  useNormalizations: vi.fn(),
  useUpdateNormalization: () => ({ mutate: mockMutate, isPending: false }),
}))

import { useNormalizations } from "../../../hooks/admin/useCauseMappings"

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>
        <NormalizationsTab />
      </AdminTestWrapper>
    </QueryClientProvider>
  )
}

describe("NormalizationsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()
    expect(screen.getByText("Failed to load normalizations")).toBeInTheDocument()
  })

  it("renders normalizations table with data", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: {
        normalizations: [
          { originalCause: "lung cancer", normalizedCause: "Lung cancer", actorCount: 45 },
          { originalCause: "Lung Cancer", normalizedCause: "Lung cancer", actorCount: 12 },
        ],
        total: 2,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()
    expect(screen.getByText("lung cancer")).toBeInTheDocument()
    expect(screen.getByText("2 normalizations")).toBeInTheDocument()
  })

  it("renders empty state", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: { normalizations: [], total: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()
    expect(screen.getByText("No normalizations found")).toBeInTheDocument()
  })

  it("enters edit mode on click and saves on Enter", async () => {
    mockMutate.mockImplementation((_params: unknown, options: { onSuccess: () => void }) => {
      options.onSuccess()
    })

    vi.mocked(useNormalizations).mockReturnValue({
      data: {
        normalizations: [
          { originalCause: "lung cancer", normalizedCause: "Lung cancer", actorCount: 45 },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()

    // Click the normalized cause to enter edit mode
    fireEvent.click(screen.getByText("Lung cancer"))

    // Edit field should appear
    const input = screen.getByTestId("normalization-edit-lung cancer")
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue("Lung cancer")

    // Change value and press Enter
    fireEvent.change(input, { target: { value: "Lung Cancer" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { originalCause: "lung cancer", normalizedCause: "Lung Cancer" },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    })
  })

  it("cancels edit on Escape", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: {
        normalizations: [
          { originalCause: "lung cancer", normalizedCause: "Lung cancer", actorCount: 45 },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()

    fireEvent.click(screen.getByText("Lung cancer"))
    expect(screen.getByTestId("normalization-edit-lung cancer")).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId("normalization-edit-lung cancer"), { key: "Escape" })
    expect(screen.queryByTestId("normalization-edit-lung cancer")).not.toBeInTheDocument()
  })

  it("renders search input", () => {
    vi.mocked(useNormalizations).mockReturnValue({
      data: { normalizations: [], total: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useNormalizations>)

    renderTab()
    expect(screen.getByTestId("normalization-search")).toBeInTheDocument()
  })
})
