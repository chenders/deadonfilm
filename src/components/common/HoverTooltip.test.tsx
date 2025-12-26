import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import HoverTooltip from "./HoverTooltip"

describe("HoverTooltip", () => {
  it("renders children", () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    expect(screen.getByText("Trigger text")).toBeInTheDocument()
  })

  it("does not show tooltip initially", () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
  })

  it("shows tooltip on hover", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    fireEvent.mouseEnter(screen.getByText("Trigger text"))

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
      expect(screen.getByText("Tooltip content")).toBeInTheDocument()
    })
  })

  it("hides tooltip on mouse leave with delay", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    // Show tooltip
    fireEvent.mouseEnter(screen.getByText("Trigger text"))
    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    // Hide tooltip
    fireEvent.mouseLeave(screen.getByText("Trigger text"))

    // Wait for the hide delay (100ms) plus some buffer
    await waitFor(
      () => {
        expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
      },
      { timeout: 500 }
    )
  })

  it("applies custom className", () => {
    render(
      <HoverTooltip content="Tooltip content" className="custom-class">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement
    expect(trigger).toHaveClass("custom-class")
  })

  it("keeps tooltip visible when moving mouse to tooltip", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    // Show tooltip
    fireEvent.mouseEnter(screen.getByText("Trigger text"))
    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    // Start leaving trigger
    fireEvent.mouseLeave(screen.getByText("Trigger text"))

    // Enter tooltip before hide timeout
    fireEvent.mouseEnter(screen.getByTestId("hover-tooltip"))

    // Tooltip should still be visible
    await waitFor(
      () => {
        expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
      },
      { timeout: 300 }
    )
  })

  it("has cursor-help class on trigger", () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement
    expect(trigger).toHaveClass("cursor-help")
  })
})
