/* eslint-disable no-console */
import { chromium } from "playwright"

const pages = [
  { name: "home", path: "/" },
  { name: "movie", path: "/movie/the-shining-1980-694" },
  { name: "actor", path: "/actor/jack-nicholson-514" },
]

async function takeScreenshots() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  for (const { name, path } of pages) {
    // Navigate to page
    await page.goto(`http://localhost:5173${path}`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000) // Extra wait for animations

    // Take light mode screenshot
    await page.screenshot({
      path: `e2e/screenshots/${name}-light.png`,
      fullPage: false,
    })
    console.log(`Captured ${name}-light.png`)

    // Click theme toggle to switch to dark mode
    const toggle = page.getByTestId("theme-toggle")
    await toggle.click()
    await page.waitForTimeout(500) // Wait for transition

    // Take dark mode screenshot
    await page.screenshot({
      path: `e2e/screenshots/${name}-dark.png`,
      fullPage: false,
    })
    console.log(`Captured ${name}-dark.png`)

    // Switch back to light mode for next page
    await toggle.click()
    await page.waitForTimeout(300)
  }

  await browser.close()
  console.log("Done!")
}

takeScreenshots().catch(console.error)
