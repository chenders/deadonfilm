/**
 * Migration: Create actor_death_info_history table
 *
 * Tracks changes to actor death information including:
 * - cause_of_death
 * - cause_of_death_details
 * - birthday
 * - deathday
 *
 * Used for auditing changes made by the batch cause-of-death backfill script.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("actor_death_info_history", {
    id: "id",
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors(id)",
      onDelete: "CASCADE",
    },
    field_name: {
      type: "text",
      notNull: true,
      comment: "The field that was changed (cause_of_death, cause_of_death_details, birthday, deathday)",
    },
    old_value: {
      type: "text",
      comment: "The previous value (null if field was empty)",
    },
    new_value: {
      type: "text",
      comment: "The new value",
    },
    source: {
      type: "text",
      notNull: true,
      comment: "Source of the change (e.g., claude-opus-4.5-batch, manual)",
    },
    batch_id: {
      type: "text",
      comment: "The Anthropic batch ID if from a batch operation",
    },
    confidence: {
      type: "text",
      comment: "Confidence level from Claude (high, medium, low)",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  // Index for looking up history by actor
  pgm.createIndex("actor_death_info_history", "actor_id", {
    name: "idx_actor_death_info_history_actor_id",
  })

  // Index for looking up by batch
  pgm.createIndex("actor_death_info_history", "batch_id", {
    name: "idx_actor_death_info_history_batch_id",
    where: "batch_id IS NOT NULL",
  })

  // Index for looking up by source
  pgm.createIndex("actor_death_info_history", "source", {
    name: "idx_actor_death_info_history_source",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("actor_death_info_history", { cascade: true })
}
