import { Request } from "express"

/**
 * Skip rate limiting for authenticated admin users
 * This function is used as the `skip` callback for express-rate-limit
 * @param req - Express request object
 * @returns True if rate limiting should be skipped (admin user)
 */
export function skipRateLimitForAdmin(req: Request): boolean {
  return req.isAdmin === true
}
