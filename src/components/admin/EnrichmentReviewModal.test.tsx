/**
 * Tests for EnrichmentReviewModal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import EnrichmentReviewModal from "./EnrichmentReviewModal"
import * as enrichmentReviewHooks from "../../hooks/admin/useEnrichmentReview"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentReview")

describe("EnrichmentReviewModal", () => {
  const mockDetail = {
    enrichment_run_actor_id: 1,
    run_id: 1,
    actor_id: 100,
    actor_name: "John Doe",
    actor_tmdb_id: 1000,
    winning_source: "claude",
    cost_usd: "0.02",
    overall_confidence: 0.85,
    staging: {
      deathday: "2020-01-15",
      cause_of_death: "Natural causes",
      cause_of_death_details: "Heart attack",
      age_at_death: 75,
      years_lost: 5,
      violent_death: false,
      has_detailed_death_info: true,
      circumstances: "Died peacefully at home",
      location_of_death: "Los Angeles, CA",
    },
    production: {
      deathday: null,
      cause_of_death: null,
      cause_of_death_details: null,
      age_at_death: null,
      years_lost: null,
      violent_death: null,
      has_detailed_death_info: null,
      circumstances: null,
      location_of_death: null,
    },
    confidence_breakdown: {
      cause_confidence: 0.9,
      details_confidence: 0.85,
      deathday_confidence: 0.95,
      birthday_confidence: 0.8,
      circumstances_confidence: 0.75,
    },
    raw_response: '{"cause": "Natural causes"}',
  }

  const mockProps = {
    enrichmentRunActorId: 1,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(enrichmentReviewHooks.useEnrichmentReviewDetail).mockReturnValue({
      data: mockDetail,
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(enrichmentReviewHooks.useApproveEnrichment).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any)

    vi.mocked(enrichmentReviewHooks.useRejectEnrichment).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any)

    vi.mocked(enrichmentReviewHooks.useEditEnrichment).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
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
        <MemoryRouter>
          <EnrichmentReviewModal {...props} />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(enrichmentReviewHooks.useEnrichmentReviewDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderModal()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(enrichmentReviewHooks.useEnrichmentReviewDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderModal()

    expect(screen.getByText(/Failed to load enrichment details/i)).toBeInTheDocument()
  })

  it("renders enrichment detail", () => {
    renderModal()

    expect(screen.getByText(/Review Enrichment: John Doe/i)).toBeInTheDocument()
    expect(screen.getByText("Natural causes")).toBeInTheDocument()
    expect(screen.getByText("Heart attack")).toBeInTheDocument()
    expect(screen.getByText("claude")).toBeInTheDocument()
  })

  it("displays side-by-side comparison", () => {
    renderModal()

    expect(screen.getByText("New Data (Staging)")).toBeInTheDocument()
    expect(screen.getByText("Current Data (Production)")).toBeInTheDocument()
  })

  it("displays confidence breakdown", () => {
    renderModal()

    expect(screen.getByText("Confidence Breakdown")).toBeInTheDocument()
    expect(screen.getByText("0.90")).toBeInTheDocument() // cause_confidence
    const confidenceValues = screen.getAllByText("0.85")
    expect(confidenceValues.length).toBeGreaterThan(0) // details_confidence and overall
  })

  it("enters edit mode when edit button clicked", () => {
    renderModal()

    const editButton = screen.getByText("Edit")
    fireEvent.click(editButton)

    expect(screen.getByText("Save Edits")).toBeInTheDocument()
  })

  it("calls approve mutation when approve button clicked", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ success: true })
    vi.mocked(enrichmentReviewHooks.useApproveEnrichment).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)

    renderModal()

    const approveButton = screen.getByText("Approve")
    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(1)
      expect(mockProps.onSuccess).toHaveBeenCalled()
    })
  })

  it("shows reject dialog when reject button clicked", () => {
    renderModal()

    const rejectButton = screen.getByText("Reject")
    fireEvent.click(rejectButton)

    expect(screen.getByText("Reject Enrichment")).toBeInTheDocument()
    expect(screen.getByLabelText("Reason for rejection")).toBeInTheDocument()
  })

  it("calls reject mutation when reject confirmed", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ success: true })
    vi.mocked(enrichmentReviewHooks.useRejectEnrichment).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)

    renderModal()

    const rejectButton = screen.getByText("Reject")
    fireEvent.click(rejectButton)

    const reasonSelect = screen.getByLabelText("Reason for rejection")
    fireEvent.change(reasonSelect, { target: { value: "incorrect_data" } })

    const confirmButton = screen.getByText("Confirm Reject")
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 1,
        data: { reason: "incorrect_data" },
      })
      expect(mockProps.onSuccess).toHaveBeenCalled()
    })
  })

  it("saves edits when save button clicked", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ success: true })
    vi.mocked(enrichmentReviewHooks.useEditEnrichment).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)

    renderModal()

    const editButton = screen.getByText("Edit")
    fireEvent.click(editButton)

    const saveButton = screen.getByText("Save Edits")
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled()
    })
  })

  it("closes modal when close button clicked", () => {
    renderModal()

    const closeButtons = screen.getAllByLabelText("Close modal")
    fireEvent.click(closeButtons[0])

    expect(mockProps.onClose).toHaveBeenCalled()
  })

  it("closes modal when cancel button clicked", () => {
    renderModal()

    const cancelButton = screen.getByText("Cancel")
    fireEvent.click(cancelButton)

    expect(mockProps.onClose).toHaveBeenCalled()
  })

  it("disables approve button in edit mode", () => {
    renderModal()

    const editButton = screen.getByText("Edit")
    fireEvent.click(editButton)

    const approveButton = screen.getByText("Approve")
    expect(approveButton).toBeDisabled()
  })

  it("displays death circumstances when present", () => {
    renderModal()

    expect(screen.getByText("Death Circumstances")).toBeInTheDocument()
  })

  it("displays raw response when present", () => {
    renderModal()

    expect(screen.getByText("Raw Response")).toBeInTheDocument()
  })
})
