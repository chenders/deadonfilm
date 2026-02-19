import { describe, it, expect } from "vitest"
import { sanitizeSourceText } from "./sanitize-source-text.js"

describe("sanitizeSourceText", () => {
  it("removes citation markers without spaces", () => {
    const input = "He died on May 29, 1997[1] at the age of 30.[2]"
    const result = sanitizeSourceText(input)
    expect(result).toBe("He died on May 29, 1997 at the age of 30.")
  })

  it("removes citation markers with spaces", () => {
    const input = "He died on May 29, 1997[ 1 ] at the age of 30.[ 2 ]"
    const result = sanitizeSourceText(input)
    expect(result).toBe("He died on May 29, 1997 at the age of 30.")
  })

  it("removes [edit] tags", () => {
    const input = "Death [edit]\nHe drowned in the river."
    const result = sanitizeSourceText(input)
    expect(result).toContain("Death")
    expect(result).not.toContain("[edit]")
    expect(result).toContain("He drowned in the river.")
  })

  it("removes [citation needed] and similar tags", () => {
    const input =
      "He was born in 1966[citation needed] and attended school[clarification needed] in California."
    const result = sanitizeSourceText(input)
    expect(result).not.toContain("[citation needed]")
    expect(result).not.toContain("[clarification needed]")
    expect(result).toContain("He was born in 1966")
    expect(result).toContain("in California.")
  })

  it("removes Wikipedia footnote blocks", () => {
    const input = `He died of drowning.

^ Gourley, Matt (December 4, 2018). "Jeff Buckley: The Story Behind Grace". Rolling Stone.
^ Smith, John (2020). "A Tribute". New York Times.

He was 30 years old.`

    const result = sanitizeSourceText(input)
    expect(result).not.toContain("Gourley")
    expect(result).not.toContain("Smith, John")
    expect(result).toContain("He died of drowning.")
    expect(result).toContain("He was 30 years old.")
  })

  it("removes navigation-like pipe-separated text", () => {
    const input = `News | Sports | Weather | Entertainment
The actor died at home.`

    const result = sanitizeSourceText(input)
    expect(result).not.toContain("News | Sports")
    expect(result).toContain("The actor died at home.")
  })

  it("removes boilerplate phrases", () => {
    const input = `The actor died at home.
Sign up for our newsletter to get more stories
Cookie Policy and Terms of Service apply
He was survived by his wife.`

    const result = sanitizeSourceText(input)
    expect(result).not.toContain("Sign up")
    expect(result).not.toContain("Cookie Policy")
    expect(result).toContain("The actor died at home.")
    expect(result).toContain("He was survived by his wife.")
  })

  it("collapses excessive whitespace", () => {
    const input = "Line one.\n\n\n\n\nLine two.\n\n\n\n\nLine three."
    const result = sanitizeSourceText(input)
    // Empty lines are removed by the filter step, leaving single newlines
    expect(result).toBe("Line one.\nLine two.\nLine three.")
  })

  it("preserves normal article text with single newline separation", () => {
    const input = `Jeff Buckley was an American singer-songwriter who drowned in the Wolf River Harbor on May 29, 1997. He was 30 years old at the time of his death.
Buckley had gone swimming in the harbor while fully clothed and singing. A friend who was with him said that Buckley appeared to be in good spirits.
His body was recovered from the river several days later. The medical examiner ruled the death an accidental drowning.`

    const result = sanitizeSourceText(input)
    expect(result).toBe(input)
  })

  it("handles empty and whitespace-only input", () => {
    expect(sanitizeSourceText("")).toBe("")
    expect(sanitizeSourceText("   ")).toBe("")
    expect(sanitizeSourceText("\n\n\n")).toBe("")
  })

  it("removes [needs update] and [verification needed]", () => {
    const input = "He appeared in 50 films[needs update] during his career[verification needed]."
    const result = sanitizeSourceText(input)
    expect(result).not.toContain("[needs update]")
    expect(result).not.toContain("[verification needed]")
  })
})
