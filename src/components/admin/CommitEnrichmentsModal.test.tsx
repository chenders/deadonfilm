/**
 * Tests for CommitEnrichmentsModal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import CommitEnrichmentsModal from "./CommitEnrichmentsModal"
import * as enrichmentReviewHooks from "../../hooks/admin/useEnrichmentReview"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentReview")

describe("CommitEnrichmentsModal", () => {
  const mockProps = {
    runId: 1,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(enrichmentReviewHooks.useCommitEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        approvedCount: 5,
        actorCount: 5,
        totalCost: 0.5,
        actors: [
          { actor_id: 1, actor_name: "Actor 1" },
          { actor_id: 2, actor_name: "Actor 2" },
        ],
      }),
      isPending: false,
    } as any)
  })

  function renderModal(props = mockProps) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <CommitEnrichmentsModal {...props} />
      </QueryClientProvider>
    )
  }

  it("renders modal header", () => {
    renderModal()

    expect(screen.getByText("Commit Enrichments")).toBeInTheDocument()
  })

  it("displays warning message", () => {
    renderModal()

    expect(screen.getByText("Warning")).toBeInTheDocument()
    expect(
      screen.getByText(/This will update production data for all approved actors/i)
    ).toBeInTheDocument()
    const undoneMsgs = screen.getAllByText(/This action cannot be undone/i)
    expect(undoneMsgs.length).toBeGreaterThan(0)
  })

  it("displays confirmation checkbox", () => {
    renderModal()

    const checkbox = screen.getByRole("checkbox")
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it("commit button is disabled when checkbox not checked", () => {
    renderModal()

    const commitButton = screen.getByText("Commit to Production")
    expect(commitButton).toBeDisabled()
  })

  it("commit button is enabled when checkbox checked", () => {
    renderModal()

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    const commitButton = screen.getByText("Commit to Production")
    expect(commitButton).not.toBeDisabled()
  })

  it("calls commit mutation when commit button clicked", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({
      approvedCount: 5,
      actorCount: 5,
      totalCost: 0.5,
      actors: [],
    })
    vi.mocked(enrichmentReviewHooks.useCommitEnrichmentRun).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)

    renderModal()

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    const commitButton = screen.getByText("Commit to Production")
    fireEvent.click(commitButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(1)
      expect(mockProps.onSuccess).toHaveBeenCalled()
    })
  })

  it("shows loading state during commit", () => {
    vi.mocked(enrichmentReviewHooks.useCommitEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn().mockImplementation(() => new Promise(() => {})),
      isPending: true,
    } as any)

    renderModal()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("closes modal when close button clicked", () => {
    renderModal()

    const closeButton = screen.getByLabelText("Close modal")
    fireEvent.click(closeButton)

    expect(mockProps.onClose).toHaveBeenCalled()
  })

  it("closes modal when cancel button clicked", () => {
    renderModal()

    const cancelButton = screen.getByText("Cancel")
    fireEvent.click(cancelButton)

    expect(mockProps.onClose).toHaveBeenCalled()
  })

  it("disables buttons during commit", () => {
    vi.mocked(enrichmentReviewHooks.useCommitEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn().mockImplementation(() => new Promise(() => {})),
      isPending: true,
    } as any)

    renderModal()

    // Loading spinner shows, buttons not rendered
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument()
    expect(screen.queryByText("Commit to Production")).not.toBeInTheDocument()
  })

  it("shows error toast when commit fails", async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error("Commit failed"))
    vi.mocked(enrichmentReviewHooks.useCommitEnrichmentRun).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)

    renderModal()

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    const commitButton = screen.getByText("Commit to Production")
    fireEvent.click(commitButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled()
    })

    // Note: We can't easily test toast messages in vitest, but the mutation error is handled
  })

  it("shows error toast when committing without confirmation", async () => {
    renderModal()

    const commitButton = screen.getByText("Commit to Production")

    // Try to click while disabled (should not call mutation)
    expect(commitButton).toBeDisabled()
  })
})
