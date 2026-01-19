/**
 * New York Times login handler.
 *
 * NYTimes uses a multi-step login flow:
 * 1. Enter email, click continue
 * 2. Enter password, click submit
 *
 * Login URL: https://myaccount.nytimes.com/auth/login
 */

import type { Page } from "playwright-core"

import type { CaptchaSolverConfig, LoginResult, SiteCredential } from "../types.js"
import { getBrowserAuthConfig } from "../config.js"
import { detectCaptcha } from "../captcha/detector.js"
import { solveCaptcha } from "../captcha/solver.js"
import { BaseLoginHandler } from "./base-handler.js"

import { consoleLog } from "../../logger.js"

// NYTimes-specific selectors (updated Jan 2026)
// NYTimes uses a role-based structure with custom components
const SELECTORS = {
  // Email step (enter-email page)
  emailInput: 'role=textbox[name="Email address"]',
  continueButton: '[data-testid="submit-email"], button:has-text("Continue")',

  // Password step (login-password page)
  passwordInput: 'role=textbox[name="Password"]',
  submitButton: 'button:has-text("Log in")',

  // Logged in indicators
  userMenu: '[data-testid="user-settings-button"], [aria-label="Account"], .user-tools',
  accountIcon: '[data-testid="account-icon"]',

  // Error messages
  errorMessage: '[data-testid="error-message"], .login-error, [role="alert"]',
}

// NYTimes redirects to enter-email page
const LOGIN_URL = "https://myaccount.nytimes.com/auth/enter-email"
const STEP_WAIT_MS = 2000

/**
 * Login handler for New York Times.
 */
export class NYTimesLoginHandler extends BaseLoginHandler {
  readonly domain = "nytimes.com"
  readonly siteName = "New York Times"

  protected readonly loginUrl = LOGIN_URL
  protected readonly emailSelector = SELECTORS.emailInput
  protected readonly passwordSelector = SELECTORS.passwordInput
  protected readonly submitSelector = SELECTORS.submitButton
  protected readonly loggedInIndicator = SELECTORS.userMenu

  protected readonly credentials: SiteCredential | undefined

  constructor() {
    super()
    const config = getBrowserAuthConfig()
    this.credentials = config.credentials.nytimes
  }

  /**
   * NYTimes uses a two-step login flow.
   */
  override async login(page: Page, captchaSolver?: CaptchaSolverConfig): Promise<LoginResult> {
    if (!this.hasCredentials()) {
      return {
        success: false,
        error: "No credentials configured for New York Times",
        captchaEncountered: false,
      }
    }

    let captchaEncountered = false
    let captchaSolved = false
    let captchaCostUsd = 0

    try {
      consoleLog("Logging into New York Times...")

      // Navigate to login page
      await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })

      // Wait for email field using role-based locator
      const emailInput = page.getByRole("textbox", { name: "Email address" })
      await emailInput.waitFor({ state: "visible", timeout: 15000 })

      // Step 1: Enter email
      await emailInput.fill(this.credentials!.email)

      // Click continue button (the primary submit button, not OAuth buttons)
      const continueButton = page.getByTestId("submit-email")
      await continueButton.click()

      // Wait for password field to appear
      await page.waitForTimeout(STEP_WAIT_MS)
      const passwordInput = page.getByRole("textbox", { name: "Password" })
      await passwordInput.waitFor({ state: "visible", timeout: 15000 })

      // Step 2: Enter password
      await passwordInput.fill(this.credentials!.password)

      // Check for CAPTCHA before submitting
      const preSubmitCaptcha = await detectCaptcha(page)
      if (preSubmitCaptcha.detected) {
        captchaEncountered = true
        consoleLog(`CAPTCHA detected before password submit: ${preSubmitCaptcha.type}`)

        if (captchaSolver) {
          const solveResult = await solveCaptcha(page, preSubmitCaptcha, captchaSolver)
          captchaCostUsd += solveResult.costUsd

          if (!solveResult.success) {
            return {
              success: false,
              error: `CAPTCHA solving failed: ${solveResult.error}`,
              captchaEncountered: true,
              captchaSolved: false,
              captchaCostUsd,
            }
          }
          captchaSolved = true
        } else {
          return {
            success: false,
            error: "CAPTCHA encountered but no solver configured",
            captchaEncountered: true,
            captchaSolved: false,
          }
        }
      }

