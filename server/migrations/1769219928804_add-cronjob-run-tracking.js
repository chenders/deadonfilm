/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable("cronjob_runs", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    job_name: {
      type: "varchar(100)",
      notNull: true,
      comment: "Name of the cronjob (e.g., 'coverage-snapshot', 'tmdb-sync')",
    },
    started_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    completed_at: {
      type: "timestamp with time zone",
      comment: "When the job completed (success or failure)",
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      check: "status IN ('running', 'success', 'failure')",
    },
    error_message: {
      type: "text",
      comment: "Error details if status = 'failure'",
    },
    duration_ms: {
      type: "integer",
      comment: "Duration in milliseconds",
    },
  })

  // Index for querying recent runs by job name
  pgm.createIndex("cronjob_runs", ["job_name", "started_at"], {
    name: "idx_cronjob_runs_job_started",
    method: "btree",
  })

  // Index for finding failed runs
  pgm.createIndex("cronjob_runs", ["status", "started_at"], {
    name: "idx_cronjob_runs_status_started",
    method: "btree",
  })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("cronjob_runs")
};
