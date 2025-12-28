import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { isVagueCause, validateDeathDetails, ClaudeRateLimiter } from "./claude.js"

describe("isVagueCause", () => {
  it("returns true for null", () => {
    expect(isVagueCause(null)).toBe(true)
  })

  it('returns true for "disease"', () => {
    expect(isVagueCause("disease")).toBe(true)
  })

  it('returns true for "illness"', () => {
    expect(isVagueCause("illness")).toBe(true)
  })

  it('returns true for "natural causes"', () => {
    expect(isVagueCause("natural causes")).toBe(true)
  })

  it('returns true for "natural cause"', () => {
    expect(isVagueCause("natural cause")).toBe(true)
  })

  it('returns true for "unspecified"', () => {
    expect(isVagueCause("unspecified")).toBe(true)
  })

  it('returns true for "unknown"', () => {
    expect(isVagueCause("unknown")).toBe(true)
  })

  it("returns true for case-insensitive matches", () => {
    expect(isVagueCause("DISEASE")).toBe(true)
    expect(isVagueCause("Natural Causes")).toBe(true)
    expect(isVagueCause("UNKNOWN")).toBe(true)
  })

  it("returns true when vague cause is part of string", () => {
    expect(isVagueCause("died of disease")).toBe(true)
    expect(isVagueCause("natural causes at age 90")).toBe(true)
    expect(isVagueCause("cause unknown")).toBe(true)
  })

  it("returns false for specific causes", () => {
    expect(isVagueCause("lung cancer")).toBe(false)
    expect(isVagueCause("heart attack")).toBe(false)
    expect(isVagueCause("myocardial infarction")).toBe(false)
    expect(isVagueCause("complications from diabetes")).toBe(false)
    expect(isVagueCause("stroke")).toBe(false)
    expect(isVagueCause("pneumonia")).toBe(false)
    expect(isVagueCause("COVID-19")).toBe(false)
    expect(isVagueCause("car accident")).toBe(false)
    expect(isVagueCause("suicide")).toBe(false)
    expect(isVagueCause("overdose")).toBe(false)
  })

  it("returns false for detailed medical causes", () => {
    expect(isVagueCause("pancreatic cancer")).toBe(false)
    expect(isVagueCause("amyotrophic lateral sclerosis")).toBe(false)
    expect(isVagueCause("kidney failure")).toBe(false)
    expect(isVagueCause("liver cirrhosis")).toBe(false)
  })
})

// Note: We don't test getCauseOfDeathFromClaude directly because it requires
// actual API calls. In a production setting, you would mock the Anthropic client
// to test the parsing and error handling logic.

describe("validateDeathDetails", () => {
  // Suppress console.log during tests
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("accepts valid death details", () => {
    it("accepts medical context about the death", () => {
      const details = "He had been battling the disease for three years before succumbing to it."
      expect(validateDeathDetails(details, "cancer")).toBe(details)
    })

    it("accepts details about duration of illness", () => {
      const details = "The pneumonia developed after a long hospitalization following surgery."
      expect(validateDeathDetails(details, "pneumonia")).toBe(details)
    })

    it("accepts details about medical complications", () => {
      const details = "Complications arose from the surgery, leading to organ failure."
      expect(validateDeathDetails(details, "organ failure")).toBe(details)
    })
  })

  describe("rejects family references", () => {
    it("rejects mentions of wife", () => {
      const details = "He died peacefully with his wife by his side."
      expect(validateDeathDetails(details, "heart attack")).toBeNull()
    })

    it("rejects mentions of husband", () => {
      const details = "Her husband announced the news to the press."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects mentions of children", () => {
      const details = "The actor leaves behind three children."
      expect(validateDeathDetails(details, "stroke")).toBeNull()
    })

    it("rejects mentions of parents", () => {
      const details = "His father had died of the same condition years earlier."
      expect(validateDeathDetails(details, "heart disease")).toBeNull()
    })

    it("rejects mentions of widow/widower", () => {
      const details = "The widow confirmed the cause of death."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects 'survived by' phrases", () => {
      const details = "He is survived by his two sons and a daughter."
      expect(validateDeathDetails(details, "heart attack")).toBeNull()
    })

    it("rejects mentions of marriage", () => {
      const details = "After 40 years of marriage, he passed away peacefully."
      expect(validateDeathDetails(details, "old age")).toBeNull()
    })

    it("rejects 'predeceased' references", () => {
      const details = "She was predeceased by her sister in 2010."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects 'family' mentions", () => {
      const details = "The family announced his passing on social media."
      expect(validateDeathDetails(details, "heart failure")).toBeNull()
    })
  })

  describe("rejects career and tribute references", () => {
    it("rejects mentions of career", () => {
      const details = "His career spanned five decades in the entertainment industry."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects mentions of film/movie roles", () => {
      const details = "Known for his role in the blockbuster film, he died at 75."
      expect(validateDeathDetails(details, "heart attack")).toBeNull()
    })

    it("rejects mentions of actor/actress", () => {
      const details = "The actor had been ill for several months before passing."
      expect(validateDeathDetails(details, "illness")).toBeNull()
    })

    it("rejects mentions of awards", () => {
      const details = "The Oscar winner passed away after a long illness."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects tribute language", () => {
      const details = "He will be remembered as a beloved figure in the industry."
      expect(validateDeathDetails(details, "natural causes")).toBeNull()
    })

    it("rejects memorial language", () => {
      const details = "A memorial service will be held next week."
      expect(validateDeathDetails(details, "heart attack")).toBeNull()
    })

    it("rejects legacy references", () => {
      const details = "His legacy will live on through his work."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })

    it("rejects birthplace information", () => {
      const details = "Born in New York, he died at his home in Los Angeles."
      expect(validateDeathDetails(details, "heart failure")).toBeNull()
    })

    it("rejects 'grew up' information", () => {
      const details = "He grew up in a small town before moving to Hollywood."
      expect(validateDeathDetails(details, "cancer")).toBeNull()
    })
  })

  describe("rejects details that are too short", () => {
    it("rejects details shorter than cause + 20 characters", () => {
      // "heart attack" is 11 characters (normalized to "heartattack")
      // Details must be at least 31 characters (normalized) to be meaningful
      const details = "He died of heart attack."
      expect(validateDeathDetails(details, "heart attack")).toBeNull()
    })

    it("accepts details with sufficient additional context", () => {
      const details =
        "The heart attack occurred suddenly while he was at home. Emergency services were called but he was pronounced dead on arrival."
      expect(validateDeathDetails(details, "heart attack")).toBe(details)
    })
  })

  describe("case insensitivity", () => {
    it("rejects family references regardless of case", () => {
      expect(validateDeathDetails("His WIFE was by his side when he passed.", "cancer")).toBeNull()
      expect(validateDeathDetails("SURVIVED BY two children.", "heart attack")).toBeNull()
    })

    it("rejects career references regardless of case", () => {
      expect(validateDeathDetails("The OSCAR-winning ACTOR died at 80.", "cancer")).toBeNull()
    })
  })
})

