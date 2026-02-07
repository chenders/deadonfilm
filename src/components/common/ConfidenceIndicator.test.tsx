import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import ConfidenceIndicator from "./ConfidenceIndicator"

describe("ConfidenceIndicator", () => {
  describe("dots variant (default)", () => {
    it("renders nothing when level is null", () => {
      const { container } = render(<ConfidenceIndicator level={null} />)
      expect(container.firstChild).toBeNull()
    })

    it("renders high confidence with 4 active dots", () => {
      render(<ConfidenceIndicator level="high" />)
      const indicator = screen.getByTestId("confidence-indicator")
      expect(indicator).toHaveAttribute("title", "High confidence")
      expect(screen.getByText("High confidence")).toBeInTheDocument()
      const dots = indicator.querySelectorAll("div.rounded-full")
      const activeDots = Array.from(dots).filter((d) => d.classList.contains("bg-confidence-high"))
      expect(activeDots).toHaveLength(4)
    })

    it("renders medium confidence with 3 active dots", () => {
      render(<ConfidenceIndicator level="medium" />)
      const indicator = screen.getByTestId("confidence-indicator")
      expect(screen.getByText("Medium confidence")).toBeInTheDocument()
      const dots = indicator.querySelectorAll("div.rounded-full")
      const activeDots = Array.from(dots).filter((d) =>
        d.classList.contains("bg-confidence-medium")
      )
      expect(activeDots).toHaveLength(3)
    })

    it("renders low confidence with 2 active dots", () => {
      render(<ConfidenceIndicator level="low" />)
      const indicator = screen.getByTestId("confidence-indicator")
      expect(screen.getByText("Low confidence")).toBeInTheDocument()
      const dots = indicator.querySelectorAll("div.rounded-full")
      const activeDots = Array.from(dots).filter((d) => d.classList.contains("bg-confidence-low"))
      expect(activeDots).toHaveLength(2)
    })

    it("renders disputed with 1 active dot", () => {
      render(<ConfidenceIndicator level="disputed" />)
      const indicator = screen.getByTestId("confidence-indicator")
      expect(screen.getByText("Disputed")).toBeInTheDocument()
      const dots = indicator.querySelectorAll("div.rounded-full")
      const activeDots = Array.from(dots).filter((d) =>
        d.classList.contains("bg-confidence-disputed")
      )
      expect(activeDots).toHaveLength(1)
    })

    it("renders inactive dots for remaining positions", () => {
      render(<ConfidenceIndicator level="low" />)
      const dots = screen.getByTestId("confidence-indicator").querySelectorAll("div.rounded-full")
      const inactiveDots = Array.from(dots).filter((d) =>
        d.classList.contains("bg-confidence-inactive")
      )
      expect(inactiveDots).toHaveLength(2)
    })

    it("falls back to medium for unknown levels", () => {
      render(<ConfidenceIndicator level="unknown" />)
      expect(screen.getByTestId("confidence-indicator")).toBeInTheDocument()
      expect(screen.getByText("Medium confidence")).toBeInTheDocument()
    })
  })

  describe("badge variant", () => {
    it("renders nothing when level is null", () => {
      const { container } = render(<ConfidenceIndicator level={null} variant="badge" />)
      expect(container.firstChild).toBeNull()
    })

    it("renders high confidence badge", () => {
      render(<ConfidenceIndicator level="high" variant="badge" />)
      const badge = screen.getByText("High")
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveAttribute("title", "High confidence")
      expect(badge.classList.contains("bg-confidence-high")).toBe(true)
    })

    it("renders medium confidence badge", () => {
      render(<ConfidenceIndicator level="medium" variant="badge" />)
      const badge = screen.getByText("Medium")
      expect(badge).toBeInTheDocument()
      expect(badge.classList.contains("bg-confidence-medium")).toBe(true)
    })

    it("renders low confidence badge", () => {
      render(<ConfidenceIndicator level="low" variant="badge" />)
      const badge = screen.getByText("Low")
      expect(badge).toBeInTheDocument()
      expect(badge.classList.contains("bg-confidence-low")).toBe(true)
    })

    it("renders disputed badge", () => {
      render(<ConfidenceIndicator level="disputed" variant="badge" />)
      const badge = screen.getByText("Disputed")
      expect(badge).toBeInTheDocument()
      expect(badge.classList.contains("bg-confidence-disputed")).toBe(true)
    })

    it("falls back to medium for unknown levels", () => {
      render(<ConfidenceIndicator level="unknown" variant="badge" />)
      const badge = screen.getByText("Medium")
      expect(badge).toBeInTheDocument()
      expect(badge.classList.contains("bg-confidence-medium")).toBe(true)
    })
  })
})
