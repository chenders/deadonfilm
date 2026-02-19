/**
 * CAPTCHA detection for browser automation.
 *
 * Detects common CAPTCHA types:
 * - reCAPTCHA v2/v3
 * - hCaptcha
 * - PerimeterX
 * - DataDome
 */

import type { Page } from "playwright-core"

import type { CaptchaDetectionResult, CaptchaType } from "../types.js"

// CSS selectors for CAPTCHA detection
const CAPTCHA_SELECTORS = {
  // reCAPTCHA v2
  recaptchaV2: [
    'iframe[src*="recaptcha"]',
    'iframe[src*="google.com/recaptcha"]',
    ".g-recaptcha",
    '[data-sitekey][class*="recaptcha"]',
    "#recaptcha",
  ],
  // reCAPTCHA v3 (invisible, often just a badge)
  recaptchaV3: [".grecaptcha-badge", 'script[src*="recaptcha/api.js?render="]'],
  // hCaptcha
  hcaptcha: [
    'iframe[src*="hcaptcha"]',
    ".h-captcha",
    '[data-sitekey][class*="hcaptcha"]',
    "#hcaptcha",
  ],
  // PerimeterX
  perimeterx: [".px-captcha", "#px-captcha", 'iframe[src*="px-captcha"]', "[data-px-captcha]"],
  // DataDome
  datadome: ['iframe[src*="captcha-delivery.com"]', 'iframe[src*="geo.captcha-delivery.com"]'],
} as const

/**
 * Detect DataDome challenge page from page content.
 * DataDome challenge pages have a distinctive JavaScript structure.
 */
async function detectDataDomeChallenge(page: Page): Promise<{
  detected: boolean
  captchaUrl: string | null
  cookie: string | null
}> {
  try {
    // Check page content for DataDome signature
    const content = await page.content()

    // DataDome challenge pages start with "var dd=" containing challenge data
    // Check for DataDome's specific pattern: 'host':'*.captcha-delivery.com'
    const hasDataDomeSignature =
      content.includes("var dd=") && /'host'\s*:\s*'[^']*\.captcha-delivery\.com'/i.test(content)
    if (hasDataDomeSignature) {
      // Extract the captcha URL from the dd object
      // The structure is: var dd={'host':'geo.captcha-delivery.com',...}
      const hostMatch = content.match(/'host'\s*:\s*'([^']+captcha-delivery\.com[^']*)'/i)
      const captchaHost = hostMatch ? hostMatch[1] : "geo.captcha-delivery.com"

      // Extract the cookie value (used for solving)
      const cookieMatch = content.match(/'cookie'\s*:\s*'([^']+)'/i)
      const cookie = cookieMatch ? cookieMatch[1] : null

      // Build the captcha URL - DataDome uses an iframe with specific params
      // We need the current page URL to construct the captcha URL
      const pageUrl = page.url()
      const captchaUrl = `https://${captchaHost}/captcha/?initialCid=${encodeURIComponent(pageUrl)}`

      return {
        detected: true,
        captchaUrl,
        cookie,
      }
    }

    // Also check for DataDome iframe directly
    const datadomeIframe = await page.locator('iframe[src*="captcha-delivery.com"]').first()
    if ((await datadomeIframe.count()) > 0) {
      const src = await datadomeIframe.getAttribute("src")
      return {
        detected: true,
        captchaUrl: src,
        cookie: null,
      }
    }

    return { detected: false, captchaUrl: null, cookie: null }
  } catch {
    return { detected: false, captchaUrl: null, cookie: null }
  }
}

/**
 * Extract the site key from a CAPTCHA element.
 */
