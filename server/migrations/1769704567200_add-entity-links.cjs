/**
 * Add entity_links JSONB column to actor_death_circumstances.
 *
 * Stores auto-detected entity links in narrative text fields
 * (circumstances, rumored_circumstances, additional_context).
 *
 * Structure:
 * {
 *   "circumstances": [
 *     { start, end, text, entityType, entityId, entitySlug, matchMethod, confidence }
 *   ],
 *   "rumored_circumstances": [...],
 *   "additional_context": [...]
 * }
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add entity_links JSONB column
  pgm.addColumn("actor_death_circumstances", {
    entity_links: {
      type: "jsonb",
      default: null,
    },
  })

  // Add GIN index for efficient JSONB queries
  pgm.createIndex("actor_death_circumstances", "entity_links", {
    name: "idx_actor_death_entity_links",
    method: "gin",
    ifNotExists: true,
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("actor_death_circumstances", "entity_links", {
    name: "idx_actor_death_entity_links",
    ifExists: true,
  })

  pgm.dropColumn("actor_death_circumstances", "entity_links")
}
