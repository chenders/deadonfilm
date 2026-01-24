import rateLimit from "express-rate-limit"
import { skipRateLimitForAdmin } from "./rate-limit-utils.js"

/**
 * Admin-friendly rate limiter
 * Same as the general API limiter but skips authenticated admins
 */
export const adminBypassApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
  skip: skipRateLimitForAdmin,
})

/**
 * Admin-friendly heavy endpoint limiter
 * Skips authenticated admins for heavy operations (sitemap, etc.)
 */
export const adminBypassHeavyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
  skip: skipRateLimitForAdmin,
})
