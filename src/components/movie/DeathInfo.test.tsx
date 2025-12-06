import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import DeathInfo from "./DeathInfo"

describe("DeathInfo", () => {
  it("displays formatted death date", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    expect(screen.getByText("Jan 20, 1993")).toBeInTheDocument()
  })

  it("displays age at death when birthday is provided", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    expect(screen.getByText("Age 63")).toBeInTheDocument()
  })

  it("does not display age when birthday is null", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    expect(screen.queryByText(/Age/)).not.toBeInTheDocument()
  })

  it("displays cause of death without link when no wikipedia URL", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    expect(screen.getByText("colon cancer")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "colon cancer" })).not.toBeInTheDocument()
  })

  it("displays cause of death as link when wikipedia URL is provided", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Audrey_Hepburn"
      />
    )

    const link = screen.getByRole("link", { name: "colon cancer" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Audrey_Hepburn")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("displays cause unknown with Wikipedia link when no cause of death but URL exists", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
      />
    )

    expect(screen.getByText("(cause unknown)")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Wikipedia" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Some_Actor")
  })

  it("does not display Wikipedia link when cause of death is shown", () => {
    render(
      <DeathInfo
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
      />
    )

    // The cause of death IS a link, but there should not be a separate "Wikipedia" link
    expect(screen.queryByRole("link", { name: "Wikipedia" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "heart attack" })).toBeInTheDocument()
  })

  it("renders nothing extra when no cause or URL", () => {
    const { container } = render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    // Should only have the date
    expect(screen.getByText("Jan 1, 2000")).toBeInTheDocument()
    expect(container.querySelectorAll("a").length).toBe(0)
  })

  it("shows loading indicator when isLoading is true and no cause/wikipedia", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        isLoading={true}
      />
    )

    expect(screen.getByText(/Looking up cause/)).toBeInTheDocument()
  })

  it("does not show loading indicator when cause of death exists", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        isLoading={true}
      />
    )

    expect(screen.queryByText(/Looking up cause/)).not.toBeInTheDocument()
    expect(screen.getByText("heart attack")).toBeInTheDocument()
  })

  it("does not show loading indicator when wikipedia URL exists", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath={null}
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Test"
        isLoading={true}
      />
    )

    expect(screen.queryByText(/Looking up cause/)).not.toBeInTheDocument()
    expect(screen.getByText("(cause unknown)")).toBeInTheDocument()
  })

  it("shows info icon and dotted underline when details are present without wikipedia URL", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails="Suffered a massive coronary while playing tennis"
        wikipediaUrl={null}
      />
    )

    // Should show the info icon
    expect(screen.getByText("ⓘ")).toBeInTheDocument()
    // The cause text should have a title attribute with details
    const causeElement = screen.getByText("heart attack")
    expect(causeElement.closest("span")).toHaveAttribute(
      "title",
      "Suffered a massive coronary while playing tennis"
    )
  })

  it("shows info icon and title on link when details are present with wikipedia URL", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="lung cancer"
        causeOfDeathDetails="Was a heavy smoker for over 40 years"
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
      />
    )

    // Should show the info icon
    expect(screen.getByText("ⓘ")).toBeInTheDocument()
    // The link should have a title attribute with details
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("title", "Was a heavy smoker for over 40 years")
  })

  it("does not show info icon when details are null", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
      />
    )

    expect(screen.queryByText("ⓘ")).not.toBeInTheDocument()
  })

  it("does not show info icon when details are empty string", () => {
    render(
      <DeathInfo
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails=""
        wikipediaUrl={null}
      />
    )

    expect(screen.queryByText("ⓘ")).not.toBeInTheDocument()
  })
})
