import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

test.describe("Accessibility", () => {
  test("home page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector('[data-testid="search-bar"]')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()

    // Filter to only critical and serious violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    )

    expect(criticalViolations).toEqual([])
  })

  test("movie page should have no critical accessibility violations", async ({ page }) => {
    // Use a known movie - Casablanca
    await page.goto("/movie/casablanca-1942-289")
    await page.waitForSelector('[data-testid="movie-header"]')

    // Wait for CSS fade-in animations to complete before scanning
    // (animations start with opacity: 0, which would cause false color contrast failures)
    await page.waitForFunction(() => {
      const elements = document.querySelectorAll(".animate-fade-slide-in")
      return Array.from(elements).every((el) => {
        const style = window.getComputedStyle(el)
        return style.opacity === "1"
      })
    })

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    )

    expect(criticalViolations).toEqual([])
  })

  test("search results dropdown should be accessible", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector('[data-testid="search-input"]')

    // Type in search to trigger dropdown
    await page.fill('[data-testid="search-input"]', "casablanca")
    await page.waitForSelector('[role="listbox"]')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-testid="search-bar"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    )

    expect(criticalViolations).toEqual([])
  })
})
