import { describe, it, expect, vi, afterEach } from "vitest"
import { getCaptchaSolverConfig } from "./captcha-config.js"

describe("getCaptchaSolverConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns undefined when CAPTCHA_SOLVER_PROVIDER is not set", () => {
    delete process.env.CAPTCHA_SOLVER_PROVIDER
    expect(getCaptchaSolverConfig()).toBeUndefined()
  })

  it("returns undefined for invalid provider value", () => {
    vi.stubEnv("CAPTCHA_SOLVER_PROVIDER", "invalid-provider")
    expect(getCaptchaSolverConfig()).toBeUndefined()
  })

  it("returns config with 2captcha provider and matching key", () => {
    vi.stubEnv("CAPTCHA_SOLVER_PROVIDER", "2captcha")
    vi.stubEnv("TWOCAPTCHA_API_KEY", "test-2captcha-key")
    const config = getCaptchaSolverConfig()
    expect(config).toEqual({ provider: "2captcha", apiKey: "test-2captcha-key" })
  })

  it("returns config with capsolver provider and matching key", () => {
    vi.stubEnv("CAPTCHA_SOLVER_PROVIDER", "capsolver")
    vi.stubEnv("CAPSOLVER_API_KEY", "test-capsolver-key")
    const config = getCaptchaSolverConfig()
    expect(config).toEqual({ provider: "capsolver", apiKey: "test-capsolver-key" })
  })

  it("returns undefined when 2captcha provider is set but TWOCAPTCHA_API_KEY is missing", () => {
    vi.stubEnv("CAPTCHA_SOLVER_PROVIDER", "2captcha")
    delete process.env.TWOCAPTCHA_API_KEY
    vi.stubEnv("CAPSOLVER_API_KEY", "wrong-key")
    expect(getCaptchaSolverConfig()).toBeUndefined()
  })

  it("returns undefined when capsolver provider is set but CAPSOLVER_API_KEY is missing", () => {
    vi.stubEnv("CAPTCHA_SOLVER_PROVIDER", "capsolver")
    vi.stubEnv("TWOCAPTCHA_API_KEY", "wrong-key")
    delete process.env.CAPSOLVER_API_KEY
    expect(getCaptchaSolverConfig()).toBeUndefined()
  })
})
