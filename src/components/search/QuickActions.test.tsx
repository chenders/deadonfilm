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
    expect(screen.getByTestId("in-detail-btn")).toBeInTheDocument()
    expect(screen.getByTestId("covid-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("unnatural-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("causes-of-death-btn")).toBeInTheDocument()
    expect(screen.getByTestId("notable-deaths-btn")).toBeInTheDocument()
    expect(screen.getByTestId("deaths-by-decade-btn")).toBeInTheDocument()
  })

  it("displays correct button text", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("In Detail")).toBeInTheDocument()
    expect(screen.getByText("COVID-19")).toBeInTheDocument()
    expect(screen.getByText("Unnatural Deaths")).toBeInTheDocument()
    expect(screen.getByText("Causes of Death")).toBeInTheDocument()
    expect(screen.getByText("Notable Deaths")).toBeInTheDocument()
    expect(screen.getByText("Deaths by Decade")).toBeInTheDocument()
  })

  it("In Detail button links to /in-detail", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("in-detail-btn")
    expect(link).toHaveAttribute("href", "/in-detail")
  })

  it("has clipboard emoji for In Detail button", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("📋")).toBeInTheDocument()
  })

  it("displays tooltips explaining each button", () => {
    renderWithRouter(<QuickActions />)

    // Tooltips are rendered as spans with the tooltip text
    expect(
      screen.getByText("Actors with thoroughly researched death information")
    ).toBeInTheDocument()
    expect(screen.getByText("Actors who died from COVID-19")).toBeInTheDocument()
    expect(screen.getByText("Actors who died from unnatural causes")).toBeInTheDocument()
    expect(screen.getByText("Browse actors by cause of death")).toBeInTheDocument()
    expect(
      screen.getByText("Strange, disputed, and controversial celebrity deaths")
    ).toBeInTheDocument()
    expect(screen.getByText("Browse actors by decade of death")).toBeInTheDocument()
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

  it("Causes of Death button links to /causes-of-death", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("causes-of-death-btn")
    expect(link).toHaveAttribute("href", "/causes-of-death")
  })

  it("Causes of Death button has chart emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("📊")).toBeInTheDocument()
  })

  it("Notable Deaths button links to /deaths/notable", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("notable-deaths-btn")
    expect(link).toHaveAttribute("href", "/deaths/notable")
  })

  it("Notable Deaths button has magnifying glass emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("🔍")).toBeInTheDocument()
  })

  it("uses flex-wrap layout for discovery pills on desktop", () => {
    renderWithRouter(<QuickActions />)

    const container = screen.getByTestId("quick-actions")

    expect(container.className).toContain("md:flex")
    expect(container.className).toContain("md:flex-wrap")
    expect(container.className).toContain("md:justify-center")
  })

  it("all buttons have consistent styling for height", () => {
    renderWithRouter(<QuickActions />)

    const inDetailBtn = screen.getByTestId("in-detail-btn")
    const covidDeathsBtn = screen.getByTestId("covid-deaths-btn")
    const unnaturalDeathsBtn = screen.getByTestId("unnatural-deaths-btn")
    const causesOfDeathBtn = screen.getByTestId("causes-of-death-btn")
    const notableDeathsBtn = screen.getByTestId("notable-deaths-btn")
    const deathsByDecadeBtn = screen.getByTestId("deaths-by-decade-btn")

    // Verify all buttons have the same height-affecting CSS classes
    // Note: getBoundingClientRect() returns 0 in jsdom, so we test classes instead
    const heightClasses = ["py-1.5", "text-xs", "items-center"]

    const buttons = [
      inDetailBtn,
      covidDeathsBtn,
      unnaturalDeathsBtn,
      causesOfDeathBtn,
      notableDeathsBtn,
      deathsByDecadeBtn,
    ]
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

    const emojis = ["📋", "🦠", "⚠️", "📊", "🔍"]
    emojis.forEach((emoji) => {
      const emojiSpan = screen.getByText(emoji)
      emojiClasses.forEach((cls) => {
        expect(emojiSpan.className).toContain(cls)
      })
    })
  })

  it("Deaths by Decade button links to /deaths/decades", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("deaths-by-decade-btn")
    expect(link).toHaveAttribute("href", "/deaths/decades")
  })

  it("Deaths by Decade button has timeline icon", () => {
    renderWithRouter(<QuickActions />)

    const button = screen.getByTestId("deaths-by-decade-btn")
    // Check that the button contains an SVG element
    const svg = button.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })

  it("does not render short descriptions (removed for mobile declutter)", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.queryByText("Full death accounts")).not.toBeInTheDocument()
    expect(screen.queryByText("Actors lost to the pandemic")).not.toBeInTheDocument()
    expect(screen.queryByText("Accidents, murders, suicides")).not.toBeInTheDocument()
  })
})
