/**
 * Cause of Death Category System
 *
 * This module provides intelligent grouping of cause of death strings into broad categories.
 * Causes are stored as free-text in the database (e.g., "heart attack", "cardiac arrest",
 * "myocardial infarction") and need to be grouped for the causes-of-death discovery pages.
 *
 * SECURITY NOTE:
 * All patterns are hardcoded compile-time constants, NOT user input.
 * Pattern matching uses SQL ILIKE with escaped patterns for defense-in-depth.
 */

/**
 * Category definitions with patterns for matching cause_of_death strings.
 * Patterns are matched case-insensitively using SQL ILIKE.
 * Order matters: first match wins, so more specific patterns should come first.
 */
export const CAUSE_CATEGORIES = {
  cancer: {
    label: "Cancer",
    slug: "cancer",
    patterns: [
      "cancer",
      "carcinoma",
      "leukemia",
      "leukaemia",
      "lymphoma",
      "melanoma",
      "tumor",
      "tumour",
      "myeloma",
      "sarcoma",
      "malignant",
      "metastatic",
      "neoplasm",
      "oncological",
    ],
  },
  heart_disease: {
    label: "Heart Disease",
    slug: "heart-disease",
    patterns: [
      "heart attack",
      "cardiac arrest",
      "myocardial infarction",
      "heart failure",
      "cardiovascular",
      "coronary",
      "cardiomyopathy",
      "cardiac",
      "heart disease",
      "congestive heart",
      "arrhythmia",
      "aortic",
    ],
  },
  respiratory: {
    label: "Respiratory Disease",
    slug: "respiratory",
    patterns: [
      "pneumonia",
      "copd",
      "emphysema",
      "pulmonary",
      "lung disease",
      "respiratory failure",
      "respiratory",
      "asthma",
      "bronchitis",
      "pulmonary fibrosis",
      "pulmonary embolism",
    ],
  },
  neurological: {
    label: "Neurological",
    slug: "neurological",
    patterns: [
      "alzheimer",
      "parkinson",
      "dementia",
      "als",
      "amyotrophic lateral sclerosis",
      "stroke",
      "aneurysm",
      "brain hemorrhage",
      "cerebral",
      "neurological",
      "multiple sclerosis",
      "epilepsy",
      "huntington",
    ],
  },
  overdose: {
    label: "Overdose",
    slug: "overdose",
    patterns: [
      "overdose",
      "drug overdose",
      "intoxication",
      "barbiturate",
      "opioid",
      "fentanyl",
      "heroin",
      "cocaine",
      "methamphetamine",
      "prescription drug",
      "accidental overdose",
      "mixed drug",
    ],
  },
  accident: {
    label: "Accidents",
    slug: "accident",
    patterns: [
      "car accident",
      "automobile accident",
      "auto accident",
      "traffic accident",
      "plane crash",
      "aircraft",
      "aviation",
      "motorcycle accident",
      "motorcycle crash",
      "drowning",
      "drowned",
      "fall",
      "fell",
      "accident",
      "crash",
      "collision",
      "fire",
      "burns",
      "electrocution",
      "choking",
      "asphyxiation",
    ],
  },
  suicide: {
    label: "Suicide",
    slug: "suicide",
    patterns: [
      "suicide",
      "self-inflicted",
      "took own life",
      "died by suicide",
      "killed himself",
      "killed herself",
    ],
  },
  homicide: {
    label: "Homicide",
    slug: "homicide",
    patterns: [
      "murder",
      "murdered",
      "homicide",
      "gunshot",
      "shot to death",
      "shot dead",
      "stabbing",
      "stabbed",
      "strangled",
      "strangulation",
      "beaten",
      "killed by",
      "assassination",
      "assassinated",
    ],
  },
  infectious: {
    label: "Infectious Disease",
    slug: "infectious",
    patterns: [
      "covid",
      "coronavirus",
      "aids",
      "hiv",
      "tuberculosis",
      "sepsis",
      "infection",
      "infectious",
      "hepatitis",
      "meningitis",
      "flu",
      "influenza",
      "ebola",
      "malaria",
    ],
  },
  liver_kidney: {
    label: "Liver & Kidney Disease",
    slug: "liver-kidney",
    patterns: [
      "liver failure",
      "liver disease",
      "liver cancer",
      "cirrhosis",
      "kidney failure",
      "kidney disease",
      "renal failure",
      "renal disease",
      "hepatic",
      "nephritis",
      "dialysis",
    ],
  },
  natural: {
    label: "Natural Causes",
    slug: "natural",
    patterns: [
      "natural causes",
      "old age",
      "age-related",
      "died peacefully",
      "died in sleep",
      "natural death",
    ],
  },
  other: {
    label: "Other",
    slug: "other",
    patterns: [], // Catch-all for unmatched causes
  },
} as const

