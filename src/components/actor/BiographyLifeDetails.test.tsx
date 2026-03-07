import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import BiographyLifeDetails from "./BiographyLifeDetails"
import type { BiographyDetails } from "@/types/actor"

function makeBioDetails(overrides: Partial<BiographyDetails> = {}): BiographyDetails {
  return {
    narrative: "Test narrative",
    narrativeConfidence: "high",
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
    alternateNames: [],
    gender: null,
    nationality: null,
    occupations: [],
    awards: [],
    ...overrides,
  }
}

describe("BiographyLifeDetails", () => {
  it("renders nothing when all fields are null", () => {
    const { container } = render(<BiographyLifeDetails biographyDetails={makeBioDetails()} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when all fields are empty strings", () => {
    const { container } = render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          birthplaceDetails: "",
          familyBackground: "   ",
          education: "",
        })}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders birthplaceDetails when present", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          birthplaceDetails: "Born in rural Iowa, near a small farming community",
        })}
      />
    )
    expect(screen.getByText("Birthplace & Upbringing:")).toBeInTheDocument()
    expect(
      screen.getByText("Born in rural Iowa, near a small farming community")
    ).toBeInTheDocument()
  })

  it("renders familyBackground when present", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          familyBackground: "His father owned a hardware store",
        })}
      />
    )
    expect(screen.getByText("Family:")).toBeInTheDocument()
    expect(screen.getByText("His father owned a hardware store")).toBeInTheDocument()
  })

  it("renders education when present", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          education: "Attended Princeton University",
        })}
      />
    )
    expect(screen.getByText("Education:")).toBeInTheDocument()
    expect(screen.getByText("Attended Princeton University")).toBeInTheDocument()
  })

  it("renders multiple fields", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          birthplaceDetails: "Small town in Texas",
          education: "Local high school, then Yale",
          relationships: "Married twice, three children",
        })}
      />
    )
    expect(screen.getByText("Birthplace & Upbringing:")).toBeInTheDocument()
    expect(screen.getByText("Education:")).toBeInTheDocument()
    expect(screen.getByText("Relationships:")).toBeInTheDocument()
    // Skipped fields should not appear
    expect(screen.queryByText("Family:")).not.toBeInTheDocument()
    expect(screen.queryByText("Before Fame:")).not.toBeInTheDocument()
  })

  it("renders preFameLife and fameCatalyst", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          preFameLife: "Worked as a carpenter",
          fameCatalyst: "A chance audition changed everything",
        })}
      />
    )
    expect(screen.getByText("Before Fame:")).toBeInTheDocument()
    expect(screen.getByText("Rise to Fame:")).toBeInTheDocument()
  })

  it("renders personalStruggles when present", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          personalStruggles: "Struggled with addiction in the 1980s",
        })}
      />
    )
    expect(screen.getByText("Personal Struggles:")).toBeInTheDocument()
  })

  it("has the correct test id", () => {
    render(
      <BiographyLifeDetails
        biographyDetails={makeBioDetails({
          birthplaceDetails: "Test location",
        })}
      />
    )
    expect(screen.getByTestId("biography-life-details")).toBeInTheDocument()
  })
})
