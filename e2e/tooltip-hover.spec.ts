import { test, expect } from "@playwright/test"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const movieData = JSON.parse(readFileSync(join(__dirname, "fixtures/movie-95120.json"), "utf-8"))

test.describe("Card Hover and Tooltip Behavior", () => {
  // Using Private Nurse which has actors with cause of death details
  const movieUrl = "/movie/private-nurse-1941-95120"

  // Mock the API response to ensure consistent test data with cause of death details
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/movie/95120", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(movieData),
      })
    })
  })

  test("card should have no visual changes on hover (no lift, no shadow)", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait longer for API response
    await expect(page.getByTestId("movie-page")).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    const firstCard = page.getByTestId("deceased-card").first()
    await firstCard.scrollIntoViewIfNeeded()

    // Get card position and computed styles BEFORE hover
    const beforeHoverBox = await firstCard.boundingBox()
    const beforeStyles = await firstCard.evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return {
        transform: styles.transform,
        boxShadow: styles.boxShadow,
        top: el.getBoundingClientRect().top,
      }
    })

    // Screenshot before hover
    await page.screenshot({
      path: "e2e/screenshots/card-before-hover.png",
    })

    // Hover over the card
    await firstCard.hover()
    await page.waitForTimeout(300) // Wait for any CSS transitions

    // Get card position and computed styles AFTER hover
    const afterHoverBox = await firstCard.boundingBox()
    const afterStyles = await firstCard.evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return {
        transform: styles.transform,
        boxShadow: styles.boxShadow,
        top: el.getBoundingClientRect().top,
      }
    })

    // Screenshot after hover
    await page.screenshot({
      path: "e2e/screenshots/card-after-hover.png",
    })

    // Assert: Card position should not change (no lift)
    expect(beforeHoverBox?.y).toBe(afterHoverBox?.y)
    expect(beforeStyles.top).toBe(afterStyles.top)

    // Assert: Transform should be the same (no translateY)
    expect(beforeStyles.transform).toBe(afterStyles.transform)

    // Assert: Box shadow should be "none" or unchanged
    // "none" in CSS is often represented as "none" or "rgba(0, 0, 0, 0) 0px 0px 0px 0px"
    const shadowIsNone = (shadow: string) =>
      shadow === "none" || shadow.includes("0px 0px 0px 0px") || shadow === ""

    expect(
      shadowIsNone(afterStyles.boxShadow) || beforeStyles.boxShadow === afterStyles.boxShadow
    ).toBe(true)
  })

  test("tooltip appears in correct position when hovering over info icon", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    // Find a tooltip trigger (cause of death with details - has dotted underline)
    const tooltipTrigger = page.locator(".tooltip-trigger").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    // Get trigger position
    const triggerBox = await tooltipTrigger.boundingBox()
    expect(triggerBox).toBeTruthy()

    // Screenshot before hover
    await page.screenshot({
      path: "e2e/screenshots/tooltip-before-hover.png",
    })

    // Hover over the trigger
    await tooltipTrigger.hover()
    await page.waitForTimeout(300)

    // Screenshot during hover
    await page.screenshot({
      path: "e2e/screenshots/tooltip-during-hover.png",
    })

    // Tooltip should be visible
    const tooltip = page.locator(".fixed.z-50.max-w-xs")
    await expect(tooltip).toBeVisible()

    // Get tooltip position
    const tooltipBox = await tooltip.boundingBox()
    expect(tooltipBox).toBeTruthy()

    // Tooltip should be positioned near the trigger (below or above it)
    // The tooltip should be within a reasonable distance of the trigger
    const verticalDistance = Math.abs(tooltipBox!.y - triggerBox!.y)
    const isPositionedNearTrigger = verticalDistance < 200 // Within 200px vertically

    expect(isPositionedNearTrigger).toBe(true)

    // Tooltip should have meaningful content
    const tooltipText = await tooltip.textContent()
    expect(tooltipText).toBeTruthy()
    expect(tooltipText!.length).toBeGreaterThan(10)
  })

  test("tooltip stays visible when moving mouse from trigger to tooltip", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    const tooltipTrigger = page.locator(".tooltip-trigger").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    // Hover over the trigger to show tooltip
    await tooltipTrigger.hover()
    await page.waitForTimeout(300)

    // Tooltip should be visible
    const tooltip = page.locator(".fixed.z-50.max-w-xs")
    await expect(tooltip).toBeVisible()

    // Move mouse to the tooltip itself
    await tooltip.hover()
    await page.waitForTimeout(200)

    // Screenshot with mouse on tooltip
    await page.screenshot({
      path: "e2e/screenshots/tooltip-mouse-on-tooltip.png",
    })

    // Tooltip should still be visible
    await expect(tooltip).toBeVisible()
  })

  test("tooltip disappears when mouse leaves both trigger and tooltip", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    const tooltipTrigger = page.locator(".tooltip-trigger").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    // Hover to show tooltip
    await tooltipTrigger.hover()
    await page.waitForTimeout(300)

    const tooltip = page.locator(".fixed.z-50.max-w-xs")
    await expect(tooltip).toBeVisible()

    // Move mouse away from both trigger and tooltip
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)

    // Tooltip should be hidden
    await expect(tooltip).not.toBeVisible()
  })

  test("card does not interfere with tooltip when approaching from card body", async ({
    page,
  }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    const tooltipTrigger = page.locator(".tooltip-trigger").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    const triggerBox = await tooltipTrigger.boundingBox()
    if (!triggerBox) {
      throw new Error("Could not get trigger bounding box")
    }

    // First hover on the card body (to the left of the trigger)
    await page.mouse.move(triggerBox.x - 100, triggerBox.y + triggerBox.height / 2)
    await page.waitForTimeout(200)

    // Screenshot: hovering on card
    await page.screenshot({
      path: "e2e/screenshots/tooltip-hover-on-card.png",
    })

    // Now move to the trigger
    await page.mouse.move(
      triggerBox.x + triggerBox.width / 2,
      triggerBox.y + triggerBox.height / 2
    )
    await page.waitForTimeout(300)

    // Screenshot: hovering on trigger
    await page.screenshot({
      path: "e2e/screenshots/tooltip-hover-on-trigger.png",
    })

    // Tooltip should be visible
    const tooltip = page.locator(".fixed.z-50.max-w-xs")
    await expect(tooltip).toBeVisible()

    // Verify tooltip position is stable (not jumping around due to card movement)
    const tooltipBox = await tooltip.boundingBox()
    expect(tooltipBox).toBeTruthy()
  })
})
