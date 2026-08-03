/**
 * Shared enrichment version constants.
 *
 * Both death and biography enrichment systems use semver-style version strings
 * to track which enrichment pipeline produced the data. Centralizing these
 * constants prevents version drift across the codebase when bumping versions.
 */

/**
 * Current death enrichment version.
 *
 * Unchanged by the Aug 2026 Sonnet 5 migration: death synthesis still runs on
 * Opus 4.5, and the two helpers that moved to Sonnet 5 (AI link selection and
 * AI content extraction) are disabled by default, so default-run output is
 * byte-for-byte comparable to 5.0.0.
 */
export const DEATH_ENRICHMENT_VERSION = "5.0.0"

/**
 * Current biography enrichment version.
 *
 * 7.1.0 — Stage 3 synthesis moved from the retired `claude-sonnet-4-20250514`
 * to `claude-sonnet-5`. Narrative output differs from 7.0.0, so the version is
 * bumped to keep per-record provenance accurate.
 */
export const BIO_ENRICHMENT_VERSION = "7.1.0"
