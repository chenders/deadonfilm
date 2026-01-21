import { Request } from "express"
import rateLimit from "express-rate-limit"

/**
 * Skip rate limiting for authenticated admin users
 * This function is used as the `skip` callback for express-rate-limit
 * @param req - Express request object
 * @returns True if rate limiting should be skipped (admin user)
 */
export function skipRateLimitForAdmin(req: Request): boolean {
  return req.isAdmin === true
}

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
