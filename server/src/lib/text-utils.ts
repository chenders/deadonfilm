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

  // Restore acronyms
  for (const acronym of MEDICAL_ACRONYMS) {
    const regex = new RegExp(`\\b${acronym.toLowerCase()}\\b`, "gi")
    result = result.replace(regex, acronym)
  }

  return result
}
