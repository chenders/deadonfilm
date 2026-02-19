/**
 * CAPTCHA solving service integration.
 *
 * Supports:
 * - 2Captcha (https://2captcha.com)
 * - CapSolver (https://capsolver.com)
 *
 * Typical costs:
 * - reCAPTCHA v2: ~$0.003 per solve
 * - reCAPTCHA v3: ~$0.003 per solve
 * - hCaptcha: ~$0.003 per solve
 */

import type { Page } from "playwright-core"

import type {
  CaptchaDetectionResult,
  CaptchaSolveResult,
  CaptchaSolverConfig,
  CaptchaType,
} from "../types.js"

import { consoleLog } from "../../logger.js"

// API endpoints
const TWOCAPTCHA_API = {
  submit: "https://2captcha.com/in.php",
  result: "https://2captcha.com/res.php",
}

const CAPSOLVER_API = {
  createTask: "https://api.capsolver.com/createTask",
  getTaskResult: "https://api.capsolver.com/getTaskResult",
}

// Polling intervals and costs
const POLL_INTERVAL_MS = 5000
const INITIAL_WAIT_MS = 10000

// Approximate costs per CAPTCHA type (USD)
const CAPTCHA_COSTS: Record<CaptchaType, number> = {
  recaptcha_v2: 0.003,
  recaptcha_v3: 0.003,
  hcaptcha: 0.003,
  perimeterx: 0.005,
  datadome: 0.003, // DataDome uses reCAPTCHA/hCaptcha internally
  unknown: 0.005,
}

/**
 * Submit a CAPTCHA to 2Captcha for solving.
 */
async function submit2Captcha(
  config: CaptchaSolverConfig,
  type: CaptchaType,
  siteKey: string,
  pageUrl: string
): Promise<string> {
  const params = new URLSearchParams({
    key: config.apiKey,
    method: type === "hcaptcha" ? "hcaptcha" : "userrecaptcha",
    googlekey: siteKey,
    pageurl: pageUrl,
    json: "1",
  })

  // Add version for reCAPTCHA v3
  if (type === "recaptcha_v3") {
    params.append("version", "v3")
    params.append("action", "verify")
    params.append("min_score", "0.3")
  }

  const response = await fetch(`${TWOCAPTCHA_API.submit}?${params}`)
  const data = (await response.json()) as { status: number; request: string }

  if (data.status !== 1) {
    throw new Error(`2Captcha submission failed: ${data.request}`)
  }

  return data.request // Task ID
}

/**
 * Submit a DataDome CAPTCHA to 2Captcha for solving.
 * DataDome requires different parameters than standard CAPTCHAs.
 */
async function submit2CaptchaDataDome(
  config: CaptchaSolverConfig,
  captchaUrl: string,
  pageUrl: string,
  userAgent: string
): Promise<string> {
  const params = new URLSearchParams({
    key: config.apiKey,
    method: "datadome",
    captcha_url: captchaUrl,
    pageurl: pageUrl,
    userAgent: userAgent,
    json: "1",
  })

  const response = await fetch(`${TWOCAPTCHA_API.submit}?${params}`)
  const data = (await response.json()) as { status: number; request: string }

  if (data.status !== 1) {
    throw new Error(`2Captcha DataDome submission failed: ${data.request}`)
  }

  return data.request // Task ID
}

/**
 * Poll 2Captcha for the solution.
 */
