/**
 * Base class for site-specific login handlers.
 *
 * Provides common functionality for:
 * - Form filling with retry logic
 * - CAPTCHA detection and solving
 * - Success verification
 */

import type { Page } from "playwright-core"

import type { CaptchaSolverConfig, LoginHandler, LoginResult, SiteCredential } from "../types.js"
import { detectCaptcha } from "../captcha/detector.js"
import { solveCaptcha } from "../captcha/solver.js"

// Timeouts
const NAVIGATION_TIMEOUT_MS = 30000
const ELEMENT_TIMEOUT_MS = 10000
const POST_LOGIN_WAIT_MS = 3000

/**
 * Abstract base class for login handlers.
 * Subclasses implement site-specific selectors and flows.
 */
export abstract class BaseLoginHandler implements LoginHandler {
  abstract readonly domain: string
  abstract readonly siteName: string

  protected abstract readonly credentials: SiteCredential | undefined
  protected abstract readonly loginUrl: string

  // Selectors to be overridden by subclasses
  protected abstract readonly emailSelector: string
  protected abstract readonly passwordSelector: string
  protected abstract readonly submitSelector: string
  protected abstract readonly loggedInIndicator: string

  /**
   * Check if credentials are configured.
   */
  hasCredentials(): boolean {
    return !!(this.credentials?.email && this.credentials?.password)
  }

  /**
   * Navigate to login page and wait for it to load.
   */
  protected async navigateToLogin(page: Page): Promise<void> {
    await page.goto(this.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    })

    // Wait for email field to be visible
    await page.waitForSelector(this.emailSelector, {
      state: "visible",
      timeout: ELEMENT_TIMEOUT_MS,
    })
  }

  /**
   * Fill the email field. Override for multi-step flows.
   */
  protected async fillEmail(page: Page): Promise<void> {
    await page.fill(this.emailSelector, this.credentials!.email)
  }

  /**
   * Fill the password field. Override for multi-step flows.
   */
  protected async fillPassword(page: Page): Promise<void> {
    await page.fill(this.passwordSelector, this.credentials!.password)
  }

  /**
   * Click the submit button. Override for custom behavior.
   */
  protected async clickSubmit(page: Page): Promise<void> {
    await page.click(this.submitSelector)
  }

  /**
   * Wait for login to complete and verify success.
   */
  protected async waitForLoginComplete(page: Page): Promise<boolean> {
    try {
      // Wait for navigation or indicator
      await Promise.race([
        page.waitForNavigation({ timeout: NAVIGATION_TIMEOUT_MS }),
        page.waitForSelector(this.loggedInIndicator, {
          state: "visible",
          timeout: NAVIGATION_TIMEOUT_MS,
        }),
      ])

      // Additional wait for any redirects
      await page.waitForTimeout(POST_LOGIN_WAIT_MS)

      return this.verifySession(page)
    } catch {
      return false
    }
  }

  /**
   * Check for login errors on the page.
   */
  protected async checkForErrors(page: Page): Promise<string | null> {
    const errorSelectors = [
      '[data-testid="error"]',
      '[role="alert"]',
      ".error-message",
      ".login-error",
      ".alert-danger",
      "#login-error",
    ]

    for (const selector of errorSelectors) {
      try {
        const error = page.locator(selector).first()
        if ((await error.count()) > 0 && (await error.isVisible())) {
          const text = await error.textContent()
          if (text && text.length > 0) {
            return text.trim()
          }
        }
      } catch {
        // Continue checking
      }
    }

    return null
  }

  /**
   * Verify if the session is valid (user is logged in).
   */
  async verifySession(page: Page): Promise<boolean> {
    try {
      const indicator = page.locator(this.loggedInIndicator).first()
      const isVisible = (await indicator.count()) > 0 && (await indicator.isVisible())
      return isVisible
    } catch {
      return false
    }
  }

  /**
   * Perform the login flow.
   * Can be overridden for complex multi-step flows.
   */
  async login(page: Page, captchaSolver?: CaptchaSolverConfig): Promise<LoginResult> {
    if (!this.hasCredentials()) {
      return {
        success: false,
        error: `No credentials configured for ${this.siteName}`,
        captchaEncountered: false,
      }
    }

    let captchaEncountered = false
    let captchaSolved = false
    let captchaCostUsd = 0

    try {
      console.log(`Logging into ${this.siteName}...`)

      // Navigate to login page
      await this.navigateToLogin(page)

      // Fill credentials
      await this.fillEmail(page)
      await this.fillPassword(page)

      // Click submit
      await this.clickSubmit(page)

      // Wait a moment for CAPTCHA to potentially appear
      await page.waitForTimeout(2000)

      // Check for CAPTCHA
      const captchaResult = await detectCaptcha(page)
      if (captchaResult.detected) {
        captchaEncountered = true
        console.log(`CAPTCHA detected: ${captchaResult.type}`)

        if (captchaSolver) {
          const solveResult = await solveCaptcha(page, captchaResult, captchaSolver)
          captchaCostUsd = solveResult.costUsd
          captchaSolved = solveResult.success

          if (!solveResult.success) {
            return {
              success: false,
              error: `CAPTCHA solving failed: ${solveResult.error}`,
              captchaEncountered: true,
              captchaSolved: false,
              captchaCostUsd,
            }
          }

          // Try submitting again after solving CAPTCHA
          await this.clickSubmit(page)
        } else {
          return {
            success: false,
            error: "CAPTCHA encountered but no solver configured",
            captchaEncountered: true,
            captchaSolved: false,
          }
        }
      }

      // Wait for login to complete
      const success = await this.waitForLoginComplete(page)

      if (!success) {
        const error = await this.checkForErrors(page)
        return {
          success: false,
          error: error || "Login failed - unable to verify session",
          captchaEncountered,
          captchaSolved,
          captchaCostUsd,
        }
      }

      console.log(`Successfully logged into ${this.siteName}`)
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
}
