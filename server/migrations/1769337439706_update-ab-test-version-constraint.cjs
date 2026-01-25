/**
 * Update version column constraint in enrichment_ab_tests
 *
 * The original constraint only allowed "with_sources" and "without_sources".
 * We now need to support provider names like "gemini_pro", "perplexity", etc.
 * for the provider_comparison test type.
 *
 * Solution: Drop the check constraint to allow any text value in the version column.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Drop the existing check constraint
  pgm.dropConstraint("enrichment_ab_tests", "enrichment_ab_tests_version_check")

  // The version column will now accept any text value
  // For source_requirement tests: "with_sources" or "without_sources"
  // For provider_comparison tests: "gemini_pro", "perplexity", etc.
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Restore the original constraint (only if rolling back)
  pgm.addConstraint("enrichment_ab_tests", "enrichment_ab_tests_version_check", {
    check: "version IN ('with_sources', 'without_sources')",
  })
}
