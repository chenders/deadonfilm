import { Request, Response } from "express"
import { verifyPassword, generateToken, logAdminAction } from "../../lib/admin-auth.js"
import { logger } from "../../lib/logger.js"

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

/**
 * POST /admin/api/auth/login
 * Authenticate admin user with password
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { password } = req.body

    // Validate password is provided and is a string
    // codeql[js/user-controlled-bypass] - False positive: Input validation before cryptographic bcrypt verification
    if (!password || typeof password !== "string" || password.trim().length === 0) {
      res.status(400).json({ error: { message: "Password required" } })
      return
    }

    // Get password hash from environment
    const passwordHash = process.env.ADMIN_PASSWORD_HASH
    if (!passwordHash) {
      logger.error("ADMIN_PASSWORD_HASH environment variable not set")
      res.status(500).json({ error: { message: "Server configuration error" } })
      return
    }

    // Verify password
    const isValid = await verifyPassword(password, passwordHash)
    if (!isValid) {
      // Log failed login attempt
      await logAdminAction({
        action: "login_failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      res.status(401).json({ error: { message: "Invalid password" } })
      return
    }

    // Generate JWT token
    const token = generateToken()

    // Set httpOnly cookie
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
    })

    // Log successful login
    await logAdminAction({
      action: "login",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, "Login handler error")
    res.status(500).json({ error: { message: "Login failed" } })
  }
}

/**
 * POST /admin/api/auth/logout
 * Clear authentication cookie
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    // Clear cookie
    res.clearCookie("adminToken")

    // Log logout
    await logAdminAction({
      action: "logout",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, "Logout handler error")
    res.status(500).json({ error: { message: "Logout failed" } })
  }
}

/**
 * GET /admin/api/auth/status
 * Check if user is authenticated
 */
export function statusHandler(req: Request, res: Response): void {
  res.json({ authenticated: req.isAdmin === true })
}
