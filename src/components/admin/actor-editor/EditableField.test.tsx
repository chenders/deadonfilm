import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import EditableField from "./EditableField"

describe("EditableField", () => {
  describe("text input", () => {
    it("renders text input with label", () => {
      render(<EditableField name="test" label="Test Field" value="Hello" onChange={vi.fn()} />)

      expect(screen.getByLabelText("Test Field")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Hello")).toBeInTheDocument()
    })

    it("calls onChange when value changes", () => {
      const handleChange = vi.fn()
      render(<EditableField name="test" label="Test Field" value="" onChange={handleChange} />)

      fireEvent.change(screen.getByLabelText("Test Field"), { target: { value: "New Value" } })

      expect(handleChange).toHaveBeenCalledWith("New Value")
    })

    it("shows placeholder when provided", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value=""
          onChange={vi.fn()}
          placeholder="Enter text..."
        />
      )

      expect(screen.getByPlaceholderText("Enter text...")).toBeInTheDocument()
    })

    it("shows help text when provided", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value=""
          onChange={vi.fn()}
          helpText="This is helpful"
        />
      )

      expect(screen.getByText("This is helpful")).toBeInTheDocument()
    })

    it("is disabled when disabled prop is true", () => {
      render(<EditableField name="test" label="Test Field" value="" onChange={vi.fn()} disabled />)

      expect(screen.getByLabelText("Test Field")).toBeDisabled()
    })
  })

  describe("textarea input", () => {
    it("renders textarea when type is textarea", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Long text"
          onChange={vi.fn()}
          type="textarea"
        />
      )

      const textarea = screen.getByLabelText("Test Field")
      expect(textarea.tagName).toBe("TEXTAREA")
      expect(textarea).toHaveValue("Long text")
    })
  })

  describe("date input", () => {
    it("renders date input when type is date", () => {
      render(
        <EditableField
          name="test"
          label="Test Date"
          value="2024-01-15"
          onChange={vi.fn()}
          type="date"
        />
      )

      const input = screen.getByLabelText("Test Date")
      expect(input).toHaveAttribute("type", "date")
      expect(input).toHaveValue("2024-01-15")
    })
  })

  describe("boolean input", () => {
    it("renders checkbox when type is boolean", () => {
      render(
        <EditableField
          name="test"
          label="Test Bool"
          value={true}
          onChange={vi.fn()}
          type="boolean"
        />
      )

      const checkbox = screen.getByLabelText("Test Bool")
      expect(checkbox).toHaveAttribute("type", "checkbox")
      expect(checkbox).toBeChecked()
    })

    it("calls onChange with boolean value", () => {
      const handleChange = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Bool"
          value={false}
          onChange={handleChange}
          type="boolean"
        />
      )

      fireEvent.click(screen.getByLabelText("Test Bool"))

      expect(handleChange).toHaveBeenCalledWith(true)
    })
  })

  describe("select input", () => {
    it("renders select with options", () => {
      render(
        <EditableField
          name="test"
          label="Test Select"
          value="opt1"
          onChange={vi.fn()}
          type="select"
          options={[
            { value: "opt1", label: "Option 1" },
            { value: "opt2", label: "Option 2" },
          ]}
        />
      )

      expect(screen.getByLabelText("Test Select")).toHaveValue("opt1")
      expect(screen.getByText("Option 1")).toBeInTheDocument()
      expect(screen.getByText("Option 2")).toBeInTheDocument()
    })
  })

  describe("array input", () => {
    it("renders array as comma-separated values", () => {
      render(
        <EditableField
          name="test"
          label="Test Array"
          value={["one", "two", "three"]}
          onChange={vi.fn()}
          type="array"
        />
      )

      expect(screen.getByDisplayValue("one, two, three")).toBeInTheDocument()
    })

    it("converts comma-separated input to array", () => {
      const handleChange = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Array"
          value={[]}
          onChange={handleChange}
          type="array"
        />
      )

      fireEvent.change(screen.getByLabelText("Test Array"), { target: { value: "a, b, c" } })

      expect(handleChange).toHaveBeenCalledWith(["a", "b", "c"])
    })
  })

  describe("history and revert", () => {
    const mockHistory = [
      {
        field_name: "test",
        old_value: "Old Value",
        new_value: "New Value",
        source: "admin-manual-edit",
        created_at: "2024-01-15T10:00:00Z",
      },
    ]

    it("shows revert button when history exists", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="New Value"
          onChange={vi.fn()}
          history={mockHistory}
          onRevert={vi.fn()}
        />
      )

      expect(screen.getByText("Revert")).toBeInTheDocument()
    })

    it("hides revert button when no history", () => {
      render(<EditableField name="test" label="Test Field" value="Value" onChange={vi.fn()} />)

      expect(screen.queryByText("Revert")).not.toBeInTheDocument()
    })

    it("calls onRevert with old value when clicked", () => {
      const handleRevert = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="New Value"
          onChange={vi.fn()}
          history={mockHistory}
          onRevert={handleRevert}
        />
      )

      fireEvent.click(screen.getByText("Revert"))

      expect(handleRevert).toHaveBeenCalledWith("Old Value")
    })

    it("shows last changed info", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Value"
          onChange={vi.fn()}
          history={mockHistory}
        />
      )

      expect(screen.getByText(/Last changed:/)).toBeInTheDocument()
      expect(screen.getByText(/admin-manual-edit/)).toBeInTheDocument()
    })

    it("toggles history view", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Value"
          onChange={vi.fn()}
          history={mockHistory}
        />
      )

      // Initially shows "Show history"
      expect(screen.getByText("Show history")).toBeInTheDocument()

      // Click to show history
      fireEvent.click(screen.getByText("Show history"))

      // Now shows "Hide history" and change history panel
      expect(screen.getByText("Hide history")).toBeInTheDocument()
      expect(screen.getByText("Change History")).toBeInTheDocument()
    })
  })
})
