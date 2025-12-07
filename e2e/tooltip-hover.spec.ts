import { test, expect } from "@playwright/test"

test.describe("Tooltip Hover Issue", () => {
  // Using the specific movie mentioned in the bug report
  const movieUrl = "/movie/private-nurse-1941-95120"

  test("tooltip remains visible when hovering over cause of death", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for the page to load
    await expect(page.getByTestId("movie-page")).toBeVisible()

    // Wait for deceased cards to load
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    // Find "disease" text with tooltip (Kay Linaker's cause of death)
    const diseaseText = page.locator("text=disease").first()
    await diseaseText.scrollIntoViewIfNeeded()

    // Screenshot before hover
    await page.screenshot({
      path: "e2e/screenshots/tooltip-test-before-hover.png",
    })

    // Hover over the disease text
    await diseaseText.hover()

    // Wait a moment for any animations/transitions
    await page.waitForTimeout(300)

    // Screenshot during hover - should show tooltip
    await page.screenshot({
      path: "e2e/screenshots/tooltip-test-during-hover.png",
    })

    // Check if a tooltip appeared
    const tooltip = page.locator(".fixed.z-50")
    const tooltipVisible = await tooltip.isVisible()
    console.log("Tooltip visible:", tooltipVisible)

    // The tooltip should be visible while hovering
    await expect(tooltip).toBeVisible()

    // Verify tooltip contains expected content about Kay Linaker
    const tooltipText = await tooltip.textContent()
    console.log("Tooltip text:", tooltipText)
    expect(tooltipText).toContain("Linaker")
  })

  test("card hover lift does not interfere with tooltip trigger", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    // Find the first tooltip trigger
    const tooltipTrigger = page.locator(".decoration-dotted").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    // Get the first deceased card
    const firstCard = page.getByTestId("deceased-card").first()

    // Hover on the first card
    await firstCard.hover()
    await page.waitForTimeout(200)

    // Screenshot showing card lifted state
    await page.screenshot({
      path: "e2e/screenshots/tooltip-test-card-hover.png",
    })

    // Now hover specifically on the tooltip trigger
    await tooltipTrigger.hover()
    await page.waitForTimeout(300)

    // Screenshot showing tooltip
    await page.screenshot({
      path: "e2e/screenshots/tooltip-test-trigger-hover.png",
    })

    // Tooltip should be visible
    const tooltip = page.locator(".fixed.z-50")
    await expect(tooltip).toBeVisible()
  })

  test("tooltip does not flicker when card lifts", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    await expect(page.getByTestId("deceased-cards")).toBeVisible()

    // Find the first tooltip trigger
    const tooltipTrigger = page.locator(".decoration-dotted").first()
    await tooltipTrigger.scrollIntoViewIfNeeded()

    const triggerBox = await tooltipTrigger.boundingBox()
    if (!triggerBox) {
      throw new Error("Could not get trigger bounding box")
    }

    // Move mouse to just above the trigger (on the card but not on trigger)
    await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y - 20)
    await page.waitForTimeout(100)

    // Now slowly move onto the trigger
    await page.mouse.move(
      triggerBox.x + triggerBox.width / 2,
      triggerBox.y + triggerBox.height / 2
    )
    await page.waitForTimeout(300)

    // Screenshot
    await page.screenshot({
      path: "e2e/screenshots/tooltip-test-slow-approach.png",
    })

    // Tooltip should be visible
    const tooltip = page.locator(".fixed.z-50")
    await expect(tooltip).toBeVisible()

    // Verify the tooltip contains text
    const tooltipText = await tooltip.textContent()
    console.log("Tooltip text:", tooltipText)
    expect(tooltipText).toBeTruthy()
  })
})
