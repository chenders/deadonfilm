#!/usr/bin/env tsx
/**
 * Job Worker Process
 *
 * Standalone process that runs BullMQ workers to process jobs.
 * Run separately from the main app server.
 *
 * Usage:
 *   npx tsx src/worker.ts
 *   NODE_ENV=production node --import newrelic/esm-loader.mjs dist/worker.js
 */

import "dotenv/config"
import { logger } from "./lib/logger.js"
import { JobWorker } from "./lib/jobs/worker.js"
import { QueueName } from "./lib/jobs/types.js"

// Import handlers to register them
import "./lib/jobs/handlers/index.js"

const worker = new JobWorker()

async function main() {
  logger.info("Starting job worker process...")

  // Parse queue names from env or use all queues
  const queueEnv = process.env.WORKER_QUEUES
  const queueNames = queueEnv
    ? (queueEnv.split(",").map((q) => q.trim()) as QueueName[])
    : Object.values(QueueName)

  logger.info({ queues: queueNames }, "Worker will process queues")

  // Start workers
  await worker.start(queueNames)

  logger.info("Job worker process started successfully")
}

// Graceful shutdown
async function shutdown(signal: string) {
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
