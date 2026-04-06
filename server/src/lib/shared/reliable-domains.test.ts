import { describe, it, expect } from "vitest"
import {
  RELIABLE_DOMAINS,
  extractDomain,
  isReliableDomain,
  isReliableSourceUrl,
} from "./reliable-domains.js"

// ── RELIABLE_DOMAINS contents ─────────────────────────────────────────────────

describe("RELIABLE_DOMAINS", () => {
  it("contains Tier 1 News domains", () => {
    expect(RELIABLE_DOMAINS.has("theguardian.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("nytimes.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("bbc.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("bbc.co.uk")).toBe(true)
    expect(RELIABLE_DOMAINS.has("apnews.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("reuters.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("washingtonpost.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("latimes.com")).toBe(true)
  })

  it("contains Trade Press domains", () => {
    expect(RELIABLE_DOMAINS.has("variety.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("deadline.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("hollywoodreporter.com")).toBe(true)
  })

  it("contains Quality Publication domains", () => {
    expect(RELIABLE_DOMAINS.has("newyorker.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("theatlantic.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("smithsonianmag.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("rollingstone.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("vanityfair.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("time.com")).toBe(true)
    expect(RELIABLE_DOMAINS.has("telegraph.co.uk")).toBe(true)
    expect(RELIABLE_DOMAINS.has("independent.co.uk")).toBe(true)
    expect(RELIABLE_DOMAINS.has("npr.org")).toBe(true)
    expect(RELIABLE_DOMAINS.has("pbs.org")).toBe(true)
  })

  it("does NOT contain lower-reliability domains", () => {
    // MARGINAL_EDITORIAL (0.65)
    expect(RELIABLE_DOMAINS.has("people.com")).toBe(false)
    // UNRELIABLE_FAST (0.5)
    expect(RELIABLE_DOMAINS.has("tmz.com")).toBe(false)
    // User-generated content / social
    expect(RELIABLE_DOMAINS.has("reddit.com")).toBe(false)
    // SECONDARY_COMPILATION (0.85) — just below threshold
    expect(RELIABLE_DOMAINS.has("wikipedia.org")).toBe(false)
    // Arbitrary blog
    expect(RELIABLE_DOMAINS.has("someblog.com")).toBe(false)
  })
})

// ── extractDomain ─────────────────────────────────────────────────────────────

describe("extractDomain", () => {
  it("strips www. prefix from hostname", () => {
    expect(extractDomain("https://www.theguardian.com/film/article")).toBe("theguardian.com")
  })

  it("returns bare hostname when no www. present", () => {
    expect(extractDomain("https://apnews.com/article/123")).toBe("apnews.com")
  })

  it("handles subdomains other than www", () => {
    expect(extractDomain("https://edition.cnn.com/2022/story")).toBe("edition.cnn.com")
  })

  it("returns empty string for an invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("")
  })

  it("returns empty string for an empty string", () => {
    expect(extractDomain("")).toBe("")
  })
})

// ── isReliableDomain ──────────────────────────────────────────────────────────

describe("isReliableDomain", () => {
  it("returns true for an exact reliable domain", () => {
    expect(isReliableDomain("theguardian.com")).toBe(true)
  })

  it("returns true for a subdomain of a reliable domain", () => {
    // news.bbc.co.uk → bbc.co.uk is in RELIABLE_DOMAINS
    expect(isReliableDomain("news.bbc.co.uk")).toBe(true)
  })

  it("returns true for a subdomain of theguardian.com", () => {
    expect(isReliableDomain("edition.theguardian.com")).toBe(true)
  })

  it("returns false for an unknown blog domain", () => {
    expect(isReliableDomain("someblog.com")).toBe(false)
  })

  it("returns false for tmz.com (unreliable tier)", () => {
    expect(isReliableDomain("tmz.com")).toBe(false)
  })

  it("returns false for edition.cnn.com (cnn.com not in reliable set)", () => {
    expect(isReliableDomain("edition.cnn.com")).toBe(false)
  })

  it("returns false for an empty string", () => {
    expect(isReliableDomain("")).toBe(false)
  })
})

// ── isReliableSourceUrl ───────────────────────────────────────────────────────

describe("isReliableSourceUrl", () => {
  it("returns true for a reliable URL", () => {
    expect(isReliableSourceUrl("https://www.theguardian.com/film/article")).toBe(true)
  })

  it("returns true for a reliable URL with a subdomain", () => {
    expect(isReliableSourceUrl("https://news.bbc.co.uk/story")).toBe(true)
  })

  it("returns false for an unreliable URL", () => {
    expect(isReliableSourceUrl("https://www.tmz.com/story")).toBe(false)
  })

  it("returns false for an invalid URL", () => {
    expect(isReliableSourceUrl("not-a-url")).toBe(false)
  })
})
