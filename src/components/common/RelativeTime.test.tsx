import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import RelativeTime from "./RelativeTime"

describe("RelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders relative time for a valid date", () => {
    render(<RelativeTime date="2026-02-13T12:00:00Z" />)
    expect(screen.getByText("3 days ago")).toBeInTheDocument()
  })

  it("shows full date/time in title attribute", () => {
    render(<RelativeTime date="2026-02-13T12:00:00Z" />)
    const element = screen.getByText("3 days ago")
    expect(element).toHaveAttribute("title", expect.stringContaining("Feb 13, 2026 at"))
  })

  it("prepends prefix when provided", () => {
    render(<RelativeTime date="2026-02-13T12:00:00Z" prefix="Updated" />)
    expect(screen.getByText("Updated 3 days ago")).toBeInTheDocument()
  })

  it("applies className to the span", () => {
    render(<RelativeTime date="2026-02-13T12:00:00Z" className="text-xs" />)
    const element = screen.getByText("3 days ago")
    expect(element).toHaveClass("text-xs")
  })

  it("returns null for null date without fallback", () => {
    const { container } = render(<RelativeTime date={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders fallback text for null date when fallback provided", () => {
    render(<RelativeTime date={null} fallback="Never" />)
    expect(screen.getByText("Never")).toBeInTheDocument()
  })

  it("applies className to fallback span", () => {
    render(<RelativeTime date={null} fallback="Never" className="text-muted" />)
    const element = screen.getByText("Never")
    expect(element).toHaveClass("text-muted")
  })

  it("returns null for invalid date without fallback", () => {
    const { container } = render(<RelativeTime date="invalid" />)
    expect(container.firstChild).toBeNull()
  })
})
