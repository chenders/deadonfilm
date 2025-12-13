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

  test("quick actions buttons layout", async ({ page }) => {
    await page.goto("/")

    // Verify quick actions container is visible
    const quickActions = page.getByTestId("quick-actions")
    await expect(quickActions).toBeVisible()

    // Verify all 5 buttons are present
    await expect(page.getByTestId("forever-young-btn")).toBeVisible()
    await expect(page.getByTestId("cursed-movies-btn")).toBeVisible()
    await expect(page.getByTestId("cursed-actors-btn")).toBeVisible()
    await expect(page.getByTestId("covid-deaths-btn")).toBeVisible()
    await expect(page.getByTestId("death-watch-btn")).toBeVisible()

    // Take screenshot of quick actions for visual regression testing
    await quickActions.screenshot({ path: "e2e/screenshots/quick-actions.png" })
  })

  test("search shows dropdown results", async ({ page }) => {
    await page.goto("/")

    // Type in search
    await page.getByTestId("search-input").fill("The Matrix")

    // Wait for search results dropdown to appear
    await expect(page.getByRole("listbox")).toBeVisible()

    // Take screenshot of search results
    await page.screenshot({ path: "e2e/screenshots/search-results.png" })
  })
})
