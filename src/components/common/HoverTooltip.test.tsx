import { describe, it, expect, vi } from "vitest"
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

  it("shows tooltip on click (for mobile support)", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    // Click to show tooltip
    fireEvent.click(screen.getByText("Trigger text"))

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })
  })

  it("hides tooltip on second click (toggle behavior)", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text")

    // Click to show
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    // Click again to hide
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
    })
  })

  it("uses custom testId when provided", async () => {
    render(
      <HoverTooltip content="Tooltip content" testId="custom-tooltip">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    fireEvent.click(screen.getByText("Trigger text"))

    await waitFor(() => {
      expect(screen.getByTestId("custom-tooltip")).toBeInTheDocument()
    })
  })

  it("shows tooltip on Enter key press (keyboard accessibility)", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!
    fireEvent.keyDown(trigger, { key: "Enter" })

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })
  })

  it("hides tooltip on Escape key press", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!

    // Open with click
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    // Close with Escape
    fireEvent.keyDown(trigger, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
    })
  })

  it("has proper accessibility attributes", () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!
    expect(trigger).toHaveAttribute("role", "button")
    expect(trigger).toHaveAttribute("tabIndex", "0")
  })

  it("calls onOpen callback when tooltip is shown via hover", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    fireEvent.mouseEnter(screen.getByText("Trigger text"))

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("calls onOpen callback when tooltip is shown via click", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    fireEvent.click(screen.getByText("Trigger text"))

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("only calls onOpen once per tooltip session", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text")

    // Open via hover
    fireEvent.mouseEnter(trigger)
    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    // Move to tooltip and back - should not trigger onOpen again
    const tooltip = screen.getByTestId("hover-tooltip")
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(tooltip)
    fireEvent.mouseLeave(tooltip)
    fireEvent.mouseEnter(trigger)

    // Should still only be called once
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("calls onOpen callback when tooltip is opened via keyboard (Enter key)", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!
    fireEvent.keyDown(trigger, { key: "Enter" })

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("calls onOpen callback when tooltip is opened via keyboard (Space key)", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!
    fireEvent.keyDown(trigger, { key: " " })

    await waitFor(() => {
      expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
