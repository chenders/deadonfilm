import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import DeathInfo from "./DeathInfo"

// Mock the New Relic tracking function
vi.mock("@/hooks/useNewRelicBrowser", () => ({
  trackPageAction: vi.fn(),
}))

const defaultTmdbUrl = "https://www.themoviedb.org/person/12345"
const defaultActorName = "Test Actor"

describe("DeathInfo", () => {
  it("displays formatted death date", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText("Jan 20, 1993")).toBeInTheDocument()
  })

  it("displays age at death when birthday is provided", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText("Age 63")).toBeInTheDocument()
  })

  it("does not display age when birthday is null", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.queryByText(/Age/)).not.toBeInTheDocument()
  })

  it("displays cause of death as TMDB link when no wikipedia URL", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    const link = screen.getByRole("link", { name: "Colon Cancer" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", defaultTmdbUrl)
  })

  it("displays cause of death as Wikipedia link when wikipedia URL is provided", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Audrey_Hepburn"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    const link = screen.getByRole("link", { name: "Colon Cancer" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Audrey_Hepburn")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("displays cause unknown with Wikipedia link when no cause of death but URL exists", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText("(cause unknown)")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Wikipedia" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Some_Actor")
  })

  it("displays cause unknown with TMDB link when no cause or wikipedia URL", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText("(cause unknown)")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "TMDB" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", defaultTmdbUrl)
  })

  it("does not display Wikipedia link when cause of death is shown", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // The cause of death IS a link, but there should not be a separate "Wikipedia" link
    expect(screen.queryByRole("link", { name: "Wikipedia" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Heart Attack" })).toBeInTheDocument()
  })

  it("shows loading indicator when isLoading is true and no cause/wikipedia", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
        isLoading={true}
      />
    )

    expect(screen.getByText(/Looking up cause/)).toBeInTheDocument()
  })

  it("does not show loading indicator when cause of death exists", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
        isLoading={true}
      />
    )

    expect(screen.queryByText(/Looking up cause/)).not.toBeInTheDocument()
    expect(screen.getByText("Heart Attack")).toBeInTheDocument()
  })

  it("does not show loading indicator when wikipedia URL exists", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Test"
        tmdbUrl={defaultTmdbUrl}
        isLoading={true}
      />
    )

    expect(screen.queryByText(/Looking up cause/)).not.toBeInTheDocument()
    expect(screen.getByText("(cause unknown)")).toBeInTheDocument()
  })

  it("shows info icon and dotted underline when details are present with TMDB link", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails="Suffered a massive coronary while playing tennis"
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Should show the info icon (SVG)
    const triggerSpan = screen.getByTestId("death-details-trigger")
    expect(triggerSpan.querySelector("svg")).toBeInTheDocument()
    // The trigger should be wrapped in HoverTooltip which has the styling classes
    const tooltipWrapper = triggerSpan.parentElement
    expect(tooltipWrapper).toHaveClass("underline", "decoration-dotted", "cursor-help")
  })

  it("shows info icon and tooltip trigger when details are present with wikipedia URL", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="lung cancer"
        causeOfDeathDetails="Was a heavy smoker for over 40 years"
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Should show the info icon (SVG)
    const triggerSpan = screen.getByTestId("death-details-trigger")
    expect(triggerSpan.querySelector("svg")).toBeInTheDocument()
    // The trigger should be wrapped in HoverTooltip which has the styling classes
    const tooltipWrapper = triggerSpan.parentElement
    expect(tooltipWrapper).toHaveClass("underline", "decoration-dotted", "cursor-help")
  })

  it("does not show info icon when details are null", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    const causeLink = screen.getByText("Heart Attack")
    expect(causeLink.closest("a")).toBeInTheDocument()
    expect(causeLink.closest("p")?.querySelector("svg")).not.toBeInTheDocument()
  })

  it("does not show info icon when details are empty string", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails=""
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    const causeLink = screen.getByText("Heart Attack")
    expect(causeLink.closest("a")).toBeInTheDocument()
    expect(causeLink.closest("p")?.querySelector("svg")).not.toBeInTheDocument()
  })

  it("renders tooltip with long details text without truncation", async () => {
    const user = userEvent.setup()
    const longDetails =
      "This is a very long cause of death details text that would previously have been truncated with an ellipsis. " +
      "It contains multiple sentences describing the circumstances of the death in great detail. " +
      "The tooltip should now display all of this text without any truncation, allowing users to scroll if needed. " +
      "This ensures that important information about the cause of death is never hidden from users who want to learn more."

    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="complications from surgery"
        causeOfDeathDetails={longDetails}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Hover over the cause to show tooltip
    const causeText = screen.getByText("Complications From Surgery")
    await user.hover(causeText)

    // Verify the full long text is rendered in the tooltip (not truncated)
    expect(screen.getByText(longDetails)).toBeInTheDocument()
  })

  it("displays years lost when positive (died early)", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday="1960-01-01"
        ageAtDeath={null}
        yearsLost={15.5}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText(/16 years early/)).toBeInTheDocument()
  })

  it("displays years gained when negative (lived longer)", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday="1920-01-01"
        ageAtDeath={null}
        yearsLost={-12.3}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText(/12 years longer/)).toBeInTheDocument()
  })

  it("displays around expected when yearsLost is near zero", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday="1930-01-01"
        ageAtDeath={null}
        yearsLost={0.3}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.getByText(/around expected/)).toBeInTheDocument()
  })

  it("renders lifespan bar with fixed width when all required props provided", () => {
    const { container } = render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday="1960-01-01"
        ageAtDeath={40}
        yearsLost={35}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Find the lifespan bar container by its classes
    const lifespanBarContainer = container.querySelector(".w-40.ml-auto")
    expect(lifespanBarContainer).toBeInTheDocument()
    // Verify it contains the bar visualization
    expect(lifespanBarContainer?.querySelector(".rounded-full.bg-gray-200")).toBeInTheDocument()
  })

  it("does not render lifespan bar when ageAtDeath is null and birthday unavailable", () => {
    const { container } = render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={35}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Lifespan bar should not be rendered when age cannot be determined
    expect(container.querySelector(".w-40.ml-auto")).not.toBeInTheDocument()
  })

  it("does not render lifespan bar when yearsLost is null", () => {
    const { container } = render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday="1960-01-01"
        ageAtDeath={40}
        yearsLost={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Lifespan bar should not be rendered
    expect(container.querySelector(".w-40.ml-auto")).not.toBeInTheDocument()
  })

  it("tracks view_death_details event when tooltip is opened", async () => {
    const { trackPageAction } = await import("@/hooks/useNewRelicBrowser")
    const user = userEvent.setup()

    render(
      <DeathInfo
        actorName="John Smith"
        deathday="2000-01-01"
        birthday={null}
        ageAtDeath={null}
        yearsLost={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails="Suffered a heart attack at home"
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Hover over the cause to open tooltip
    const causeText = screen.getByText("Heart Attack")
    await user.hover(causeText)

    // Verify tracking was called with correct parameters
    expect(trackPageAction).toHaveBeenCalledWith("view_death_details", {
      actorName: "John Smith",
      causeOfDeath: "heart attack",
    })
  })
})
