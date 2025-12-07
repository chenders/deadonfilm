import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import DeathInfo from "./DeathInfo"

const defaultTmdbUrl = "https://www.themoviedb.org/person/12345"
const defaultActorName = "Test Actor"

describe("DeathInfo", () => {
  it("displays formatted death date", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
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
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    const link = screen.getByRole("link", { name: "colon cancer" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", defaultTmdbUrl)
  })

  it("displays cause of death as Wikipedia link when wikipedia URL is provided", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
        causeOfDeath="colon cancer"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Audrey_Hepburn"
        tmdbUrl={defaultTmdbUrl}
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
        actorName={defaultActorName}
        deathday="1993-01-20"
        birthday="1929-05-04"
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
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // The cause of death IS a link, but there should not be a separate "Wikipedia" link
    expect(screen.queryByRole("link", { name: "Wikipedia" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "heart attack" })).toBeInTheDocument()
  })

  it("shows loading indicator when isLoading is true and no cause/wikipedia", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
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
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
        isLoading={true}
      />
    )

    expect(screen.queryByText(/Looking up cause/)).not.toBeInTheDocument()
    expect(screen.getByText("heart attack")).toBeInTheDocument()
  })

  it("does not show loading indicator when wikipedia URL exists", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
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
        causeOfDeath="heart attack"
        causeOfDeathDetails="Suffered a massive coronary while playing tennis"
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Should show the info icon
    expect(screen.getByText("ⓘ")).toBeInTheDocument()
    // The cause text should be in a span with tooltip trigger styling (not a link when details present)
    const causeText = screen.getByText("heart attack")
    expect(causeText.closest("span")).toHaveClass("underline", "decoration-dotted", "cursor-help")
  })

  it("shows info icon and tooltip trigger when details are present with wikipedia URL", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="lung cancer"
        causeOfDeathDetails="Was a heavy smoker for over 40 years"
        wikipediaUrl="https://en.wikipedia.org/wiki/Some_Actor"
        tmdbUrl={defaultTmdbUrl}
      />
    )

    // Should show the info icon
    expect(screen.getByText("ⓘ")).toBeInTheDocument()
    // The cause text should be in a span with tooltip styling (no link when details present)
    const causeText = screen.getByText("lung cancer")
    expect(causeText.closest("span")).toHaveClass("underline", "decoration-dotted", "cursor-help")
  })

  it("does not show info icon when details are null", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails={null}
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.queryByText("ⓘ")).not.toBeInTheDocument()
  })

  it("does not show info icon when details are empty string", () => {
    render(
      <DeathInfo
        actorName={defaultActorName}
        deathday="2000-01-01"
        birthday={null}
        causeOfDeath="heart attack"
        causeOfDeathDetails=""
        wikipediaUrl={null}
        tmdbUrl={defaultTmdbUrl}
      />
    )

    expect(screen.queryByText("ⓘ")).not.toBeInTheDocument()
  })
})