export type CauseCategoryKey = keyof typeof CAUSE_CATEGORIES

/**
 * All category slugs for validation
 */
export const CATEGORY_SLUGS = Object.values(CAUSE_CATEGORIES).map((c) => c.slug)

export type CategorySlug = (typeof CATEGORY_SLUGS)[number]

/**
 * Type guard to check if a string is a valid category slug
 */
export function isValidCategorySlug(slug: string): slug is CategorySlug {
  return CATEGORY_SLUGS.includes(slug as CategorySlug)
}

/**
 * Get category info by slug
 */
export function getCategoryBySlug(
  slug: string
): (typeof CAUSE_CATEGORIES)[CauseCategoryKey] | null {
  const entry = Object.entries(CAUSE_CATEGORIES).find(([, cat]) => cat.slug === slug)
  return entry ? entry[1] : null
}

/**
 * Get category key by slug
 */
export function getCategoryKeyBySlug(slug: string): CauseCategoryKey | null {
  const entry = Object.entries(CAUSE_CATEGORIES).find(([, cat]) => cat.slug === slug)
  return entry ? (entry[0] as CauseCategoryKey) : null
}

/**
 * Escapes special SQL LIKE pattern characters (%, _, \)
 */
function escapeSqlLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, "\\$&")
}

/**
 * Builds a SQL condition for matching a single pattern.
 * Uses ILIKE for case-insensitive matching.
 */
function buildPatternCondition(pattern: string): string {
  const escaped = escapeSqlLikePattern(pattern)
  return `LOWER(cause_of_death) LIKE '%${escaped.toLowerCase()}%'`
}

/**
 * Builds a SQL OR condition for multiple patterns within a category.
 */
export function buildCategoryCondition(patterns: readonly string[]): string {
  if (patterns.length === 0) {
    return "TRUE" // 'other' category matches everything
  }
  return patterns.map((p) => buildPatternCondition(p)).join(" OR ")
}

/**
 * Builds a SQL CASE statement that maps cause_of_death to category slugs.
 * This is used for grouping and aggregation queries.
 */
export function buildCategoryCaseStatement(): string {
  const cases = Object.entries(CAUSE_CATEGORIES)
    .filter(([key]) => key !== "other") // Handle 'other' as ELSE
    .map(([, cat]) => `WHEN ${buildCategoryCondition(cat.patterns)} THEN '${cat.slug}'`)
    .join("\n        ")

  return `CASE
        ${cases}
        ELSE 'other'
      END`
}

/**
 * Categorizes a cause of death string into a category.
 * Used for application-level categorization (not SQL).
 */
export function categorizeCauseOfDeath(cause: string | null): CauseCategoryKey {
  if (!cause) return "other"

  const lowerCause = cause.toLowerCase()

  for (const [key, category] of Object.entries(CAUSE_CATEGORIES)) {
    if (key === "other") continue

    for (const pattern of category.patterns) {
      if (lowerCause.includes(pattern.toLowerCase())) {
        return key as CauseCategoryKey
      }
    }
  }

  return "other"
}

/**
 * Creates a URL-safe slug from a cause of death string.
 * Used for specific cause detail pages.
 */
export function createCauseSlug(cause: string): string {
  return cause
    .toLowerCase()
    .replace(/['\u2019\u02BC]/g, "") // Remove apostrophes (straight, curly, modifier)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Get the display name for a category by its slug
 */
export function getCategoryLabel(slug: string): string {
  const category = getCategoryBySlug(slug)
  return category?.label || "Unknown"
}
