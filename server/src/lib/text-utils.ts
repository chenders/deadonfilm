/**
 * Text formatting utilities for cause of death and other medical text.
 */

/**
 * Medical acronyms that should be preserved in uppercase.
 */
const MEDICAL_ACRONYMS = [
  "COVID-19",
  "COVID",
  "ALS",
  "AIDS",
  "COPD",
  "HIV",
  "SIDS",
  "CJD",
  "AML",
  "CLL",
  "ARDS",
  "CHF",
  "DVT",
  "PE",
  "MI",
  "CVA",
  "TBI",
  "MRSA",
]

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")
}

/**
 * Pre-compiled regex patterns for medical acronyms.
 * Created at module load time for better performance during batch processing.
 */
const ACRONYM_PATTERNS = MEDICAL_ACRONYMS.map((acronym) => ({
  pattern: new RegExp(`\\b${escapeRegex(acronym.toLowerCase())}\\b`, "gi"),
  replacement: acronym,
}))

/**
 * Converts a string to sentence case, preserving medical acronyms.
 *
 * @example
 * toSentenceCase("lung cancer") // "Lung cancer"
 * toSentenceCase("HEART ATTACK") // "Heart attack"
 * toSentenceCase("covid-19 complications") // "COVID-19 complications"
 * toSentenceCase("als") // "ALS"
 * toSentenceCase("Lung Cancer") // "Lung cancer"
 */
export function toSentenceCase(str: string): string {
  if (!str) return str

  // Convert to lowercase first, then capitalize first letter
  let result = str.toLowerCase()
  result = result.charAt(0).toUpperCase() + result.slice(1)

  // Restore acronyms using pre-compiled patterns
  for (const { pattern, replacement } of ACRONYM_PATTERNS) {
    result = result.replace(pattern, replacement)
  }

  return result
}