async function extractSiteKey(page: Page, type: CaptchaType): Promise<string | null> {
  try {
    let siteKey: string | null = null

    switch (type) {
      case "recaptcha_v2":
      case "recaptcha_v3": {
        // Try data-sitekey attribute first
        // Note: This callback runs in browser context, not Node.js
        siteKey = await page.evaluate(() => {
          const element = document.querySelector("[data-sitekey]")
          if (element) {
            return element.getAttribute("data-sitekey")
          }

          // Check for reCAPTCHA script render parameter (for v3 implicit)
          const scripts = document.querySelectorAll("script[src*='recaptcha']")
          for (const script of scripts) {
            const src = script.getAttribute("src") || ""
            const match = src.match(/render=([a-zA-Z0-9_-]+)/)
            // Skip if render=explicit (means site key is elsewhere)
            if (match && match[1] !== "explicit") {
              return match[1]
            }
          }

          // Check iframe src for sitekey
          const iframe = document.querySelector(
            'iframe[src*="recaptcha"]'
          ) as HTMLIFrameElement | null
          if (iframe) {
            const src = iframe.src || ""
            const match = src.match(/k=([a-zA-Z0-9_-]+)/)
            if (match) {
              return match[1]
            }
          }

          // For explicit rendering, search page source for sitekey in JS
          // Common patterns: 'sitekey': '...', sitekey: "...", grecaptcha.render(..., {sitekey: '...'})
          const html = document.documentElement.innerHTML
          const patterns = [
            /['"]?sitekey['"]?\s*[:=]\s*['"]([a-zA-Z0-9_-]{40})['"]/, // sitekey: 'xxx' or sitekey = "xxx"
            /grecaptcha\.render\s*\([^,]+,\s*\{[^}]*['"]?sitekey['"]?\s*:\s*['"]([a-zA-Z0-9_-]{40})['"]/, // grecaptcha.render(el, {sitekey: 'xxx'})
            /data-sitekey=["']([a-zA-Z0-9_-]{40})["']/, // data-sitekey attribute in HTML string
          ]

          for (const pattern of patterns) {
            const match = html.match(pattern)
            if (match && match[1]) {
              return match[1]
            }
          }

          return null
        })
        break
      }

      case "hcaptcha": {
        // Note: This callback runs in browser context, not Node.js
        siteKey = await page.evaluate(() => {
          const element = document.querySelector(
            ".h-captcha[data-sitekey], [data-hcaptcha-sitekey]"
          )
          if (element) {
            return (
              element.getAttribute("data-sitekey") || element.getAttribute("data-hcaptcha-sitekey")
            )
          }

          const iframe = document.querySelector(
            'iframe[src*="hcaptcha"]'
          ) as HTMLIFrameElement | null
          if (iframe) {
            const src = iframe.src || ""
            const match = src.match(/sitekey=([a-zA-Z0-9-]+)/)
            if (match) {
              return match[1]
            }
          }

          return null
        })
        break
      }

      case "perimeterx": {
        // PerimeterX doesn't use a traditional site key
        // The appId is embedded differently
        siteKey = await page.evaluate(() => {
          // Check for window._pxAppId
          // @ts-expect-error - accessing potentially undefined global
          if (typeof window._pxAppId === "string") {
            // @ts-expect-error - accessing potentially undefined global
            return window._pxAppId as string
          }
          return null
        })
        break
      }
    }

    return siteKey
  } catch {
    return null
  }
}

/**
 * Detect if a CAPTCHA is present on the page.
 *
 * @param page - Playwright page to check
 * @returns Detection result with type and site key if found
 */
export async function detectCaptcha(page: Page): Promise<CaptchaDetectionResult> {
  // Check for DataDome first (used by NYTimes and other major sites)
  const datadomeResult = await detectDataDomeChallenge(page)
  if (datadomeResult.detected) {
    return {
      detected: true,
      type: "datadome",
      siteKey: null,
      selector: null,
      context: "DataDome challenge page detected",
      datadomeUrl: datadomeResult.captchaUrl || undefined,
      datadomeCookie: datadomeResult.cookie || undefined,
    }
  }

  // Check for DataDome iframe
  for (const selector of CAPTCHA_SELECTORS.datadome) {
    try {
      const count = await page.locator(selector).count()
      if (count > 0) {
        const iframe = page.locator(selector).first()
        const src = await iframe.getAttribute("src")
        return {
          detected: true,
          type: "datadome",
          siteKey: null,
          selector,
          context: "DataDome CAPTCHA iframe detected",
          datadomeUrl: src || undefined,
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check for reCAPTCHA v2 (most common after DataDome)
  for (const selector of CAPTCHA_SELECTORS.recaptchaV2) {
    try {
      const count = await page.locator(selector).count()
      if (count > 0) {
        const siteKey = await extractSiteKey(page, "recaptcha_v2")
        return {
          detected: true,
          type: "recaptcha_v2",
          siteKey,
          selector,
          context: "reCAPTCHA v2 challenge detected",
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check for hCaptcha
  for (const selector of CAPTCHA_SELECTORS.hcaptcha) {
    try {
      const count = await page.locator(selector).count()
      if (count > 0) {
        const siteKey = await extractSiteKey(page, "hcaptcha")
        return {
          detected: true,
          type: "hcaptcha",
          siteKey,
          selector,
          context: "hCaptcha challenge detected",
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check for PerimeterX
  for (const selector of CAPTCHA_SELECTORS.perimeterx) {
    try {
      const count = await page.locator(selector).count()
      if (count > 0) {
        const siteKey = await extractSiteKey(page, "perimeterx")
        return {
          detected: true,
          type: "perimeterx",
          siteKey,
          selector,
          context: "PerimeterX challenge detected",
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check for reCAPTCHA v3 (invisible, check last)
  for (const selector of CAPTCHA_SELECTORS.recaptchaV3) {
    try {
      const count = await page.locator(selector).count()
      if (count > 0) {
        const siteKey = await extractSiteKey(page, "recaptcha_v3")
        return {
          detected: true,
          type: "recaptcha_v3",
          siteKey,
          selector,
          context: "reCAPTCHA v3 detected (invisible)",
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check page content for CAPTCHA-related text (soft detection)
  try {
    const bodyText = await page.locator("body").textContent()
    const lowerBody = (bodyText || "").toLowerCase()

    const captchaTextPatterns = [
      "please verify you are human",
      "complete the captcha",
      "solve the captcha",
      "security check",
      "press and hold",
      "confirm you're not a robot",
    ]

    for (const pattern of captchaTextPatterns) {
      if (lowerBody.includes(pattern)) {
        return {
          detected: true,
          type: "unknown",
          siteKey: null,
          selector: null,
          context: `CAPTCHA-like text detected: "${pattern}"`,
        }
      }
    }
  } catch {
    // Ignore text extraction errors
  }

  return {
    detected: false,
    type: null,
    siteKey: null,
    selector: null,
  }
}

/**
 * Wait for a CAPTCHA to appear on the page.
 *
 * @param page - Playwright page to monitor
 * @param timeoutMs - Maximum time to wait (default: 5000)
 * @returns Detection result
 */
export async function waitForCaptcha(
  page: Page,
  timeoutMs: number = 5000
): Promise<CaptchaDetectionResult> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const result = await detectCaptcha(page)
    if (result.detected) {
      return result
    }

    // Wait a bit before checking again
    await page.waitForTimeout(500)
  }

  return {
    detected: false,
    type: null,
    siteKey: null,
    selector: null,
  }
}

/**
 * Check if the page appears to be a CAPTCHA challenge page.
 * More aggressive than detectCaptcha - checks page structure.
 *
 * @param page - Playwright page to check
 * @returns true if page seems to be primarily a CAPTCHA challenge
 */
export async function isChallengePage(page: Page): Promise<boolean> {
  // First check for explicit CAPTCHA elements
  const captchaResult = await detectCaptcha(page)
  if (captchaResult.detected) {
    return true
  }

  // Check if page has minimal content (challenge pages are often sparse)
  try {
    const bodyText = await page.locator("body").textContent()
    const textLength = (bodyText || "").trim().length

    // Challenge pages typically have very little text
    if (textLength < 500) {
      // Check for challenge-related URLs
      const url = page.url().toLowerCase()
      if (
        url.includes("captcha") ||
        url.includes("challenge") ||
        url.includes("/cdn-cgi/") ||
        url.includes("px/captcha")
      ) {
        return true
      }
    }
  } catch {
    // Ignore errors
  }

  return false
}
