/**
 * Washington Post login handler.
 *
 * Washington Post uses a single-page login form:
 * - Email and password on same page
 * - May have CAPTCHA protection
 *
 * Login URL: https://www.washingtonpost.com/subscribe/signin
 */

import type { Page } from "playwright-core"

import type { CaptchaSolverConfig, LoginResult, SiteCredential } from "../types.js"
import { getBrowserAuthConfig } from "../config.js"
import { detectCaptcha } from "../captcha/detector.js"
import { solveCaptcha } from "../captcha/solver.js"
import { BaseLoginHandler } from "./base-handler.js"

import { consoleLog } from "../../logger.js"

// Washington Post-specific selectors
const SELECTORS = {
  // Login form - WaPo uses a two-step process
  emailInput: 'input[name="email"], input[type="email"], #email, [data-testid="email-input"]',
  continueButton:
    'button[type="submit"]:has-text("Continue"), button:has-text("Next"), button[data-qa="submit-email"]',
  passwordInput:
    'input[name="password"], input[type="password"], #password, [data-testid="password-input"]',
  submitButton:
    'button[type="submit"]:has-text("Sign in"), button:has-text("Log in"), [data-testid="sign-in-button"], button[data-qa="submit-password"]',

  // Logged in indicators
  accountMenu: '[data-qa="account-menu"], [aria-label="My account"], .account-menu',
  userIcon: '[data-qa="user-icon"], .user-icon',
  signOutLink: 'a:has-text("Sign out"), button:has-text("Sign out")',

  // Error messages
  errorMessage: '[data-testid="error-message"], .error-message, [role="alert"], .form-error',
}

const LOGIN_URL = "https://www.washingtonpost.com/subscribe/signin"
const POST_SUBMIT_WAIT_MS = 3000

/**
 * Login handler for Washington Post.
 */
export class WashingtonPostLoginHandler extends BaseLoginHandler {
  readonly domain = "washingtonpost.com"
  readonly siteName = "Washington Post"

  protected readonly loginUrl = LOGIN_URL
  protected readonly emailSelector = SELECTORS.emailInput
  protected readonly passwordSelector = SELECTORS.passwordInput
  protected readonly submitSelector = SELECTORS.submitButton
  protected readonly loggedInIndicator = SELECTORS.accountMenu

  protected readonly credentials: SiteCredential | undefined

  constructor() {
    super()
    const config = getBrowserAuthConfig()
    this.credentials = config.credentials.washingtonpost
  }

  /**
   * Washington Post login flow.
   */
  override async login(page: Page, captchaSolver?: CaptchaSolverConfig): Promise<LoginResult> {
    if (!this.hasCredentials()) {
      return {
        success: false,
        error: "No credentials configured for Washington Post",
        captchaEncountered: false,
      }
    }

    let captchaEncountered = false
    let captchaSolved = false
    let captchaCostUsd = 0

    try {
      consoleLog("Logging into Washington Post...")

      // Navigate to login page
      await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })

      // Wait for login form
      await page.waitForSelector(SELECTORS.emailInput, {
        state: "visible",
        timeout: 10000,
      })

      // Small delay for human-like interaction
      await page.waitForTimeout(500)

      // Fill email
      await page.fill(SELECTORS.emailInput, this.credentials!.email)
      await page.waitForTimeout(300)

      // WaPo uses a two-step login - click continue after email
      const continueButton = page.locator(SELECTORS.continueButton).first()
      if ((await continueButton.count()) > 0 && (await continueButton.isVisible())) {
        consoleLog("Clicking continue button...")
        await continueButton.click()
        await page.waitForTimeout(1500)
      }

      // Wait for password field to become visible
      await page.waitForSelector(SELECTORS.passwordInput, {
        state: "visible",
        timeout: 10000,
      })
      await page.waitForTimeout(300)

      // Fill password
      await page.fill(SELECTORS.passwordInput, this.credentials!.password)
      await page.waitForTimeout(300)

      // Check for CAPTCHA before submitting
      const preSubmitCaptcha = await detectCaptcha(page)
      if (preSubmitCaptcha.detected) {
        captchaEncountered = true
        consoleLog(`CAPTCHA detected before submit: ${preSubmitCaptcha.type}`)

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

      // Click sign in button
      await page.click(SELECTORS.submitButton)

      // Wait for response
      await page.waitForTimeout(POST_SUBMIT_WAIT_MS)

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

          // Wait for form to process
          await page.waitForTimeout(POST_SUBMIT_WAIT_MS)
        } else {
          return {
            success: false,
            error: "CAPTCHA encountered but no solver configured",
            captchaEncountered: true,
            captchaSolved: false,
          }
        }
      }

      // Wait for navigation
      try {
        await page.waitForURL((url) => !url.href.includes("/signin"), {
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
        // Navigate to homepage to verify
        await page.goto("https://www.washingtonpost.com", {
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

      consoleLog("Successfully logged into Washington Post")
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
   * Check for Washington Post-specific error messages.
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

    // Check for generic error patterns
    try {
      const bodyText = await page.locator("body").textContent()
      const lowerText = (bodyText || "").toLowerCase()

      if (lowerText.includes("incorrect email") || lowerText.includes("incorrect password")) {
        return "Incorrect email or password"
      }
      if (lowerText.includes("email not found") || lowerText.includes("no account")) {
        return "No account found with this email"
      }
      if (lowerText.includes("too many attempts")) {
        return "Too many login attempts - please try again later"
      }
    } catch {
      // Ignore
    }

    return null
  }

  /**
   * Verify Washington Post login status.
   */
  override async verifySession(page: Page): Promise<boolean> {
    try {
      // Check for user menu/account indicators
      const indicatorSelectors = [
        SELECTORS.accountMenu,
        SELECTORS.userIcon,
        SELECTORS.signOutLink,
        '[data-qa="sign-out"]',
        ".signed-in",
      ]

      for (const selector of indicatorSelectors) {
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
          c.domain.includes("washingtonpost.com") &&
          (c.name.includes("wapo_") ||
            c.name.includes("wp_") ||
            c.name === "logged_in" ||
            c.name.includes("session"))
      )

      return authCookies.length > 0
    } catch {
      return false
    }
  }
}
