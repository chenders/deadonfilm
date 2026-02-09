import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SortControl from "./SortControl"

const options = [
  { value: "date", label: "Date" },
  { value: "name", label: "Name" },
  { value: "age", label: "Age" },
]

describe("SortControl", () => {
  it("renders sort dropdown with options", () => {
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="desc"
        onSortChange={vi.fn()}
        onDirChange={vi.fn()}
      />
    )

    const select = screen.getByTestId("sort-control-select")
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue("date")

    // Check all options rendered
    const optionElements = select.querySelectorAll("option")
    expect(optionElements).toHaveLength(3)
  })

  it("calls onSortChange when sort option is changed", () => {
    const onSortChange = vi.fn()
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="desc"
        onSortChange={onSortChange}
        onDirChange={vi.fn()}
      />
    )

    fireEvent.change(screen.getByTestId("sort-control-select"), { target: { value: "name" } })
    expect(onSortChange).toHaveBeenCalledWith("name")
  })

  it("calls onDirChange when direction button is clicked", () => {
    const onDirChange = vi.fn()
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="desc"
        onSortChange={vi.fn()}
        onDirChange={onDirChange}
      />
    )

    fireEvent.click(screen.getByTestId("sort-control-dir"))
    expect(onDirChange).toHaveBeenCalledWith("asc")
  })

  it("toggles direction from asc to desc", () => {
    const onDirChange = vi.fn()
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="asc"
        onSortChange={vi.fn()}
        onDirChange={onDirChange}
      />
    )

    fireEvent.click(screen.getByTestId("sort-control-dir"))
    expect(onDirChange).toHaveBeenCalledWith("desc")
  })

  it("shows ascending arrow when dir is asc", () => {
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="asc"
        onSortChange={vi.fn()}
        onDirChange={vi.fn()}
      />
    )

    expect(screen.getByTestId("sort-control-dir")).toHaveTextContent("\u2191")
  })

  it("shows descending arrow when dir is desc", () => {
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="desc"
        onSortChange={vi.fn()}
        onDirChange={vi.fn()}
      />
    )

    expect(screen.getByTestId("sort-control-dir")).toHaveTextContent("\u2193")
  })

  it("uses custom testId", () => {
    render(
      <SortControl
        options={options}
        currentSort="date"
        currentDir="desc"
        onSortChange={vi.fn()}
        onDirChange={vi.fn()}
        testId="custom-sort"
      />
    )

    expect(screen.getByTestId("custom-sort")).toBeInTheDocument()
    expect(screen.getByTestId("custom-sort-select")).toBeInTheDocument()
    expect(screen.getByTestId("custom-sort-dir")).toBeInTheDocument()
  })
})
