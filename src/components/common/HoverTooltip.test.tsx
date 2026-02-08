import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import HoverTooltip from "./HoverTooltip"

describe("HoverTooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

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

    await act(async () => {
      fireEvent.mouseEnter(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    expect(screen.getByText("Tooltip content")).toBeInTheDocument()
  })

  it("hides tooltip on mouse leave with delay", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    // Show tooltip
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    // Hide tooltip - should still be visible immediately after mouse leave
    await act(async () => {
      fireEvent.mouseLeave(screen.getByText("Trigger text"))
      vi.advanceTimersByTime(50) // Less than 100ms delay
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    // After the full delay, tooltip should be hidden
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
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
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    // Start leaving trigger
    await act(async () => {
      fireEvent.mouseLeave(screen.getByText("Trigger text"))
      vi.advanceTimersByTime(50) // Before hide timeout
    })

    // Enter tooltip before hide timeout completes
    await act(async () => {
      fireEvent.mouseEnter(screen.getByTestId("hover-tooltip"))
      vi.advanceTimersByTime(100) // Past the original timeout
    })

    // Tooltip should still be visible
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
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

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
  })

  it("hides tooltip on second click (toggle behavior)", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text")

    // Click to show
    await act(async () => {
      fireEvent.click(trigger)
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    // Click again to hide
    await act(async () => {
      fireEvent.click(trigger)
      await vi.runAllTimersAsync()
    })
    expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
  })

  it("uses custom testId when provided", async () => {
    render(
      <HoverTooltip content="Tooltip content" testId="custom-tooltip">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("custom-tooltip")).toBeInTheDocument()
  })

  it("shows tooltip on Enter key press (keyboard accessibility)", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!

    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Enter" })
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
  })

  it("hides tooltip on Escape key press", async () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!

    // Open with click
    await act(async () => {
      fireEvent.click(trigger)
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    // Close with Escape
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Escape" })
      await vi.runAllTimersAsync()
    })
    expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()
  })

  it("has proper accessibility attributes", () => {
    render(
      <HoverTooltip content="Tooltip content">
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByRole("button")
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute("type", "button")
  })

  it("calls onOpen callback when tooltip is shown via hover", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    await act(async () => {
      fireEvent.mouseEnter(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("calls onOpen callback when tooltip is shown via click", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger text"))
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
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
    await act(async () => {
      fireEvent.mouseEnter(trigger)
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()

    const tooltip = screen.getByTestId("hover-tooltip")

    // Move to tooltip and back - should not trigger onOpen again
    await act(async () => {
      fireEvent.mouseLeave(trigger)
      vi.advanceTimersByTime(50)
      fireEvent.mouseEnter(tooltip)
    })

    await act(async () => {
      fireEvent.mouseLeave(tooltip)
      vi.advanceTimersByTime(50)
      fireEvent.mouseEnter(trigger)
    })

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

    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Enter" })
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
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

    await act(async () => {
      fireEvent.keyDown(trigger, { key: " " })
      await vi.runAllTimersAsync()
    })

    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("calls onOpen again after closing with Escape and reopening", async () => {
    const onOpen = vi.fn()
    render(
      <HoverTooltip content="Tooltip content" onOpen={onOpen}>
        <span>Trigger text</span>
      </HoverTooltip>
    )

    const trigger = screen.getByText("Trigger text").parentElement!

    // Open with Enter
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Enter" })
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    expect(onOpen).toHaveBeenCalledTimes(1)

    // Close with Escape
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Escape" })
      await vi.runAllTimersAsync()
    })
    expect(screen.queryByTestId("hover-tooltip")).not.toBeInTheDocument()

    // Open again with Enter - onOpen should be called again
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Enter" })
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId("hover-tooltip")).toBeInTheDocument()
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
