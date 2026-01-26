import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import DateInput from "./DateInput"

describe("DateInput", () => {
  it("renders with label and input", () => {
    render(<DateInput id="test-date" label="Test Date" value="" onChange={vi.fn()} />)

    expect(screen.getByLabelText("Test Date")).toBeInTheDocument()
    expect(screen.getByText("Format: YYYY-MM-DD")).toBeInTheDocument()
  })

  it("displays the provided value", () => {
    render(<DateInput id="test-date" label="Test Date" value="2024-01-15" onChange={vi.fn()} />)

    const input = screen.getByLabelText("Test Date") as HTMLInputElement
    expect(input.value).toBe("2024-01-15")
  })

  it("calls onChange when value changes", () => {
    const handleChange = vi.fn()
    render(<DateInput id="test-date" label="Test Date" value="" onChange={handleChange} />)

    const input = screen.getByLabelText("Test Date")
    fireEvent.change(input, { target: { value: "2024-02-20" } })

    expect(handleChange).toHaveBeenCalledWith("2024-02-20")
  })

  it("shows clear button when value is present and showClearButton is true", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value="2024-01-15"
        onChange={vi.fn()}
        showClearButton={true}
      />
    )

    // react-datepicker uses aria-label="Close" for its clear button
    expect(screen.getByLabelText("Close")).toBeInTheDocument()
  })

  it("hides clear button when value is empty", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        showClearButton={true}
      />
    )

    // react-datepicker uses aria-label="Close" for its clear button
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument()
  })

  it("hides clear button when showClearButton is false", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value="2024-01-15"
        onChange={vi.fn()}
        showClearButton={false}
      />
    )

    // react-datepicker uses aria-label="Close" for its clear button
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument()
  })

  it("clears value when clear button is clicked", () => {
    const handleChange = vi.fn()
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value="2024-01-15"
        onChange={handleChange}
        showClearButton={true}
      />
    )

    // react-datepicker uses aria-label="Close" for its clear button
    const clearButton = screen.getByLabelText("Close")
    fireEvent.click(clearButton)

    expect(handleChange).toHaveBeenCalledWith("")
  })

  it("displays custom help text", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        helpText="Custom help message"
      />
    )

    expect(screen.getByText("Custom help message")).toBeInTheDocument()
    expect(screen.queryByText("Format: YYYY-MM-DD")).not.toBeInTheDocument()
  })

  it("displays error message when error is provided", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        error="Invalid date"
      />
    )

    expect(screen.getByText("Invalid date")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid date")
  })

  it("hides help text when error is shown", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        helpText="Help text"
        error="Error message"
      />
    )

    expect(screen.queryByText("Help text")).not.toBeInTheDocument()
    expect(screen.getByText("Error message")).toBeInTheDocument()
  })

  it("applies error styling when error is provided", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        error="Invalid date"
      />
    )

    const input = screen.getByLabelText("Test Date")
    expect(input).toHaveClass("border-admin-danger")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("sets proper ARIA attributes for accessibility", () => {
    render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        helpText="Help text"
      />
    )

    const input = screen.getByLabelText("Test Date")
    expect(input).toHaveAttribute("aria-label", "Test Date")
    expect(input).toHaveAttribute("aria-describedby", "test-date-help")
  })

  it("applies custom className to container", () => {
    const { container } = render(
      <DateInput
        id="test-date"
        label="Test Date"
        value=""
        onChange={vi.fn()}
        className="custom-class"
      />
    )

    expect(container.firstChild).toHaveClass("custom-class")
  })
})
