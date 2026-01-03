import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import QuickActions from "./QuickActions"

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

describe("QuickActions", () => {
  it("renders all action buttons", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByTestId("quick-actions")).toBeInTheDocument()
    expect(screen.getByTestId("forever-young-btn")).toBeInTheDocument()
    expect(screen.getByTestId("covid-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("unnatural-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("death-watch-btn")).toBeInTheDocument()
  })

  it("displays correct button text", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("Forever Young")).toBeInTheDocument()
    expect(screen.getByText("COVID-19")).toBeInTheDocument()
    expect(screen.getByText("Unnatural Deaths")).toBeInTheDocument()
    expect(screen.getByText("Death Watch")).toBeInTheDocument()
  })

  it("Forever Young button links to /forever-young", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("forever-young-btn")
    expect(link).toHaveAttribute("href", "/forever-young")
  })

  it("has angel emoji for Forever Young button", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("👼")).toBeInTheDocument()
  })

  it("displays tooltips explaining each button", () => {
    renderWithRouter(<QuickActions />)

    // Tooltips are rendered as spans with the tooltip text
    expect(
      screen.getByText("Movies featuring actors who died tragically young")
    ).toBeInTheDocument()
    expect(screen.getByText("Actors who died from COVID-19")).toBeInTheDocument()
    expect(screen.getByText("Actors who died from unnatural causes")).toBeInTheDocument()
    expect(screen.getByText("Living actors most likely to die soon")).toBeInTheDocument()
  })

  it("COVID-19 button links to /covid-deaths", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("covid-deaths-btn")
    expect(link).toHaveAttribute("href", "/covid-deaths")
  })

  it("COVID-19 button has microbe emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("🦠")).toBeInTheDocument()
  })

  it("Unnatural Deaths button links to /unnatural-deaths", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("unnatural-deaths-btn")
    expect(link).toHaveAttribute("href", "/unnatural-deaths")
  })

  it("Unnatural Deaths button has warning emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("⚠️")).toBeInTheDocument()
  })

  it("Death Watch button links to /death-watch", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("death-watch-btn")
    expect(link).toHaveAttribute("href", "/death-watch")
  })

  it("Death Watch button has hourglass emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("⏳")).toBeInTheDocument()
  })

  it("uses flex-wrap layout with max-width to limit buttons per row", () => {
    renderWithRouter(<QuickActions />)

    const container = screen.getByTestId("quick-actions")

    // Verify flex layout with wrapping and centered content
    expect(container.className).toContain("flex")
    expect(container.className).toContain("flex-wrap")
    expect(container.className).toContain("justify-center")
    expect(container.className).toContain("gap-2")
    // Max-width ensures buttons wrap to max 4 per row on wide screens
    expect(container.className).toContain("max-w-xl")
  })

  it("all buttons have consistent styling for height", () => {
    renderWithRouter(<QuickActions />)

    const foreverYoungBtn = screen.getByTestId("forever-young-btn")
    const covidDeathsBtn = screen.getByTestId("covid-deaths-btn")
    const unnaturalDeathsBtn = screen.getByTestId("unnatural-deaths-btn")
    const deathWatchBtn = screen.getByTestId("death-watch-btn")

    // Verify all buttons have the same height-affecting CSS classes
    // Note: getBoundingClientRect() returns 0 in jsdom, so we test classes instead
    const heightClasses = ["py-1.5", "text-xs", "items-center"]

    const buttons = [foreverYoungBtn, covidDeathsBtn, unnaturalDeathsBtn, deathWatchBtn]
    buttons.forEach((btn) => {
      heightClasses.forEach((cls) => {
        expect(btn.className).toContain(cls)
      })
    })
  })

  it("all emoji spans have consistent styling to ensure equal button heights", () => {
    renderWithRouter(<QuickActions />)

    // Each button's emoji should use the same emojiClass for consistent sizing
    const emojiClasses = ["text-base", "leading-none"]

    const emojis = ["👼", "🦠", "⚠️", "⏳"]
    emojis.forEach((emoji) => {
      const emojiSpan = screen.getByText(emoji)
      emojiClasses.forEach((cls) => {
        expect(emojiSpan.className).toContain(cls)
      })
    })
  })
})
