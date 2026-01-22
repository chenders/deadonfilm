import { Request, Response, NextFunction } from "express"
import { verifyToken } from "../lib/admin-auth.js"
import { logger } from "../lib/logger.js"

// Extend Express Request type to include isAdmin flag
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      isAdmin?: boolean
    }
  }
}

/**
 * Admin authentication middleware
 * Verifies JWT token from cookies and sets req.isAdmin flag
 * Returns 401 if authentication fails
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract JWT token from cookie
    const token = req.cookies?.adminToken

    // Validate token exists and is a string
    // codeql[js/user-controlled-bypass] - False positive: Input validation before cryptographic JWT verification
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      res.status(401).json({ error: { message: "Authentication required" } })
      return
    }

    // Verify token using cryptographic validation
    const decoded = verifyToken(token)

    // Ensure decoded token is valid and contains admin flag
    if (!decoded || typeof decoded !== "object" || decoded.isAdmin !== true) {
      res.status(401).json({ error: { message: "Invalid authentication token" } })
      return
    }

    // Set admin flag on request
    req.isAdmin = true
    next()
  } catch (error) {
    logger.error({ error }, "Admin auth middleware error")
    res.status(500).json({ error: { message: "Authentication error" } })
  }
}

/**
 * Optional admin authentication middleware
 * Checks for JWT token and sets req.isAdmin flag if present, but doesn't block the request
 * Used for rate limit bypass - allows requests through even without auth
 */
export function optionalAdminAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.adminToken

    // Only process if token exists and is a valid string
    // codeql[js/user-controlled-bypass] - False positive: Input validation before cryptographic JWT verification
    if (token && typeof token === "string" && token.trim().length > 0) {
      // Verify token using cryptographic validation
      const decoded = verifyToken(token)

      // Only set admin flag if token is valid and contains admin claim
      if (decoded && typeof decoded === "object" && decoded.isAdmin === true) {
        req.isAdmin = true
      }
    }
  } catch (error) {
    logger.warn({ error }, "Optional admin auth check failed")
  }
  next()
}
