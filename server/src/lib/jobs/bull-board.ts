/**
 * Bull Board Integration
 *
 * Provides a web UI for monitoring and managing BullMQ queues.
 * Bull Board features:
 * - View all queues and their stats
 * - Inspect individual jobs (payload, progress, logs, stack traces)
 * - Retry failed jobs (single or bulk)
 * - Remove jobs from queue
 * - Clean completed/failed jobs
 * - Pause/resume queues
 * - Real-time updates via polling
 */

import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ExpressAdapter } from "@bull-board/express"
import type { Queue } from "bullmq"

/**
 * Setup Bull Board with all queues
 * @param queues Array of BullMQ queues to monitor
 * @returns Express router for Bull Board UI
 */
export function setupBullBoard(queues: Queue[]): ReturnType<ExpressAdapter["getRouter"]> {
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath("/admin/bull-board")

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  })

  return serverAdapter.getRouter()
}
