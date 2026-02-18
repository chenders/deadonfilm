import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import BiographySection from "./BiographySection"
import type { BiographyDetails } from "@/types/actor"

function makeBiographyDetails(overrides: Partial<BiographyDetails> = {}): BiographyDetails {
  return {
    narrativeTeaser: null,
    narrative: null,
    narrativeConfidence: null,
    lifeNotableFactors: [],
    birthplaceDetails: null,
    familyBackground: null,
    education: null,
    preFameLife: null,
    fameCatalyst: null,
    personalStruggles: null,
    relationships: null,
    lesserKnownFacts: [],
    sources: null,
    ...overrides,
  }
}

describe("BiographySection", () => {
  it("renders nothing when no biography at all", () => {
    const { container } = render(<BiographySection />)
    expect(container.innerHTML).toBe("")
  })

  it("falls back to old biography when no enriched data", () => {
    render(<BiographySection biography="Old bio text" />)
    expect(screen.getByText("Old bio text")).toBeInTheDocument()
    expect(screen.getByTestId("biography-section")).toBeInTheDocument()
  })

  it("shows source link with correct display name for fallback biography", () => {
    render(
      <BiographySection
        biography="Bio text"
        biographySourceUrl="https://en.wikipedia.org/wiki/Actor"
        biographySourceType="wikipedia"
      />
    )
    const link = screen.getByText(/Read more on Wikipedia/)
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Actor")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("shows generic source name when biographySourceType is null", () => {
    render(
      <BiographySection
        biography="Bio text"
        biographySourceUrl="https://example.com"
        biographySourceType={null}
      />
    )
    expect(screen.getByText(/Read more on source/)).toBeInTheDocument()
  })

  it("does not show source link when biographySourceUrl is null", () => {
    render(<BiographySection biography="Bio text" />)
    expect(screen.queryByText(/Read more on/)).not.toBeInTheDocument()
  })

  it("renders narrative teaser with Show more button", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser text",
      narrative: "This is a much longer narrative that exceeds 300 characters. " + "x".repeat(300),
      narrativeConfidence: "high",
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.getByText("Short teaser text")).toBeInTheDocument()
    expect(screen.getByTestId("biography-toggle")).toHaveTextContent("Show more")
  })

  it("expands to full narrative on Show more click", () => {
    const fullNarrative = "Full narrative content " + "x".repeat(300)
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: fullNarrative,
      narrativeConfidence: "high",
    })
    render(<BiographySection biographyDetails={details} />)
    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByText(fullNarrative)).toBeInTheDocument()
    expect(screen.getByTestId("biography-toggle")).toHaveTextContent("Show less")
  })

  it("collapses back on Show less click", () => {
    const fullNarrative = "Full narrative content " + "x".repeat(300)
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: fullNarrative,
      narrativeConfidence: "high",
    })
    render(<BiographySection biographyDetails={details} />)
    // Expand
    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByText(fullNarrative)).toBeInTheDocument()
    // Collapse
    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByText("Short teaser")).toBeInTheDocument()
    expect(screen.getByTestId("biography-toggle")).toHaveTextContent("Show more")
  })

  it("renders full narrative when no teaser", () => {
    const details = makeBiographyDetails({
      narrative: "A narrative without a teaser version",
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.getByText("A narrative without a teaser version")).toBeInTheDocument()
    expect(screen.queryByTestId("biography-toggle")).not.toBeInTheDocument()
  })

  it("renders full narrative directly when short (< 300 chars)", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: "Short narrative",
    })
    render(<BiographySection biographyDetails={details} />)
    // Short narrative shown directly, no toggle
    expect(screen.getByText("Short narrative")).toBeInTheDocument()
    expect(screen.queryByTestId("biography-toggle")).not.toBeInTheDocument()
  })

  it("renders teaser only when narrative is null", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Just a teaser, no full narrative",
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.getByText("Just a teaser, no full narrative")).toBeInTheDocument()
    expect(screen.queryByTestId("biography-toggle")).not.toBeInTheDocument()
  })

  it("splits narrative into paragraphs on double newlines", () => {
    const details = makeBiographyDetails({
      narrative: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.getByText("Paragraph one.")).toBeInTheDocument()
    expect(screen.getByText("Paragraph two.")).toBeInTheDocument()
    expect(screen.getByText("Paragraph three.")).toBeInTheDocument()
  })

  it("does not display life notable factors (shown in actor page header instead)", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      lifeNotableFactors: ["military_service", "scholar"],
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.queryByText("Military Service")).not.toBeInTheDocument()
    expect(screen.queryByTestId("biography-factors")).not.toBeInTheDocument()
  })

  it("displays lesser-known facts", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      lesserKnownFacts: ["Was an amateur pilot", "Spoke four languages"],
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.getByText("Was an amateur pilot")).toBeInTheDocument()
    expect(screen.getByText("Spoke four languages")).toBeInTheDocument()
    expect(screen.getByTestId("biography-facts")).toBeInTheDocument()
  })

  it("does not show factors section when empty", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      lifeNotableFactors: [],
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.queryByTestId("biography-factors")).not.toBeInTheDocument()
  })

  it("does not show facts section when empty", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      lesserKnownFacts: [],
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.queryByTestId("biography-facts")).not.toBeInTheDocument()
  })

  it("prefers enriched biography over old biography", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Enriched teaser",
    })
    render(<BiographySection biography="Old bio text" biographyDetails={details} />)
    expect(screen.getByText("Enriched teaser")).toBeInTheDocument()
    expect(screen.queryByText("Old bio text")).not.toBeInTheDocument()
  })

  it("renders nothing when biographyDetails has no narrative or teaser", () => {
    const details = makeBiographyDetails({
      lifeNotableFactors: ["scholar"],
      lesserKnownFacts: ["Some fact"],
    })
    const { container } = render(<BiographySection biographyDetails={details} />)
    expect(container.innerHTML).toBe("")
  })
})
