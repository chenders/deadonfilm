import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import Sparkline from "./Sparkline"

describe("Sparkline", () => {
  it("renders SVG element", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    expect(screen.getByTestId("sparkline")).toBeInTheDocument()
  })

  it("renders with default dimensions", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toHaveAttribute("width", "80")
    expect(svg).toHaveAttribute("height", "24")
  })

  it("renders with custom dimensions", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} width={120} height={40} />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toHaveAttribute("width", "120")
    expect(svg).toHaveAttribute("height", "40")
  })

  it("renders path for data points", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path")
    expect(path).toBeInTheDocument()
    expect(path).toHaveAttribute("d")
  })

  it("renders end point indicator", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    const circle = svg.querySelector("circle")
    expect(circle).toBeInTheDocument()
  })

  it("applies default variant styling", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path[stroke]")
    expect(path).toHaveAttribute("stroke", "var(--admin-interactive-primary)")
  })

  it("applies success variant styling", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} variant="success" />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path[stroke]")
    expect(path).toHaveAttribute("stroke", "var(--admin-success)")
  })

  it("applies danger variant styling", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} variant="danger" />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path[stroke]")
    expect(path).toHaveAttribute("stroke", "var(--admin-danger)")
  })

  it("applies warning variant styling", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} variant="warning" />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path[stroke]")
    expect(path).toHaveAttribute("stroke", "var(--admin-warning)")
  })

  it("handles single data point", () => {
    render(<Sparkline data={[5]} />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toBeInTheDocument()
    // Single point shows a circle in the center
    const circle = svg.querySelector("circle")
    expect(circle).toBeInTheDocument()
  })

  it("handles empty data", () => {
    render(<Sparkline data={[]} />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toBeInTheDocument()
    // Empty data shows a dashed line
    const line = svg.querySelector("line")
    expect(line).toBeInTheDocument()
    expect(line).toHaveAttribute("stroke-dasharray", "4 2")
  })

  it("handles negative values", () => {
    render(<Sparkline data={[-5, -2, 0, 2, 5]} />)
    const svg = screen.getByTestId("sparkline")
    const path = svg.querySelector("path")
    expect(path).toHaveAttribute("d")
  })

  it("applies custom className", () => {
    render(<Sparkline data={[1, 2, 3]} className="custom-class" />)
    expect(screen.getByTestId("sparkline")).toHaveClass("custom-class")
  })

  it("sets accessible aria-label with data count", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toHaveAttribute("aria-label", "Sparkline chart with 5 data points")
  })

  it("uses custom label when provided", () => {
    render(<Sparkline data={[1, 2, 3]} label="Weekly sales trend" />)
    const svg = screen.getByTestId("sparkline")
    expect(svg).toHaveAttribute("aria-label", "Weekly sales trend")
  })

  it("shows gradient fill by default", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const svg = screen.getByTestId("sparkline")
    const defs = svg.querySelector("defs")
    expect(defs).toBeInTheDocument()
  })

  it("hides gradient fill when showFill is false", () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} showFill={false} />)
    const svg = screen.getByTestId("sparkline")
    const defs = svg.querySelector("defs")
    expect(defs).not.toBeInTheDocument()
  })
})
