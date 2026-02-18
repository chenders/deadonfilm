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

  it("shows teaser collapsed with chevron toggle when long narrative exists", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser text",
      narrative: "This is a much longer narrative that exceeds 300 characters. " + "x".repeat(300),
    })
    render(<BiographySection biographyDetails={details} />)

    // Teaser is visible in collapsed state
    expect(screen.getByText("Short teaser text")).toBeInTheDocument()
    // Toggle chevron is present
    expect(screen.getByTestId("biography-toggle")).toBeInTheDocument()
    // Full narrative is not visible
    expect(screen.queryByText(/This is a much longer narrative/)).not.toBeInTheDocument()
  })

  it("expands to full narrative on header click", () => {
    const fullNarrative = "Full narrative content " + "x".repeat(300)
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: fullNarrative,
    })
    render(<BiographySection biographyDetails={details} />)

    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByText(fullNarrative)).toBeInTheDocument()
  })

  it("collapses back to teaser on second click", () => {
    const fullNarrative = "Full narrative content " + "x".repeat(300)
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: fullNarrative,
    })
    render(<BiographySection biographyDetails={details} />)

    fireEvent.click(screen.getByTestId("biography-toggle")) // expand
    expect(screen.getByText(fullNarrative)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("biography-toggle")) // collapse
    expect(screen.queryByText(fullNarrative)).not.toBeInTheDocument()
    expect(screen.getByText("Short teaser")).toBeInTheDocument()
  })

  it("sets aria-expanded correctly", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Teaser",
      narrative: "Full narrative " + "x".repeat(300),
    })
    render(<BiographySection biographyDetails={details} />)

    const toggle = screen.getByTestId("biography-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("renders full narrative directly when no teaser", () => {
    const details = makeBiographyDetails({
      narrative: "A narrative without a teaser version",
    })
    render(<BiographySection biographyDetails={details} />)

    // Shown directly with no toggle
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
    expect(screen.queryByText("Scholar")).not.toBeInTheDocument()
    expect(screen.queryByTestId("biography-factors")).not.toBeInTheDocument()
  })

  it("shows lesser-known facts when no expandable content", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      lesserKnownFacts: ["Was an amateur pilot", "Spoke four languages"],
    })
    render(<BiographySection biographyDetails={details} />)

    // No toggle (teaser-only, no long narrative) — facts always visible
    expect(screen.getByText("Was an amateur pilot")).toBeInTheDocument()
    expect(screen.getByText("Spoke four languages")).toBeInTheDocument()
    expect(screen.getByTestId("biography-facts")).toBeInTheDocument()
  })

  it("hides lesser-known facts when collapsed and shows when expanded", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: "Full narrative " + "x".repeat(300),
      lesserKnownFacts: ["Was an amateur pilot"],
    })
    render(<BiographySection biographyDetails={details} />)

    // Collapsed — facts hidden
    expect(screen.queryByTestId("biography-facts")).not.toBeInTheDocument()

    // Expand — facts visible
    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByTestId("biography-facts")).toBeInTheDocument()
    expect(screen.getByText("Was an amateur pilot")).toBeInTheDocument()
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

  it("shows biography sources when no expandable content", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Actor",
          type: "wikipedia-bio",
          publication: "Wikipedia",
          articleTitle: "Actor - Wikipedia",
          confidence: 0.9,
          retrievedAt: "2026-01-01T00:00:00Z",
        },
        {
          url: "https://www.biography.com/actors/actor",
          type: "biography-com",
          publication: "Biography.com",
          articleTitle: null,
          confidence: 0.8,
          retrievedAt: "2026-01-01T00:00:00Z",
        },
      ],
    })
    render(<BiographySection biographyDetails={details} />)

    // Sources visible (no expandable content — always shown)
    expect(screen.getByTestId("sources-sources")).toBeInTheDocument()
    expect(screen.getByText("Actor - Wikipedia")).toBeInTheDocument()
    // Falls back to publication when articleTitle is null
    expect(screen.getByText("Biography.com")).toBeInTheDocument()
  })

  it("hides sources when collapsed and shows when expanded", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Short teaser",
      narrative: "Full narrative " + "x".repeat(300),
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Actor",
          type: "wikipedia-bio",
          publication: "Wikipedia",
          articleTitle: "Actor - Wikipedia",
          confidence: 0.9,
          retrievedAt: "2026-01-01T00:00:00Z",
        },
      ],
    })
    render(<BiographySection biographyDetails={details} />)

    // Collapsed — sources hidden
    expect(screen.queryByTestId("sources-sources")).not.toBeInTheDocument()

    // Expand — sources visible
    fireEvent.click(screen.getByTestId("biography-toggle"))
    expect(screen.getByTestId("sources-sources")).toBeInTheDocument()
    expect(screen.getByText("Actor - Wikipedia")).toBeInTheDocument()
  })

  it("does not show sources when sources is null", () => {
    const details = makeBiographyDetails({
      narrativeTeaser: "Bio text",
      sources: null,
    })
    render(<BiographySection biographyDetails={details} />)
    expect(screen.queryByTestId("sources-sources")).not.toBeInTheDocument()
  })
})
