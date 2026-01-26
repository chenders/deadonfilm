/**
 * Unit tests for browser authentication module.
 *
 * Tests cover:
 * - Configuration loading
 * - Session management
 * - CAPTCHA detection
 * - Login handler interfaces
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Page, BrowserContext } from "playwright-core"

// ============================================================================
// Configuration Tests
// ============================================================================

describe("browser-auth/config", () => {
  beforeEach(() => {
    // Clear environment variables (including alternate names)
    delete process.env.BROWSER_AUTH_ENABLED
    delete process.env.BROWSER_AUTH_SESSION_PATH
    delete process.env.BROWSER_AUTH_SESSION_TTL_HOURS
    delete process.env.NYTIMES_EMAIL
    delete process.env.NYTIMES_PASSWORD
    delete process.env.NYTIMES_AUTH_EMAIL
    delete process.env.NYTIMES_AUTH_PASSWORD
    delete process.env.WAPO_EMAIL
    delete process.env.WAPO_PASSWORD
    delete process.env.WASHPOST_AUTH_EMAIL
    delete process.env.WASHPOST_AUTH_PASSWORD
    delete process.env.CAPTCHA_SOLVER_PROVIDER
    delete process.env.TWOCAPTCHA_API_KEY
    delete process.env.CAPSOLVER_API_KEY
  })

  it("returns disabled config when BROWSER_AUTH_ENABLED is not set", async () => {
    // Reset module cache to pick up env changes
    vi.resetModules()
    const { loadBrowserAuthConfig } = await import("./browser-auth/config.js")

    const config = loadBrowserAuthConfig()
    expect(config.enabled).toBe(false)
  })

  it("loads NYTimes credentials from environment", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.NYTIMES_EMAIL = "test@example.com"
    process.env.NYTIMES_PASSWORD = "testpass123"

    vi.resetModules()
    const { loadBrowserAuthConfig } = await import("./browser-auth/config.js")

    const config = loadBrowserAuthConfig()
    expect(config.enabled).toBe(true)
    expect(config.credentials.nytimes).toEqual({
      email: "test@example.com",
      password: "testpass123",
    })
  })

  it("loads Washington Post credentials from environment", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.WAPO_EMAIL = "wapo@example.com"
    process.env.WAPO_PASSWORD = "wapopass123"

    vi.resetModules()
    const { loadBrowserAuthConfig } = await import("./browser-auth/config.js")

    const config = loadBrowserAuthConfig()
    expect(config.credentials.washingtonpost).toEqual({
      email: "wapo@example.com",
      password: "wapopass123",
    })
  })

  it("loads CAPTCHA solver config for 2captcha", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.CAPTCHA_SOLVER_PROVIDER = "2captcha"
    process.env.TWOCAPTCHA_API_KEY = "test-2captcha-key"

    vi.resetModules()
    const { loadBrowserAuthConfig } = await import("./browser-auth/config.js")

    const config = loadBrowserAuthConfig()
    expect(config.captchaSolver).toBeDefined()
    expect(config.captchaSolver?.provider).toBe("2captcha")
    expect(config.captchaSolver?.apiKey).toBe("test-2captcha-key")
  })

  it("returns undefined captchaSolver when provider set but no key", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.CAPTCHA_SOLVER_PROVIDER = "2captcha"
    // No API key set

    vi.resetModules()
    const { loadBrowserAuthConfig } = await import("./browser-auth/config.js")

    const config = loadBrowserAuthConfig()
    expect(config.captchaSolver).toBeUndefined()
  })

  it("hasCredentialsForSite returns correct values", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.NYTIMES_EMAIL = "test@example.com"
    process.env.NYTIMES_PASSWORD = "testpass123"

    vi.resetModules()
    const { hasCredentialsForSite, resetBrowserAuthConfig } =
      await import("./browser-auth/config.js")

    resetBrowserAuthConfig() // Force reload
    expect(hasCredentialsForSite("nytimes")).toBe(true)
    expect(hasCredentialsForSite("washingtonpost")).toBe(false)
  })
})

// ============================================================================
// Session Manager Tests
// ============================================================================

describe("browser-auth/session-manager", () => {
  const mockFs = {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn(),
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()

    // Mock fs/promises
    vi.doMock("fs/promises", () => mockFs)

    // Set up default config
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.BROWSER_AUTH_SESSION_PATH = "/tmp/test-sessions"
  })

  afterEach(() => {
    vi.doUnmock("fs/promises")
    delete process.env.BROWSER_AUTH_ENABLED
    delete process.env.BROWSER_AUTH_SESSION_PATH
  })

  it("isSessionValid returns true for fresh sessions", async () => {
    const { isSessionValid } = await import("./browser-auth/session-manager.js")

    const session = {
      domain: "nytimes.com",
      cookies: [],
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    expect(isSessionValid(session, 24)).toBe(true)
  })

  it("isSessionValid returns false for expired sessions", async () => {
    const { isSessionValid } = await import("./browser-auth/session-manager.js")

    const oldDate = new Date()
    oldDate.setHours(oldDate.getHours() - 25) // 25 hours ago

    const session = {
      domain: "nytimes.com",
      cookies: [],
      createdAt: oldDate.toISOString(),
      lastUsedAt: oldDate.toISOString(),
    }

    expect(isSessionValid(session, 24)).toBe(false)
  })

  it("isSessionValid respects custom TTL", async () => {
    const { isSessionValid } = await import("./browser-auth/session-manager.js")

    const recentDate = new Date()
    recentDate.setHours(recentDate.getHours() - 2) // 2 hours ago

    const session = {
      domain: "nytimes.com",
      cookies: [],
      createdAt: recentDate.toISOString(),
      lastUsedAt: recentDate.toISOString(),
    }

    // Valid with 24-hour TTL
    expect(isSessionValid(session, 24)).toBe(true)
    // Invalid with 1-hour TTL
    expect(isSessionValid(session, 1)).toBe(false)
  })
})

// ============================================================================
// CAPTCHA Detector Tests
// ============================================================================

describe("browser-auth/captcha/detector", () => {
  function createMockPage(options: {
    locatorCounts?: Record<string, number>
    evaluate?: unknown
    textContent?: string
    url?: string
  }): Page {
    const page = {
      locator: vi.fn((selector: string) => {
        const counts = options.locatorCounts || {}
        const count = counts[selector] || 0
        return {
          count: vi.fn().mockResolvedValue(count),
          isVisible: vi.fn().mockResolvedValue(count > 0),
          first: vi.fn().mockReturnThis(),
          textContent: vi.fn().mockResolvedValue(options.textContent || ""),
        }
      }),
      evaluate: vi.fn().mockResolvedValue(options.evaluate),
      url: vi.fn().mockReturnValue(options.url || "https://example.com"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page

    return page
  }

  it("detects reCAPTCHA v2 iframe", async () => {
    const { detectCaptcha } = await import("./browser-auth/captcha/detector.js")

    const page = createMockPage({
      locatorCounts: {
        'iframe[src*="recaptcha"]': 1,
      },
      evaluate: "test-site-key",
    })

    const result = await detectCaptcha(page)
    expect(result.detected).toBe(true)
    expect(result.type).toBe("recaptcha_v2")
  })

  it("detects hCaptcha", async () => {
    const { detectCaptcha } = await import("./browser-auth/captcha/detector.js")

    const page = createMockPage({
      locatorCounts: {
        ".h-captcha": 1,
      },
      evaluate: "hcaptcha-site-key",
    })

    const result = await detectCaptcha(page)
    expect(result.detected).toBe(true)
    expect(result.type).toBe("hcaptcha")
  })

  it("returns not detected when no CAPTCHA present", async () => {
    const { detectCaptcha } = await import("./browser-auth/captcha/detector.js")

    const page = createMockPage({
      locatorCounts: {},
      textContent: "Regular page content without captcha",
    })

    const result = await detectCaptcha(page)
    expect(result.detected).toBe(false)
    expect(result.type).toBeNull()
  })

  it("detects CAPTCHA from text patterns", async () => {
    const { detectCaptcha } = await import("./browser-auth/captcha/detector.js")

    const page = createMockPage({
      locatorCounts: {},
      textContent: "Please verify you are human to continue",
    })

    const result = await detectCaptcha(page)
    expect(result.detected).toBe(true)
    expect(result.type).toBe("unknown")
    expect(result.context).toContain("CAPTCHA-like text detected")
  })
})

// ============================================================================
// CAPTCHA Solver Tests
// ============================================================================

describe("browser-auth/captcha/solver", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("returns error when site key not found", async () => {
    const { solveCaptcha } = await import("./browser-auth/captcha/solver.js")

    const mockPage = {
      url: vi.fn().mockReturnValue("https://example.com"),
      evaluate: vi.fn(),
    } as unknown as Page

    const detection = {
      detected: true,
      type: "recaptcha_v2" as const,
      siteKey: null, // No site key
      selector: ".g-recaptcha",
    }

    const config = {
      provider: "2captcha" as const,
      apiKey: "test-key",
      timeoutMs: 60000,
      maxCostPerSolve: 0.01,
    }

    const result = await solveCaptcha(mockPage, detection, config)
    expect(result.success).toBe(false)
    expect(result.error).toContain("No site key")
    expect(result.costUsd).toBe(0)
  })

  it("returns error when cost exceeds limit", async () => {
    const { solveCaptcha } = await import("./browser-auth/captcha/solver.js")

    const mockPage = {
      url: vi.fn().mockReturnValue("https://example.com"),
    } as unknown as Page

    const detection = {
      detected: true,
      type: "perimeterx" as const, // PerimeterX costs more
      siteKey: "test-key",
      selector: ".px-captcha",
    }

    const config = {
      provider: "2captcha" as const,
      apiKey: "test-key",
      timeoutMs: 60000,
      maxCostPerSolve: 0.001, // Very low limit
    }

    const result = await solveCaptcha(mockPage, detection, config)
    expect(result.success).toBe(false)
    expect(result.error).toContain("exceeds limit")
    expect(result.costUsd).toBe(0)
  })
})

// ============================================================================
// Login Handler Tests
// ============================================================================

describe("browser-auth/login-handlers", () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear credentials (including alternate names)
    delete process.env.NYTIMES_EMAIL
    delete process.env.NYTIMES_PASSWORD
    delete process.env.NYTIMES_AUTH_EMAIL
    delete process.env.NYTIMES_AUTH_PASSWORD
    delete process.env.WAPO_EMAIL
    delete process.env.WAPO_PASSWORD
    delete process.env.WASHPOST_AUTH_EMAIL
    delete process.env.WASHPOST_AUTH_PASSWORD
    process.env.BROWSER_AUTH_ENABLED = "true"
  })

  afterEach(() => {
    delete process.env.BROWSER_AUTH_ENABLED
  })

  describe("NYTimesLoginHandler", () => {
    it("hasCredentials returns false when not configured", async () => {
      vi.resetModules()
      const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
      resetBrowserAuthConfig()

      const { NYTimesLoginHandler } = await import("./browser-auth/login-handlers/nytimes.js")
      const handler = new NYTimesLoginHandler()

      expect(handler.hasCredentials()).toBe(false)
      expect(handler.domain).toBe("nytimes.com")
      expect(handler.siteName).toBe("New York Times")
    })

    it("hasCredentials returns true when configured", async () => {
      process.env.NYTIMES_EMAIL = "test@example.com"
      process.env.NYTIMES_PASSWORD = "testpass"

      vi.resetModules()
      const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
      resetBrowserAuthConfig()

      const { NYTimesLoginHandler } = await import("./browser-auth/login-handlers/nytimes.js")
      const handler = new NYTimesLoginHandler()

      expect(handler.hasCredentials()).toBe(true)
    })

    it("login returns error when no credentials", async () => {
      vi.resetModules()
      const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
      resetBrowserAuthConfig()

      const { NYTimesLoginHandler } = await import("./browser-auth/login-handlers/nytimes.js")
      const handler = new NYTimesLoginHandler()

      const mockPage = {} as Page
      const result = await handler.login(mockPage)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No credentials configured")
      expect(result.captchaEncountered).toBe(false)
    })
  })

  describe("WashingtonPostLoginHandler", () => {
    it("hasCredentials returns false when not configured", async () => {
      vi.resetModules()
      const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
      resetBrowserAuthConfig()

      const { WashingtonPostLoginHandler } =
        await import("./browser-auth/login-handlers/washingtonpost.js")
      const handler = new WashingtonPostLoginHandler()

      expect(handler.hasCredentials()).toBe(false)
      expect(handler.domain).toBe("washingtonpost.com")
      expect(handler.siteName).toBe("Washington Post")
    })

    it("hasCredentials returns true when configured", async () => {
      process.env.WAPO_EMAIL = "test@example.com"
      process.env.WAPO_PASSWORD = "testpass"

      vi.resetModules()
      const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
      resetBrowserAuthConfig()

      const { WashingtonPostLoginHandler } =
        await import("./browser-auth/login-handlers/washingtonpost.js")
      const handler = new WashingtonPostLoginHandler()

      expect(handler.hasCredentials()).toBe(true)
    })
  })
})

// ============================================================================
// Type Tests
// ============================================================================

describe("browser-auth/types", () => {
  it("exports all required types", async () => {
    const types = await import("./browser-auth/types.js")

    // Check that types are exported (will fail at compile time if missing)
    expect(types.DEFAULT_BROWSER_AUTH_CONFIG).toBeDefined()
    expect(types.DEFAULT_BROWSER_AUTH_CONFIG.enabled).toBe(false)
    expect(types.DEFAULT_BROWSER_AUTH_CONFIG.sessionTtlHours).toBe(24)
  })
})

// ============================================================================
// Integration Tests (with mocked browser)
// ============================================================================

describe("browser-fetch integration", () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.BROWSER_AUTH_ENABLED
    delete process.env.NYTIMES_EMAIL
    delete process.env.NYTIMES_PASSWORD
  })

  it("isAuthEnabledForUrl returns false when auth disabled", async () => {
    vi.resetModules()
    const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
    resetBrowserAuthConfig()

    const { isAuthEnabledForUrl } = await import("./browser-fetch.js")

    expect(isAuthEnabledForUrl("https://www.nytimes.com/article")).toBe(false)
  })

  it("isAuthEnabledForUrl returns false for unsupported sites", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"

    vi.resetModules()
    const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
    resetBrowserAuthConfig()

    const { isAuthEnabledForUrl } = await import("./browser-fetch.js")

    expect(isAuthEnabledForUrl("https://www.example.com/article")).toBe(false)
  })

  it("isAuthEnabledForUrl returns true for nytimes with credentials", async () => {
    process.env.BROWSER_AUTH_ENABLED = "true"
    process.env.NYTIMES_EMAIL = "test@example.com"
    process.env.NYTIMES_PASSWORD = "testpass"

    vi.resetModules()
    const { resetBrowserAuthConfig } = await import("./browser-auth/config.js")
    resetBrowserAuthConfig()

    const { isAuthEnabledForUrl } = await import("./browser-fetch.js")

    expect(isAuthEnabledForUrl("https://www.nytimes.com/article")).toBe(true)
  })
})
