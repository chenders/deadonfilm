import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import ProgressRing from "./ProgressRing"

describe("ProgressRing", () => {
  it("renders progressbar element", () => {
    render(<ProgressRing value={50} />)
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("sets correct aria attributes", () => {
    render(<ProgressRing value={75} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "75")
    expect(progressbar).toHaveAttribute("aria-valuemin", "0")
    expect(progressbar).toHaveAttribute("aria-valuemax", "100")
  })

  it("clamps value to minimum 0", () => {
    render(<ProgressRing value={-20} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "0")
  })

  it("clamps value to maximum 100", () => {
    render(<ProgressRing value={150} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "100")
  })

  it("renders with default size", () => {
    render(<ProgressRing value={50} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveStyle({ width: "48px", height: "48px" })
  })

  it("renders with custom size", () => {
    render(<ProgressRing value={50} size={64} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveStyle({ width: "64px", height: "64px" })
  })

  it("shows label by default", () => {
    render(<ProgressRing value={75} />)
    expect(screen.getByText("75%")).toBeInTheDocument()
  })

  it("hides label when showLabel is false", () => {
    render(<ProgressRing value={75} showLabel={false} />)
    expect(screen.queryByText("75%")).not.toBeInTheDocument()
  })

  it("shows custom label when provided", () => {
    render(<ProgressRing value={75} label="3/4" />)
    expect(screen.getByText("3/4")).toBeInTheDocument()
    expect(screen.queryByText("75%")).not.toBeInTheDocument()
  })

  it("sets aria-label with percentage", () => {
    render(<ProgressRing value={50} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-label", "Progress: 50%")
  })

  it("sets aria-label with custom label", () => {
    render(<ProgressRing value={50} label="Halfway" />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-label", "Progress: Halfway")
  })

  it("renders SVG with two circles", () => {
    render(<ProgressRing value={50} />)
    const progressbar = screen.getByRole("progressbar")
    const svg = progressbar.querySelector("svg")
    expect(svg).toBeInTheDocument()
    const circles = svg?.querySelectorAll("circle")
    expect(circles).toHaveLength(2)
  })

  it("applies variant color to progress circle", () => {
    render(<ProgressRing value={50} variant="success" />)
    const progressbar = screen.getByRole("progressbar")
    const circles = progressbar.querySelectorAll("circle")
    // Second circle is the progress arc
    expect(circles[1]).toHaveAttribute("stroke", "var(--admin-success)")
  })

  it("applies default variant color", () => {
    render(<ProgressRing value={50} />)
    const progressbar = screen.getByRole("progressbar")
    const circles = progressbar.querySelectorAll("circle")
    expect(circles[1]).toHaveAttribute("stroke", "var(--admin-interactive-primary)")
  })

  it("applies warning variant color", () => {
    render(<ProgressRing value={50} variant="warning" />)
    const progressbar = screen.getByRole("progressbar")
    const circles = progressbar.querySelectorAll("circle")
    expect(circles[1]).toHaveAttribute("stroke", "var(--admin-warning)")
  })

  it("applies danger variant color", () => {
    render(<ProgressRing value={50} variant="danger" />)
    const progressbar = screen.getByRole("progressbar")
    const circles = progressbar.querySelectorAll("circle")
    expect(circles[1]).toHaveAttribute("stroke", "var(--admin-danger)")
  })

  it("applies animation class by default", () => {
    render(<ProgressRing value={50} />)
    const progressbar = screen.getByRole("progressbar")
    const progressCircle = progressbar.querySelectorAll("circle")[1]
    expect(progressCircle).toHaveClass("transition-all")
  })

  it("removes animation class when animated is false", () => {
    render(<ProgressRing value={50} animated={false} />)
    const progressbar = screen.getByRole("progressbar")
    const progressCircle = progressbar.querySelectorAll("circle")[1]
    expect(progressCircle).not.toHaveClass("transition-all")
  })

  it("rounds percentage values", () => {
    render(<ProgressRing value={33.7} />)
    expect(screen.getByText("34%")).toBeInTheDocument()
  })

  it("renders 0% correctly", () => {
    render(<ProgressRing value={0} />)
    expect(screen.getByText("0%")).toBeInTheDocument()
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "0")
  })

  it("renders 100% correctly", () => {
    render(<ProgressRing value={100} />)
    expect(screen.getByText("100%")).toBeInTheDocument()
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "100")
  })
})
