import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import Card from "./Card"

describe("Card", () => {
  it("renders children content", () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText("Card content")).toBeInTheDocument()
  })

  it("renders as div by default", () => {
    render(<Card>Content</Card>)
    const content = screen.getByText("Content")
    expect(content.closest("div")).toBeInTheDocument()
    expect(content.closest("button")).not.toBeInTheDocument()
  })

  it("renders title when provided", () => {
    render(<Card title="Card Title">Content</Card>)
    expect(screen.getByText("Card Title")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Card Title")
  })

  it("renders action when provided", () => {
    render(
      <Card title="Card" action={<button>Action</button>}>
        Content
      </Card>
    )
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
  })

  it("renders both title and action together", () => {
    render(
      <Card title="Title" action={<span>Action</span>}>
        Content
      </Card>
    )
    expect(screen.getByText("Title")).toBeInTheDocument()
    expect(screen.getByText("Action")).toBeInTheDocument()
  })

  it("does not render header section without title or action", () => {
    const { container } = render(<Card>Content only</Card>)
    // Should not have the header wrapper div with mb-4 class
    expect(container.querySelector(".mb-4")).not.toBeInTheDocument()
  })

  it("renders as button when onClick is provided", () => {
    const handleClick = vi.fn()
    render(<Card onClick={handleClick}>Clickable</Card>)
    const button = screen.getByRole("button")
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent("Clickable")
  })

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn()
    render(<Card onClick={handleClick}>Clickable</Card>)
    fireEvent.click(screen.getByRole("button"))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it("applies cursor-pointer when onClick is provided", () => {
    const handleClick = vi.fn()
    render(<Card onClick={handleClick}>Clickable</Card>)
    expect(screen.getByRole("button")).toHaveClass("cursor-pointer")
  })

  it("applies hover effects when hoverable is true", () => {
    const { container } = render(<Card hoverable>Content</Card>)
    const card = container.firstChild
    expect(card).toHaveClass("hover:-translate-y-0.5")
    expect(card).toHaveClass("hover:shadow-admin-md")
  })

  it("does not apply hover effects by default", () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild
    expect(card).not.toHaveClass("hover:-translate-y-0.5")
  })

  it("applies small padding", () => {
    const { container } = render(<Card padding="sm">Content</Card>)
    expect(container.firstChild).toHaveClass("p-3")
  })

  it("applies medium padding by default", () => {
    const { container } = render(<Card>Content</Card>)
    expect(container.firstChild).toHaveClass("p-4")
  })

  it("applies large padding", () => {
    const { container } = render(<Card padding="lg">Content</Card>)
    expect(container.firstChild).toHaveClass("p-5")
  })

  it("applies custom className", () => {
    const { container } = render(<Card className="custom-class">Content</Card>)
    expect(container.firstChild).toHaveClass("custom-class")
  })

  it("applies base styling classes", () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild
    expect(card).toHaveClass("rounded-lg")
    expect(card).toHaveClass("border")
    expect(card).toHaveClass("border-admin-border")
    expect(card).toHaveClass("bg-admin-surface-elevated")
    expect(card).toHaveClass("shadow-admin-sm")
  })

  it("renders action without title", () => {
    render(<Card action={<button>Solo Action</button>}>Content</Card>)
    expect(screen.getByRole("button", { name: "Solo Action" })).toBeInTheDocument()
    expect(screen.queryByRole("heading")).not.toBeInTheDocument()
  })

  it("renders complex children", () => {
    render(
      <Card>
        <div data-testid="complex-child">
          <p>Paragraph</p>
          <span>Span</span>
        </div>
      </Card>
    )
    expect(screen.getByTestId("complex-child")).toBeInTheDocument()
    expect(screen.getByText("Paragraph")).toBeInTheDocument()
    expect(screen.getByText("Span")).toBeInTheDocument()
  })
})
