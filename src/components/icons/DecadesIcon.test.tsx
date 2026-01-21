import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import DecadesIcon from "./DecadesIcon"

describe("DecadesIcon", () => {
  it("renders an SVG element", () => {
    const { container } = render(<DecadesIcon />)
    const svg = container.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })

  it("uses default size of 24 when not specified", () => {
    const { container } = render(<DecadesIcon />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("width", "24")
    expect(svg).toHaveAttribute("height", "24")
  })

  it("applies custom size when provided", () => {
    const { container } = render(<DecadesIcon size={32} />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("width", "32")
    expect(svg).toHaveAttribute("height", "32")
  })

  it("applies custom className when provided", () => {
    const { container } = render(<DecadesIcon className="custom-class" />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveClass("custom-class")
  })

  it("has correct viewBox for timeline", () => {
    const { container } = render(<DecadesIcon />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24")
  })

  it("renders horizontal timeline line", () => {
    const { container } = render(<DecadesIcon />)
    const lines = container.querySelectorAll("line")
    expect(lines.length).toBeGreaterThan(0)
    // First line should be the horizontal timeline
    expect(lines[0]).toHaveAttribute("x1", "3")
    expect(lines[0]).toHaveAttribute("y1", "12")
    expect(lines[0]).toHaveAttribute("x2", "21")
    expect(lines[0]).toHaveAttribute("y2", "12")
  })

  it("renders decade marker circles", () => {
    const { container } = render(<DecadesIcon />)
    const circles = container.querySelectorAll("circle")
    // Should have 4 decade markers
    expect(circles.length).toBe(4)
  })

  it("has aria-hidden attribute for accessibility", () => {
    const { container } = render(<DecadesIcon />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })
})
