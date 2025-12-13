import { test, expect } from "@playwright/test"

test.describe("Death Watch Page", () => {
  test("displays death watch page with actor list", async ({ page }) => {
    await page.goto("/death-watch")

    // Verify page title
    await expect(page.getByRole("heading", { name: "Death Watch" })).toBeVisible()

    // Verify page description is visible
    await expect(
      page.getByText(/Living actors in our database ranked by their probability/)
    ).toBeVisible()

    // Verify filter toggle
    await expect(page.getByText("Include lesser-known actors")).toBeVisible()

    // Wait for actor list to load (skip loading state)
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    // Verify at least one actor row is displayed
    const actorRows = page.locator('[data-testid^="death-watch-row-"]')
    await expect(actorRows.first()).toBeVisible()

    // Take full page screenshot
    await page.screenshot({
      path: "e2e/screenshots/death-watch-page.png",
      fullPage: true,
    })
  })

  test("actor row displays correctly on desktop", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Desktop-specific test")

    await page.goto("/death-watch")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="death-watch-row-"]').first()

    // On desktop, we should see the full horizontal layout with all columns
    // Check that the desktop layout is visible (has md:flex class)
    const desktopLayout = firstRow.locator(".md\\:flex").first()
    await expect(desktopLayout).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/death-watch-row-desktop.png",
    })
  })

  test("actor row displays correctly on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-specific test")

    await page.goto("/death-watch")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="death-watch-row-"]').first()

    // On mobile, we should see the stacked mobile layout
    // Check that the mobile layout is visible (has md:hidden class)
    const mobileLayout = firstRow.locator(".md\\:hidden").first()
    await expect(mobileLayout).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/death-watch-row-mobile.png",
    })
  })

  test("responsive layout changes between viewports", async ({ page }) => {
    await page.goto("/death-watch")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="death-watch-row-"]').first()

    // Visual regression test - layout should match baseline for this viewport
    await expect(firstRow).toHaveScreenshot("death-watch-row-layout.png", {
      maxDiffPixelRatio: 0.02,
    })
  })

  test("filter toggle works", async ({ page }) => {
    await page.goto("/death-watch")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    const checkbox = page.getByRole("checkbox")
    await expect(checkbox).not.toBeChecked()

    // Toggle the filter
    await checkbox.click()

    // URL should update with filter
    await expect(page).toHaveURL(/includeObscure=true/)

    // Wait for list to reload
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    // Take screenshot with filter enabled
    await page.screenshot({
      path: "e2e/screenshots/death-watch-filter-enabled.png",
      fullPage: true,
    })
  })

  test("actor rows are clickable links", async ({ page }) => {
    await page.goto("/death-watch")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="death-watch-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="death-watch-row-"]').first()

    // Verify it's a link
    await expect(firstRow).toHaveAttribute("href", /\/actor\//)

    // Click and verify navigation
    await firstRow.click()
    await expect(page).toHaveURL(/\/actor\//)
  })
})
