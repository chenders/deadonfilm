/**
 * Migration: Create admin_audit_log table
 *
 * This table tracks all admin actions for security and auditing purposes.
 * Used for the admin section to log: authentication, enrichment runs, cache
 * invalidations, data quality reviews, and all other administrative operations.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('admin_audit_log', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    action: {
      type: 'text',
      notNull: true,
      comment: 'Action performed (e.g., login, start_enrichment, invalidate_cache)',
    },
    resource_type: {
      type: 'text',
      comment: 'Type of resource affected (e.g., enrichment_run, actor, cache)',
    },
    resource_id: {
      type: 'integer',
      comment: 'ID of the affected resource',
    },
    details: {
      type: 'jsonb',
      comment: 'Additional action details (costs, filters, changes, etc.)',
    },
    ip_address: {
      type: 'inet',
      comment: 'IP address of the admin user',
    },
    user_agent: {
      type: 'text',
      comment: 'User agent string of the admin browser',
    },
    created_at: {
      type: 'timestamp with time zone',
      default: pgm.func('NOW()'),
      notNull: true,
    },
  });

  // Index for querying by action type
  pgm.createIndex('admin_audit_log', 'action', {
    name: 'idx_admin_audit_log_action',
  });

  // Index for querying recent actions
  pgm.createIndex('admin_audit_log', [{ name: 'created_at', sort: 'DESC' }], {
    name: 'idx_admin_audit_log_created_at',
    method: 'btree',
  });

  // Index for querying actions on specific resources
  pgm.createIndex('admin_audit_log', ['resource_type', 'resource_id'], {
    name: 'idx_admin_audit_log_resource',
    where: 'resource_type IS NOT NULL AND resource_id IS NOT NULL',
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('admin_audit_log');
};
