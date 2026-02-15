import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import CastToggle from "./CastToggle"

describe("CastToggle", () => {
  const defaultProps = {
    showLiving: false,
    onToggle: vi.fn(),
    deceasedCount: 5,
    livingCount: 10,
    viewMode: "list" as const,
    onViewModeChange: vi.fn(),
  }

  it("renders both toggle buttons", () => {
    render(<CastToggle {...defaultProps} />)

    expect(screen.getByTestId("deceased-toggle-btn")).toBeInTheDocument()
    expect(screen.getByTestId("living-toggle-btn")).toBeInTheDocument()
  })

  it("displays correct counts in buttons", () => {
    render(<CastToggle {...defaultProps} />)

    expect(screen.getByTestId("deceased-toggle-btn")).toHaveTextContent("Deceased (5)")
    expect(screen.getByTestId("living-toggle-btn")).toHaveTextContent("Living (10)")
  })

  it("calls onToggle with false when deceased button is clicked", () => {
    const onToggle = vi.fn()
    render(<CastToggle {...defaultProps} onToggle={onToggle} showLiving={true} />)

    fireEvent.click(screen.getByTestId("deceased-toggle-btn"))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it("calls onToggle with true when living button is clicked", () => {
    const onToggle = vi.fn()
    render(<CastToggle {...defaultProps} onToggle={onToggle} />)

    fireEvent.click(screen.getByTestId("living-toggle-btn"))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it("shows deceased button as active when showLiving is false", () => {
    render(<CastToggle {...defaultProps} showLiving={false} />)

    expect(screen.getByTestId("deceased-toggle-btn")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("living-toggle-btn")).toHaveAttribute("aria-pressed", "false")
  })

  it("shows living button as active when showLiving is true", () => {
    render(<CastToggle {...defaultProps} showLiving={true} />)

    expect(screen.getByTestId("deceased-toggle-btn")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("living-toggle-btn")).toHaveAttribute("aria-pressed", "true")
  })

  describe("disabled states", () => {
    it("disables deceased button when deceasedCount is 0", () => {
      render(<CastToggle {...defaultProps} deceasedCount={0} />)

      const deceasedBtn = screen.getByTestId("deceased-toggle-btn")
      expect(deceasedBtn).toBeDisabled()
      expect(deceasedBtn).toHaveClass("cursor-not-allowed")
    })

    it("disables living button when livingCount is 0", () => {
      render(<CastToggle {...defaultProps} livingCount={0} />)

      const livingBtn = screen.getByTestId("living-toggle-btn")
      expect(livingBtn).toBeDisabled()
      expect(livingBtn).toHaveClass("cursor-not-allowed")
    })

    it("does not call onToggle when clicking disabled deceased button", () => {
      const onToggle = vi.fn()
      render(
        <CastToggle {...defaultProps} onToggle={onToggle} deceasedCount={0} showLiving={true} />
      )

      fireEvent.click(screen.getByTestId("deceased-toggle-btn"))
      expect(onToggle).not.toHaveBeenCalled()
    })

    it("does not call onToggle when clicking disabled living button", () => {
      const onToggle = vi.fn()
      render(<CastToggle {...defaultProps} onToggle={onToggle} livingCount={0} />)

      fireEvent.click(screen.getByTestId("living-toggle-btn"))
      expect(onToggle).not.toHaveBeenCalled()
    })

    it("applies grey styling to disabled buttons", () => {
      render(<CastToggle {...defaultProps} deceasedCount={0} livingCount={0} />)

      expect(screen.getByTestId("deceased-toggle-btn")).toHaveClass("bg-disabled")
      expect(screen.getByTestId("living-toggle-btn")).toHaveClass("bg-disabled")
    })
  })

  describe("view mode toggle", () => {
    it("shows list/timeline toggle when viewing deceased", () => {
      render(<CastToggle {...defaultProps} showLiving={false} />)

      expect(screen.getByTestId("list-view-btn")).toBeInTheDocument()
      expect(screen.getByTestId("timeline-view-btn")).toBeInTheDocument()
    })

    it("hides list/timeline toggle when viewing living", () => {
      render(<CastToggle {...defaultProps} showLiving={true} />)

      expect(screen.queryByTestId("list-view-btn")).not.toBeInTheDocument()
      expect(screen.queryByTestId("timeline-view-btn")).not.toBeInTheDocument()
    })

    it("hides list/timeline toggle when deceasedCount is 0", () => {
      render(<CastToggle {...defaultProps} showLiving={false} deceasedCount={0} />)

      expect(screen.queryByTestId("list-view-btn")).not.toBeInTheDocument()
      expect(screen.queryByTestId("timeline-view-btn")).not.toBeInTheDocument()
    })

    it("shows list button as active when viewMode is list", () => {
      render(<CastToggle {...defaultProps} viewMode="list" />)

      expect(screen.getByTestId("list-view-btn")).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByTestId("timeline-view-btn")).toHaveAttribute("aria-pressed", "false")
    })

    it("shows timeline button as active when viewMode is timeline", () => {
      render(<CastToggle {...defaultProps} viewMode="timeline" />)

      expect(screen.getByTestId("list-view-btn")).toHaveAttribute("aria-pressed", "false")
      expect(screen.getByTestId("timeline-view-btn")).toHaveAttribute("aria-pressed", "true")
    })

    it("calls onViewModeChange with 'list' when list button is clicked", () => {
      const onViewModeChange = vi.fn()
      render(
        <CastToggle {...defaultProps} viewMode="timeline" onViewModeChange={onViewModeChange} />
      )

      fireEvent.click(screen.getByTestId("list-view-btn"))
      expect(onViewModeChange).toHaveBeenCalledWith("list")
    })

    it("calls onViewModeChange with 'timeline' when timeline button is clicked", () => {
      const onViewModeChange = vi.fn()
      render(<CastToggle {...defaultProps} viewMode="list" onViewModeChange={onViewModeChange} />)

      fireEvent.click(screen.getByTestId("timeline-view-btn"))
      expect(onViewModeChange).toHaveBeenCalledWith("timeline")
    })

    it("has accessible titles on view mode buttons", () => {
      render(<CastToggle {...defaultProps} />)

      expect(screen.getByTestId("list-view-btn")).toHaveAttribute("title", "List view")
      expect(screen.getByTestId("timeline-view-btn")).toHaveAttribute("title", "Timeline view")
    })
  })
})
