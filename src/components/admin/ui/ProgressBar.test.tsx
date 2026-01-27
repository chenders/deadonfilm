import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import ProgressBar from "./ProgressBar"

describe("ProgressBar", () => {
  it("renders progressbar element", () => {
    render(<ProgressBar value={50} />)
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("sets correct aria attributes", () => {
    render(<ProgressBar value={75} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "75")
    expect(progressbar).toHaveAttribute("aria-valuemin", "0")
    expect(progressbar).toHaveAttribute("aria-valuemax", "100")
  })

  it("clamps value to minimum 0", () => {
    render(<ProgressBar value={-20} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "0")
  })

  it("clamps value to maximum 100", () => {
    render(<ProgressBar value={150} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-valuenow", "100")
  })

  it("renders with default height", () => {
    render(<ProgressBar value={50} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveStyle({ height: "8px" })
  })

  it("renders with custom height", () => {
    render(<ProgressBar value={50} height={16} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveStyle({ height: "16px" })
  })

  it("uses custom aria-label when provided", () => {
    render(<ProgressBar value={50} label="Upload progress" />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-label", "Upload progress")
  })

  it("uses default aria-label when not provided", () => {
    render(<ProgressBar value={50} />)
    const progressbar = screen.getByRole("progressbar")
    expect(progressbar).toHaveAttribute("aria-label", "Progress: 50%")
  })

  it("shows label outside when showLabel is true", () => {
    render(<ProgressBar value={50} showLabel labelPosition="outside" />)
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("Progress")).toBeInTheDocument()
  })

  it("shows custom label text", () => {
    render(<ProgressBar value={50} showLabel label="Download" labelPosition="outside" />)
    expect(screen.getByText("Download")).toBeInTheDocument()
  })

  it("does not show label by default", () => {
    render(<ProgressBar value={50} />)
    expect(screen.queryByText("50%")).not.toBeInTheDocument()
  })

  it("shows inside label only when height is sufficient", () => {
    render(<ProgressBar value={50} showLabel labelPosition="inside" height={20} />)
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("hides inside label when bar is too small", () => {
    render(<ProgressBar value={50} showLabel labelPosition="inside" height={8} />)
    expect(screen.queryByText("50%")).not.toBeInTheDocument()
  })

  it("hides inside label when value is below threshold", () => {
    render(<ProgressBar value={10} showLabel labelPosition="inside" height={20} />)
    // Small values don't show inside label to avoid overflow
    const labelText = screen.queryByText("10%")
    expect(labelText).not.toBeInTheDocument()
  })

  it("applies animation class by default", () => {
    render(<ProgressBar value={50} />)
    const progressbar = screen.getByRole("progressbar")
    const fillBar = progressbar.querySelector("div > div")
    expect(fillBar).toHaveClass("transition-all")
  })

  it("removes animation class when animated is false", () => {
    render(<ProgressBar value={50} animated={false} />)
    const progressbar = screen.getByRole("progressbar")
    const fillBar = progressbar.querySelector("div > div")
    expect(fillBar).not.toHaveClass("transition-all")
  })

  it("rounds percentage values", () => {
    render(<ProgressBar value={33.7} showLabel labelPosition="outside" />)
    expect(screen.getByText("34%")).toBeInTheDocument()
  })
})
