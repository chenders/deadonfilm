/**
 * Add test_type column to enrichment_ab_tests to support different A/B test types.
 *
 * This allows us to have multiple types of A/B tests:
 * - source_requirement: Testing with/without source URL requirements
 * - provider_comparison: Testing different AI providers (Gemini vs Perplexity, etc.)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Add test_type column with default value for existing rows
  pgm.addColumn("enrichment_ab_tests", {
    test_type: {
      type: "text",
      notNull: true,
      default: "source_requirement",
    },
  })

  // Add composite index for efficient queries by test type and actor
  pgm.createIndex("enrichment_ab_tests", ["test_type", "actor_id"], {
    name: "idx_ab_tests_type_actor",
  })

  // Update version column to allow for provider names (not just with_sources/without_sources)
  // The version column will now contain:
  // - For source_requirement tests: "with_sources" or "without_sources"
  // - For provider_comparison tests: "gemini_pro", "perplexity", etc.
  pgm.sql(`
    COMMENT ON COLUMN enrichment_ab_tests.version IS
    'Test variant identifier. For source_requirement: with_sources/without_sources. For provider_comparison: gemini_pro/perplexity/etc.'
  `)
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("enrichment_ab_tests", ["test_type", "actor_id"], {
    name: "idx_ab_tests_type_actor",
  })
  pgm.dropColumn("enrichment_ab_tests", "test_type")
}
