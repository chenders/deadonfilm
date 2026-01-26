/**
 * Migration: Create job queue tables
 *
 * Creates tables for BullMQ-based job queue system:
 * - job_runs: Audit trail for all jobs (pending, active, completed, failed)
 * - job_dead_letter: Permanently failed jobs for manual review
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create job_runs table for job execution tracking
  pgm.createTable("job_runs", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    job_id: {
      type: "varchar(100)",
      notNull: true,
      comment: "BullMQ job ID (unique per queue)",
    },
    job_type: {
      type: "varchar(50)",
      notNull: true,
      comment: "Job type enum value (e.g., fetch-omdb-ratings)",
    },
    queue_name: {
      type: "varchar(50)",
      notNull: true,
      comment: "Queue name (ratings, enrichment, cache, etc.)",
    },

    // Status tracking
    status: {
      type: "varchar(20)",
      notNull: true,
      comment: "Job status: pending, active, completed, failed, delayed, cancelled",
    },
    priority: {
      type: "integer",
      default: 5,
      comment: "Job priority (higher = processed first, 5 = NORMAL)",
    },

    // Timing
    queued_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
      comment: "When job was added to queue",
    },
    started_at: {
      type: "timestamptz",
      comment: "When job processing started",
    },
    completed_at: {
      type: "timestamptz",
      comment: "When job finished (success or failure)",
    },
    duration_ms: {
      type: "integer",
      comment: "Job execution duration in milliseconds",
    },

    // Retry tracking
    attempts: {
      type: "integer",
      notNull: true,
      default: 0,
      comment: "Number of attempts so far",
    },
    max_attempts: {
      type: "integer",
      notNull: true,
      default: 3,
      comment: "Maximum retry attempts before permanent failure",
    },

    // Payload and results
    payload: {
      type: "jsonb",
      notNull: true,
      comment: "Job input data",
    },
    result: {
      type: "jsonb",
      comment: "Job output data (on success)",
    },
    error_message: {
      type: "text",
      comment: "Error message (on failure)",
    },
    error_stack: {
      type: "text",
      comment: "Full error stack trace (on failure)",
    },

    // Metadata
    worker_id: {
      type: "varchar(100)",
      comment: "ID of worker that processed the job",
    },
    created_by: {
      type: "varchar(100)",
      comment: "Script/route that created the job",
    },
  })

  // Add check constraint for status values
  pgm.addConstraint("job_runs", "job_runs_status_check", {
    check:
      "status IN ('pending', 'active', 'completed', 'failed', 'delayed', 'cancelled')",
  })

  // Add unique constraint on (queue_name, job_id) since BullMQ job IDs are unique per queue
  pgm.addConstraint("job_runs", "job_runs_queue_job_unique", {
    unique: ["queue_name", "job_id"],
  })

  // Create indexes for job_runs
  pgm.createIndex("job_runs", ["job_type", "status"], {
    name: "idx_job_runs_type_status",
  })
  pgm.createIndex("job_runs", ["queue_name", "status"], {
    name: "idx_job_runs_queue_status",
  })
  pgm.createIndex("job_runs", "queued_at", {
    name: "idx_job_runs_queued_at",
    method: "btree",
  })
  pgm.createIndex("job_runs", "payload", {
    name: "idx_job_runs_payload",
    method: "gin",
    opclass: { payload: "jsonb_path_ops" },
  })

  // Create job_dead_letter table for permanently failed jobs
  pgm.createTable("job_dead_letter", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    job_id: {
      type: "varchar(100)",
      notNull: true,
      comment: "Original BullMQ job ID",
    },
    job_type: {
      type: "varchar(50)",
      notNull: true,
      comment: "Job type that failed",
    },
    queue_name: {
      type: "varchar(50)",
      notNull: true,
      comment: "Queue name",
    },

    // Failure details
    failed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
      comment: "When job was moved to dead letter queue",
    },
    attempts: {
      type: "integer",
      notNull: true,
      comment: "Total number of attempts before failure",
    },
    final_error: {
      type: "text",
      notNull: true,
      comment: "Final error message",
    },

    // Original data
    payload: {
      type: "jsonb",
      notNull: true,
      comment: "Original job payload for retry",
    },

    // Triage
    reviewed: {
      type: "boolean",
      notNull: true,
      default: false,
      comment: "Has this failure been reviewed by admin?",
    },
    review_notes: {
      type: "text",
      comment: "Admin notes about the failure",
    },
    reviewed_at: {
      type: "timestamptz",
      comment: "When admin reviewed this failure",
    },
    reviewed_by: {
      type: "varchar(100)",
      comment: "Admin who reviewed this failure",
    },
  })

  // Create indexes for job_dead_letter
  pgm.createIndex("job_dead_letter", "job_type", {
    name: "idx_job_dead_letter_type",
  })
  pgm.createIndex("job_dead_letter", ["reviewed", "failed_at"], {
    name: "idx_job_dead_letter_reviewed",
    method: "btree",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop tables in reverse order
  pgm.dropTable("job_dead_letter")
  pgm.dropTable("job_runs")
}
