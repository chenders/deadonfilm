#!/usr/bin/env tsx
/**
 * Job Worker Process
 *
 * Standalone process that runs BullMQ workers to process jobs.
 * Run separately from the main app server.
 *
 * Usage:
 *   npx tsx src/worker.ts
 *   NODE_ENV=production node --import newrelic/esm-loader.mjs dist/src/worker.js
 */

import "dotenv/config"
import { logger } from "./lib/logger.js"
import { JobWorker } from "./lib/jobs/worker.js"
import { QueueName } from "./lib/jobs/types.js"

// Import handlers to register them
import "./lib/jobs/handlers/index.js"

const worker = new JobWorker()
let isShuttingDown = false

async function main() {
  logger.info("Starting job worker process...")

  // Parse queue names from env or use all queues
  const queueEnv = process.env.WORKER_QUEUES
  let queueNames: QueueName[]

  if (queueEnv) {
    const validQueueNames = new Set(Object.values(QueueName))
    const parsed = queueEnv
      .split(",")
      .map((q) => q.trim())
      .filter((q) => q.length > 0)

    // Validate all queue names
    const invalid = parsed.filter((q) => !validQueueNames.has(q as QueueName))
    if (invalid.length > 0) {
      logger.fatal({ invalid }, "Invalid queue names in WORKER_QUEUES")
      process.exit(1)
    }

    if (parsed.length === 0) {
      logger.fatal("WORKER_QUEUES is set but contains no valid queue names")
      process.exit(1)
    }

    // Deduplicate while preserving order
    queueNames = [...new Set(parsed)] as QueueName[]
  } else {
    queueNames = Object.values(QueueName)
  }

  logger.info({ queues: queueNames }, "Worker will process queues")

  // Start workers
  await worker.start(queueNames)

  logger.info("Job worker process started successfully")
}

// Graceful shutdown
async function shutdown(signal: string) {
  if (isShuttingDown) {
    logger.info({ signal }, "Shutdown already in progress, ignoring signal")
    return
  }
  isShuttingDown = true
  logger.info({ signal }, "Received shutdown signal, stopping workers...")

  try {
    await worker.shutdown()
    logger.info("Workers shut down successfully")
    process.exit(0)
  } catch (error) {
    logger.error({ error }, "Error during shutdown")
    process.exit(1)
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

main().catch((error) => {
  logger.fatal({ error }, "Failed to start worker process")
  process.exit(1)
})
