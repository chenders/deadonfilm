/**
 * Browser stealth techniques to avoid bot detection.
 *
 * Implements common anti-detection measures without external dependencies.
 * Works directly with playwright-core.
 *
 * Techniques include:
 * - Hiding navigator.webdriver
 * - Removing automation indicators
 * - Setting realistic browser properties
 * - Fixing Chrome-specific detection points
 */

import type { BrowserContext, Page } from "playwright-core"

/**
 * Script to inject into pages to hide automation indicators.
 * This runs before any page scripts execute.
 */
const STEALTH_SCRIPT = `
// Hide webdriver property
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true
});

// Remove automation-related properties from navigator
delete navigator.__proto__.webdriver;

// Fix Chrome-specific automation detection
if (navigator.userAgent.includes('Chrome')) {
  // Override navigator.plugins to look normal
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' }
      ];
      plugins.item = (i) => plugins[i];
      plugins.namedItem = (name) => plugins.find(p => p.name === name);
      plugins.refresh = () => {};
      return plugins;
    },
    configurable: true
  });

  // Override navigator.languages to look realistic
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });

  // Override navigator.mimeTypes
  Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
      const mimeTypes = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
      ];
      mimeTypes.item = (i) => mimeTypes[i];
      mimeTypes.namedItem = (type) => mimeTypes.find(m => m.type === type);
      return mimeTypes;
    },
    configurable: true
  });
}

// Fix permissions API to not leak automation
if (navigator.permissions) {
  const originalQuery = navigator.permissions.query;
  navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
      Promise.resolve({ state: Notification.permission }) :
      originalQuery(parameters)
  );
}

// Hide automation indicators in window
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

// Override chrome runtime to appear normal
if (window.chrome) {
  window.chrome.runtime = {
    PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
    PlatformArch: { ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
    PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
    RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
    OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }
  };
}

// Fix console.debug to not reveal automation
const originalDebug = console.debug;
console.debug = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('puppeteer')) {
    return;
  }
  return originalDebug.apply(console, args);
};

// Override Function.prototype.toString for stealth
const originalFunctionToString = Function.prototype.toString;
Function.prototype.toString = function() {
  if (this === navigator.permissions.query) {
    return 'function query() { [native code] }';
  }
  return originalFunctionToString.call(this);
};
`

/**
 * Apply stealth techniques to a browser context.
 * This should be called immediately after creating the context.
 *
 * @param context - Browser context to apply stealth to
 */
export async function applyStealthToContext(context: BrowserContext): Promise<void> {
  // Add init script that runs before any page scripts
  await context.addInitScript(STEALTH_SCRIPT)
}

/**
 * Apply stealth techniques to a single page.
 * Use this if you can't apply to the context (e.g., existing page).
 *
 * @param page - Page to apply stealth to
 */
export async function applyStealthToPage(page: Page): Promise<void> {
  await page.addInitScript(STEALTH_SCRIPT)
}

/**
 * Get browser launch arguments for stealth mode.
 * These should be added to chromium.launch() args.
 */
export function getStealthLaunchArgs(): string[] {
  return [
    // Disable automation features
    "--disable-blink-features=AutomationControlled",

    // Disable various Chrome features that indicate automation
    "--disable-dev-shm-usage",
    "--disable-infobars",

    // Security flags (needed for some sites)
    "--no-sandbox",
    "--disable-setuid-sandbox",

    // Window configuration
    "--window-position=0,0",

    // Ignore certificate errors (sometimes needed for captcha solving)
    "--ignore-certificate-errors",
    "--ignore-certificate-errors-spki-list",

    // Additional stealth flags
    "--disable-features=IsolateOrigins,site-per-process",
    "--flag-switches-begin",
    "--flag-switches-end",

    // Disable webrtc IP leak (privacy)
    "--disable-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",

    // Disable GPU if headless (reduces fingerprint)
    "--disable-gpu",

    // Disable extensions (reduces fingerprint)
    "--disable-extensions",
  ]
}

/**
 * Get a realistic user agent string.
 * Matches common Chrome on macOS configuration.
 */
export function getRealisticUserAgent(): string {
  // Chrome 120 on macOS Sonoma (14.0)
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

/**
 * Get realistic viewport dimensions.
 * Common desktop resolution.
 */
export function getRealisticViewport(): { width: number; height: number } {
  return { width: 1920, height: 1080 }
}