      // Click submit (Log in button)
      const loginButton = page.getByRole("button", { name: "Log in" })
      await loginButton.click()

      // Wait for navigation or CAPTCHA
      await page.waitForTimeout(STEP_WAIT_MS)

      // Check for CAPTCHA after submission
      const postSubmitCaptcha = await detectCaptcha(page)
      if (postSubmitCaptcha.detected && !captchaEncountered) {
        captchaEncountered = true
        consoleLog(`CAPTCHA detected after submit: ${postSubmitCaptcha.type}`)

        if (captchaSolver) {
          const solveResult = await solveCaptcha(page, postSubmitCaptcha, captchaSolver)
          captchaCostUsd += solveResult.costUsd

          if (!solveResult.success) {
            return {
              success: false,
              error: `CAPTCHA solving failed: ${solveResult.error}`,
              captchaEncountered: true,
              captchaSolved: false,
              captchaCostUsd,
            }
          }
          captchaSolved = true

          // Wait for form to submit after CAPTCHA
          await page.waitForTimeout(STEP_WAIT_MS)
        } else {
          return {
            success: false,
            error: "CAPTCHA encountered but no solver configured",
            captchaEncountered: true,
            captchaSolved: false,
          }
        }
      }

      // Wait for navigation to complete
      try {
        await page.waitForURL((url) => !url.href.includes("/auth/login"), {
          timeout: 15000,
        })
      } catch {
        // May not navigate if there's an error
      }

      // Check for error messages
      const error = await this.checkForErrors(page)
      if (error) {
        return {
          success: false,
          error,
          captchaEncountered,
          captchaSolved,
          captchaCostUsd,
        }
      }

      // Verify we're logged in
      const isLoggedIn = await this.verifySession(page)
      if (!isLoggedIn) {
        // Navigate to homepage to check
        await page.goto("https://www.nytimes.com", {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        })
        const verified = await this.verifySession(page)
        if (!verified) {
          return {
            success: false,
            error: "Login appeared to succeed but session verification failed",
            captchaEncountered,
            captchaSolved,
            captchaCostUsd,
          }
        }
      }

      consoleLog("Successfully logged into New York Times")
      return {
        success: true,
        captchaEncountered,
        captchaSolved,
        captchaCostUsd,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        captchaEncountered,
        captchaSolved,
        captchaCostUsd,
      }
    }
  }

  /**
   * Check for NYTimes-specific error messages.
   */
  protected override async checkForErrors(page: Page): Promise<string | null> {
    // Check for explicit error message
    try {
      const errorElement = page.locator(SELECTORS.errorMessage).first()
      if ((await errorElement.count()) > 0 && (await errorElement.isVisible())) {
        const text = await errorElement.textContent()
        if (text) {
          return text.trim()
        }
      }
    } catch {
      // Continue
    }

    // Check for generic error patterns in page text
    try {
      const bodyText = await page.locator("body").textContent()
      const lowerText = (bodyText || "").toLowerCase()

      if (lowerText.includes("invalid email") || lowerText.includes("invalid password")) {
        return "Invalid email or password"
      }
      if (lowerText.includes("too many attempts") || lowerText.includes("rate limit")) {
        return "Too many login attempts - please try again later"
      }
      if (lowerText.includes("account locked") || lowerText.includes("account suspended")) {
        return "Account is locked or suspended"
      }
    } catch {
      // Ignore
    }

    return null
  }

  /**
   * Verify NYTimes login status.
   */
  override async verifySession(page: Page): Promise<boolean> {
    try {
      // Check for user menu indicator
      const userMenuSelectors = [
        SELECTORS.userMenu,
        SELECTORS.accountIcon,
        '[data-testid="logged-in"]',
        ".logged-in",
      ]

      for (const selector of userMenuSelectors) {
        const element = page.locator(selector).first()
        if ((await element.count()) > 0) {
          const isVisible = await element.isVisible().catch(() => false)
          if (isVisible) {
            return true
          }
        }
      }

      // Check cookies for auth tokens
      const cookies = await page.context().cookies()
      const authCookies = cookies.filter(
        (c) =>
          c.domain.includes("nytimes.com") &&
          (c.name.includes("NYT-S") || c.name.includes("nyt-auth") || c.name === "nyt-a")
      )

      return authCookies.length > 0
    } catch {
      return false
    }
  }
}
