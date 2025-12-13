import { test, expect } from "@playwright/test"

test.describe("COVID-19 Deaths Page", () => {
  test("displays covid deaths page with actor list", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Verify page title
    await expect(page.getByRole("heading", { name: "COVID-19 Deaths" })).toBeVisible()

    // Verify page description is visible
    await expect(
      page.getByText(/Actors in our database who died from COVID-19/)
    ).toBeVisible()

    // Wait for actor list to load (skip loading state)
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    // Verify at least one actor row is displayed
    const actorRows = page.locator('[data-testid^="covid-death-row-"]')
    await expect(actorRows.first()).toBeVisible()

    // Take full page screenshot
    await page.screenshot({
      path: "e2e/screenshots/covid-deaths-page.png",
      fullPage: true,
    })
  })

  test("actor row displays correctly on desktop", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Desktop-specific test")

    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // On desktop, we should see the full horizontal layout with all columns
    // Check that the desktop layout is visible (has md:flex class)
    const desktopLayout = firstRow.locator(".md\\:flex").first()
    await expect(desktopLayout).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/covid-death-row-desktop.png",
    })
  })

  test("actor row displays correctly on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-specific test")

    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // On mobile, we should see the stacked mobile layout
    // Check that the mobile layout is visible (has md:hidden class)
    const mobileLayout = firstRow.locator(".md\\:hidden").first()
    await expect(mobileLayout).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/covid-death-row-mobile.png",
    })
  })

  test("responsive layout changes between viewports", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Visual regression test - layout should match baseline for this viewport
    await expect(firstRow).toHaveScreenshot("covid-death-row-layout.png", {
      maxDiffPixelRatio: 0.02,
    })
  })

  test("actor rows are clickable links", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Verify it's a link
    await expect(firstRow).toHaveAttribute("href", /\/actor\//)

    // Click and verify navigation
    await firstRow.click()
    await expect(page).toHaveURL(/\/actor\//)
  })

  test("displays death information", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    // Verify that death-related info is shown (date, cause)
    // At least one row should show a death date - use visible: true to only match currently visible elements
    const visibleDiedElements = page.locator("text=/Died/").locator("visible=true")
    await expect(visibleDiedElements.first()).toBeVisible()
  })
})
