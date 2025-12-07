import { test, expect } from "@playwright/test"

test.describe("Home Page", () => {
  test("displays home page with search bar", async ({ page }) => {
    await page.goto("/")

    // Verify key elements are present
    await expect(page.getByTestId("site-header")).toBeVisible()
    await expect(page.getByTestId("site-title")).toHaveText("Dead on Film")
    await expect(page.getByTestId("search-bar")).toBeVisible()
    await expect(page.getByTestId("search-input")).toBeVisible()

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/home-page.png", fullPage: true })
  })

  test("search shows dropdown results", async ({ page }) => {
    await page.goto("/")

    // Type in search
    await page.getByTestId("search-input").fill("The Matrix")

    // Wait for results to load
    await page.waitForTimeout(1000)

    // Take screenshot of search results
    await page.screenshot({ path: "e2e/screenshots/search-results.png" })
  })
})