async function poll2Captcha(
  config: CaptchaSolverConfig,
  taskId: string,
  startTime: number
): Promise<string> {
  const params = new URLSearchParams({
    key: config.apiKey,
    action: "get",
    id: taskId,
    json: "1",
  })

  while (Date.now() - startTime < config.timeoutMs) {
    const response = await fetch(`${TWOCAPTCHA_API.result}?${params}`)
    const data = (await response.json()) as { status: number; request: string }

    if (data.status === 1) {
      return data.request // Solution token
    }

    if (data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2Captcha solving failed: ${data.request}`)
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error("2Captcha solving timed out")
}

/**
 * Submit a CAPTCHA to CapSolver for solving.
 */
async function submitCapSolver(
  config: CaptchaSolverConfig,
  type: CaptchaType,
  siteKey: string,
  pageUrl: string
): Promise<string> {
  const taskType =
    type === "hcaptcha"
      ? "HCaptchaTaskProxyLess"
      : type === "recaptcha_v3"
        ? "ReCaptchaV3TaskProxyLess"
        : "ReCaptchaV2TaskProxyLess"

  const task: Record<string, unknown> = {
    type: taskType,
    websiteURL: pageUrl,
    websiteKey: siteKey,
  }

  // Add page action for v3
  if (type === "recaptcha_v3") {
    task.pageAction = "verify"
    task.minScore = 0.3
  }

  const response = await fetch(CAPSOLVER_API.createTask, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: config.apiKey,
      task,
    }),
  })

  const data = (await response.json()) as {
    errorId: number
    errorDescription?: string
    taskId?: string
  }

  if (data.errorId !== 0 || !data.taskId) {
    throw new Error(`CapSolver submission failed: ${data.errorDescription || "Unknown error"}`)
  }

  return data.taskId
}

/**
 * Poll CapSolver for the solution.
 */
async function pollCapSolver(
  config: CaptchaSolverConfig,
  taskId: string,
  startTime: number
): Promise<string> {
  while (Date.now() - startTime < config.timeoutMs) {
    const response = await fetch(CAPSOLVER_API.getTaskResult, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: config.apiKey,
        taskId,
      }),
    })

    const data = (await response.json()) as {
      errorId: number
      errorDescription?: string
      status: string
      solution?: { gRecaptchaResponse?: string; token?: string }
    }

    if (data.errorId !== 0) {
      throw new Error(`CapSolver polling failed: ${data.errorDescription || "Unknown error"}`)
    }

    if (data.status === "ready" && data.solution) {
      return data.solution.gRecaptchaResponse || data.solution.token || ""
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error("CapSolver solving timed out")
}

/**
 * Inject a solved CAPTCHA token into the page.
 *
 * @param page - Playwright page
 * @param token - Solution token from solver
 * @param type - CAPTCHA type
 */
export async function injectCaptchaToken(
  page: Page,
  token: string,
  type: CaptchaType
): Promise<void> {
  // Note: This callback runs in browser context, not Node.js
  await page.evaluate(
    ({ token, type }) => {
      // Find and fill the response textarea
      const responseSelectors = [
        "#g-recaptcha-response",
        'textarea[name="g-recaptcha-response"]',
        ".g-recaptcha-response",
        "#h-captcha-response",
        'textarea[name="h-captcha-response"]',
        ".h-captcha-response",
      ]

      for (const selector of responseSelectors) {
        const textarea = document.querySelector(selector) as HTMLTextAreaElement | null
        if (textarea) {
          // Make visible if hidden (common pattern)
          textarea.style.display = "block"
          textarea.style.visibility = "visible"
          textarea.value = token

          textarea.dispatchEvent(new Event("input", { bubbles: true }))
          textarea.dispatchEvent(new Event("change", { bubbles: true }))
          break
        }
      }

      // Try to trigger the callback function
      if (type === "recaptcha_v2" || type === "recaptcha_v3") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (
          typeof (window as any).grecaptcha !== "undefined" &&
          (window as any).grecaptcha.getResponse
        ) {
          try {
            // Find callback from data attribute
            const recaptchaDiv = document.querySelector("[data-callback]")
            const callbackName = recaptchaDiv?.getAttribute("data-callback")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (callbackName && typeof (window as any)[callbackName] === "function") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(window as any)[callbackName](token)
            }
          } catch {
            // Callback invocation failed, form submission should still work
          }
        }
      } else if (type === "hcaptcha") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (window as any).hcaptcha !== "undefined") {
          try {
            const hcaptchaDiv = document.querySelector("[data-callback]")
            const callbackName = hcaptchaDiv?.getAttribute("data-callback")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (callbackName && typeof (window as any)[callbackName] === "function") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(window as any)[callbackName](token)
            }
          } catch {
            // Callback invocation failed
          }
        }
      }
    },
    { token, type }
  )
}

/**
 * Solve a CAPTCHA using the configured solving service.
 *
 * @param page - Playwright page with the CAPTCHA
 * @param detection - Detection result with CAPTCHA details
 * @param config - Solver configuration
 * @returns Solve result with token and cost
 */
export async function solveCaptcha(
  page: Page,
  detection: CaptchaDetectionResult,
  config: CaptchaSolverConfig
): Promise<CaptchaSolveResult> {
  const startTime = Date.now()
  const type = detection.type || "unknown"
  const estimatedCost = CAPTCHA_COSTS[type]

  // Check cost limit
  if (estimatedCost > config.maxCostPerSolve) {
    return {
      success: false,
      token: null,
      type,
      costUsd: 0,
      solveTimeMs: Date.now() - startTime,
      error: `CAPTCHA cost ($${estimatedCost}) exceeds limit ($${config.maxCostPerSolve})`,
    }
  }

  const pageUrl = page.url()

  // DataDome requires different handling - uses captchaUrl instead of siteKey
  if (type === "datadome") {
    return solveDataDome(page, detection, config, pageUrl, startTime, estimatedCost)
  }

  // Standard CAPTCHAs require a siteKey
  if (!detection.siteKey) {
    return {
      success: false,
      token: null,
      type,
      costUsd: 0,
      solveTimeMs: Date.now() - startTime,
      error: "No site key found for CAPTCHA",
    }
  }

  try {
    consoleLog(`Submitting ${type} CAPTCHA to ${config.provider}...`)

    // Wait before polling (CAPTCHAs take time to solve)
    await new Promise((resolve) => setTimeout(resolve, INITIAL_WAIT_MS))

    let token: string

    if (config.provider === "2captcha") {
      const taskId = await submit2Captcha(config, type, detection.siteKey, pageUrl)
      token = await poll2Captcha(config, taskId, startTime)
    } else {
      const taskId = await submitCapSolver(config, type, detection.siteKey, pageUrl)
      token = await pollCapSolver(config, taskId, startTime)
    }

    // Inject the token into the page
    await injectCaptchaToken(page, token, type)

    const solveTimeMs = Date.now() - startTime
    consoleLog(`CAPTCHA solved in ${solveTimeMs}ms`)

    return {
      success: true,
      token,
      type,
      costUsd: estimatedCost,
      solveTimeMs,
    }
  } catch (error) {
    return {
      success: false,
      token: null,
      type,
      costUsd: 0, // Don't charge for failures
      solveTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Solve a DataDome CAPTCHA challenge.
 *
 * DataDome is different from standard CAPTCHAs:
 * - Requires the captcha URL and user agent
 * - Returns a cookie value that must be set on the browser
 */
async function solveDataDome(
  page: Page,
  detection: CaptchaDetectionResult,
  config: CaptchaSolverConfig,
  pageUrl: string,
  startTime: number,
  estimatedCost: number
): Promise<CaptchaSolveResult> {
  if (!detection.datadomeUrl) {
    return {
      success: false,
      token: null,
      type: "datadome",
      costUsd: 0,
      solveTimeMs: Date.now() - startTime,
      error: "No DataDome captcha URL found",
    }
  }

  // DataDome solving only supported via 2captcha currently
  if (config.provider !== "2captcha") {
    return {
      success: false,
      token: null,
      type: "datadome",
      costUsd: 0,
      solveTimeMs: Date.now() - startTime,
      error: "DataDome solving only supported via 2captcha provider",
    }
  }

  try {
    consoleLog("Submitting DataDome CAPTCHA to 2captcha...")

    // Get the user agent from the page
    const userAgent = await page.evaluate(() => navigator.userAgent)

    // Wait before polling (CAPTCHAs take time to solve)
    await new Promise((resolve) => setTimeout(resolve, INITIAL_WAIT_MS))

    const taskId = await submit2CaptchaDataDome(config, detection.datadomeUrl, pageUrl, userAgent)
    const cookieValue = await poll2Captcha(config, taskId, startTime)

    // DataDome returns a cookie value - set it on the browser context
    // The cookie is typically named "datadome"
    const url = new URL(pageUrl)
    await page.context().addCookies([
      {
        name: "datadome",
        value: cookieValue,
        domain: url.hostname,
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "Lax",
      },
    ])

    const solveTimeMs = Date.now() - startTime
    consoleLog(`DataDome CAPTCHA solved in ${solveTimeMs}ms`)

    return {
      success: true,
      token: cookieValue,
      type: "datadome",
      costUsd: estimatedCost,
      solveTimeMs,
    }
  } catch (error) {
    return {
      success: false,
      token: null,
      type: "datadome",
      costUsd: 0,
      solveTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Check the balance of the solving service account.
 *
 * @param config - Solver configuration
 * @returns Balance in USD
 */
export async function getBalance(config: CaptchaSolverConfig): Promise<number> {
  if (config.provider === "2captcha") {
    const params = new URLSearchParams({
      key: config.apiKey,
      action: "getbalance",
      json: "1",
    })

    const response = await fetch(`${TWOCAPTCHA_API.result}?${params}`)
    const data = (await response.json()) as { status: number; request: string }

    if (data.status !== 1) {
      throw new Error(`Failed to get 2Captcha balance: ${data.request}`)
    }

    return parseFloat(data.request)
  } else {
    const response = await fetch("https://api.capsolver.com/getBalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: config.apiKey }),
    })

    const data = (await response.json()) as {
      errorId: number
      balance?: number
      errorDescription?: string
    }

    if (data.errorId !== 0) {
      throw new Error(`Failed to get CapSolver balance: ${data.errorDescription}`)
    }

    return data.balance || 0
  }
}
