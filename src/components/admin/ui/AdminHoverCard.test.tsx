import { render, screen, fireEvent, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import AdminHoverCard from "./AdminHoverCard"

describe("AdminHoverCard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders trigger element", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    expect(screen.getByRole("button", { name: "Hover me" })).toBeInTheDocument()
  })

  it("does not show content initially", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    expect(screen.queryByText("Card content")).not.toBeInTheDocument()
  })

  it("shows content after hover delay", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>} hoverDelay={300}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })

    fireEvent.mouseEnter(trigger)

    // Content should not be visible immediately
    expect(screen.queryByText("Card content")).not.toBeInTheDocument()

    // Advance timers past hover delay
    act(() => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText("Card content")).toBeInTheDocument()
  })

  it("hides content on mouse leave", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>} hoverDelay={0}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })

    // Show the card
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(10)
    })

    expect(screen.getByText("Card content")).toBeInTheDocument()

    // Hide the card
    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(screen.queryByText("Card content")).not.toBeInTheDocument()
  })

  it("calls onOpen when card opens", () => {
    const onOpen = vi.fn()

    render(
      <AdminHoverCard content={<div>Card content</div>} hoverDelay={0} onOpen={onOpen}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })
    fireEvent.mouseEnter(trigger)

    act(() => {
      vi.advanceTimersByTime(10)
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("does not show content when disabled", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>} hoverDelay={0} disabled>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })
    fireEvent.mouseEnter(trigger)

    act(() => {
      vi.advanceTimersByTime(10)
    })

    expect(screen.queryByText("Card content")).not.toBeInTheDocument()
  })

  it("closes on escape key", () => {
    render(
      <AdminHoverCard content={<div>Card content</div>} hoverDelay={0}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })
    fireEvent.mouseEnter(trigger)

    act(() => {
      vi.advanceTimersByTime(10)
    })

    expect(screen.getByText("Card content")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByText("Card content")).not.toBeInTheDocument()
  })

  it("keeps card open when moving mouse to card", () => {
    render(
      <AdminHoverCard content={<div data-testid="card-content">Card content</div>} hoverDelay={0}>
        <button>Hover me</button>
      </AdminHoverCard>
    )

    const trigger = screen.getByRole("button", { name: "Hover me" })

    // Open card
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(10)
    })

    expect(screen.getByTestId("card-content")).toBeInTheDocument()

    // Leave trigger
    fireEvent.mouseLeave(trigger)

    // Enter card before close timeout
    const card = screen.getByRole("tooltip")
    fireEvent.mouseEnter(card)

    // Advance past close timeout
    act(() => {
      vi.advanceTimersByTime(150)
    })

    // Card should still be visible
    expect(screen.getByTestId("card-content")).toBeInTheDocument()
  })
})
