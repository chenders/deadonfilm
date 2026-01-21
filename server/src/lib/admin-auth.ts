import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { logger } from "./logger.js"
import { getPool } from "./db/pool.js"

const BCRYPT_ROUNDS = 10
const JWT_EXPIRY = "7d"

// JWT payload interface
export interface AdminJWT {
  isAdmin: true
  iat: number // issued at
  exp: number // expiry
}

// Audit log entry interface
export interface AuditLogEntry {
  action: string
  resourceType?: string
  resourceId?: number
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a bcrypt hash
 * @param password - Plain text password
 * @param hash - Bcrypt hash to verify against
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Generate a JWT token for admin authentication
 * @returns Signed JWT token
 */
export function generateToken(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET environment variable not set")
  }

  const payload = {
    isAdmin: true as const,
  }

  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRY })
}

/**
 * Verify a JWT token and extract payload
 * @param token - JWT token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyToken(token: string): AdminJWT | null {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    logger.error("JWT_SECRET environment variable not set")
    return null
  }

  try {
    const decoded = jwt.verify(token, secret) as AdminJWT
    return decoded
  } catch (error) {
    logger.warn({ error }, "Invalid JWT token")
    return null
  }
}

/**
 * Log an admin action to the database and New Relic
 * @param entry - Audit log entry details
 */
export async function logAdminAction(entry: AuditLogEntry): Promise<void> {
  try {
    // Log to database
    const pool = getPool()
    await pool.query(
      `INSERT INTO admin_audit_log
       (action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
      ]
    )

    // Log to New Relic (custom event)
    // @ts-expect-error - newrelic is added globally by the agent
    if (global.newrelic) {
      // @ts-expect-error - newrelic is added globally by the agent
      global.newrelic.recordCustomEvent("AdminAction", {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        ipAddress: entry.ipAddress,
        ...entry.details,
      })
    }

    logger.info(
      {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
      },
      "Admin action logged"
    )
  } catch (error) {
    // Log error but don't throw - audit logging failure shouldn't break the app
    logger.error({ error, entry }, "Failed to log admin action")
  }
}
