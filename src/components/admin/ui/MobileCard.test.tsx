import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import MobileCard from "./MobileCard"

describe("MobileCard", () => {
  it("renders title", () => {
    render(<MobileCard title="John Wayne" />)
    expect(screen.getByText("John Wayne")).toBeInTheDocument()
  })

  it("renders subtitle when provided", () => {
    render(<MobileCard title="John Wayne" subtitle="1907 - 1979" />)
    expect(screen.getByText("1907 - 1979")).toBeInTheDocument()
  })

  it("does not render subtitle when not provided", () => {
    render(<MobileCard title="John Wayne" />)
    expect(screen.queryByText("1907 - 1979")).not.toBeInTheDocument()
  })

  it("renders key-value fields", () => {
    render(
      <MobileCard
        title="John Wayne"
        fields={[
          { label: "Death Date", value: "June 11, 1979" },
          { label: "Cause", value: "Cancer" },
        ]}
      />
    )

    expect(screen.getByText("Death Date")).toBeInTheDocument()
    expect(screen.getByText("June 11, 1979")).toBeInTheDocument()
    expect(screen.getByText("Cause")).toBeInTheDocument()
    expect(screen.getByText("Cancer")).toBeInTheDocument()
  })

  it("renders actions", () => {
    render(<MobileCard title="John Wayne" actions={<button>Edit</button>} />)

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
  })

  it("renders checkbox when selectable", () => {
    render(<MobileCard title="John Wayne" selectable selected={false} />)

    const checkbox = screen.getByRole("checkbox")
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it("calls onSelectionChange when checkbox is toggled", () => {
    const onSelectionChange = vi.fn()
    render(
      <MobileCard
        title="John Wayne"
        selectable
        selected={false}
        onSelectionChange={onSelectionChange}
      />
    )

    fireEvent.click(screen.getByRole("checkbox"))
    expect(onSelectionChange).toHaveBeenCalledWith(true)
  })

  it("shows checked checkbox when selected", () => {
    render(<MobileCard title="John Wayne" selectable selected />)
    expect(screen.getByRole("checkbox")).toBeChecked()
  })

  it("applies selected styling when selected", () => {
    const { container } = render(<MobileCard title="John Wayne" selectable selected />)
    expect(container.firstChild).toHaveClass("border-admin-interactive")
  })

  it("applies default border when not selected", () => {
    const { container } = render(<MobileCard title="John Wayne" />)
    expect(container.firstChild).toHaveClass("border-admin-border")
  })

  it("applies data-testid", () => {
    render(<MobileCard title="John Wayne" data-testid="actor-card-1" />)
    expect(screen.getByTestId("actor-card-1")).toBeInTheDocument()
  })

  it("does not render checkbox when not selectable", () => {
    render(<MobileCard title="John Wayne" />)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("does not render actions section when no actions provided", () => {
    const { container } = render(<MobileCard title="John Wayne" />)
    // Actions section has a border-t, which shouldn't be present
    expect(container.querySelector(".border-t")).not.toBeInTheDocument()
  })

  it("does not render fields section when no fields provided", () => {
    render(<MobileCard title="John Wayne" />)
    expect(screen.queryByRole("definition")).not.toBeInTheDocument()
  })

  it("renders ReactNode title", () => {
    render(<MobileCard title={<span data-testid="custom-title">Custom</span>} />)
    expect(screen.getByTestId("custom-title")).toBeInTheDocument()
  })
})
