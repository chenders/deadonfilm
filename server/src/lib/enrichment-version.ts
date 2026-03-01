/**
 * Shared enrichment version constants.
 *
 * Both death and biography enrichment systems use semver-style version strings
 * to track which enrichment pipeline produced the data. Centralizing these
 * constants prevents version drift across the codebase when bumping versions.
 */

/** Current death enrichment version. */
export const DEATH_ENRICHMENT_VERSION = "5.0.0"

/** Current biography enrichment version. */
export const BIO_ENRICHMENT_VERSION = "5.0.0"
