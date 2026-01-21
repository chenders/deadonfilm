/**
 * API routes for the Causes of Death category pages.
 *
 * Routes:
 * - GET /api/causes-of-death - Get all categories with stats
 * - GET /api/causes-of-death/:categorySlug - Get category detail with actors
 * - GET /api/causes-of-death/:categorySlug/:causeSlug - Get specific cause with actors
 */

import type { Request, Response } from "express"
import { getCauseCategoryIndex, getCauseCategory, getSpecificCause } from "../lib/db.js"
import { sendWithETag } from "../lib/etag.js"
import newrelic from "newrelic"
import { isValidCategorySlug } from "../lib/cause-categories.js"

/**
 * Handler for GET /api/causes-of-death
 * Returns all cause categories with counts and statistics.
 */
export async function getCauseCategoryIndexHandler(req: Request, res: Response) {
  try {
    const startTime = Date.now()

    if (!process.env.DATABASE_URL) {
      return res.json({
        categories: [],
        totalWithKnownCause: 0,
        overallAvgAge: null,
        overallAvgYearsLost: null,
        mostCommonCategory: null,
      })
    }

    const data = await getCauseCategoryIndex()

    newrelic.recordCustomEvent("CausesCategoryIndexFetch", {
      categoryCount: data.categories.length,
      totalWithKnownCause: data.totalWithKnownCause,
      durationMs: Date.now() - startTime,
    })

    sendWithETag(req, res, data, 3600) // 1 hour cache
  } catch (error) {
    console.error("Cause category index error:", error)
    res.status(500).json({ error: { message: "Failed to fetch cause categories" } })
  }
}

/**
 * Handler for GET /api/causes-of-death/:categorySlug
 * Returns category detail with notable actors, decade breakdown, and paginated actor list.
 */
export async function getCauseCategoryHandler(req: Request, res: Response) {
  try {
    const startTime = Date.now()

    if (!process.env.DATABASE_URL) {
      return res.status(404).json({ error: { message: "Category not found" } })
    }

    const categorySlug = req.params.categorySlug
    if (!categorySlug) {
      return res.status(400).json({ error: { message: "Category slug is required" } })
    }

    // Validate category slug
    if (!isValidCategorySlug(categorySlug)) {
      return res.status(404).json({ error: { message: "Category not found" } })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const includeObscure = req.query.includeObscure === "true"
    const specificCause = (req.query.cause as string) || null

    const data = await getCauseCategory(categorySlug, {
      page,
      includeObscure,
      specificCause,
    })

    if (!data) {
      return res.status(404).json({ error: { message: "Category not found" } })
    }

    newrelic.recordCustomEvent("CausesCategoryFetch", {
      categorySlug,
      page,
      includeObscure,
      actorCount: data.actors.length,
      totalCount: data.count,
      durationMs: Date.now() - startTime,
    })

    sendWithETag(req, res, data, 3600) // 1 hour cache
  } catch (error) {
    console.error("Cause category error:", error)
    res.status(500).json({ error: { message: "Failed to fetch cause category" } })
  }
}

/**
 * Handler for GET /api/causes-of-death/:categorySlug/:causeSlug
 * Returns specific cause detail with notable actors, decade breakdown, and paginated actor list.
 */
export async function getSpecificCauseHandler(req: Request, res: Response) {
  try {
    const startTime = Date.now()

    if (!process.env.DATABASE_URL) {
      return res.status(404).json({ error: { message: "Cause not found" } })
    }

    const { categorySlug, causeSlug } = req.params
    if (!categorySlug || !causeSlug) {
      return res.status(400).json({ error: { message: "Category and cause slugs are required" } })
    }

    // Validate category slug
    if (!isValidCategorySlug(categorySlug)) {
      return res.status(404).json({ error: { message: "Category not found" } })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const includeObscure = req.query.includeObscure === "true"

    const data = await getSpecificCause(categorySlug, causeSlug, {
      page,
      includeObscure,
    })

    if (!data) {
      return res.status(404).json({ error: { message: "Cause not found" } })
    }

    newrelic.recordCustomEvent("SpecificCauseFetch", {
      categorySlug,
      causeSlug,
      cause: data.cause,
      page,
      includeObscure,
      actorCount: data.actors.length,
      totalCount: data.count,
      durationMs: Date.now() - startTime,
    })

    sendWithETag(req, res, data, 3600) // 1 hour cache
  } catch (error) {
    console.error("Specific cause error:", error)
    res.status(500).json({ error: { message: "Failed to fetch specific cause" } })
  }
}
