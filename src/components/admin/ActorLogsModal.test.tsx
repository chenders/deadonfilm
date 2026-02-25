/**
 * Tests for ActorLogsModal component.
 * Covers: happy path, empty state, loading state, error state,
 * collapsible Claude request/response sections, level badge rendering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ActorLogsModal } from "./ActorLogsModal"
import type { ActorLogEntry } from "../../hooks/admin/useEnrichmentRuns"

const mockOnClose = vi.fn()

const baseLogs: ActorLogEntry[] = [
  {
    timestamp: "2026-02-24T12:00:05.000Z",
    level: "info",
    message: "Starting enrichment",
    data: { source: "wikipedia" },
  },
  {
    timestamp: "2026-02-24T12:00:10.000Z",
    level: "warn",
    message: "Rate limited by source",
  },
  {
    timestamp: "2026-02-24T12:00:15.000Z",
    level: "error",
    message: "Source lookup failed",
    data: { error: "timeout" },
  },
  {
    timestamp: "2026-02-24T12:00:20.000Z",
    level: "debug",
    message: "Cache check",
  },
]

const claudeLogs: ActorLogEntry[] = [
  {
    timestamp: "2026-02-24T12:01:00.000Z",
    level: "info",
    message: "[CLAUDE_REQUEST]",
    data: { promptLength: 1500, prompt: "You are a biography writer..." },
  },
  {
    timestamp: "2026-02-24T12:01:05.000Z",
    level: "info",
    message: "[CLAUDE_RESPONSE]",
    data: {
      inputTokens: 500,
      outputTokens: 200,
      costUsd: 0.0045,
      response: '{"narrative":"Actor was born..."}',
    },
  },
]

function renderModal(overrides: Partial<Parameters<typeof ActorLogsModal>[0]> = {}) {
  const defaultProps = {
    title: "Enrichment Logs — John Wayne",
    subtitle: "Bio enrichment run #42",
    logEntries: baseLogs,
    isLoading: false,
    error: null,
    onClose: mockOnClose,
  }

  return render(
    <MemoryRouter>
      <ActorLogsModal {...defaultProps} {...overrides} />
    </MemoryRouter>
  )
}

describe("ActorLogsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders header with title and subtitle", () => {
    renderModal()

    expect(screen.getByText("Enrichment Logs — John Wayne")).toBeInTheDocument()
    expect(screen.getByText("Bio enrichment run #42")).toBeInTheDocument()
  })

  it("renders log entries with timestamps and messages", () => {
    renderModal()

    expect(screen.getByText("Starting enrichment")).toBeInTheDocument()
    expect(screen.getByText("Rate limited by source")).toBeInTheDocument()
    expect(screen.getByText("Source lookup failed")).toBeInTheDocument()
    expect(screen.getByText("Cache check")).toBeInTheDocument()
  })

  it("renders level badges for all log levels", () => {
    renderModal()

    const levels = screen.getAllByText(/^(info|warn|error|debug)$/)
    expect(levels).toHaveLength(4)

    // Verify all four levels are represented
    const levelTexts = levels.map((el) => el.textContent)
    expect(levelTexts).toContain("info")
    expect(levelTexts).toContain("warn")
    expect(levelTexts).toContain("error")
    expect(levelTexts).toContain("debug")
  })

  it("shows JSON data for non-collapsible entries", () => {
    renderModal()

    // The "Starting enrichment" entry has data: {source: "wikipedia"}
    expect(screen.getByText(/"source": "wikipedia"/)).toBeInTheDocument()
  })

  it("renders empty state when no log entries", () => {
    renderModal({ logEntries: [] })

    expect(screen.getByText("No log entries recorded")).toBeInTheDocument()
  })

  it("renders loading state", () => {
    renderModal({ isLoading: true, logEntries: undefined })

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("renders error state", () => {
    renderModal({ error: new Error("Network error"), logEntries: undefined })

    expect(screen.getByText("Failed to load actor logs")).toBeInTheDocument()
  })

  it("calls onClose when close button is clicked", () => {
    renderModal()

    fireEvent.click(screen.getByLabelText("Close modal"))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  describe("collapsible Claude sections", () => {
    it("renders Claude request as collapsible with prompt length", () => {
      renderModal({ logEntries: claudeLogs })

      expect(screen.getByText(/Prompt \(1,500 chars\)/)).toBeInTheDocument()
    })

    it("renders Claude response as collapsible with token counts and cost", () => {
      renderModal({ logEntries: claudeLogs })

      expect(
        screen.getByText(/Response \(500 in \/ 200 out tokens, \$0\.0045\)/)
      ).toBeInTheDocument()
    })

    it("shows prompt text when Claude request details is expanded", () => {
      renderModal({ logEntries: claudeLogs })

      // Click the summary to expand
      const promptSummary = screen.getByText(/Prompt \(1,500 chars\)/)
      fireEvent.click(promptSummary)

      expect(screen.getByText("You are a biography writer...")).toBeInTheDocument()
    })

    it("shows response text when Claude response details is expanded", () => {
      renderModal({ logEntries: claudeLogs })

      const responseSummary = screen.getByText(/Response \(500 in \/ 200 out tokens/)
      fireEvent.click(responseSummary)

      expect(screen.getByText('{"narrative":"Actor was born..."}')).toBeInTheDocument()
    })
  })
})
