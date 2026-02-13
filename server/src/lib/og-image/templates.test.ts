import { describe, it, expect } from "vitest"
import {
  movieTemplate,
  actorTemplate,
  showTemplate,
  OG_WIDTH,
  OG_HEIGHT,
} from "./templates.js"

describe("OG image templates", () => {
  describe("movieTemplate", () => {
    it("renders with full data", () => {
      const result = movieTemplate({
        title: "The Godfather",
        year: 1972,
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        posterBase64: "data:image/jpeg;base64,/9j/4AAQ...",
        deceasedCount: 8,
        totalCast: 15,
      }) as any

      expect(result.type).toBe("div")
      expect(result.props.style.width).toBe(OG_WIDTH)
      expect(result.props.style.height).toBe(OG_HEIGHT)

      // Should contain poster image
      const posterChild = result.props.children[0]
      expect(posterChild.type).toBe("img")
      expect(posterChild.props.src).toBe("data:image/jpeg;base64,/9j/4AAQ...")

      // Should contain title text
      const textSection = result.props.children[1]
      const titleGroup = textSection.props.children[0]
      const titleEl = titleGroup.props.children[0]
      expect(titleEl.props.children).toBe("The Godfather (1972)")
    })

    it("renders without poster", () => {
      const result = movieTemplate({
        title: "Unknown Film",
        year: null,
        posterUrl: null,
        posterBase64: null,
        deceasedCount: 0,
        totalCast: 0,
      }) as any

      // Fallback poster placeholder
      const posterChild = result.props.children[0]
      expect(posterChild.type).toBe("div")
      expect(posterChild.props.children.props.children).toBe("🎬")
    })

    it("calculates mortality percentage", () => {
      const result = movieTemplate({
        title: "Test Movie",
        year: 2000,
        posterUrl: null,
        posterBase64: null,
        deceasedCount: 6,
        totalCast: 10,
      }) as any

      // Navigate to mortality stats section
      const textSection = result.props.children[1]
      const contentGroup = textSection.props.children[0]
      const statsGroup = contentGroup.props.children[1]
      const percentageEl = statsGroup.props.children[0]
      expect(percentageEl.props.children).toBe("60%")
    })
  })

  describe("actorTemplate", () => {
    it("renders deceased actor", () => {
      const result = actorTemplate({
        name: "Marlon Brando",
        profileUrl: null,
        profileBase64: "data:image/jpeg;base64,abc123",
        birthYear: "1924",
        deathYear: "2004",
        causeOfDeath: "Respiratory failure",
        isDeceased: true,
      }) as any

      expect(result.props.style.width).toBe(OG_WIDTH)

      // Profile image
      const profileChild = result.props.children[0]
      expect(profileChild.type).toBe("img")

      // Text content
      const textSection = result.props.children[1]
      const contentGroup = textSection.props.children[0]
      const nameEl = contentGroup.props.children[0]
      expect(nameEl.props.children).toBe("Marlon Brando")
    })

    it("renders living actor", () => {
      const result = actorTemplate({
        name: "Al Pacino",
        profileUrl: null,
        profileBase64: null,
        birthYear: "1940",
        deathYear: null,
        causeOfDeath: null,
        isDeceased: false,
      }) as any

      const textSection = result.props.children[1]
      const contentGroup = textSection.props.children[0]

      // Check lifespan shows "Born 1940"
      const lifeSpanEl = contentGroup.props.children[1]
      expect(lifeSpanEl.props.children).toBe("Born 1940")
    })

    it("renders without profile photo", () => {
      const result = actorTemplate({
        name: "Unknown Actor",
        profileUrl: null,
        profileBase64: null,
        birthYear: null,
        deathYear: null,
        causeOfDeath: null,
        isDeceased: false,
      }) as any

      // Fallback profile placeholder
      const profileChild = result.props.children[0]
      expect(profileChild.type).toBe("div")
      expect(profileChild.props.children.props.children).toBe("👤")
    })
  })

  describe("showTemplate", () => {
    it("renders with full data", () => {
      const result = showTemplate({
        name: "Breaking Bad",
        year: 2008,
        posterUrl: null,
        posterBase64: "data:image/jpeg;base64,def456",
        deceasedCount: 3,
        totalCast: 12,
      }) as any

      expect(result.props.style.width).toBe(OG_WIDTH)

      const textSection = result.props.children[1]
      const contentGroup = textSection.props.children[0]
      const titleEl = contentGroup.props.children[0]
      expect(titleEl.props.children).toBe("Breaking Bad (2008)")

      // Should have "TV SERIES" label
      const tvLabel = contentGroup.props.children[1]
      expect(tvLabel.props.children).toBe("TV SERIES")
    })
  })

  describe("dimensions", () => {
    it("exports correct OG dimensions", () => {
      expect(OG_WIDTH).toBe(1200)
      expect(OG_HEIGHT).toBe(630)
    })
  })
})
