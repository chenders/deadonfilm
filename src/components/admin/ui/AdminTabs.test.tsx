import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import AdminTabs, { TabDefinition } from "./AdminTabs"

const tabs: TabDefinition[] = [
  { id: "overview", label: "Overview", testId: "tab-overview" },
  { id: "details", label: "Details", testId: "tab-details" },
  { id: "settings", label: "Settings", badge: 3, testId: "tab-settings" },
]

describe("AdminTabs", () => {
  it("renders all tab buttons", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Details")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })

  it("marks the active tab with aria-selected", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="details" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByTestId("tab-overview")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByTestId("tab-details")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("tab-settings")).toHaveAttribute("aria-selected", "false")
  })

  it("calls onTabChange when a tab is clicked", () => {
    const onTabChange = vi.fn()
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={onTabChange}>
        Content
      </AdminTabs>
    )

    fireEvent.click(screen.getByTestId("tab-details"))
    expect(onTabChange).toHaveBeenCalledWith("details")
  })

  it("renders badge counts", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("uses role=tablist on the nav container", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByRole("tablist")).toBeInTheDocument()
  })

  it("uses role=tab on each tab button", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    const tabButtons = screen.getAllByRole("tab")
    expect(tabButtons).toHaveLength(3)
  })

  it("renders children in a tabpanel", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        <div>Panel content</div>
      </AdminTabs>
    )

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel content")
  })

  it("applies data-testid to tab buttons", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByTestId("tab-overview")).toBeInTheDocument()
    expect(screen.getByTestId("tab-details")).toBeInTheDocument()
    expect(screen.getByTestId("tab-settings")).toBeInTheDocument()
  })

  it("applies active styling to the selected tab", () => {
    render(
      <AdminTabs tabs={tabs} activeTab="overview" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    expect(screen.getByTestId("tab-overview")).toHaveClass("border-admin-interactive")
    expect(screen.getByTestId("tab-details")).toHaveClass("border-transparent")
  })

  it("renders tabs without badges when not specified", () => {
    const noBadgeTabs: TabDefinition[] = [
      { id: "a", label: "Tab A" },
      { id: "b", label: "Tab B" },
    ]

    render(
      <AdminTabs tabs={noBadgeTabs} activeTab="a" onTabChange={() => {}}>
        Content
      </AdminTabs>
    )

    const tabButtons = screen.getAllByRole("tab")
    expect(tabButtons).toHaveLength(2)
    expect(screen.getByText("Tab A")).toBeInTheDocument()
    expect(screen.getByText("Tab B")).toBeInTheDocument()
  })
})