describe("ClaudeRateLimiter", () => {
  describe("getMinDelayMs", () => {
    it("returns correct delay for sonnet (50 req/min = 1200ms)", () => {
      const rateLimiter = new ClaudeRateLimiter()
      expect(rateLimiter.getMinDelayMs("sonnet")).toBe(1200)
    })

    it("returns correct delay for haiku (100 req/min = 600ms)", () => {
      const rateLimiter = new ClaudeRateLimiter()
      expect(rateLimiter.getMinDelayMs("haiku")).toBe(600)
    })
  })

  describe("waitForRateLimit", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("returns 0 on first request (no wait needed)", async () => {
      const rateLimiter = new ClaudeRateLimiter()
      const waitPromise = rateLimiter.waitForRateLimit("sonnet")
      await vi.runAllTimersAsync()
      const waitTime = await waitPromise
      expect(waitTime).toBe(0)
    })

    it("waits appropriate time between sequential requests for same model", async () => {
      const rateLimiter = new ClaudeRateLimiter()

      // First request - no wait
      const firstWaitPromise = rateLimiter.waitForRateLimit("sonnet")
      await vi.runAllTimersAsync()
      const firstWait = await firstWaitPromise
      expect(firstWait).toBe(0)

      // Second request immediately after - should wait ~1200ms for sonnet
      const secondWaitPromise = rateLimiter.waitForRateLimit("sonnet")
      await vi.runAllTimersAsync()
      const secondWait = await secondWaitPromise
      expect(secondWait).toBeGreaterThanOrEqual(1199) // Allow small variance
      expect(secondWait).toBeLessThanOrEqual(1201)
    })

    it("uses independent rate limits for different models", async () => {
      const rateLimiter = new ClaudeRateLimiter()

      // First request for sonnet
      const sonnetPromise = rateLimiter.waitForRateLimit("sonnet")
      await vi.runAllTimersAsync()
      await sonnetPromise

      // First request for haiku - should not wait (different model)
      const haikuPromise = rateLimiter.waitForRateLimit("haiku")
      await vi.runAllTimersAsync()
      const haikuWait = await haikuPromise
      expect(haikuWait).toBe(0)
    })

    it("respects different rate limits per model", async () => {
      const rateLimiter = new ClaudeRateLimiter()

      // Sonnet: 50/min = 1200ms between requests
      // Haiku: 100/min = 600ms between requests

      // First haiku request
      const firstHaikuPromise = rateLimiter.waitForRateLimit("haiku")
      await vi.runAllTimersAsync()
      await firstHaikuPromise

      // Second haiku request - should wait ~600ms
      const secondHaikuPromise = rateLimiter.waitForRateLimit("haiku")
      await vi.runAllTimersAsync()
      const haikuWait = await secondHaikuPromise
      expect(haikuWait).toBeGreaterThanOrEqual(599)
      expect(haikuWait).toBeLessThanOrEqual(601)
    })
  })
})
