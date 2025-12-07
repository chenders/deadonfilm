import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import CastToggle from "./CastToggle"

describe("CastToggle", () => {
  const defaultProps = {
    showLiving: false,
    onToggle: vi.fn(),
    deceasedCount: 5,
    livingCount: 10,
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

      expect(screen.getByTestId("deceased-toggle-btn")).toHaveClass("bg-gray-100")
      expect(screen.getByTestId("living-toggle-btn")).toHaveClass("bg-gray-100")
    })
  })
})
